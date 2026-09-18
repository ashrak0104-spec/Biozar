/**
 * BIOZAR — Couche d'accès aux données locales
 * ─────────────────────────────────────────────────────────────────────
 * Une seule API (`Db`), quatre moteurs interchangeables :
 *
 *   • Android (APK) ... @capacitor-community/sqlite  → SQLite natif
 *   • Windows (EXE) ... tauri-plugin-sql             → SQLite natif (rusqlite)
 *   • Navigateur ...... sql.js sur OPFS              → SQLite compilé WASM
 *   • Tests / Node .... node:sqlite (DatabaseSync)
 *
 * Aucun droit Windows à demander : Tauri écrit dans %APPDATA%\mg.biozar.app.
 * Aucune permission Android à demander : getDatabasePath() est dans le
 * sandbox applicatif.
 *
 * Le point critique est `Db.transaction()` : l'écriture métier ET
 * l'insertion dans la file d'attente doivent être atomiques, sinon une
 * coupure réseau en cours de route perd des saisies.
 */

import { createRequire } from 'node:module';
import { generateSchema, SCHEMA_VERSION, ENTITY_SPECS } from './schema.js';

// ═══════════════════════════════════════════════════════════════
//  Identifiants
// ═══════════════════════════════════════════════════════════════

/**
 * UUID v7 : préfixe temporel, donc triable chronologiquement.
 * Utile pour le rejeu ordonné de la file d'attente.
 */
function uuidv7() {
  const bytes = new Uint8Array(16);
  let ms = Date.now();

  // 48 bits d'horodatage, poids fort d'abord.
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }

  const rnd = crypto.getRandomValues(new Uint8Array(10));
  bytes.set(rnd, 6);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Identifiant d'appareil stable, persisté dans settings. */
function newDeviceId() {
  return `dev_${uuidv7()}`;
}

// ═══════════════════════════════════════════════════════════════
//  Adaptateurs
// ═══════════════════════════════════════════════════════════════

/** SQLite natif via node:sqlite (Node ≥ 22.5). Sert aux tests. */
class NodeAdapter {
  constructor(dbName) {
    // createRequire() : le constructeur doit rester synchrone, un import()
    // dynamique ne l'est pas. Cette branche n'est jamais atteinte dans le
    // navigateur, seulement sous Node (tests et scripts).
    const req = createRequire(import.meta.url);
    const { DatabaseSync } = req('node:sqlite');
    this.db = new DatabaseSync(dbName || ':memory:');
    this.name = 'node:sqlite';
  }

  async exec(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  async all(sql, params = []) {
    return this.db.prepare(sql).all(...params);
  }

  async get(sql, params = []) {
    return this.db.prepare(sql).get(...params);
  }

  async runStatements(sql) {
    this.db.exec(sql);
  }

  async transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      try {
        this.db.exec('ROLLBACK');
      } catch (_) {
        /* déjà annulée */
      }
      throw e;
    }
  }

  async close() {
    this.db.close();
  }
}

/** SQLite natif Android via @capacitor-community/sqlite. */
class CapacitorAdapter {
  constructor(handle) {
    this.handle = handle; // instance CapacitorSQLiteDB
    this.name = 'capacitor';
  }

  async exec(sql, params = []) {
    return this.handle.run(sql, params, false);
  }

  async all(sql, params = []) {
    const r = await this.handle.query(sql, params);
    return r.values || [];
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params);
    return rows[0];
  }

  async runStatements(sql) {
    await this.handle.execute(sql, false);
  }

  async transaction(fn) {
    await this.handle.beginTransaction();
    try {
      const result = await fn(this);
      await this.handle.commitTransaction();
      return result;
    } catch (e) {
      try {
        await this.handle.rollbackTransaction();
      } catch (_) {
        /* déjà annulée */
      }
      throw e;
    }
  }

  async close() {
    await this.handle.close();
  }
}

/** SQLite natif Windows via tauri-plugin-sql. */
class TauriAdapter {
  constructor(handle) {
    this.handle = handle; // Database.load('sqlite:biozar.db')
    this.name = 'tauri';
  }

  async exec(sql, params = []) {
    return this.handle.execute(sql, params);
  }

  async all(sql, params = []) {
    return this.handle.select(sql, params);
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params);
    return rows[0];
  }

  async runStatements(sql) {
    // tauri-plugin-sql n'exécute qu'une instruction par appel :
    // on découpe sur les points-virgules hors chaîne de caractères.
    for (const stmt of splitStatements(sql)) {
      await this.handle.execute(stmt, []);
    }
  }

  async transaction(fn) {
    await this.handle.execute('BEGIN IMMEDIATE', []);
    try {
      const result = await fn(this);
      await this.handle.execute('COMMIT', []);
      return result;
    } catch (e) {
      try {
        await this.handle.execute('ROLLBACK', []);
      } catch (_) {
        /* déjà annulée */
      }
      throw e;
    }
  }

  async close() {
    await this.handle.close();
  }
}

/** Découpe un script SQL multi-instructions en respectant les quotes. */
function splitStatements(sql) {
  const out = [];
  let cur = '';
  let quote = null;

  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === ';') {
      const trimmed = cur.trim();
      if (trimmed) out.push(trimmed);
      cur = '';
      continue;
    }
    cur += c;
  }

  const trimmed = cur.trim();
  if (trimmed) out.push(trimmed);
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  Db — API unique exposée au reste de l'application
// ═══════════════════════════════════════════════════════════════

class Db {
  constructor(adapter) {
    this.adapter = adapter;
    this.deviceId = null;
  }

  static async open(adapter) {
    const db = new Db(adapter);
    await db.initialize();
    return db;
  }

  async initialize() {
    await this.adapter.runStatements(generateSchema());

    const applied = await this.adapter.get(
      'SELECT version FROM schema_migrations WHERE version = ?',
      [SCHEMA_VERSION]
    );
    if (!applied) {
      await this.adapter.exec(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        [SCHEMA_VERSION, Date.now()]
      );
    }

    this.deviceId = await this.getSetting('device_id');
    if (!this.deviceId) {
      this.deviceId = newDeviceId();
      await this.setSetting('device_id', this.deviceId);
    }
  }

  // ── Accès bas niveau ──────────────────────────────────────
  exec(sql, params) {
    return this.adapter.exec(sql, params);
  }
  all(sql, params) {
    return this.adapter.all(sql, params);
  }
  get(sql, params) {
    return this.adapter.get(sql, params);
  }
  transaction(fn) {
    return this.adapter.transaction(fn);
  }
  close() {
    return this.adapter.close();
  }

  // ── Préférences ───────────────────────────────────────────
  async getSetting(key) {
    const row = await this.adapter.get('SELECT value FROM settings WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  async setSetting(key, value) {
    await this.adapter.exec(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, String(value), Date.now()]
    );
  }

  async getSettingJson(key, fallback = null) {
    const raw = await this.getSetting(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  async setSettingJson(key, value) {
    await this.setSetting(key, JSON.stringify(value));
  }

  // ── Entités ───────────────────────────────────────────────

  /**
   * Écriture métier + enqueue dans la file d'attente, atomiquement.
   * C'est le point central du mode semi-offline : si le réseau tombe
   * juste après, l'opération est déjà durablement en file.
   */
  async upsert(entity, fields, { id = null, markDirty = true } = {}) {
    const spec = ENTITY_SPECS[entity];
    if (!spec) throw new Error(`Entité inconnue : ${entity}`);

    const rowId = id || uuidv7();
    const now = Date.now();

    return this.transaction(async (tx) => {
      const columns = ['id', 'device_id', 'updated_at', 'dirty', ...spec.columns.map(([c]) => c)];
      const values = [
        rowId,
        this.deviceId,
        now,
        markDirty ? 1 : 0,
        ...spec.columns.map(([c]) => normalize(fields[c]))
      ];

      const assignments = columns
        .filter((c) => c !== 'id')
        .map((c) => `${c} = excluded.${c}`)
        .join(', ');

      await tx.exec(
        `INSERT INTO ${entity} (${columns.join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})
         ON CONFLICT(id) DO UPDATE SET ${assignments}`,
        values
      );

      if (markDirty) {
        const row = await tx.get(`SELECT * FROM ${entity} WHERE id = ?`, [rowId]);
        await enqueue(tx, entity, rowId, 'upsert', row);
      }

      return rowId;
    });
  }

  /** Suppression logique : la ligne reste, elle est marquée à propager. */
  async remove(entity, id) {
    const spec = ENTITY_SPECS[entity];
    if (!spec) throw new Error(`Entité inconnue : ${entity}`);

    return this.transaction(async (tx) => {
      await tx.exec(
        `UPDATE ${entity}
            SET deleted = 1, dirty = 1, updated_at = ?, device_id = ?
          WHERE id = ?`,
        [Date.now(), this.deviceId, id]
      );
      const row = await tx.get(`SELECT * FROM ${entity} WHERE id = ?`, [id]);
      if (row) await enqueue(tx, entity, id, 'delete', row);
    });
  }

  async findAll(entity, { includeDeleted = false } = {}) {
    const where = includeDeleted ? '' : ' WHERE deleted = 0';
    return this.all(`SELECT * FROM ${entity}${where} ORDER BY updated_at DESC`);
  }

  async findById(entity, id) {
    return this.get(`SELECT * FROM ${entity} WHERE id = ?`, [id]);
  }

  async countPending() {
    const row = await this.get(
      "SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending','in_flight')"
    );
    return row ? Number(row.n) : 0;
  }
}

// ─── Helpers ────────────────────────────────────────────────────

function normalize(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v;
}

/**
 * Enqueue transactionnel. Doit être appelé avec le handle de transaction
 * (pas le Db), pour garantir l'atomicité avec l'écriture métier.
 */
async function enqueue(tx, entity, entityId, op, payload) {
  // Une opération déjà en file pour la même ligne est rendue obsolète :
  // on évite d'accumuler N push pour N éditions de la même cellule.
  await tx.exec(
    `DELETE FROM outbox
      WHERE entity = ? AND entity_id = ? AND status IN ('pending','conflict')`,
    [entity, entityId]
  );

  await tx.exec(
    `INSERT INTO outbox (entity, entity_id, op, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [entity, entityId, op, JSON.stringify(payload), Date.now()]
  );
}

export { Db, NodeAdapter, CapacitorAdapter, TauriAdapter, splitStatements, uuidv7, newDeviceId, normalize };
