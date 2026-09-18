/**
 * BIOZAR — Tests de l'indicateur de synchronisation dans un vrai DOM
 * ─────────────────────────────────────────────────────────────────────
 * `createSyncIndicator()` n'avait jamais été exécuté : il faut un DOM. Ces
 * tests le montent dans jsdom et vérifient le rendu réel, attribut par
 * attribut — pas le code source.
 *
 * Ils vérifient aussi la contrainte de direction artistique dans le CSS
 * effectivement injecté : ni dégradé, ni halo, ni animation permanente.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { createSyncIndicator, STATES } from '../biozar/web/core/sync-status.js';

let dom;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><head></head><body><div id="cloud-status"></div></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
});

afterEach(() => {
  delete globalThis.window;
  delete globalThis.document;
});

function mount(opts) {
  const host = document.getElementById('cloud-status');
  const indicator = createSyncIndicator(host, opts);
  return { host, indicator };
}

describe('montage', () => {
  test('renvoie null sans hôte plutôt que de lever', () => {
    assert.equal(createSyncIndicator(null), null);
  });

  test('le CSS est injecté une seule fois, même pour plusieurs instances', () => {
    mount();
    const second = document.createElement('div');
    document.body.appendChild(second);
    createSyncIndicator(second);

    assert.equal(document.querySelectorAll('#sync-indicator-css').length, 1);
  });

  test('l’état initial est hors-ligne, pas « synchronisé »', () => {
    const { host } = mount();
    // Un indicateur qui afficherait « synchronisé » avant toute vérification
    // mentirait à l'opérateur : le défaut doit être l'état le plus prudent.
    assert.equal(host.dataset.state, 'offline');
    assert.equal(host.querySelector('.sync-indicator__label').textContent, 'Hors-ligne');
  });

  test('accessible : role et aria-label posés', () => {
    const { host } = mount();
    assert.equal(host.getAttribute('role'), 'status');
    assert.ok(host.getAttribute('aria-label').includes('Hors-ligne'));
  });
});

describe('les quatre états', () => {
  test('online : ● Synchronisé, vert, sans compteur', () => {
    const { host, indicator } = mount();
    indicator.render('online', { pending: 0 });

    assert.equal(host.dataset.state, 'online');
    assert.equal(host.querySelector('.sync-indicator__glyph').textContent, '●');
    assert.equal(host.querySelector('.sync-indicator__label').textContent, 'Synchronisé');
    assert.equal(host.querySelector('.sync-indicator__count').hidden, true);
    assert.equal(host.style.getPropertyValue('--sync-color'), 'var(--green-mid, #2d6a35)');
  });

  test('offline : ○ creux, gris, aucune animation', () => {
    const { host, indicator } = mount();
    indicator.render('offline');

    assert.equal(host.querySelector('.sync-indicator__glyph').textContent, '○');
    assert.equal(host.style.getPropertyValue('--sync-color'), 'var(--text-muted, #8a8f8c)');
  });

  test('syncing : ◐ ambre, compteur masqué', () => {
    const { host, indicator } = mount();
    indicator.render('syncing', { pending: 7 });

    assert.equal(host.querySelector('.sync-indicator__glyph').textContent, '◐');
    assert.equal(
      host.querySelector('.sync-indicator__count').hidden,
      true,
      'pendant la synchro le compteur bouge sans cesse : il n’informe pas'
    );
  });

  test('sync_error : alerte, rouge, bouton Réessayer', () => {
    const { host, indicator } = mount();
    indicator.render('sync_error', { pending: 3 });

    assert.equal(host.getAttribute('role'), 'alert', 'une erreur doit interrompre le lecteur d’écran');
    assert.equal(host.style.getPropertyValue('--sync-color'), '#c0392b');
    assert.equal(host.querySelector('.sync-indicator__action').hidden, false);
    assert.equal(host.querySelector('.sync-indicator__action').textContent, 'Réessayer');
    assert.ok(host.getAttribute('aria-label').includes('Échec de synchro'));
  });

  test('un état inconnu retombe sur hors-ligne sans lever', () => {
    const { host, indicator } = mount();
    indicator.render('etat_inexistant');
    assert.equal(host.dataset.state, 'etat_inexistant');
    assert.equal(host.querySelector('.sync-indicator__label').textContent, 'Hors-ligne');
  });
});

describe('compteur d’opérations en attente', () => {
  test('affiché dès qu’il y a du travail local', () => {
    const { host, indicator } = mount();
    indicator.render('online', { pending: 12 });

    const count = host.querySelector('.sync-indicator__count');
    assert.equal(count.hidden, false);
    assert.equal(count.textContent, '12');
    assert.ok(
      host.getAttribute('aria-label').includes('12 élément(s) en attente'),
      'le compteur doit être annoncé, pas seulement visible'
    );
  });

  test('masqué à zéro', () => {
    const { host, indicator } = mount();
    indicator.render('online', { pending: 0 });
    assert.equal(host.querySelector('.sync-indicator__count').hidden, true);
  });

  test('une valeur non numérique est traitée comme zéro', () => {
    const { host, indicator } = mount();
    indicator.render('online', { pending: undefined });
    assert.equal(host.querySelector('.sync-indicator__count').hidden, true);
  });

  test('en erreur, le compteur est intégré au libellé', () => {
    const { host, indicator } = mount();
    indicator.render('sync_error', { pending: 2 });
    assert.equal(
      host.querySelector('.sync-indicator__label').textContent,
      'Échec de synchro · 2 en attente'
    );
  });
});

describe('action « Réessayer »', () => {
  test('le clic rappelle onRetry avec l’état courant', () => {
    const seen = [];
    const { host, indicator } = mount({ onRetry: (s) => seen.push(s) });

    indicator.render('sync_error', { pending: 2 });
    host.querySelector('.sync-indicator__action').click();

    assert.deepEqual(seen, ['sync_error']);
  });

  test('le bouton est masqué hors état d’erreur', () => {
    const { host, indicator } = mount({ onRetry: () => {} });
    indicator.render('online');
    assert.equal(host.querySelector('.sync-indicator__action').hidden, true);
  });
});

describe('direction artistique : le CSS réellement injecté', () => {
  function injectedCss() {
    mount();
    return document.getElementById('sync-indicator-css').textContent;
  }

  test('aucun dégradé', () => {
    assert.equal(/linear-gradient|radial-gradient/.test(injectedCss()), false);
  });

  test('aucun halo lumineux', () => {
    assert.equal(/box-shadow:\s*0 0 \d+px/.test(injectedCss()), false);
  });

  test('aucune animation permanente : le mouvement est conditionné', () => {
    const css = injectedCss();
    // Toute @keyframes doit vivre derrière prefers-reduced-motion.
    assert.ok(css.includes('@media (prefers-reduced-motion: no-preference)'),
      'le mouvement doit respecter la préférence système');

    const guarded = css.slice(css.indexOf('@media (prefers-reduced-motion'));
    const animations = (css.match(/animation:/g) || []).length;
    const guardedAnimations = (guarded.match(/animation:/g) || []).length;
    assert.equal(animations, guardedAnimations,
      'toute déclaration animation: doit être dans le bloc conditionné');
  });

  test('pas de glassmorphism : fond opaque ou transparent, pas de flou', () => {
    assert.equal(/backdrop-filter/.test(injectedCss()), false);
  });

  test('chiffres tabulaires pour un compteur qui ne saute pas', () => {
    assert.ok(injectedCss().includes('font-variant-numeric:tabular-nums'));
  });

  test('les quatre états sont définis', () => {
    assert.deepEqual(Object.keys(STATES).sort(), ['offline', 'online', 'sync_error', 'syncing']);
  });
});
