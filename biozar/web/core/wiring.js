/**
 * BIOZAR — Câblage du socle dans l'application existante
 * ─────────────────────────────────────────────────────────────────────
 * Mode « shadow » : le localStorage reste la source de vérité de l'app,
 * le socle SQLite tourne en parallèle et reçoit les mêmes écritures.
 *
 * Pourquoi ne pas basculer directement ? Les 41 appels à saveState()
 * d'une application en service ne se remplacent pas sans risque. En mode
 * shadow, on peut comparer les deux bases, vérifier que rien ne diverge,
 * puis promouvoir entité par entité.
 *
 * Sécurité : si le socle échoue (plateforme sans moteur SQL, quota,
 * corruption), l'application continue de fonctionner normalement sur
 * localStorage. Aucune exception ne remonte vers l'UI.
 */

import { bootstrap } from './index.js';
import { createBridge } from './bridge.js';

/**
 * @param {object} opts
 * @param {() => object} opts.getState        accesseur vers le `state` global
 * @param {HTMLElement} [opts.statusHost]     ex. #cloud-status
 * @param {object} [opts.supabase]            { url, anonKey, accessToken }
 * @param {(msg: string) => void} [opts.log]
 */
async function install(opts) {
  const log = opts.log || ((m) => console.info('[BIOZAR]', m));

  let app;
  try {
    app = await bootstrap({
      supabase: opts.supabase,
      statusHost: opts.statusHost,
      onStatus: opts.onStatus
    });
  } catch (e) {
    log(`socle indisponible (${e.message}) — l'app reste sur localStorage`);
    return { available: false, reason: e.message };
  }

  const bridge = await createBridge({ db: app.db, monitor: app.monitor });

  // L'état déjà présent en base (chargé depuis localStorage par la migration)
  // sert de point de départ : on ne repousse pas tout au premier lancement.
  bridge.prime(opts.getState());

  const pending = await app.db.countPending();
  log(`socle actif · plateforme ${app.platform} · ${pending} opération(s) en attente`);

  /**
   * Récupère le jeton de la session courante et le transmet au transport.
   *
   * La connexion utilisateur intervient après le démarrage, et le jeton peut
   * être renouvelé entre deux synchronisations. Sans ce rafraîchissement,
   * les politiques RLS de la migration 002 renvoient 401 sur chaque requête
   * et la file d'attente ne se vide jamais — silencieusement.
   *
   * @returns {boolean} true si un jeton est installé
   */
  function refreshAccessToken() {
    const s = opts.getState();
    const token = s && s.currentUser ? s.currentUser.accessToken : null;
    app.setAccessToken(token || null);

    // Publié aussi pour le chemin legacy (supabase-init.js) : depuis la
    // migration 002, ses écritures vers biozar_state exigent un utilisateur
    // authentifié, et ce script s'exécute avant la déclaration de `state`.
    const host = typeof window !== 'undefined' ? window : null;
    if (host) {
      if (token) host.__biozarAccessToken = token;
      else delete host.__biozarAccessToken;
    }

    return Boolean(token);
  }

  // Une session peut avoir été restaurée du localStorage avant que ce module
  // (deferred) ne s'exécute : on reprend le jeton immédiatement, sans attendre
  // le premier événement de synchronisation.
  if (refreshAccessToken()) log('session restaurée : synchro autorisée');

  // ── Indicateur : on remplace l'ancien updateCloudStatus ──
  if (opts.statusHost && app.indicator) {
    window.updateCloudStatus = function (legacyStatus) {
      const map = { online: 'online', syncing: 'syncing', offline: 'offline' };
      const state = map[legacyStatus] || 'offline';
      app.db.countPending().then((n) => app.indicator.render(state, { pending: n }));
    };
  }

  // ── Hook sur saveState() : shadow, jamais bloquant ──
  const originalSaveState = window.saveState;
  if (typeof originalSaveState === 'function' && !originalSaveState.__biozarWrapped) {
    const wrapped = function (...args) {
      const result = originalSaveState.apply(this, args);

      // La copie SQLite est différée et silencieuse : une défaillance du
      // socle ne doit jamais empêcher la sauvegarde localStorage.
      Promise.resolve()
        .then(() => bridge.syncState(opts.getState()))
        .catch((e) => log(`copie SQLite ignorée : ${e.message}`));

      return result;
    };
    wrapped.__biozarWrapped = true;
    window.saveState = wrapped;
    log('saveState() doublé vers SQLite (mode shadow)');
  }

  // ── Déclenchement de la synchronisation ──────────────────────
  /**
   * Un cycle de synchro, déclenché par un événement.
   *
   * Le jeton est rafraîchi à chaque tentative : il n'existe qu'après
   * connexion et peut être renouvelé entre deux cycles. Sans ça, les
   * politiques RLS renvoient 401 en silence et la file ne se vide jamais.
   */
  let inFlight = false;
  async function trigger(reason) {
    if (inFlight) return null;

    refreshAccessToken();
    if (!app.isAuthorized()) {
      log(`synchro différée (${reason}) : aucun utilisateur connecté`);
      return null;
    }

    inFlight = true;
    try {
      return await app.syncNow();
    } catch (e) {
      /* l'état d'erreur est déjà affiché par l'indicateur */
      log(`cycle de synchro interrompu (${reason}) : ${e.message}`);
      return null;
    } finally {
      inFlight = false;
    }
  }

  // Ces écouteurs sont posés ICI, et non dans un initCloudMonitor() remplacé :
  // ce module est `deferred`, il s'exécute donc APRÈS le script inline de
  // démarrage qui a déjà appelé initCloudMonitor(). Remplacer la fonction à
  // ce stade ne servirait à rien.
  const host = typeof window !== 'undefined' ? window : null;
  const doc = typeof document !== 'undefined' ? document : null;

  if (host && typeof host.addEventListener === 'function') {
    host.addEventListener('online', () => trigger('retour réseau'));
  }
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'visible') trigger('retour au premier plan');
    });
  }

  // Premier cycle dès l'installation — différé d'un tour de boucle pour ne
  // pas ralentir le démarrage de l'interface.
  setTimeout(() => trigger('démarrage'), 0);

  return {
    trigger,
    available: true,
    app,
    bridge,
    platform: app.platform,
    refreshAccessToken,
    isAuthorized: () => app.isAuthorized()
  };
}

export { install };
