/**
 * BIOZAR — Transport Supabase (double écriture)
 * ─────────────────────────────────────────────────────────────────────
 * Phase de transition décidée : les nouvelles tables par entité deviennent
 * la source de vérité, MAIS le blob historique `biozar_state` continue
 * d'être alimenté, pour que l'application web actuellement déployée sur
 * Cloudflare Pages reste fonctionnelle pendant la migration.
 *
 *   écriture  ──►  tables par entité   (autorité, LWW ligne à ligne)
 *            └──►  biozar_state.data   (miroir de compatibilité)
 *
 * Quand tous les clients seront passés sur le socle SQLite, il suffira de
 * mettre `legacyMirror: false` : aucune autre modification n'est nécessaire.
 */

import { ENTITY_SPECS } from './schema.js';

/** Nom de la table SQL côté serveur, si différent du nom local. */
const REMOTE_TABLE = {
  marche_prix: 'marche_prix'
};

class SupabaseTransport {
  /**
   * @param {object} cfg { url, anonKey, accessToken?, legacyMirror?, fetchImpl? }
   */
  constructor(cfg) {
    if (!cfg || !cfg.url || !cfg.anonKey) {
      throw new Error('SupabaseTransport : url et anonKey sont requis');
    }
    this.url = cfg.url.replace(/\/$/, '');
    this.anonKey = cfg.anonKey;
    this.accessToken = cfg.accessToken || null;
    this.legacyMirror = cfg.legacyMirror !== false;
    this.fetchImpl = cfg.fetchImpl || fetch;
  }

  _headers(extra = {}) {
    const h = {
      'Content-Type': 'application/json',
      apikey: this.anonKey,
      Accept: 'application/json',
      ...extra
    };
    if (this.accessToken) h.Authorization = `Bearer ${this.accessToken}`;
    return h;
  }

  async _request(path, options = {}) {
    const res = await this.fetchImpl(`${this.url}/rest/v1${path}`, {
      ...options,
      headers: this._headers(options.headers)
    });

    if (!res.ok) {
      // 5xx et coupures sont rejouables ; 4xx signale un vrai problème.
      const err = new Error(`HTTP ${res.status} ${res.statusText}`);
      err.retryable = res.status >= 500;
      err.status = res.status;
      throw err;
    }
    return res;
  }

  /**
   * Pousse un lot de lignes. Idempotent côté serveur grâce à
   * `resolution=merge-duplicates` sur la clé primaire `id`.
   */
  async push(entity, rows) {
    if (!rows || rows.length === 0) return { applied: [] };
    const table = REMOTE_TABLE[entity] || entity;

    const payload = rows.map((row) => {
      const spec = ENTITY_SPECS[entity];
      const out = {
        id: row.id,
        device_id: row.device_id,
        updated_at: Number(row.updated_at),
        deleted: Number(row.deleted) || 0
      };
      for (const [col] of spec.columns) out[col] = row[col];
      return out;
    });

    const res = await this._request(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify(payload)
    });

    const saved = await res.json();
    const applied = (Array.isArray(saved) ? saved : []).map((r) => ({
      id: r.id,
      server_rev: r.server_rev != null ? Number(r.server_rev) : null
    }));

    return { applied };
  }

  /** Récupère les lignes modifiées après `since` (ms epoch). */
  async pull(entity, since) {
    const table = REMOTE_TABLE[entity] || entity;
    const from = Number(since || 0);

    const res = await this._request(
      `/${table}?updated_at=gt.${from}&select=*&order=updated_at.asc&limit=1000`
    );
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  }

  /** Sonde de santé : utilisée par la détection réseau. */
  async health() {
    try {
      await this._request('/biozar_state?select=id&limit=1');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Miroir de compatibilité : reconstitue l'ancien blob depuis les tables
   * par entité et l'upserte dans `biozar_state`.
   *
   * @param {Db} db
   */
  async writeLegacyMirror(db) {
    if (!this.legacyMirror) return false;

    const SOURCE_KEY = {
      productions: 'productions',
      clients: 'clients',
      products: 'products',
      parcelles: 'parcelles',
      commandes: 'commandes',
      factures: 'factures',
      incidents: 'incidents',
      intrants: 'intrants',
      checklist: 'checklist',
      marche_prix: 'marchePrix',
      tresorerie: 'tresorerie',
      notifications: 'notifications'
    };

    const blob = {};
    for (const [entity, key] of Object.entries(SOURCE_KEY)) {
      if (!ENTITY_SPECS[entity]) continue;
      blob[key] = (await db.findAll(entity)).map(toLegacyShape.bind(null, entity));
    }

    // Les préférences non synchronisées ligne à ligne.
    for (const k of ['legacy_charges', 'legacy_appUsage', 'legacy_prodThreshold', 'legacy_darkMode']) {
      const raw = await db.getSetting(k);
      if (raw != null) {
        try {
          blob[k.replace(/^legacy_/, '')] = JSON.parse(raw);
        } catch (_) {
          /* préférence illisible : on l'ignore plutôt que de corrompre le blob */
        }
      }
    }

    await this._request('/biozar_state', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        id: 'appState',
        data: blob,
        updated_at: new Date().toISOString()
      })
    });

    return true;
  }
}

/**
 * Repasse une ligne SQL à la forme attendue par l'ancien code
 * (rendement_reel → rendementObj, resolved INTEGER → booléen…).
 */
function toLegacyShape(entity, row) {
  const base = { ...row };
  delete base.dirty;
  delete base.server_rev;
  delete base.device_id;

  if (entity === 'parcelles') {
    base.rendementObj = row.rendement_obj;
    base.rendementReel = row.rendement_reel;
    delete base.rendement_obj;
    delete base.rendement_reel;
  }
  if (entity === 'incidents') {
    base.desc = row.description;
    base.resolved = !!row.resolved;
    base.reportedBy = row.reported_by;
    delete base.description;
    delete base.reported_by;
  }
  if (entity === 'factures') {
    // `lines` est stocké en TEXT (JSON) côté SQL, l'ancien code attend un tableau.
    if (typeof base.lines === 'string') {
      try {
        base.lines = JSON.parse(base.lines);
      } catch (_) {
        base.lines = [];
      }
    }
  }
  if (entity === 'productions') {
    base.reportedBy = row.reported_by;
    delete base.reported_by;
  }

  return base;
}

export { SupabaseTransport, toLegacyShape, REMOTE_TABLE };
