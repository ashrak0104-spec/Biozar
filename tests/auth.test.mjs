/**
 * BIOZAR — Test du flux d'authentification vers la synchronisation
 * ─────────────────────────────────────────────────────────────────────
 * Depuis la migration 002, les politiques RLS des tables d'entités exigent
 * `auth.uid() IS NOT NULL`. Avec la seule clé anonyme, chaque requête
 * renvoie 401 — et la file d'attente ne se vide jamais, silencieusement.
 *
 * Le jeton n'existe qu'APRÈS la connexion de l'utilisateur, donc après le
 * démarrage du socle. Ces tests vérifient qu'il circule jusqu'au transport.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SupabaseTransport } from '../biozar/web/core/transport-supabase.js';
import { bootstrap } from '../biozar/web/core/index.js';
import { install } from '../biozar/web/core/wiring.js';
import { NodeAdapter } from '../biozar/web/core/db.js';

const CFG = {
  url: 'https://exemple.supabase.co',
  anonKey: 'anon-test'
};

/** Capture les en-têtes envoyés sans toucher au réseau. */
function captureFetch(responder) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({ url, options });
    return responder ? responder(url, options) : { ok: true, status: 200, json: async () => [] };
  };
  return { impl, calls };
}

describe('jeton d’accès dans le transport', () => {
  test('sans jeton, aucun en-tête Authorization n’est envoyé', async () => {
    const { impl, calls } = captureFetch();
    const t = new SupabaseTransport({ ...CFG, fetchImpl: impl });

    assert.equal(t.accessToken, null);
    await t.pull('clients', 0);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.equal(calls[0].options.headers.apikey, 'anon-test', 'la clé anon reste envoyée');
  });

  test('setAccessToken installe le jeton et l’en-tête apparaît', async () => {
    const { impl, calls } = captureFetch();
    const t = new SupabaseTransport({ ...CFG, fetchImpl: impl });

    assert.equal(t.setAccessToken('eyJtoken'), true, 'la valeur a changé');
    await t.pull('clients', 0);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer eyJtoken');

    // Idempotent : même jeton ⇒ pas de changement signalé.
    assert.equal(t.setAccessToken('eyJtoken'), false);
  });

  test('retirer le jeton supprime l’en-tête (déconnexion)', async () => {
    const { impl, calls } = captureFetch();
    const t = new SupabaseTransport({ ...CFG, accessToken: 'eyJtoken', fetchImpl: impl });

    t.setAccessToken(null);
    await t.pull('clients', 0);
    assert.equal(calls[0].options.headers.Authorization, undefined);
  });

  test('un 401 n’est pas réessayable : la file ne tourne pas en boucle', async () => {
    const { impl } = captureFetch(() => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ message: 'JWT expired' })
    }));
    const t = new SupabaseTransport({ ...CFG, fetchImpl: impl });

    await assert.rejects(
      () => t.pull('clients', 0),
      (e) => {
        assert.equal(e.status, 401);
        assert.equal(e.retryable, false, 'un problème d’auth ne se résout pas en réessayant');
        return true;
      }
    );
  });

  test('un 500 reste réessayable', async () => {
    const { impl } = captureFetch(() => ({ ok: false, status: 503, statusText: 'Unavailable' }));
    const t = new SupabaseTransport({ ...CFG, fetchImpl: impl });

    await assert.rejects(() => t.pull('clients', 0), (e) => {
      assert.equal(e.retryable, true);
      return true;
    });
  });
});

describe('jeton via la façade bootstrap()', () => {
  test('bootstrap expose setAccessToken et isAuthorized', async () => {
    const { impl } = captureFetch();
    const app = await bootstrap({
      platform: 'node',
      adapter: new NodeAdapter(':memory:'),
      supabase: { ...CFG, fetchImpl: impl }
    });

    assert.equal(typeof app.setAccessToken, 'function');
    assert.equal(typeof app.isAuthorized, 'function');
    assert.equal(app.isAuthorized(), false, 'pas encore connecté');

    app.setAccessToken('eyJtoken');
    assert.equal(app.isAuthorized(), true);

    await app.db.close();
    app.detach();
  });
});

describe('câblage : le jeton est repris depuis la session courante', () => {
  /** Environnement minimal de WebView : window, document, fetch. */
  function fakeDom(state) {
    const listeners = [];
    globalThis.window = {
      state,
      saveState: function () {
        this.__saved = (this.__saved || 0) + 1;
      },
      initCloudMonitor: function () {
        this.__monitorInit = (this.__monitorInit || 0) + 1;
      },
      addEventListener: (ev, fn) => listeners.push({ ev, fn })
    };
    globalThis.document = {
      addEventListener: (ev, fn) => listeners.push({ ev, fn }),
      visibilityState: 'visible',
      getElementById: () => null
    };
    return { listeners };
  }

  function clearDom() {
    delete globalThis.window;
    delete globalThis.document;
  }

  test('install() reprend le jeton de state.currentUser avant chaque synchro', async () => {
    const state = {
      currentUser: { login: 'niaina@biozar.mg', accessToken: 'eyJ-session' },
      clients: [{ nom: 'Hôtel A' }],
      productions: []
    };
    const { impl, calls } = captureFetch();
    const { listeners } = fakeDom(state);

    try {
      const bridge = await install({
        getState: () => state,
        supabase: { ...CFG, fetchImpl: impl },
        log: () => {}
      });

      assert.equal(bridge.available, true, `installation échouée : ${bridge.reason}`);
      assert.equal(bridge.isAuthorized(), true, 'le jeton de session doit être repris');

      // Le premier cycle est différé d'un tour de boucle pour ne pas ralentir
      // le démarrage de l'interface : on attend qu'il ait eu lieu.
      await bridge.trigger('test');

      const authed = calls.filter((c) => c.options.headers.Authorization === 'Bearer eyJ-session');
      assert.ok(authed.length > 0, 'au moins une requête authentifiée');
      assert.equal(
        calls.some((c) => c.options.headers.Authorization === undefined),
        false,
        'aucune requête ne doit partir sans jeton'
      );

      // Déconnexion : plus rien ne doit être envoyé.
      state.currentUser = null;
      bridge.refreshAccessToken();
      assert.equal(bridge.isAuthorized(), false);

      const before = calls.length;
      const online = listeners.find((l) => l.ev === 'online');
      assert.ok(online, 'un déclencheur sur l’événement online doit être posé');
      online.fn();
      await new Promise((r) => setTimeout(r, 10));
      assert.equal(calls.length, before, 'aucune requête sans utilisateur connecté');

      // On laisse le cycle différé du démarrage s'écouler avant de démonter
      // le DOM factice, sinon il échoue après la fin du test.
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      clearDom();
    }
  });

  test('sans Supabase configuré, l’installation n’échoue pas', async () => {
    const { listeners } = fakeDom({ clients: [], productions: [] });
    try {
      const bridge = await install({
        // Défensif : le cycle différé du démarrage peut s'écouler après le
        // démontage du DOM factice.
        getState: () => (globalThis.window ? globalThis.window.state : null),
        supabase: undefined,
        log: () => {}
      });
      assert.equal(bridge.available, true);
      assert.equal(bridge.isAuthorized(), false, 'pas de transport ⇒ pas d’autorisation');
      assert.ok(listeners.length > 0, 'les déclencheurs de synchro sont quand même posés');

      await new Promise((r) => setTimeout(r, 10));
    } finally {
      clearDom();
    }
  });
});
