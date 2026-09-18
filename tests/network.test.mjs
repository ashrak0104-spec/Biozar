/**
 * BIOZAR — Tests de la machine à états réseau
 * ─────────────────────────────────────────────────────────────────────
 * La connectivité et la phase de synchronisation sont deux dimensions
 * distinctes. Ces tests verrouillent la règle d'affichage, y compris le
 * cas qui faisait rester l'indicateur bloqué sur « syncing ».
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { NetworkMonitor, probe } from '../biozar/web/core/net.js';

function monitor() {
  const seen = [];
  const m = new NetworkMonitor({ onChange: (s, info) => seen.push([s, info]) });
  m.seen = seen;
  return m;
}

describe('machine à états réseau', () => {
  test('sans aucun signal, l’état est offline', () => {
    const m = monitor();
    assert.equal(m.state, 'offline');
    assert.equal(m.isConnected(), null, 'aucun signal connu ≠ connecté');
  });

  test('un signal de connectivité positif donne online', () => {
    const m = monitor();
    m.setConnectivity('browser', true);
    assert.equal(m.state, 'online');
  });

  test('le signal le plus pessimiste ne suffit pas à tout bloquer', () => {
    const m = monitor();
    m.setConnectivity('browser', false); // navigator.onLine dit non
    m.setConnectivity('probe', true); // mais la sonde HTTP passe
    assert.equal(m.state, 'online', 'une sonde réussie prouve que le réseau fonctionne');
  });

  test('tous les signaux négatifs → offline', () => {
    const m = monitor();
    m.setConnectivity('native', false);
    m.setConnectivity('probe', false);
    assert.equal(m.state, 'offline');
  });

  test('une synchro en cours s’affiche syncing puis revient à online', () => {
    const m = monitor();
    m.setConnectivity('probe', true);
    assert.equal(m.state, 'online');

    m.setSyncPhase('syncing', { pending: 4 });
    assert.equal(m.state, 'syncing');

    // C'est le cas qui restait bloqué avant la refonte : sortir de syncing.
    m.setSyncPhase('online', { pending: 0 });
    assert.equal(m.state, 'online', 'l’indicateur doit pouvoir quitter syncing');
  });

  test('un échec de synchro s’affiche sync_error et se récupère', () => {
    const m = monitor();
    m.setConnectivity('probe', true);

    m.setSyncPhase('sync_error', { pending: 7, error: 'HTTP 500' });
    assert.equal(m.state, 'sync_error');
    assert.equal(m.detail.pending, 7);
    assert.equal(m.detail.lastError, 'HTTP 500');

    m.resetError();
    assert.equal(m.state, 'online');
    assert.equal(m.detail.lastError, null);
  });

  test('hors-ligne pendant une synchro : offline l’emporte sur syncing', () => {
    const m = monitor();
    m.setConnectivity('probe', true);
    m.setSyncPhase('syncing');
    assert.equal(m.state, 'syncing');

    m.setConnectivity('probe', false);
    assert.equal(m.state, 'offline', 'l’information utile est « hors-ligne », pas « échec »');

    m.setConnectivity('probe', true);
    assert.equal(m.state, 'syncing', 'la phase de synchro est conservée');
  });

  test('onChange ne se déclenche pas deux fois pour le même état', () => {
    const m = monitor();
    m.setConnectivity('browser', true);
    m.setConnectivity('probe', true);
    m.setConnectivity('native', true);

    const onlineEvents = m.seen.filter(([s]) => s === 'online');
    assert.equal(onlineEvents.length, 1, 'pas de re-render inutile');
  });
});

describe('sonde HTTP', () => {
  test('une réponse — même 5xx — prouve que le réseau fonctionne', async () => {
    const ok = await probe(async () => ({ ok: false, status: 503 }));
    assert.equal(ok, true);
  });

  test('une exception réseau signifie hors-ligne', async () => {
    const down = await probe(async () => {
      throw new TypeError('Failed to fetch');
    });
    assert.equal(down, false);
  });

  test('le timeout de la sonde est appliqué', async () => {
    const started = Date.now();
    const hung = await probe(
      (_url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    assert.equal(hung, false);
    assert.ok(Date.now() - started >= 4900, 'la sonde doit attendre son timeout avant d’abandonner');
  });
});
