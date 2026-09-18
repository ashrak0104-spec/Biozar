/**
 * BIOZAR — Tests des adaptateurs de plateforme (Android / Windows)
 * ─────────────────────────────────────────────────────────────────────
 * Ces deux chemins étaient cassés et n'avaient jamais été exécutés :
 * `createAdapter()` importait `@capacitor-community/sqlite` et
 * `@tauri-apps/plugin-sql`, deux *bare specifiers* qu'aucune WebView ne sait
 * résoudre — l'application n'a pas de bundler. Le socle n'aurait jamais
 * démarré ni dans l'APK ni dans l'EXE.
 *
 * Les faux greffons ci-dessous sont adossés à un vrai SQLite en mémoire :
 * on exerce donc tout le chemin, du chargement du module à l'écriture en base.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { createAdapter, tauriDatabaseClass, Db } from '../biozar/web/core/index.js';
import { CapacitorAdapter, TauriAdapter } from '../biozar/web/core/db.js';

// ── Faux greffon Capacitor SQLite, adossé à un vrai SQLite ──────
function fakeCapacitorPlugin() {
  const raw = new DatabaseSync(':memory:');
  const calls = [];

  return {
    calls,
    raw,
    async createConnection(o) {
      calls.push({ m: 'createConnection', ...o });
      return { result: true };
    },
    async isConnection(o) {
      calls.push({ m: 'isConnection', ...o });
      return { result: false };
    },
    async run({ statement, values = [] }) {
      calls.push({ m: 'run', statement });
      raw.prepare(statement).run(...values);
      return { changes: { changes: 1 } };
    },
    async query({ statement, values = [] }) {
      calls.push({ m: 'query', statement });
      return { values: raw.prepare(statement).all(...values) };
    },
    async execute({ statements }) {
      calls.push({ m: 'execute', statements: statements.slice(0, 40) });
      raw.exec(statements);
      return { changes: { changes: 1 } };
    },
    async beginTransaction() {
      raw.exec('BEGIN');
      return { result: true };
    },
    async commitTransaction() {
      raw.exec('COMMIT');
      return { result: true };
    },
    async rollbackTransaction() {
      raw.exec('ROLLBACK');
      return { result: true };
    },
    async close() {
      calls.push({ m: 'close' });
      return { result: true };
    }
  };
}

// ── Faux pont Tauri, adossé à un vrai SQLite ────────────────────
function fakeTauriBridge() {
  const raw = new DatabaseSync(':memory:');
  const calls = [];

  const invoke = async (cmd, args = {}) => {
    calls.push({ cmd, args });
    switch (cmd) {
      case 'plugin:sql|load':
        return args.db;
      case 'plugin:sql|execute': {
        const info = raw.prepare(args.query).run(...(args.values || []));
        return [Number(info.changes), Number(info.lastInsertRowid)];
      }
      case 'plugin:sql|select':
        return raw.prepare(args.query).all(...(args.values || []));
      case 'plugin:sql|close':
        return true;
      default:
        throw new Error(`commande inattendue : ${cmd}`);
    }
  };

  return { invoke, calls, raw, install: () => { globalThis.window = { __TAURI__: { core: { invoke } } }; } };
}

beforeEach(() => {
  delete globalThis.window;
});

afterEach(() => {
  delete globalThis.window;
});

describe('Android : adaptateur Capacitor via le module vendorisé', () => {
  test('createAdapter("android") fonctionne sans bare specifier', async () => {
    const plugin = fakeCapacitorPlugin();
    globalThis.window = { Capacitor: { Plugins: { CapacitorSQLite: plugin } } };

    const adapter = await createAdapter('android', { dbName: 'biozar.db' });

    assert.ok(adapter instanceof CapacitorAdapter);
    assert.equal(adapter.name, 'capacitor');

    // Le module vendorisé a bien été chargé et la connexion créée.
    assert.ok(
      plugin.calls.some((c) => c.m === 'createConnection'),
      'createConnection doit avoir été appelé'
    );
  });

  test('le greffon est résolu depuis le pont natif, pas par import', async () => {
    const plugin = fakeCapacitorPlugin();
    globalThis.window = { Capacitor: { Plugins: { CapacitorSQLite: plugin } } };

    await createAdapter('android');
    assert.ok(plugin.calls.length > 0, 'le greffon stubbé doit avoir reçu des appels');
  });

  test('sans le greffon, l’erreur est explicite', async () => {
    globalThis.window = { Capacitor: { Plugins: {} } };

    await assert.rejects(
      () => createAdapter('android'),
      /CapacitorSQLite introuvable/,
      'il faut nommer la dépendance manquante, pas lever une erreur opaque'
    );
  });

  test('sans window.Capacitor du tout, l’erreur reste explicite', async () => {
    globalThis.window = {};
    await assert.rejects(() => createAdapter('android'), /CapacitorSQLite introuvable/);
  });

  test('parcours complet : Db ouvert sur l’adaptateur Capacitor', async () => {
    const plugin = fakeCapacitorPlugin();
    globalThis.window = { Capacitor: { Plugins: { CapacitorSQLite: plugin } } };

    const adapter = await createAdapter('android');
    const db = await Db.open(adapter);

    await db.upsert('clients', { nom: 'Hôtel Royal', statut: 'Abonné' });
    const rows = await db.findAll('clients');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].nom, 'Hôtel Royal');
    assert.equal(await db.countPending(), 1);

    await db.close();
  });
});

describe('Windows : adaptateur Tauri via window.__TAURI__', () => {
  test('tauriDatabaseClass refuse de démarrer sans le pont Tauri', () => {
    globalThis.window = {};
    assert.throws(
      () => tauriDatabaseClass(),
      /withGlobalTauri/,
      'le message doit pointer la configuration à vérifier'
    );
  });

  test('createAdapter("tauri") appelle plugin:sql|load', async () => {
    const bridge = fakeTauriBridge();
    bridge.install();

    const adapter = await createAdapter('tauri', { dbName: 'biozar.db' });

    assert.ok(adapter instanceof TauriAdapter);
    const load = bridge.calls.find((c) => c.cmd === 'plugin:sql|load');
    assert.ok(load, 'plugin:sql|load doit avoir été appelé');
    assert.equal(load.args.db, 'sqlite:biozar.db');
  });

  test('execute et select passent les paramètres liés correctement', async () => {
    const bridge = fakeTauriBridge();
    bridge.install();

    const adapter = await createAdapter('tauri');
    await adapter.exec('CREATE TABLE t (id TEXT, n INTEGER)', []);
    await adapter.exec('INSERT INTO t (id, n) VALUES (?, ?)', ['a', 7]);

    const rows = await adapter.all('SELECT id, n FROM t WHERE n > ?', [1]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'a');
    assert.equal(Number(rows[0].n), 7);

    const sel = bridge.calls.find((c) => c.cmd === 'plugin:sql|select');
    assert.deepEqual(sel.args.values, [1], 'les valeurs liées doivent être transmises');
  });

  test('parcours complet : Db ouvert sur l’adaptateur Tauri', async () => {
    const bridge = fakeTauriBridge();
    bridge.install();

    const adapter = await createAdapter('tauri');
    const db = await Db.open(adapter);

    await db.upsert('productions', { date: '2026-09-18', name: 'Tomate', qty: 12, value: 60000 });
    const rows = await db.findAll('productions');

    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].qty), 12);
    assert.equal(await db.countPending(), 1);

    await db.close();
  });
});

describe('aucun bare specifier dans le socle', () => {
  test('core/ ne contient que des imports relatifs avec extension', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = new URL('../biozar/web/core/', import.meta.url).pathname;

    const offenders = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/(?:^|\s)import\s+[^;]*?from\s+['"]([^'"]+)['"]/gs)) {
        const spec = m[1];
        // node:* et les relatifs avec extension sont les seuls admis.
        if (!spec.startsWith('.') && !spec.startsWith('node:')) {
          offenders.push(`${f} → ${spec}`);
        }
      }
      // Les imports dynamiques aussi.
      for (const m of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        if (!m[1].startsWith('.') && !m[1].startsWith('node:')) {
          offenders.push(`${f} → import(${m[1]})`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'une WebView sans bundler ne résout pas les bare specifiers : ' + offenders.join(', ')
    );
  });
});
