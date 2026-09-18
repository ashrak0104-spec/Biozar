/**
 * BIOZAR — Tests des adaptateurs de plateforme
 * ─────────────────────────────────────────────────────────────────────
 * CapacitorAdapter (Android) et TauriAdapter (Windows) sont les deux cibles
 * réellement livrées. Ni Android SDK ni toolchain Rust dans cet
 * environnement : ces tests exercent donc les adaptateurs contre de faux
 * greffons qui imitent fidèlement les APIs documentées.
 *
 * Cela ne remplace pas un build réel, mais ça couvre ce qui casse le plus
 * souvent : nom des méthodes, forme des paramètres, ordre
 * BEGIN/COMMIT/ROLLBACK, et découpage du script SQL — tauri-plugin-sql
 * n'exécute qu'une instruction par appel.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  CapacitorAdapter,
  TauriAdapter,
  splitStatements,
  Db
} from '../biozar/web/core/db.js';
import { generateSchema } from '../biozar/web/core/schema.js';

// ── Faux greffon @capacitor-community/sqlite ────────────────────
// Signature réelle : run(statement, values, transaction), query(statement,
// values) → { values }, execute(statements, transaction),
// beginTransaction/commitTransaction/rollbackTransaction, close().
function fakeCapacitor() {
  const calls = [];
  let inTx = false;
  return {
    calls,
    get inTransaction() {
      return inTx;
    },
    async run(sql, values, transaction) {
      calls.push({ m: 'run', sql, values, transaction });
      return { changes: { changes: 1 } };
    },
    async query(sql, values) {
      calls.push({ m: 'query', sql, values });
      return { values: [{ id: 'a' }, { id: 'b' }] };
    },
    async execute(statements, transaction) {
      calls.push({ m: 'execute', statements, transaction });
      return {};
    },
    async beginTransaction() {
      calls.push({ m: 'beginTransaction' });
      inTx = true;
    },
    async commitTransaction() {
      calls.push({ m: 'commitTransaction' });
      inTx = false;
    },
    async rollbackTransaction() {
      calls.push({ m: 'rollbackTransaction' });
      inTx = false;
    },
    async close() {
      calls.push({ m: 'close' });
    }
  };
}

// ── Faux greffon tauri-plugin-sql ───────────────────────────────
// Signature réelle : execute(sql, bindValues) → rowsAffected/lastInsertId,
// select(sql, bindValues) → tableau, close().
function fakeTauri() {
  const calls = [];
  return {
    calls,
    async execute(sql, bindValues) {
      calls.push({ m: 'execute', sql, bindValues });
      return { rowsAffected: 1, lastInsertId: 1 };
    },
    async select(sql, bindValues) {
      calls.push({ m: 'select', sql, bindValues });
      return [{ id: 'a' }, { id: 'b' }];
    },
    async close() {
      calls.push({ m: 'close' });
    }
  };
}

describe('CapacitorAdapter (Android)', () => {
  test('exec appelle run() avec transaction = false', async () => {
    const h = fakeCapacitor();
    const a = new CapacitorAdapter(h);

    await a.exec('INSERT INTO clients (id) VALUES (?)', ['x']);

    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].m, 'run');
    assert.deepEqual(h.calls[0].values, ['x']);
    assert.equal(h.calls[0].transaction, false, 'hors transaction explicite');
  });

  test('all() dépaquette r.values et get() renvoie la première ligne', async () => {
    const a = new CapacitorAdapter(fakeCapacitor());

    assert.deepEqual(await a.all('SELECT * FROM clients'), [{ id: 'a' }, { id: 'b' }]);
    assert.deepEqual(await a.get('SELECT * FROM clients'), { id: 'a' });
  });

  test('get() renvoie undefined quand il n’y a aucune ligne', async () => {
    const h = fakeCapacitor();
    h.query = async () => ({ values: [] });
    const a = new CapacitorAdapter(h);
    assert.equal(await a.get('SELECT 1'), undefined);
  });

  test('une transaction valide fait BEGIN puis COMMIT', async () => {
    const h = fakeCapacitor();
    const a = new CapacitorAdapter(h);

    const out = await a.transaction(async (tx) => {
      await tx.exec('INSERT INTO clients (id) VALUES (?)', ['x']);
      return 'ok';
    });

    assert.equal(out, 'ok');
    assert.deepEqual(
      h.calls.map((c) => c.m),
      ['beginTransaction', 'run', 'commitTransaction']
    );
  });

  test('un échec dans la transaction fait ROLLBACK et remonte l’erreur', async () => {
    const h = fakeCapacitor();
    const a = new CapacitorAdapter(h);

    await assert.rejects(
      () =>
        a.transaction(async (tx) => {
          await tx.exec('INSERT INTO clients (id) VALUES (?)', ['x']);
          throw new Error('contrainte violée');
        }),
      /contrainte violée/
    );

    assert.deepEqual(
      h.calls.map((c) => c.m),
      ['beginTransaction', 'run', 'rollbackTransaction']
    );
    assert.equal(h.inTransaction, false, 'la transaction est bien refermée');
  });

  test('un rollback qui échoue ne masque pas l’erreur d’origine', async () => {
    const h = fakeCapacitor();
    h.rollbackTransaction = async () => {
      throw new Error('rollback impossible');
    };
    const a = new CapacitorAdapter(h);

    await assert.rejects(
      () =>
        a.transaction(async () => {
          throw new Error('erreur métier');
        }),
      /erreur métier/,
      'c’est l’erreur métier qui doit remonter, pas celle du rollback'
    );
  });

  test('runStatements passe le script en une seule fois', async () => {
    const h = fakeCapacitor();
    const a = new CapacitorAdapter(h);
    await a.runStatements('CREATE TABLE a (x); CREATE TABLE b (y);');

    assert.equal(h.calls.length, 1, 'le greffon Capacitor accepte un script multi-instructions');
    assert.equal(h.calls[0].m, 'execute');
  });
});

describe('TauriAdapter (Windows)', () => {
  test('exec appelle execute() avec les paramètres liés', async () => {
    const h = fakeTauri();
    const a = new TauriAdapter(h);

    await a.exec('INSERT INTO clients (id) VALUES (?)', ['x']);

    assert.equal(h.calls[0].m, 'execute');
    assert.deepEqual(h.calls[0].bindValues, ['x']);
  });

  test('runStatements découpe : tauri-plugin-sql ne prend qu’une instruction', async () => {
    const h = fakeTauri();
    const a = new TauriAdapter(h);

    await a.runStatements('CREATE TABLE a (x); CREATE TABLE b (y);');

    const sqls = h.calls.map((c) => c.sql);
    assert.equal(sqls.length, 2);
    assert.equal(sqls[0], 'CREATE TABLE a (x)');
    assert.equal(sqls[1], 'CREATE TABLE b (y)');
  });

  test('une transaction passe par BEGIN IMMEDIATE / COMMIT', async () => {
    const h = fakeTauri();
    const a = new TauriAdapter(h);

    await a.transaction(async (tx) => {
      await tx.exec('INSERT INTO clients (id) VALUES (?)', ['x']);
    });

    assert.deepEqual(
      h.calls.map((c) => c.sql),
      ['BEGIN IMMEDIATE', 'INSERT INTO clients (id) VALUES (?)', 'COMMIT']
    );
  });

  test('un échec dans la transaction fait ROLLBACK', async () => {
    const h = fakeTauri();
    const a = new TauriAdapter(h);

    await assert.rejects(
      () =>
        a.transaction(async (tx) => {
          await tx.exec('INSERT INTO clients (id) VALUES (?)', ['x']);
          throw new Error('échec');
        }),
      /échec/
    );

    assert.deepEqual(
      h.calls.map((c) => c.sql),
      ['BEGIN IMMEDIATE', 'INSERT INTO clients (id) VALUES (?)', 'ROLLBACK']
    );
  });

  test('BEGIN IMMEDIATE : verrou d’écriture pris d’emblée', async () => {
    const h = fakeTauri();
    const a = new TauriAdapter(h);
    await a.transaction(async () => {});

    assert.equal(
      h.calls[0].sql,
      'BEGIN IMMEDIATE',
      'un BEGIN différé risquerait SQLITE_BUSY en pleine synchro'
    );
  });
});

describe('splitStatements', () => {
  test('ignore les points-virgules dans une chaîne', () => {
    const out = splitStatements("INSERT INTO t VALUES ('a;b'); INSERT INTO t VALUES ('c');");
    assert.equal(out.length, 2);
    assert.equal(out[0], "INSERT INTO t VALUES ('a;b')");
  });

  test("gère les guillemets doublés (échappement SQL : 'il''s')", () => {
    const out = splitStatements("INSERT INTO t VALUES ('il''s; here'); SELECT 1;");
    assert.equal(out.length, 2, 'le point-virgule protégé ne doit pas découper');
    assert.equal(out[0], "INSERT INTO t VALUES ('il''s; here')");
  });

  test('ignore les points-virgules dans une chaîne entre guillemets doubles', () => {
    const out = splitStatements('CREATE TABLE t (a TEXT DEFAULT ";x"); SELECT 1;');
    assert.equal(out.length, 2);
  });

  test('conserve une dernière instruction sans point-virgule final', () => {
    const out = splitStatements('SELECT 1; SELECT 2');
    assert.deepEqual(out, ['SELECT 1', 'SELECT 2']);
  });

  test('ne produit aucune instruction vide', () => {
    const out = splitStatements(';;SELECT 1;;;\n  ;');
    assert.deepEqual(out, ['SELECT 1']);
  });
});

describe('le vrai schéma survit au découpage Tauri', () => {
  test('chaque instruction découpée s’exécute individuellement sur SQLite', () => {
    const schema = generateSchema();
    const stmts = splitStatements(schema);

    assert.ok(stmts.length > 50, `schéma anormalement court : ${stmts.length} instructions`);

    const db = new DatabaseSync(':memory:');
    let executed = 0;
    for (const s of stmts) {
      // Si le découpage avait tranché au milieu d'une instruction, cette
      // exécution lèverait une erreur de syntaxe.
      db.exec(s);
      executed += 1;
    }

    const tables = db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .get();
    assert.equal(Number(tables.n), 17, 'le schéma compte 17 tables applicatives');

    db.close();
    return `  ${executed} instructions exécutées une par une, ${tables.n} tables`;
  });
});

describe('Db sur un adaptateur de plateforme', () => {
  test('Db.open fonctionne sur CapacitorAdapter via un faux greffon SQLite', async () => {
    // Faux greffon adossé à un vrai SQLite en mémoire : on vérifie que les
    // appels de Db sont compréhensibles par le greffon, pas seulement leur forme.
    const raw = new DatabaseSync(':memory:');
    const handle = {
      async run(sql, values) {
        raw.prepare(sql).run(...(values || []));
        return {};
      },
      async query(sql, values) {
        return { values: raw.prepare(sql).all(...(values || [])) };
      },
      async execute(statements) {
        raw.exec(statements);
        return {};
      },
      async beginTransaction() {
        raw.exec('BEGIN');
      },
      async commitTransaction() {
        raw.exec('COMMIT');
      },
      async rollbackTransaction() {
        raw.exec('ROLLBACK');
      },
      async close() {
        raw.close();
      }
    };

    const db = await Db.open(new CapacitorAdapter(handle));
    assert.ok(db.deviceId, 'un identifiant d’appareil est attribué');

    await db.upsert('clients', { nom: 'Hôtel Royal', statut: 'Abonné' });
    const rows = await db.findAll('clients');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nom, 'Hôtel Royal');
    assert.equal(await db.countPending(), 1);

    await db.close();
  });
});
