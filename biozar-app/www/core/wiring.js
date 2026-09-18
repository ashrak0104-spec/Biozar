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

  // ── Synchronisation : on remplace initCloudMonitor ──
  const originalInitCloudMonitor = window.initCloudMonitor;
  if (typeof originalInitCloudMonitor === 'function') {
    window.initCloudMonitor = function () {
      // On laisse l'ancien moniteur gérer la bascule online/offline legacy,
      // puis on ajoute le déclenchement du vrai moteur de synchro.
      const r = originalInitCloudMonitor.apply(this, arguments);

      const trigger = () => {
        app.syncNow().catch(() => {
          /* l'état d'erreur est déjà affiché par le moniteur */
        });
      };

      window.addEventListener('online', trigger);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') trigger();
      });

      // Premier cycle dès l'installation.
      trigger();
      return r;
    };
  }

  return { available: true, app, bridge, platform: app.platform };
}

export { install };
