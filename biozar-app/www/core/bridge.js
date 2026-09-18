/**
 * BIOZAR — Passerelle entre l'application existante et le socle SQLite
 * ─────────────────────────────────────────────────────────────────────
 * L'application manipule un objet `state` global et appelle `saveState()`
 * à 41 endroits. Réécrire ces 41 appels d'un coup ferait courir un risque
 * inutile à une app en production.
 *
 * Cette passerelle permet une migration progressive :
 *
 *   • l'app continue d'écrire dans `state` et d'appeler `saveState()` ;
 *   • `syncState(state)` DIFFÉRENCIE l'état courant de l'état précédent et
 *     ne pousse vers SQLite QUE les lignes réellement ajoutées, modifiées
 *     ou supprimées ;
 *   • chaque différence devient une écriture transactionnelle + une entrée
 *     de file d'attente, donc synchronisable dès le retour du réseau.
 *
 * Le point délicat est l'identité des enregistrements : la plupart des
 * tableaux legacy n'ont pas de clé primaire. NATURAL_KEY définit, par
 * entité, les champs qui identifient une ligne de façon stable. Sans ça,
 * modifier un client créerait un doublon au lieu de le mettre à jour.
 */

import { ENTITY_SPECS } from './schema.js';
import { fnv1a } from './migration.js';

// ─── Identité des enregistrements legacy ────────────────────────
// `id`      : champs formant la clé naturelle
// `idField` : si présent, l'enregistrement porte déjà un identifiant stable
const NATURAL_KEY = {
  productions: { id: ['date', 'name'] },
  clients: { id: ['nom'] },
  products: { id: ['name'] },
  parcelles: { idField: 'id', id: ['name'] },
  commandes: { idField: 'id', id: ['client', 'product', 'date'] },
  factures: { idField: 'id', id: ['num', 'client'] },
  incidents: { idField: 'id', id: ['type', 'date'] },
  intrants: { id: ['name'] },
  checklist: { idField: 'id', id: ['label'] },
  marche_prix: { id: ['produit', 'date'] },
  tresorerie: { id: ['mois'] },
  notifications: { idField: 'id', id: ['title', 'date'] }
};

// Clé de l'état legacy → table SQL.
const STATE_KEY = {
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

// Champs legacy → colonnes SQL, pour les entités dont les noms diffèrent.
const COLUMN_MAP = {
  productions: { reportedBy: 'reported_by' },
  parcelles: { rendementObj: 'rendement_obj', rendementReel: 'rendement_reel' },
  incidents: { desc: 'description', reportedBy: 'reported_by' }
};

/**
 * Identifiant stable d'un enregistrement legacy.
 *
 * Deux enregistrements distincts peuvent partager la même clé naturelle
 * (deux récoltes de tomates le même jour). On ajoute alors l'indice
 * d'occurrence, ce qui reste stable tant que l'ordre du tableau l'est.
 */
function stableId(entity, record, occurrence) {
  const rule = NATURAL_KEY[entity] || {};

  if (rule.idField && record[rule.idField] !== undefined && record[rule.idField] !== null) {
    return `${entity}:${rule.idField}:${record[rule.idField]}`;
  }

  const parts = (rule.id || []).map((f) => String(record[f] ?? ''));
  const suffix = occurrence > 0 ? `#${occurrence}` : '';
  return `${entity}:k:${fnv1a(parts.join('|') + suffix)}`;
}

/** Convertit un enregistrement legacy en colonnes SQL. */
function toColumns(entity, record) {
  const spec = ENTITY_SPECS[entity];
  if (!spec) return null;

  const map = COLUMN_MAP[entity] || {};
  const out = {};

  for (const [col] of spec.columns) {
    const legacyField = Object.keys(map).find((k) => map[k] === col) || col;
    let v = record[legacyField];
    if (v === undefined) v = null;
    if (v !== null && typeof v === 'object') v = JSON.stringify(v);
    if (typeof v === 'boolean') v = v ? 1 : 0;
    out[col] = v;
  }
  return out;
}

/**
 * Calcule la différence entre deux états.
 *
 * @returns {Array<{entity, id, op:'upsert'|'delete', fields}>}
 */
function diffState(prev, next) {
  const ops = [];

  for (const [entity, stateKey] of Object.entries(STATE_KEY)) {
    if (!ENTITY_SPECS[entity]) continue;

    const before = indexByKey(entity, prev && prev[stateKey]);
    const after = indexByKey(entity, next && next[stateKey]);

    // Ajouts et modifications.
    for (const [id, record] of after) {
      const old = before.get(id);
      if (!old || JSON.stringify(old.fields) !== JSON.stringify(record.fields)) {
        ops.push({ entity, id, op: 'upsert', fields: record.fields });
      }
    }

    // Suppressions.
    for (const id of before.keys()) {
      if (!after.has(id)) ops.push({ entity, id, op: 'delete' });
    }
  }

  return ops;
}

/** @returns {Map<string, {raw, fields}>} */
function indexByKey(entity, rows) {
  const map = new Map();
  if (!Array.isArray(rows)) return map;

  const seen = new Map();
  for (const record of rows) {
    if (!record || typeof record !== 'object') continue;
    const key = stableId(entity, record, seen.get(rawKey(entity, record)) || 0);
    seen.set(rawKey(entity, record), (seen.get(rawKey(entity, record)) || 0) + 1);

    const fields = toColumns(entity, record);
    if (!fields) continue;
    map.set(key, { raw: record, fields });
  }
  return map;
}

function rawKey(entity, record) {
  const rule = NATURAL_KEY[entity] || {};
  if (rule.idField && record[rule.idField] != null) return `${rule.idField}:${record[rule.idField]}`;
  return (rule.id || []).map((f) => String(record[f] ?? '')).join('|');
}

/**
 * Applique un lot d'opérations à la base, en regroupant par transaction.
 *
 * @param {Db} db
 * @param {Array} ops  résultat de diffState()
 */
async function applyOps(db, ops) {
  if (!ops || ops.length === 0) return { upserts: 0, deletes: 0 };

  let upserts = 0;
  let deletes = 0;

  await db.transaction(async (tx) => {
    for (const op of ops) {
      if (op.op === 'delete') {
        await tx.exec(
          `UPDATE ${op.entity}
              SET deleted = 1, dirty = 1, updated_at = ?, device_id = ?
            WHERE id = ?`,
          [Date.now(), db.deviceId, op.id]
        );
        deletes += 1;
      } else {
        const spec = ENTITY_SPECS[op.entity];

        // Mêmes raisons que dans Db.upsert : une colonne absente doit être
        // omise, pas liée à NULL, sinon les 16 colonnes `NOT NULL DEFAULT 0`
        // du schéma font échouer l'insertion.
        const provided = spec.columns.filter(([c]) => op.fields[c] !== undefined);

        const cols = ['id', 'device_id', 'updated_at', 'dirty', ...provided.map(([c]) => c)];
        const vals = [
          op.id,
          db.deviceId,
          Date.now(),
          1,
          ...provided.map(([c]) => op.fields[c])
        ];
        const assignments = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');

        await tx.exec(
          `INSERT INTO ${op.entity} (${cols.join(', ')})
           VALUES (${cols.map(() => '?').join(', ')})
           ON CONFLICT(id) DO UPDATE SET ${assignments}`,
          vals
        );
        upserts += 1;
      }

      const row = await tx.get(`SELECT * FROM ${op.entity} WHERE id = ?`, [op.id]);
      if (row) {
        await tx.exec(
          `DELETE FROM outbox WHERE entity = ? AND entity_id = ? AND status IN ('pending','conflict')`,
          [op.entity, op.id]
        );
        await tx.exec(
          `INSERT INTO outbox (entity, entity_id, op, payload, created_at) VALUES (?, ?, ?, ?, ?)`,
          [op.entity, op.id, op.op, JSON.stringify(row), Date.now()]
        );
      }
    }
  });

  return { upserts, deletes };
}

/**
 * Passerelle exposée à l'application.
 *
 *   const bridge = await createBridge({ db, engine, monitor });
 *   bridge.syncState(state);   // à la place de / en plus de saveState()
 */
async function createBridge({ db, engine, monitor, onStatus }) {
  let snapshot = null;

  async function syncState(nextState) {
    if (!nextState) return { ops: 0, upserts: 0, deletes: 0 };

    const ops = diffState(snapshot, nextState);
    const applied = await applyOps(db, ops);

    snapshot = clone(nextState);

    if (onStatus) onStatus(ops.length, applied);
    if (monitor && ops.length > 0) {
      monitor.setSyncPhase(monitor.syncPhase === 'syncing' ? 'syncing' : monitor.syncPhase, {
        pending: await db.countPending()
      });
    }

    return { ops: ops.length, ...applied };
  }

  /** Premier appel : alimente l'instantané sans rien écrire. */
  function prime(nextState) {
    snapshot = clone(nextState);
  }

  function clone(o) {
    try {
      return JSON.parse(JSON.stringify(o));
    } catch (_) {
      return null;
    }
  }

  return { syncState, prime, diffState };
}

export {
  createBridge,
  diffState,
  applyOps,
  stableId,
  toColumns,
  indexByKey,
  NATURAL_KEY,
  STATE_KEY,
  COLUMN_MAP
};
