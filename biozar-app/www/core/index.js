/**
 * BIOZAR — Point d'entrée unique du socle de persistance
 * ─────────────────────────────────────────────────────────────────────
 * Usage dans l'application :
 *
 *   import { bootstrap } from './core/index.js';
 *   const app = await bootstrap({ onStatus: renderSyncIndicator });
 *
 *   await app.db.upsert('productions', { date, name, qty, value });
 *   // → écrit en base locale ET mis en file d'attente, atomiquement.
 *   // → poussé vers le serveur dès qu'un réseau est détecté.
 *
 * `bootstrap()` décide tout seul du moteur SQL selon la plateforme :
 * APK Android → SQLite natif, EXE Windows → SQLite natif (Tauri),
 * navigateur → repli contrôlé, tests → node:sqlite.
 */

import { Db, NodeAdapter, CapacitorAdapter, TauriAdapter, uuidv7 } from './db.js';
import { SyncEngine } from './sync-engine.js';
import { NetworkMonitor, attachPlatformSignals } from './net.js';
import { migrateFromLegacy, readLegacyState } from './migration.js';
import { SupabaseTransport } from './transport-supabase.js';
import { createSyncIndicator } from './sync-status.js';
import { ENTITY_SPECS, SCHEMA_VERSION } from './schema.js';

/** Détecte la plateforme courante. */
function detectPlatform(win = typeof window !== 'undefined' ? window : {}) {
  const tauri = win.__TAURI_INTERNALS__ || win.__TAURI__;
  if (tauri) return 'tauri';

  const cap = win.Capacitor;
  if (cap && cap.isNativePlatform && cap.isNativePlatform()) return 'android';

  if (typeof process !== 'undefined' && process.versions && process.versions.node) return 'node';
  return 'browser';
}

/**
 * Construit l'adaptateur SQL adapté à la plateforme.
 *
 * @param {'android'|'tauri'|'browser'|'node'} platform
 * @param {object} [opts] { dbName }
 */
async function createAdapter(platform, opts = {}) {
  const dbName = opts.dbName || 'biozar.db';

  switch (platform) {
    case 'node':
      return new NodeAdapter(opts.dbName || ':memory:');

    case 'android': {
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
      const conn = new SQLiteConnection(CapacitorSQLite);
      if (!(await conn.isConnection(dbName, false))) await conn.createConnection(dbName, false, 'no-encryption', 1, false);
      const handle = await conn.retrieveConnection(dbName, false);
      return new CapacitorAdapter(handle);
    }

    case 'tauri': {
      const { Database } = await import('@tauri-apps/plugin-sql');
      const handle = await Database.load(`sqlite:${dbName}`);
      return new TauriAdapter(handle);
    }

    case 'browser':
    default:
      throw new Error(
        'BIOZAR : aucun moteur SQL disponible sur cette plateforme. ' +
          'Le navigateur nécessite sql.js + OPFS (non encore câblé) ; ' +
          'les builds APK et EXE, eux, utilisent SQLite natif.'
      );
  }
}

/**
 * Démarrage complet : base → migration legacy → réseau → moteur de synchro.
 *
 * @param {object} [opts]
 * @param {(state: string, info: object) => void} [opts.onStatus]
 * @param {HTMLElement} [opts.statusHost]  ex. document.getElementById('cloud-status')
 * @param {object} [opts.supabase]  { url, anonKey, accessToken, legacyMirror }
 * @param {object} [opts.transport]  transport déjà construit (tests)
 * @param {'android'|'tauri'|'browser'|'node'} [opts.platform]  forçage manuel
 * @param {object} [opts.adapter]    adaptateur déjà construit (tests)
 */
async function bootstrap(opts = {}) {
  const platform = opts.platform || detectPlatform();

  const adapter = opts.adapter || (await createAdapter(platform, opts));
  const db = await Db.open(adapter);

  // ── Migration de l'ancien blob localStorage ──
  const legacy = readLegacyState(opts.storage);
  const migration = legacy ? await migrateFromLegacy(db, legacy) : { skipped: true };

  // ── Détection réseau ──
  const monitor = new NetworkMonitor({ onChange: opts.onStatus });
  const detach = attachPlatformSignals(monitor, opts.env || {});

  // ── Moteur de synchronisation ──
  let engine = null;
  if (opts.transport) {
    engine = new SyncEngine(db, opts.transport, { onStatus: (s, i) => monitor.setSyncPhase(s, i) });
  } else if (opts.supabase) {
    const transport = new SupabaseTransport(opts.supabase);
    engine = new SyncEngine(db, transport, { onStatus: (s, i) => monitor.setSyncPhase(s, i) });
    engine.transport = transport;
  }

  // ── Indicateur visuel ──
  let indicator = null;
  if (opts.statusHost) {
    indicator = createSyncIndicator(opts.statusHost, {
      onRetry: () => engine && syncNow()
    });
    monitor.onChange = (state, info) => {
      indicator.render(state, info);
      if (opts.onStatus) opts.onStatus(state, info);
    };
  }

  /** Déclenche un cycle de synchro, en ignorant le backoff. */
  async function syncNow() {
    if (!engine) return null;
    monitor.setSyncPhase('syncing', { pending: await db.countPending() });
    try {
      const result = await engine.syncOnce({ ignoreBackoff: true });

      // Double écriture : le blob historique reste alimenté pendant la
      // transition, pour l'app web actuellement déployée.
      if (result.ok && engine.transport && engine.transport.writeLegacyMirror) {
        try {
          await engine.transport.writeLegacyMirror(db);
        } catch (e) {
          /* le miroir est un confort, pas une exigence : on ne bloque pas */
        }
      }

      monitor.setSyncPhase(result.ok ? 'online' : 'sync_error', { pending: result.pending });
      return result;
    } catch (e) {
      monitor.setSyncPhase('sync_error', {
        pending: await db.countPending(),
        lastError: e.message
      });
      throw e;
    }
  }

  /**
   * Installe le jeton d'authentification sur le transport.
   *
   * La connexion utilisateur intervient après le démarrage : sans cet appel,
   * les politiques RLS de la migration 002 renvoient 401 sur chaque requête
   * et la file d'attente ne se vide jamais.
   *
   * @returns {boolean} true si un transport a reçu le jeton
   */
  function setAccessToken(token) {
    const transport = engine && engine.transport;
    if (!transport || typeof transport.setAccessToken !== 'function') return false;
    return transport.setAccessToken(token);
  }

  /** Vrai si le transport est prêt à écrire (jeton présent ou non requis). */
  function isAuthorized() {
    const transport = engine && engine.transport;
    if (!transport) return false;
    if (typeof transport.accessToken === 'undefined') return true;
    return Boolean(transport.accessToken);
  }

  return {
    platform,
    db,
    engine,
    monitor,
    indicator,
    syncNow,
    migration,
    detach,
    setAccessToken,
    isAuthorized
  };
}

export {
  bootstrap,
  createAdapter,
  detectPlatform,
  Db,
  NodeAdapter,
  CapacitorAdapter,
  TauriAdapter,
  SyncEngine,
  NetworkMonitor,
  SupabaseTransport,
  createSyncIndicator,
  migrateFromLegacy,
  readLegacyState,
  uuidv7,
  ENTITY_SPECS,
  SCHEMA_VERSION
};
