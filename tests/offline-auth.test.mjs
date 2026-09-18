/**
 * BIOZAR — Tests de l'authentification hors-ligne
 * ─────────────────────────────────────────────────────────────────────
 * PBKDF2 réel via WebCrypto (crypto.subtle de Node), pas de simulacre :
 * les 210 000 itérations sont effectivement calculées.
 *
 * Ces tests couvrent la propriété centrale : un compte ne peut se connecter
 * hors-ligne que s'il a été enrôlé après une authentification en ligne.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import { Db, NodeAdapter } from '../biozar/web/core/db.js';
import {
  createOfflineAuth,
  safeEqual,
  toHex,
  fromHex,
  ITERATIONS,
  SALT_BYTES
} from '../biozar/web/core/offline-auth.js';

const CRYPTO = { subtle: webcrypto.subtle, getRandomValues: (a) => webcrypto.getRandomValues(a) };

async function setup({ ttlMs, now } = {}) {
  const db = await Db.open(new NodeAdapter(':memory:'));
  const auth = createOfflineAuth({ db, crypto: CRYPTO, ttlMs, now });
  return { db, auth };
}

describe('primitives', () => {
  test('toHex/fromHex font l’aller-retour', () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255]);
    assert.deepEqual(Array.from(fromHex(toHex(bytes))), Array.from(bytes));
  });

  test('safeEqual est insensible au contenu mais sensible à la longueur', () => {
    assert.equal(safeEqual('abcd', 'abcd'), true);
    assert.equal(safeEqual('abcd', 'abce'), false);
    assert.equal(safeEqual('abcd', 'ab'), false, 'longueurs différentes ⇒ faux');
    assert.equal(safeEqual(null, 'abcd'), false);
  });

  test('le sel fait 128 bits et le nombre d’itérations suit OWASP', () => {
    assert.equal(SALT_BYTES, 16);
    assert.ok(ITERATIONS >= 210000, `${ITERATIONS} itérations, OWASP en recommande 210 000`);
  });
});

describe('enrôlement et vérification', () => {
  test('un compte non enrôlé ne peut pas se connecter hors-ligne', async () => {
    const { db, auth } = await setup();

    const r = await auth.verify('admin', 'peu importe');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'never_enrolled', 'c’est la propriété de sécurité centrale');
    assert.ok(r.message.includes('connexion en ligne'));

    await db.close();
  });

  test('après enrôlement, le bon mot de passe passe', async () => {
    const { db, auth } = await setup();

    await auth.enroll({ login: 'niaina', password: 'S3cret! biozar', role: 'admin', name: 'Niaina' });

    const r = await auth.verify('niaina', 'S3cret! biozar');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.user.role, 'admin');
    assert.equal(r.user.offline, true, 'la session doit être marquée hors-ligne');

    await db.close();
  });

  test('un mauvais mot de passe est refusé', async () => {
    const { db, auth } = await setup();
    await auth.enroll({ login: 'niaina', password: 'S3cret! biozar' });

    const r = await auth.verify('niaina', 'mauvais');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'bad_password');

    await db.close();
  });

  test('le login est insensible à la casse', async () => {
    const { db, auth } = await setup();
    await auth.enroll({ login: 'Niaina', password: 'pw-correct' });

    assert.equal((await auth.verify('niaina', 'pw-correct')).ok, true);
    assert.equal((await auth.verify('NIAINA', 'pw-correct')).ok, true);

    await db.close();
  });

  test('deux comptes distincts ont des sels distincts', async () => {
    const { db, auth } = await setup();
    await auth.enroll({ login: 'admin', password: 'même-mot-de-passe' });
    await auth.enroll({ login: 'jean', password: 'même-mot-de-passe' });

    const raw = await db.getSettingJson('offline_auth_v1', {});
    assert.notEqual(
      raw.admin.salt,
      raw.jean.salt,
      'même mot de passe, mais sels distincts ⇒ vérificateurs distincts'
    );
    assert.notEqual(raw.admin.verifier, raw.jean.verifier);

    await db.close();
  });

  test('le mot de passe n’est stocké nulle part en clair', async () => {
    const { db, auth } = await setup();
    await auth.enroll({ login: 'niaina', password: 'MotDePasseEnClair123' });

    const raw = await db.getSetting('offline_auth_v1');
    assert.equal(
      raw.includes('MotDePasseEnClair123'),
      false,
      'le mot de passe ne doit jamais apparaître dans la base'
    );

    await db.close();
  });

  test('list() n’expose ni sel ni vérificateur', async () => {
    const { db, auth } = await setup();
    await auth.enroll({ login: 'niaina', password: 'pw', role: 'admin' });

    const listed = await auth.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].login, 'niaina');
    assert.equal(listed[0].salt, undefined);
    assert.equal(listed[0].verifier, undefined);

    await db.close();
  });
});

describe('expiration', () => {
  test('un enrôlement expiré est refusé', async () => {
    let clock = 1_000_000;
    const { db, auth } = await setup({ ttlMs: 1000, now: () => clock });

    await auth.enroll({ login: 'niaina', password: 'pw' });
    assert.equal((await auth.verify('niaina', 'pw')).ok, true);

    clock += 1001;
    const r = await auth.verify('niaina', 'pw');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'expired', 'un appareil perdu ne doit pas donner un accès permanent');

    await db.close();
  });

  test('refresh() prolonge la validité', async () => {
    let clock = 1_000_000;
    const { db, auth } = await setup({ ttlMs: 1000, now: () => clock });

    await auth.enroll({ login: 'niaina', password: 'pw' });
    clock += 900;
    assert.equal(await auth.refresh('niaina'), true);

    clock += 900;
    assert.equal((await auth.verify('niaina', 'pw')).ok, true, 'prolongé par refresh');

    await db.close();
  });

  test('revoke() supprime l’accès hors-ligne', async () => {
    const { db, auth } = await setup();
    await auth.enroll({ login: 'niaina', password: 'pw' });

    assert.equal(await auth.revoke('niaina'), true);
    assert.equal((await auth.verify('niaina', 'pw')).reason, 'never_enrolled');
    assert.equal(await auth.revoke('niaina'), false, 'seconde révocation : rien à faire');

    await db.close();
  });
});

describe('robustesse', () => {
  test('une base corrompue ne fait pas lever verify()', async () => {
    const db = await Db.open(new NodeAdapter(':memory:'));
    const auth = createOfflineAuth({ db, crypto: CRYPTO });

    await db.setSetting('offline_auth_v1', 'ceci n’est pas du JSON');
    const r = await auth.verify('niaina', 'pw');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'never_enrolled');

    await db.close();
  });

  test('identifiants manquants : refus explicite, pas d’exception', async () => {
    const { db, auth } = await setup();
    assert.equal((await auth.verify('', 'pw')).ok, false);
    assert.equal((await auth.verify('niaina', '')).ok, false);
    await assert.rejects(() => auth.enroll({ login: '', password: 'pw' }), /requis/);
    await db.close();
  });

  test('sans SubtleCrypto, la construction échoue explicitement', () => {
    assert.throws(
      () => createOfflineAuth({ db: {}, crypto: {} }),
      /SubtleCrypto indisponible/,
      'mieux vaut refuser de démarrer que d’accepter n’importe quel mot de passe'
    );
  });

  test('sans getRandomValues, la construction échoue explicitement', () => {
    assert.throws(
      () => createOfflineAuth({ db: {}, crypto: { subtle: CRYPTO.subtle } }),
      /getRandomValues indisponible/
    );
  });

  test('l’enrôlement survit à la réouverture de la base', async () => {
    const adapter = new NodeAdapter(':memory:');
    const db1 = await Db.open(adapter);
    const auth1 = createOfflineAuth({ db1, db: db1, crypto: CRYPTO });
    await auth1.enroll({ login: 'niaina', password: 'pw' });

    // Même adaptateur, nouvelle façade : le réglage est bien persisté.
    const db2 = await Db.open(adapter);
    const auth2 = createOfflineAuth({ db: db2, crypto: CRYPTO });
    assert.equal((await auth2.verify('niaina', 'pw')).ok, true);

    await db2.close();
  });
});
