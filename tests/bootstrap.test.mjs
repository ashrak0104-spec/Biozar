/**
 * BIOZAR — Test de bout en bout de la façade `bootstrap()`
 * ─────────────────────────────────────────────────────────────────────
 * Exécution :  node --test tests/
 *
 * Ce test n'appelle pas les modules internes un par un : il passe par
 * `bootstrap()`, exactement comme le fera l'application. Il vérifie donc
 * le câblage complet — détection de plateforme, ouverture de la base,
 * migration du legacy, détection réseau, moteur de synchro, indicateur.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { bootstrap, detectPlatform } from '../biozar/web/core/index.js';
import { NodeAdapter } from '../biozar/web/core/db.js';

// ── Faux serveur minimal ────────────────────────────────────────
class Server {
  constructor() {
    this.rows = new Map();
    this.online = true;
    this.rev = 0;
    this.legacyWrites = 0;
  }
  async push(entity, rows) {
    if (!this.online) throw new TypeError('Failed to fetch');
    const applied = [];
    for (const row of rows) {
      this.rev += 1;
      this.rows.set(`${entity}/${row.id}`, { ...row, server_rev: this.rev, __entity: entity });
      applied.push({ id: row.id, server_rev: this.rev });
    }
    return { applied };
  }
  async pull(entity, since) {
    if (!this.online) throw new TypeError('Failed to fetch');
    return [...this.rows.values()].filter(
      (r) => r.__entity === entity && Number(r.updated_at) > Number(since || 0)
    );
  }
  async writeLegacyMirror() {
    this.legacyWrites += 1;
    return true;
  }
}

// ── localStorage factice, comme dans une WebView ────────────────
function fakeStorage(data) {
  const store = new Map(Object.entries(data));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}

const LEGACY = JSON.stringify({
  productions: [
    { date: '2026-01-12', name: 'Salade Bio', qty: 15, value: 45000 },
    { date: '2026-01-19', name: 'Tomate Grade A', qty: 12, value: 60000 }
  ],
  clients: [{ nom: 'Hôtel Royal Palissandre', statut: 'Abonné' }],
  charges: { loyer: 800000, salaires: 2500000 }
});

describe('façade bootstrap()', () => {
  test('détecte la plateforme Node dans cet environnement', () => {
    assert.equal(detectPlatform({}), 'node');
  });

  test('ouvre la base, migre le legacy et expose un moteur prêt', async () => {
    const server = new Server();
    const app = await bootstrap({
      platform: 'node',
      adapter: new NodeAdapter(':memory:'),
      storage: fakeStorage({ biozar_state: LEGACY }),
      transport: server
    });

    assert.equal(app.platform, 'node');
    assert.match(app.db.deviceId, /^dev_/);
    assert.equal(app.migration.skipped, false, 'la migration du legacy doit avoir eu lieu');
    assert.equal(app.migration.migrated.productions, 2);

    const productions = await app.db.findAll('productions');
    assert.equal(productions.length, 2, 'les saisies historiques doivent être dans SQLite');

    const charges = await app.db.getSettingJson('legacy_charges');
    assert.equal(charges.loyer, 800000);

    await app.db.close();
  });

  test('une écriture via la façade est durable puis synchronisée', async () => {
    const server = new Server();
    const statuses = [];

    const app = await bootstrap({
      platform: 'node',
      adapter: new NodeAdapter(':memory:'),
      transport: server,
      onStatus: (s) => statuses.push(s),
      // Sonde réseau factice : sans signal de connectivité, le moniteur
      // rapporte légitimement « offline ».
      env: { fetch: async () => ({ ok: true }) }
    });

    // Laisse la sonde asynchrone remonter son verdict.
    await new Promise((r) => setTimeout(r, 10));

    // Saisie sur le terrain.
    const id = await app.db.upsert('productions', {
      date: '2026-09-18',
      name: 'Tomate Grade A',
      qty: 60,
      value: 300000
    });

    assert.equal(await app.db.countPending(), 1, 'l’écriture doit être en file immédiatement');
    assert.equal(server.rows.size, 0, 'rien ne doit partir avant le cycle de synchro');

    // Reconnexion → cycle de synchro.
    const result = await app.syncNow();

    assert.equal(result.ok, true);
    assert.equal(result.pushed, 1);
    assert.equal(await app.db.countPending(), 0);
    assert.equal(server.rows.size, 1, 'le serveur a reçu la saisie');

    const row = await app.db.findById('productions', id);
    assert.equal(row.dirty, 0, 'la ligne doit être réconciliée');
    assert.ok(Number(row.server_rev) > 0, 'la révision serveur doit être enregistrée');

    // Double écriture : le blob historique est alimenté.
    assert.equal(server.legacyWrites, 1, 'writeLegacyMirror doit être appelé après un cycle réussi');

    assert.equal(statuses[statuses.length - 1], 'online');

    await app.db.close();
  });

  test('hors-ligne, l’application reste fully usable et ne perd rien', async () => {
    const server = new Server();
    server.online = false;

    const app = await bootstrap({
      platform: 'node',
      adapter: new NodeAdapter(':memory:'),
      transport: server
    });

    // Douze saisies sans aucun réseau.
    for (let i = 1; i <= 12; i++) {
      await app.db.upsert('productions', {
        date: `2026-09-${String(i).padStart(2, '0')}`,
        name: 'Salade Bio',
        qty: i * 3,
        value: i * 9000
      });
    }

    // Lecture locale : l'app fonctionne à 100 %.
    const local = await app.db.findAll('productions');
    assert.equal(local.length, 12);
    assert.equal(local.reduce((s, p) => s + p.qty, 0), 234);

    // Cycle de synchro sans réseau : rien ne part, rien ne se perd.
    const offline = await app.syncNow().catch(() => null);
    assert.equal(server.rows.size, 0);
    assert.equal(await app.db.countPending(), 12);
    assert.equal(offline && offline.ok, false);

    // Le réseau revient.
    server.online = true;
    const back = await app.syncNow();

    assert.equal(back.ok, true);
    assert.equal(back.pushed, 12, 'les 12 saisies doivent partir à la reconnexion');
    assert.equal(await app.db.countPending(), 0);
    assert.equal(server.rows.size, 12);

    await app.db.close();
  });

  test('refuse de démarrer sur un navigateur sans moteur SQL câblé', async () => {
    await assert.rejects(
      () => bootstrap({ platform: 'browser' }),
      /aucun moteur SQL disponible/,
      'l’erreur doit être explicite plutôt qu’un échec silencieux'
    );
  });
});
