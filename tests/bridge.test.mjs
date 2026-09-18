/**
 * BIOZAR — Tests de la passerelle application ↔ socle SQLite
 * ─────────────────────────────────────────────────────────────────────
 * Exécution :  node --test tests/
 *
 * Le point critique est l'IDENTITÉ des enregistrements : la plupart des
 * tableaux de l'app n'ont pas de clé primaire. Si l'identité est mal
 * calculée, modifier un client crée un doublon au lieu de le mettre à
 * jour — et la synchronisation propagerait le doublon au serveur.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Db, NodeAdapter } from '../biozar/web/core/db.js';
import { diffState, applyOps, stableId, createBridge } from '../biozar/web/core/bridge.js';

async function openDb() {
  return Db.open(new NodeAdapter(':memory:'));
}

describe('identité des enregistrements legacy', () => {
  test('stableId est déterministe', () => {
    const r = { nom: 'Hôtel Royal Palissandre', statut: 'Abonné' };
    assert.equal(stableId('clients', r, 0), stableId('clients', r, 0));
  });

  test('deux clients distincts ont des identifiants distincts', () => {
    assert.notEqual(
      stableId('clients', { nom: 'Hôtel A' }, 0),
      stableId('clients', { nom: 'Hôtel B' }, 0)
    );
  });

  test('deux récoltes du même produit le même jour restent distinctes', () => {
    const a = stableId('productions', { date: '2026-09-18', name: 'Tomate' }, 0);
    const b = stableId('productions', { date: '2026-09-18', name: 'Tomate' }, 1);
    assert.notEqual(a, b, 'l’indice d’occurrence doit départager les doublons naturels');
  });

  test('un identifiant legacy explicite a priorité sur la clé naturelle', () => {
    const r = { id: 42, name: 'Parcelle Est', surface: 2000 };
    assert.equal(stableId('parcelles', r, 0), 'parcelles:id:42');
    // Renommer la parcelle ne change pas son identité : c'est tout l'intérêt
    // d'utiliser l'identifiant existant plutôt que le nom.
    assert.equal(stableId('parcelles', { ...r, name: 'Parcelle Renommée' }, 0), 'parcelles:id:42');
  });
});

describe('différenciation d’état', () => {
  test('détecte un ajout', () => {
    const ops = diffState(
      { clients: [{ nom: 'A' }] },
      { clients: [{ nom: 'A' }, { nom: 'B' }] }
    );
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'upsert');
    assert.equal(ops[0].fields.nom, 'B');
  });

  test('détecte une modification sans créer de doublon', () => {
    const ops = diffState(
      { clients: [{ nom: 'Hôtel A', statut: 'En prospection' }] },
      { clients: [{ nom: 'Hôtel A', statut: 'Abonné' }] }
    );
    assert.equal(ops.length, 1, 'une seule opération, pas deux');
    assert.equal(ops[0].op, 'upsert');
    assert.equal(ops[0].fields.statut, 'Abonné');
  });

  test('détecte une suppression', () => {
    const ops = diffState(
      { clients: [{ nom: 'A' }, { nom: 'B' }] },
      { clients: [{ nom: 'A' }] }
    );
    assert.equal(ops.length, 1);
    assert.equal(ops[0].op, 'delete');
  });

  test('aucune opération quand rien n’a changé', () => {
    const state = {
      clients: [{ nom: 'A' }],
      productions: [{ date: '2026-09-18', name: 'Tomate', qty: 10, value: 50000 }]
    };
    assert.deepEqual(diffState(state, JSON.parse(JSON.stringify(state))), []);
  });

  test('ignore les changements hors entités synchronisées', () => {
    const ops = diffState(
      { clients: [{ nom: 'A' }], charges: { loyer: 800000 } },
      { clients: [{ nom: 'A' }], charges: { loyer: 999000 } }
    );
    assert.deepEqual(ops, [], 'les préférences ne passent pas par la synchro ligne à ligne');
  });

  test('renomme correctement les champs legacy', () => {
    const ops = diffState(
      { parcelles: [] },
      { parcelles: [{ id: 1, name: 'Est', rendementObj: 4000, rendementReel: 3800, status: 'En production' }] }
    );
    assert.equal(ops[0].fields.rendement_obj, 4000);
    assert.equal(ops[0].fields.rendement_reel, 3800);
    assert.equal(ops[0].fields.rendementObj, undefined, 'le nom legacy ne doit pas subsister');
  });

  test('sérialise les structures imbriquées (lignes de facture)', () => {
    const ops = diffState(
      { factures: [] },
      { factures: [{ id: 7, num: 'FAC-0001', client: 'A', date: '2026-09-18', total: 50000, lines: [{ product: 'Tomate', qty: 2 }] }] }
    );
    assert.equal(typeof ops[0].fields.lines, 'string', 'SQLite ne stocke pas de tableau');
    assert.deepEqual(JSON.parse(ops[0].fields.lines), [{ product: 'Tomate', qty: 2 }]);
  });

  test('convertit les booléens en 0/1', () => {
    const ops = diffState(
      { incidents: [] },
      { incidents: [{ id: 1, type: 'Irrigation', desc: 'Pompe HS', date: '2026-09-18', resolved: true }] }
    );
    assert.equal(ops[0].fields.resolved, 1);
    assert.equal(ops[0].fields.description, 'Pompe HS');
  });
});

describe('application en base', () => {
  test('les opérations deviennent des lignes + des entrées de file', async () => {
    const db = await openDb();
    const ops = diffState(
      { clients: [] },
      { clients: [{ nom: 'Hôtel A', statut: 'Abonné' }, { nom: 'Hôtel B', statut: 'En prospection' }] }
    );

    const applied = await applyOps(db, ops);
    assert.equal(applied.upserts, 2);

    const rows = await db.findAll('clients');
    assert.equal(rows.length, 2);
    assert.equal(await db.countPending(), 2);

    await db.close();
  });

  test('modifier une ligne ne crée pas de doublon en base', async () => {
    const db = await openDb();

    await applyOps(db, diffState({ clients: [] }, { clients: [{ nom: 'Hôtel A', statut: 'En prospection' }] }));
    await applyOps(
      db,
      diffState({ clients: [{ nom: 'Hôtel A', statut: 'En prospection' }] }, { clients: [{ nom: 'Hôtel A', statut: 'Abonné' }] })
    );

    const rows = await db.findAll('clients');
    assert.equal(rows.length, 1, 'une seule ligne en base');
    assert.equal(rows[0].statut, 'Abonné');
    assert.equal(await db.countPending(), 1, 'une seule opération en file, pas deux');

    await db.close();
  });

  test('une suppression est logique et propagée', async () => {
    const db = await openDb();
    const before = { clients: [{ nom: 'Hôtel A' }] };
    await applyOps(db, diffState({ clients: [] }, before));

    await applyOps(db, diffState(before, { clients: [] }));

    assert.equal((await db.findAll('clients')).length, 0, 'plus visible');
    assert.equal((await db.findAll('clients', { includeDeleted: true })).length, 1, 'toujours en base');

    const del = await db.all("SELECT * FROM outbox WHERE op = 'delete'");
    assert.equal(del.length, 1);

    await db.close();
  });
});

describe('passerelle createBridge', () => {
  test('le premier appel n’écrit rien, les suivants diffèrent', async () => {
    const db = await openDb();
    const bridge = await createBridge({ db });

    const initial = { clients: [{ nom: 'Hôtel A' }], productions: [] };
    bridge.prime(initial);
    assert.equal(await db.countPending(), 0, 'primer appel : rien à pousser');

    const r = await bridge.syncState({ clients: [{ nom: 'Hôtel A' }, { nom: 'Hôtel B' }], productions: [] });
    assert.equal(r.ops, 1);
    assert.equal(r.upserts, 1);
    assert.equal(await db.countPending(), 1);

    // Même état renvoyé : aucune opération.
    const again = await bridge.syncState({ clients: [{ nom: 'Hôtel A' }, { nom: 'Hôtel B' }], productions: [] });
    assert.equal(again.ops, 0);
    assert.equal(await db.countPending(), 1, 'pas d’opération parasite');

    await db.close();
  });

  test('parcours réaliste : plusieurs éditions successives', async () => {
    const db = await openDb();
    const bridge = await createBridge({ db });

    bridge.prime({ clients: [], productions: [] });

    let state = { clients: [], productions: [] };

    // 1. Ajout d'un client.
    state = { ...state, clients: [{ nom: 'Hôtel Royal', statut: 'En prospection' }] };
    await bridge.syncState(state);

    // 2. On le passe en abonné.
    state = { ...state, clients: [{ nom: 'Hôtel Royal', statut: 'Abonné' }] };
    await bridge.syncState(state);

    // 3. Ajout de trois récoltes.
    state = {
      ...state,
      productions: [
        { date: '2026-09-16', name: 'Tomate', qty: 10, value: 50000 },
        { date: '2026-09-17', name: 'Tomate', qty: 12, value: 60000 },
        { date: '2026-09-18', name: 'Salade', qty: 8, value: 24000 }
      ]
    };
    await bridge.syncState(state);

    // 4. Correction d'une quantité.
    state = {
      ...state,
      productions: [
        { date: '2026-09-16', name: 'Tomate', qty: 11, value: 55000 },
        { date: '2026-09-17', name: 'Tomate', qty: 12, value: 60000 },
        { date: '2026-09-18', name: 'Salade', qty: 8, value: 24000 }
      ]
    };
    await bridge.syncState(state);

    assert.equal((await db.findAll('clients')).length, 1);
    assert.equal((await db.findAll('productions')).length, 3);

    const tomates = await db.all("SELECT * FROM productions WHERE name = 'Tomate' ORDER BY date");
    assert.equal(Number(tomates[0].qty), 11, 'la correction est appliquée');
    assert.equal(Number(tomates[1].qty), 12, 'l’autre récolte n’est pas touchée');

    assert.equal(await db.countPending(), 4, '1 client + 3 récoltes, sans doublon');

    await db.close();
  });
});
