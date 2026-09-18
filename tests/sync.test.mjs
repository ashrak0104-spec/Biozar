/**
 * BIOZAR — Tests du socle de persistance et du moteur de synchronisation
 * ─────────────────────────────────────────────────────────────────────
 * Exécution :  node --test tests/
 *
 * Ces tests exercent le VRAI code de production (core/db.js, core/sync-engine.js,
 * core/migration.js) contre un VRAI moteur SQLite (node:sqlite). Le transport
 * réseau est le seul élément simulé, via un faux serveur qui conserve son
 * propre état — c'est ce qui permet de rejouer les scénarios de coupure.
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { Db, NodeAdapter } from '../biozar/web/core/db.js';
import { SyncEngine, resolveWinner, divergentUnionFields, backoffMs } from '../biozar/web/core/sync-engine.js';
import { migrateFromLegacy } from '../biozar/web/core/migration.js';
import { generateSchema, ENTITY_SPECS } from '../biozar/web/core/schema.js';

// ═══════════════════════════════════════════════════════════════
//  Faux serveur : conserve son propre état, peut tomber en panne
// ═══════════════════════════════════════════════════════════════

class FakeServer {
  constructor() {
    this.rows = new Map(); // `${entity}/${id}` → row
    this.rev = 0;
    this.online = true;
    this.pushLog = [];
    this.pushCount = 0;
    this.failAfterPushes = Infinity; // couper le réseau après N push réussis
  }

  _assertOnline() {
    if (!this.online) throw new TypeError('Failed to fetch');
  }

  async push(entity, rows) {
    this._assertOnline();
    const applied = [];

    for (const row of rows) {
      if (this.pushCount >= this.failAfterPushes) {
        this.online = false; // la ligne tombe : le reste du cycle doit survivre
        throw new TypeError('Failed to fetch');
      }

      this.rev += 1;
      this.pushCount += 1;

      const key = `${entity}/${row.id}`;
      const existing = this.rows.get(key);
      // Le serveur applique lui aussi le LWW : il n'écrase pas une ligne
      // plus récente que celle qu'on lui pousse. Sans cette garde, les
      // tests de conflit passeraient pour de mauvaises raisons.
      const accepted =
        !existing || Number(row.updated_at) >= Number(existing.updated_at || 0);

      if (accepted) {
        this.rows.set(key, { ...row, server_rev: this.rev, __entity: entity });
      }
      this.pushLog.push({ entity, id: row.id, seq: this.pushLog.length + 1, accepted });
      applied.push({ id: row.id, server_rev: this.rev });
    }

    return { applied };
  }

  async pull(entity, since) {
    this._assertOnline();
    return [...this.rows.values()].filter(
      (r) => r.__entity === entity && Number(r.updated_at) > Number(since || 0)
    );
  }

  /** Injecte une ligne comme si un autre appareil l'avait poussée. */
  seed(entity, row) {
    this.rev += 1;
    this.rows.set(`${entity}/${row.id}`, { ...row, server_rev: this.rev, __entity: entity });
  }
}

// ═══════════════════════════════════════════════════════════════

async function openDb() {
  return Db.open(new NodeAdapter(':memory:'));
}

describe('schéma', () => {
  test('génère une table par entité avec le tronc de synchronisation', () => {
    const sql = generateSchema();
    for (const entity of Object.keys(ENTITY_SPECS)) {
      assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS ${entity}`), `table ${entity} absente`);
      assert.ok(sql.includes(`idx_${entity}_dirty`), `index dirty manquant sur ${entity}`);
    }
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS outbox'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS conflicts_log'));
    assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS sync_meta'));
  });

  test('la base s’ouvre et enregistre un identifiant d’appareil stable', async () => {
    const db = await openDb();
    const id1 = db.deviceId;
    assert.match(id1, /^dev_/);

    const again = await db.getSetting('device_id');
    assert.equal(again, id1, 'l’identifiant d’appareil doit survivre à une réouverture');
    await db.close();
  });
});

describe('écriture hors-ligne', () => {
  let db;
  beforeEach(async () => {
    db = await openDb();
  });

  test('une écriture crée la ligne ET son entrée de file, atomiquement', async () => {
    const id = await db.upsert('productions', {
      date: '2026-09-18',
      name: 'Tomate Grade A',
      qty: 42,
      value: 210000
    });

    const row = await db.findById('productions', id);
    assert.equal(row.qty, 42);
    assert.equal(row.dirty, 1, 'la ligne doit être marquée à pousser');

    const queued = await db.all('SELECT * FROM outbox');
    assert.equal(queued.length, 1, 'exactement une opération en file');
    assert.equal(queued[0].entity_id, id);
    assert.equal(queued[0].op, 'upsert');
    assert.equal(queued[0].status, 'pending');
  });

  test('rééditer la même ligne ne crée pas d’entrée supplémentaire', async () => {
    const id = await db.upsert('productions', { date: '2026-09-18', name: 'Tomate', qty: 1, value: 5000 });
    await db.upsert('productions', { date: '2026-09-18', name: 'Tomate', qty: 2, value: 10000 }, { id });
    await db.upsert('productions', { date: '2026-09-18', name: 'Tomate', qty: 3, value: 15000 }, { id });

    const queued = await db.all('SELECT * FROM outbox');
    assert.equal(queued.length, 1, 'trois éditions d’une même ligne = un seul push');
    assert.equal(JSON.parse(queued[0].payload).qty, 3, 'le push doit porter la dernière valeur');
  });

  test('un échec dans la transaction annule aussi la mise en file', async () => {
    await assert.rejects(async () => {
      await db.transaction(async (tx) => {
        await tx.exec(
          `INSERT INTO productions (id, device_id, updated_at, dirty, date, name, qty, value)
           VALUES ('x1', 'dev_test', 1, 1, '2026-09-18', 'Tomate', 1, 5000)`
        );
        throw new Error('panne simulée');
      });
    }, /panne simulée/);

    const row = await db.findById('productions', 'x1');
    assert.equal(row, undefined, 'la ligne ne doit pas exister après rollback');
    assert.equal(await db.countPending(), 0);
  });

  test('une suppression est logique et reste propagée', async () => {
    const id = await db.upsert('clients', { nom: 'Hôtel Test', statut: 'Abonné' });
    await db.remove('clients', id);

    const visible = await db.findAll('clients');
    assert.equal(visible.length, 0, 'la ligne ne doit plus apparaître');

    const withDeleted = await db.findAll('clients', { includeDeleted: true });
    assert.equal(withDeleted.length, 1);
    assert.equal(withDeleted[0].deleted, 1);

    const queued = await db.all("SELECT * FROM outbox WHERE op = 'delete'");
    assert.equal(queued.length, 1, 'la suppression doit être propagée au serveur');
  });
});

describe('interruption réseau pendant la synchronisation', () => {
  test('les opérations déjà envoyées ne sont pas perdues, les autres sont reprises', async () => {
    const db = await openDb();
    const server = new FakeServer();

    // Trois saisies faites hors-ligne.
    const ids = [];
    for (let i = 0; i < 3; i++) {
      ids.push(await db.upsert('productions', { date: `2026-09-1${i}`, name: 'Salade', qty: 10 + i, value: 30000 }));
    }
    assert.equal(await db.countPending(), 3);

    // Le réseau tombe juste après le premier push réussi.
    server.failAfterPushes = 1;

    const engine = new SyncEngine(db, server, { logger: { info() {}, warn() {} } });
    const first = await engine.syncOnce();

    assert.equal(first.pushed, 1, 'une seule opération a pu passer');
    assert.equal(first.ok, false, 'le cycle doit signaler l’échec');
    assert.equal(await db.countPending(), 2, 'les opérations restantes doivent survivre');
    assert.equal(server.online, false, 'le serveur doit être tombé');

    // Reconnexion : l'évènement réseau déclenche un rejeu immédiat,
    // sans attendre la fin du backoff (ignoreBackoff).
    server.online = true;
    server.failAfterPushes = Infinity; // la panne est réparée
    const second = await engine.syncOnce({ ignoreBackoff: true });

    assert.equal(second.pushed, 2);
    assert.equal(second.ok, true);
    assert.equal(await db.countPending(), 0, 'la file doit être vide');

    assert.equal(server.pushLog.length, 3, 'le serveur a bien reçu les 3 saisies');
    assert.deepEqual(server.pushLog.map((p) => p.id), ids, 'dans l’ordre de saisie');

    await db.close();
  });

  test('recoverInterrupted remet en file ce qu’un crash avait laissé « in_flight »', async () => {
    const db = await openDb();
    const server = new FakeServer();

    await db.upsert('productions', { date: '2026-09-18', name: 'Tomate', qty: 5, value: 25000 });
    // Simulation d’un kill de l’application en pleine synchro.
    await db.exec("UPDATE outbox SET status = 'in_flight'");
    assert.equal(await db.countPending(), 1);

    const engine = new SyncEngine(db, server, { logger: { info() {}, warn() {} } });
    const recovered = await engine.recoverInterrupted();
    assert.equal(recovered, 1);

    const status = await db.get('SELECT status FROM outbox');
    assert.equal(status.status, 'pending');
    await db.close();
  });

  test('une panne totale ne vide pas la file en boucle contre le serveur', async () => {
    const db = await openDb();
    const server = new FakeServer();
    server.online = false;

    for (let i = 0; i < 4; i++) {
      await db.upsert('productions', { date: `2026-09-1${i}`, name: 'Tomate', qty: i, value: i * 1000 });
    }

    const statuses = [];
    const engine = new SyncEngine(db, server, {
      onStatus: (s) => statuses.push(s),
      logger: { info() {}, warn() {} }
    });

    const result = await engine.syncOnce();

    assert.equal(result.ok, false, 'le cycle doit signaler l’échec');
    assert.equal(result.aborted, true, 'une erreur réseau doit interrompre le cycle');
    assert.equal(await db.countPending(), 4, 'aucune opération ne doit être consommée hors-ligne');
    assert.equal(
      await db.getSetting('last_synced_at'),
      null,
      'last_synced_at ne doit PAS avancer après une coupure, sinon le prochain pull manquerait des changements'
    );
    assert.equal(statuses[statuses.length - 1], 'sync_error');

    await db.close();
  });

  test('le backoff est exponentiel et plafonné', () => {
    assert.equal(backoffMs(1), 1000);
    assert.equal(backoffMs(2), 2000);
    assert.equal(backoffMs(3), 4000);
    assert.equal(backoffMs(20), 60000, 'le backoff doit être plafonné');
  });
});

describe('résolution de conflits', () => {
  test('la version la plus récente gagne', () => {
    assert.equal(resolveWinner({ updated_at: 100, device_id: 'a' }, { updated_at: 5000, device_id: 'b' }), 'remote');
    assert.equal(resolveWinner({ updated_at: 5000, device_id: 'a' }, { updated_at: 100, device_id: 'b' }), 'local');
  });

  test('à égalité d’horodatage, l’arbitrage sur device_id est déterministe', () => {
    const local = { updated_at: 1000, device_id: 'dev_aaa' };
    const remote = { updated_at: 1000, device_id: 'dev_zzz' };
    assert.equal(resolveWinner(local, remote), 'remote');
    assert.equal(resolveWinner(remote, local), 'local', 'le résultat doit être symétrique');
  });

  test('une divergence sur un champ critique est signalée', () => {
    const d = divergentUnionFields(
      'productions',
      { qty: 40, value: 200000 },
      { qty: 55, value: 200000 }
    );
    assert.deepEqual(d, ['qty']);
  });

  test('le LWW par entité n’écrase pas une saisie locale plus récente', async () => {
    const db = await openDb();
    const server = new FakeServer();

    // Local déjà synchronisé, puis un pull ramène une version PÉRIMÉE
    // (réplica en retard, rejeu d’un ancien cycle).
    const localId = 'row-partagee';
    await db.upsert('productions', { date: '2026-09-18', name: 'Tomate', qty: 99, value: 495000 }, { id: localId });
    await db.exec('UPDATE productions SET updated_at = ?, dirty = 0 WHERE id = ?', [Date.now() + 100000, localId]);
    await db.exec('DELETE FROM outbox');

    server.seed('productions', {
      id: localId,
      device_id: 'autre-appareil',
      updated_at: Date.now() - 100000, // nettement plus ancien
      server_rev: 7,
      deleted: 0,
      date: '2026-09-18',
      name: 'Tomate',
      qty: 1,
      value: 5000
    });

    const engine = new SyncEngine(db, server, { logger: { info() {}, warn() {} } });
    const result = await engine.syncOnce();

    const row = await db.findById('productions', localId);
    assert.equal(row.qty, 99, 'la saisie locale plus récente doit être conservée');
    assert.equal(row.value, 495000);
    assert.equal(result.pulled, 0, 'aucune ligne périmée ne doit être appliquée');

    await db.close();
  });

  test('une ligne distante plus récente remplace la locale et archive la perdante', async () => {
    const db = await openDb();
    const server = new FakeServer();

    // État local déjà synchronisé par le passé : plus rien à pousser.
    const id = 'row-conflict';
    await db.upsert('productions', { date: '2026-09-18', name: 'Tomate', qty: 10, value: 50000 }, { id });
    await db.exec('UPDATE productions SET updated_at = ?, dirty = 0 WHERE id = ?', [Date.now() - 100000, id]);
    await db.exec('DELETE FROM outbox');

    // Un autre appareil a modifié la même ligne plus récemment.
    server.seed('productions', {
      id,
      device_id: 'zzz-appareil',
      updated_at: Date.now() + 100000,
      server_rev: 42,
      deleted: 0,
      date: '2026-09-18',
      name: 'Tomate',
      qty: 77,
      value: 385000
    });

    const engine = new SyncEngine(db, server, { logger: { info() {}, warn() {} } });
    const result = await engine.syncOnce();

    const row = await db.findById('productions', id);
    assert.equal(row.qty, 77, 'la version distante plus récente gagne');
    assert.equal(row.dirty, 0);
    assert.equal(result.pulled, 1, 'la ligne distante doit avoir été appliquée');

    const log = await db.all('SELECT * FROM conflicts_log WHERE entity_id = ?', [id]);
    assert.ok(log.length >= 1, 'la version écrasée doit être archivée');
    assert.equal(log[0].winner, 'remote');
    assert.equal(JSON.parse(log[0].local_json).qty, 10, 'la valeur perdue est récupérable');

    await db.close();
  });
});

describe('migration depuis localStorage', () => {
  const legacy = {
    productions: [
      { date: '2026-01-12', name: 'Salade Bio', qty: 15, value: 45000 },
      { date: '2026-01-16', name: 'Herbes Aromatiques', qty: 8, value: 16000 }
    ],
    clients: [{ nom: 'Hôtel Royal Palissandre', statut: 'Abonné', tel: '+261 32 12 345 67' }],
    parcelles: [
      { id: 1, name: 'Parcelle Est', surface: 2000, product: 'Tomate Grade A', rendementObj: 4000, rendementReel: 3800, status: 'En production' }
    ],
    charges: { loyer: 800000, salaires: 2500000 }
  };

  test('convertit les tableaux legacy en lignes d’entités', async () => {
    const db = await openDb();
    const result = await migrateFromLegacy(db, legacy);

    assert.equal(result.skipped, false);
    assert.equal(result.migrated.productions, 2);
    assert.equal(result.migrated.clients, 1);
    assert.equal(result.migrated.parcelles, 1);

    const productions = await db.findAll('productions');
    assert.equal(productions.length, 2);
    assert.equal(productions.find((p) => p.name === 'Salade Bio').qty, 15);

    const parcelle = (await db.findAll('parcelles'))[0];
    assert.equal(parcelle.rendement_reel, 3800, 'le renommage rendementReel → rendement_reel doit fonctionner');

    const charges = await db.getSettingJson('legacy_charges');
    assert.equal(charges.loyer, 800000);

    await db.close();
  });

  test('est idempotente : un second passage ne crée aucun doublon', async () => {
    const db = await openDb();
    await migrateFromLegacy(db, legacy);
    const second = await migrateFromLegacy(db, legacy);
    assert.equal(second.skipped, true, 'la migration ne doit pas se rejouer');
    assert.equal((await db.findAll('productions')).length, 2);
    await db.close();
  });

  test('conserve une sauvegarde de l’état d’origine', async () => {
    const db = await openDb();
    await migrateFromLegacy(db, legacy);
    const backup = await db.getSettingJson('migration_v1_source_backup');
    assert.equal(backup.productions.length, 2, 'l’état d’origine doit être récupérable');
    await db.close();
  });

  test('isole les lignes illisibles sans faire échouer le lot', async () => {
    const db = await openDb();
    const result = await migrateFromLegacy(db, {
      productions: [
        { date: '2026-01-12', name: 'Salade', qty: 15, value: 45000 },
        null,
        { date: '2026-01-13', name: 'Tomate', qty: 20, value: 100000 }
      ]
    });
    assert.equal(result.migrated.productions, 2);
    assert.equal(result.rejected, 1);
    await db.close();
  });
});

describe('parcours complet semi-offline', () => {
  test('saisie hors-ligne → coupure → reconnexion → reprise sans perte', async () => {
    const db = await openDb();
    const server = new FakeServer();
    server.online = false; // l’appareil démarre sans réseau

    const statuses = [];
    const engine = new SyncEngine(db, server, {
      onStatus: (s) => statuses.push(s),
      logger: { info() {}, warn() {} }
    });

    // 1. Travail sur le terrain, aucun réseau.
    const ids = [];
    for (let i = 1; i <= 12; i++) {
      ids.push(
        await db.upsert('productions', {
          date: `2026-09-${String(i).padStart(2, '0')}`,
          name: 'Tomate Grade A',
          qty: i * 5,
          value: i * 25000
        })
      );
    }
    assert.equal(await db.countPending(), 12, 'les 12 saisies doivent être en file');

    // 2. Tentative de synchro sans réseau : rien ne se perd.
    const offlineCycle = await engine.syncOnce();
    assert.equal(offlineCycle.ok, false, 'le cycle doit signaler l’échec');
    assert.equal(await db.countPending(), 12, 'les 12 saisies doivent toujours être en file');
    assert.equal(
      await db.getSetting('last_synced_at'),
      null,
      'last_synced_at ne doit pas avancer pendant la coupure'
    );

    // 3. Le réseau revient : rejeu immédiat de toute la file.
    server.online = true;
    const result = await engine.syncOnce({ ignoreBackoff: true });

    assert.equal(result.pushed, 12, 'les 12 saisies doivent être poussées');
    assert.equal(await db.countPending(), 0, 'file vide après synchro');
    assert.equal(server.pushLog.length, 12);
    assert.deepEqual(
      server.pushLog.map((p) => p.id),
      ids,
      'ordre de saisie préservé'
    );

    // 4. Toutes les lignes sont réconciliées.
    const dirty = await db.all('SELECT COUNT(*) AS n FROM productions WHERE dirty = 1');
    assert.equal(Number(dirty[0].n), 0);

    const lastSync = await db.getSetting('last_synced_at');
    assert.ok(lastSync && Number(lastSync) > 0, 'last_synced_at doit être persisté en base');

    // 5. Le statut final est bien « online ».
    assert.equal(statuses[statuses.length - 1], 'online');

    await db.close();
  });
});
