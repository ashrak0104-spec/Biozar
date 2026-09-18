/**
 * BIOZAR — Détection fiable de l'état réseau
 * ─────────────────────────────────────────────────────────────────────
 * `navigator.onLine` ne suffit pas : dans une WebView Android il reste
 * souvent `true` alors qu'aucune donnée ne circule (Wi-Fi captif, forfait
 * data épuisé, mode avion partiel). Trois signaux sont combinés :
 *
 *   1. le plugin natif (@capacitor/network sur APK, évènement Tauri sur EXE) ;
 *   2. une sonde HTTP active vers /api/health (Cloudflare Worker existant) ;
 *   3. `navigator.onLine` en dernier recours (PWA navigateur).
 *
 * La machine à états est pure et testable : `NetworkMonitor` ne sait pas
 * d'où viennent les signaux, on les lui injecte.
 */

const HEALTH_PATH = 'api/health';
const PROBE_TIMEOUT_MS = 5000;
const PROBE_INTERVAL_MS = 30000;

// ═══════════════════════════════════════════════════════════════
//  Machine à états (pure)
// ═══════════════════════════════════════════════════════════════

/**
 * @typedef {'online'|'offline'|'syncing'|'sync_error'} NetState
 */

/**
 * La connectivité et la phase de synchronisation sont DEUX dimensions
 * indépendantes. Les confondre en une seule variable d'état est ce qui
 * faisait rester l'indicateur bloqué sur « syncing » : la garde destinée à
 * ignorer un micro-coupure pendant une synchro empêchait aussi d'en sortir.
 *
 *   connecté  = null | true | false     (plus pessimiste des signaux connus)
 *   syncPhase = 'idle' | 'syncing' | 'error'
 *
 *   affiché   = !connecté            → 'offline'
 *               phase === 'syncing'  → 'syncing'
 *               phase === 'error'    → 'sync_error'
 *               sinon                → 'online'
 */
class NetworkMonitor {
  /**
   * @param {object} opts
   * @param {(state: NetState, info: object) => void} [opts.onChange]
   */
  constructor({ onChange } = {}) {
    this.sources = { native: null, probe: null, browser: null };
    this.syncPhase = 'idle';
    this.state = 'offline';
    this.detail = { pending: 0, lastError: null, lastProbeAt: null };
    this.onChange = onChange || (() => {});
  }

  /**
   * @param {'native'|'probe'|'browser'} source  d'où vient le signal
   * @param {boolean} connected
   */
  setConnectivity(source, connected) {
    this.sources[source] = !!connected;
    if (source === 'probe') this.detail.lastProbeAt = Date.now();
    this.recompute();
  }

  /** @returns {boolean|null} null = aucun signal connu */
  isConnected() {
    const known = Object.values(this.sources).filter((v) => v !== null);
    if (known.length === 0) return null;
    return known.some((v) => v === true);
  }

  recompute() {
    const connected = this.isConnected();

    let next;
    if (connected === false) {
      // Sans réseau, aucune synchronisation n'est possible : l'information
      // utile pour l'opérateur est « hors-ligne », pas « échec ».
      next = 'offline';
    } else if (this.syncPhase === 'syncing') {
      next = 'syncing';
    } else if (this.syncPhase === 'error') {
      next = 'sync_error';
    } else {
      next = 'online';
    }

    if (next === this.state) return;
    this.state = next;
    this.onChange(next, { ...this.detail });
  }

  /**
   * Appelé par le moteur de synchronisation.
   * @param {'syncing'|'online'|'sync_error'} phase
   */
  setSyncPhase(phase, info = {}) {
    this.detail = { ...this.detail, ...info };

    if (phase === 'syncing') this.syncPhase = 'syncing';
    else if (phase === 'sync_error') this.syncPhase = 'error';
    else this.syncPhase = 'idle';

    if (phase === 'sync_error' && info.error) this.detail.lastError = info.error;
    this.recompute();
  }

  /** Efface l'erreur affichée (bouton « Réessayer »). */
  resetError() {
    this.syncPhase = 'idle';
    this.detail.lastError = null;
    this.recompute();
  }
}

// ═══════════════════════════════════════════════════════════════
//  Sonde active
// ═══════════════════════════════════════════════════════════════

/**
 * Une réponse HTTP — même 5xx — prouve que le réseau fonctionne.
 * Seule une exception (DNS, timeout, hors-ligne) signifie « pas de réseau ».
 */
async function probe(fetchImpl = fetch, path = HEALTH_PATH) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetchImpl(path, { method: 'GET', signal: controller.signal, cache: 'no-store' });
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Câblage plateforme
// ═══════════════════════════════════════════════════════════════

/**
 * Branche la machine à états sur la plateforme courante.
 * Retourne une fonction de nettoyage.
 */
function attachPlatformSignals(monitor, env = {}) {
  const cleanups = [];

  // ── Android (Capacitor) ──
  const capacitor = env.Capacitor || (typeof window !== 'undefined' ? window.Capacitor : null);
  if (capacitor && capacitor.isNativePlatform && capacitor.isNativePlatform()) {
    // Le greffon se résout depuis le pont natif, jamais par import :
    // `@capacitor/network` est un bare specifier qu'une WebView sans
    // bundler ne sait pas résoudre.
    const network = capacitor.Plugins && capacitor.Plugins.Network;
    if (network) {
      Promise.resolve()
        .then(() => network.getStatus())
        .then((s) => monitor.setConnectivity('native', !!s.connected))
        .catch(() => {
          /* greffon inopérant : la sonde prend le relais */
        });

      try {
        const sub = network.addListener('networkStatusChange', (s) =>
          monitor.setConnectivity('native', !!s.connected)
        );
        cleanups.push(() => Promise.resolve(sub).then((h) => h && h.remove()));
      } catch (_) {
        /* pas d'écoute possible : la sonde suffit */
      }
    }
  }

  // ── Navigateur ──
  if (typeof window !== 'undefined') {
    monitor.setConnectivity('browser', navigator.onLine !== false);
    const on = () => monitor.setConnectivity('browser', true);
    const off = () => monitor.setConnectivity('browser', false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    cleanups.push(() => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    });
  }

  // ── Sonde active ──
  // Sans fenêtre ni plugin natif (Node, tests) et sans fetch fourni,
  // une sonde n apporte rien : on ne démarre rien.
  const hasHost = typeof window !== 'undefined' || !!capacitor;
  if (!hasHost && !env.fetch) return () => cleanups.forEach((fn) => fn());

  let timer = null;
  const runProbe = async () => monitor.setConnectivity('probe', await probe(env.fetch));
  runProbe();
  if (typeof setInterval !== 'undefined') {
    timer = setInterval(runProbe, PROBE_INTERVAL_MS);
    // Sous Node (tests, scripts) la sonde ne doit pas retenir le processus.
    if (typeof timer.unref === 'function') timer.unref();
    cleanups.push(() => clearInterval(timer));
  }

  return () => cleanups.forEach((fn) => fn());
}

export { NetworkMonitor, probe, attachPlatformSignals, HEALTH_PATH, PROBE_TIMEOUT_MS, PROBE_INTERVAL_MS };
