/**
 * BIOZAR — Test du chemin legacy Supabase après la migration 002
 * ─────────────────────────────────────────────────────────────────────
 * La migration 002 soumet biozar_state à `auth.uid() IS NOT NULL`. Le
 * client historique (supabase-init.js) n'envoyait que la clé anonyme :
 * ses écritures auraient échoué SILENCIEUSEMENT, supabaseFetch avalant
 * l'erreur et renvoyant null — l'app croyant avoir sauvegardé.
 *
 * supabase-init.js est un script navigateur classique, pas un module : il
 * est donc exécuté ici dans jsdom, comme le ferait la page.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INIT = fs.readFileSync(path.join(ROOT, 'biozar', 'web', 'supabase-init.js'), 'utf8');

let dom;
let sent;

/** Monte la page : fetch stubbé, puis exécution réelle de supabase-init.js. */
function boot({ token, stateToken } = {}) {
  sent = [];

  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'outside-only',
    url: 'https://biozar.test/'
  });

  const w = dom.window;

  // Le script appelle /api/config au chargement : on répond « non configuré »
  // pour qu'il conserve les valeurs par défaut présentes dans le fichier.
  w.fetch = async (url, options = {}) => {
    sent.push({ url: String(url), headers: options.headers || {} });
    if (String(url).includes('/api/config')) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  w.console.info = () => {};
  w.console.warn = () => {};
  w.setTimeout = (fn) => {
    // Les temporisateurs de debounce ne doivent pas maintenir le test ouvert.
    return setTimeout(fn, 0);
  };

  if (token !== undefined) w.__biozarAccessToken = token;
  if (stateToken !== undefined) {
    // `state` est une déclaration lexicale globale dans la vraie page :
    // on la reproduit dans un script du même realm.
    w.eval(`var state = { currentUser: { accessToken: ${JSON.stringify(stateToken)} } };`);
  }

  w.eval(INIT);
  return w;
}

beforeEach(() => {
  sent = [];
});

afterEach(() => {
  if (dom) dom.window.close();
  dom = null;
});

describe('jeton sur le chemin legacy', () => {
  test('sans session, aucun en-tête Authorization (comportement historique)', async () => {
    const w = boot();
    await w.BIOZAR_SUPABASE.saveStateToFirestore({ productions: [] });

    const call = sent.find((c) => c.url.includes('/rest/v1/biozar_state'));
    assert.ok(call, 'une requête vers biozar_state doit avoir été émise');
    assert.equal(call.headers.Authorization, undefined);
    assert.ok(call.headers.apikey, 'la clé anon reste envoyée');
  });

  test('le jeton publié par le socle est repris', async () => {
    const w = boot({ token: 'eyJ-socle' });
    await w.BIOZAR_SUPABASE.saveStateToFirestore({ productions: [] });

    const call = sent.find((c) => c.url.includes('/rest/v1/biozar_state'));
    assert.equal(
      call.headers.Authorization,
      'Bearer eyJ-socle',
      'sans cet en-tête, la politique RLS rejette l’écriture'
    );
  });

  test('à défaut, le jeton est repris de la session en cours', async () => {
    const w = boot({ stateToken: 'eyJ-session' });
    await w.BIOZAR_SUPABASE.saveStateToFirestore({ productions: [] });

    const call = sent.find((c) => c.url.includes('/rest/v1/biozar_state'));
    assert.equal(call.headers.Authorization, 'Bearer eyJ-session');
  });

  test('le jeton explicite a priorité sur la session', async () => {
    const w = boot({ token: 'eyJ-socle', stateToken: 'eyJ-session' });
    await w.BIOZAR_SUPABASE.saveStateToFirestore({ productions: [] });

    const call = sent.find((c) => c.url.includes('/rest/v1/biozar_state'));
    assert.equal(call.headers.Authorization, 'Bearer eyJ-socle');
  });

  test('la lecture est elle aussi authentifiée', async () => {
    const w = boot({ token: 'eyJ-socle' });
    await w.BIOZAR_SUPABASE.loadStateFromFirestore();

    const call = sent.find((c) => c.url.includes('biozar_state?id=eq.appState'));
    assert.ok(call, 'une lecture doit avoir été émise');
    assert.equal(call.headers.Authorization, 'Bearer eyJ-socle');
  });

  test('un jeton vide ne produit pas d’en-tête « Bearer » dégénéré', async () => {
    const w = boot({ token: '' });
    await w.BIOZAR_SUPABASE.saveStateToFirestore({ productions: [] });

    const call = sent.find((c) => c.url.includes('/rest/v1/biozar_state'));
    assert.equal(call.headers.Authorization, undefined, 'pas de « Bearer » sans jeton');
  });
});
