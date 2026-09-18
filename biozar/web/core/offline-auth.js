/**
 * BIOZAR — Authentification hors-ligne
 * ─────────────────────────────────────────────────────────────────────
 * Le problème initial : sept comptes étaient codés en dur dans index.html
 * avec un SHA-256 NON SALÉ, et deux paires partageaient le même hachage
 * (admin/jean, commercial/pascal) — un seul mot de passe ouvrait donc deux
 * comptes. Le repli s'activait dès que Supabase était injoignable,
 * c'est-à-dire précisément en mode hors-ligne, le mode principal de l'app.
 *
 * Ce fichier embarquait dans l'APK : n'importe qui pouvait extraire les
 * hachages et les casser par table arc-en-ciel.
 *
 * ── Ce que ce module garantit ──
 *   • aucun mot de passe ni hachage n'est livré dans le code source ;
 *   • un compte ne peut se connecter hors-ligne que s'il s'est déjà
 *     authentifié EN LIGNE au moins une fois sur cet appareil ;
 *   • PBKDF2-HMAC-SHA256, 210 000 itérations, sel aléatoire de 128 bits :
 *     un vol de la base locale ne rend pas le mot de passe bon marché ;
 *   • comparaison à temps constant ;
 *   • expiration : un appareil perdu ne donne pas un accès permanent.
 *
 * ── Ce qu'il ne peut PAS garantir ──
 * Une authentification purement côté client n'est jamais inviolable : ce
 * qui tourne dans la WebView est inspectable. Un attaquant avec un accès
 * physique à l'appareil et du temps peut modifier le code. La seule
 * autorité réelle reste le serveur — c'est pourquoi l'enrôlement exige une
 * connexion en ligne réussie, et pourquoi les jetons expirent.
 */

// Recommandation OWASP 2023 pour PBKDF2-HMAC-SHA256.
const ITERATIONS = 210000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

// Au-delà, l'appareil doit revoir le serveur.
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SETTING_KEY = 'offline_auth_v1';

function toHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

/** Comparaison à temps constant : ne révèle pas la position de divergence. */
function safeEqual(aHex, bHex) {
  if (typeof aHex !== 'string' || typeof bHex !== 'string') return false;
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) {
    diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * @param {object} deps
 * @param {Db} deps.db              base locale (le réglage y est stocké)
 * @param {object} [deps.crypto]    SubtleCrypto + getRandomValues (injectable)
 * @param {number} [deps.ttlMs]     durée de validité d'un enrôlement
 * @param {() => number} [deps.now] horloge (injectable pour les tests)
 */
function createOfflineAuth({ db, crypto: cryptoImpl, ttlMs = DEFAULT_TTL_MS, now = () => Date.now() }) {
  const subtle = cryptoImpl && cryptoImpl.subtle;
  const getRandomValues = cryptoImpl && cryptoImpl.getRandomValues;

  if (!subtle || typeof subtle.deriveBits !== 'function') {
    throw new Error('offlineAuth : SubtleCrypto indisponible (contexte non sécurisé ?)');
  }
  if (typeof getRandomValues !== 'function') {
    throw new Error('offlineAuth : getRandomValues indisponible');
  }

  async function derive(password, saltHex, iterations = ITERATIONS) {
    const key = await subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: fromHex(saltHex), iterations, hash: 'SHA-256' },
      key,
      KEY_BITS
    );
    return toHex(bits);
  }

  async function readAll() {
    const raw = await db.getSettingJson(SETTING_KEY, {});
    return raw && typeof raw === 'object' ? raw : {};
  }

  async function writeAll(entries) {
    await db.setSetting(SETTING_KEY, JSON.stringify(entries));
  }

  /**
   * Enrôle un compte après une authentification EN LIGNE réussie.
   * C'est la seule porte d'entrée : sans elle, aucune connexion hors-ligne.
   */
  async function enroll({ login, password, role, name }) {
    if (!login || !password) throw new Error('offlineAuth : login et mot de passe requis');

    const salt = new Uint8Array(SALT_BYTES);
    getRandomValues(salt);
    const saltHex = toHex(salt);

    const entries = await readAll();
    entries[String(login).toLowerCase()] = {
      login,
      name: name || login,
      role: role || 'operator',
      salt: saltHex,
      verifier: await derive(password, saltHex),
      iterations: ITERATIONS,
      enrolledAt: now(),
      expiresAt: now() + ttlMs
    };
    await writeAll(entries);
    return true;
  }

  /**
   * Vérifie un mot de passe hors-ligne.
   * @returns {Promise<{ok:boolean, reason?:string, user?:object}>}
   */
  async function verify(login, password) {
    if (!login || !password) return { ok: false, reason: 'identifiants manquants' };

    const entries = await readAll();
    const entry = entries[String(login).toLowerCase()];

    if (!entry) {
      return {
        ok: false,
        reason: 'never_enrolled',
        message:
          'Ce compte ne s’est jamais connecté sur cet appareil. ' +
          'Une connexion en ligne est requise la première fois.'
      };
    }

    if (entry.expiresAt && now() > entry.expiresAt) {
      return {
        ok: false,
        reason: 'expired',
        message: 'Session hors-ligne expirée. Une reconnexion en ligne est nécessaire.'
      };
    }

    const candidate = await derive(password, entry.salt, entry.iterations || ITERATIONS);
    if (!safeEqual(candidate, entry.verifier)) {
      return { ok: false, reason: 'bad_password', message: 'Login ou mot de passe incorrect' };
    }

    return {
      ok: true,
      user: {
        login: entry.login,
        name: entry.name,
        role: entry.role,
        offline: true
      }
    };
  }

  /** Retire un enrôlement (changement de mot de passe, départ, appareil perdu). */
  async function revoke(login) {
    const entries = await readAll();
    const key = String(login).toLowerCase();
    if (!(key in entries)) return false;
    delete entries[key];
    await writeAll(entries);
    return true;
  }

  /** Liste les comptes enrôlés, sans jamais exposer sel ni vérificateur. */
  async function list() {
    const entries = await readAll();
    return Object.values(entries).map((e) => ({
      login: e.login,
      name: e.name,
      role: e.role,
      enrolledAt: e.enrolledAt,
      expiresAt: e.expiresAt,
      expired: Boolean(e.expiresAt && now() > e.expiresAt)
    }));
  }

  /** Prolonge la validité après une connexion en ligne réussie. */
  async function refresh(login) {
    const entries = await readAll();
    const key = String(login).toLowerCase();
    if (!entries[key]) return false;
    entries[key].enrolledAt = now();
    entries[key].expiresAt = now() + ttlMs;
    await writeAll(entries);
    return true;
  }

  return { enroll, verify, revoke, list, refresh, ITERATIONS };
}

export {
  createOfflineAuth,
  safeEqual,
  toHex,
  fromHex,
  ITERATIONS,
  SALT_BYTES,
  DEFAULT_TTL_MS,
  SETTING_KEY
};
