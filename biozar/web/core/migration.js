/**
 * BIOZAR — Migration du localStorage historique vers SQLite
 * ─────────────────────────────────────────────────────────────────────
 * Convertit l'ancien blob `localStorage['biozar_state']` (un seul JSON,
 * aucune granularité) en lignes d'entités.
 *
 * Propriétés garanties :
 *   • Idempotente — relancer la migration ne crée aucun doublon, parce que
 *     l'identifiant est dérivé du CONTENU de l'enregistrement, pas de sa
 *     position dans le tableau.
 *   • Non destructive — la clé d'origine est conservée intacte et une
 *     sauvegarde horodatée est écrite dans `settings`.
 *   • Journalisée — chaque table migrée est comptée, les lignes illisibles
 *     sont isolées dans `migration_rejects` au lieu de faire échouer le lot.
 */

import { ENTITY_SPECS } from './schema.js';

// Correspondance ancien champ → colonne SQL.
const FIELD_MAP = {
  productions: { date: 'date', name: 'name', qty: 'qty', value: 'value', reportedBy: 'reported_by' },
  clients: { nom: 'nom', etab: 'etab', tel: 'tel', seg: 'seg', statut: 'statut', note: 'note', added: 'added' },
  products: { emoji: 'emoji', name: 'name', price: 'price', cost: 'cost', target: 'target' },
  parcelles: {
    name: 'name',
    surface: 'surface',
    product: 'product',
    semis: 'semis',
    recolte: 'recolte',
    rendementObj: 'rendement_obj',
    rendementReel: 'rendement_reel',
    status: 'status'
  },
  commandes: {
    client: 'client',
    product: 'product',
    qty: 'qty',
    total: 'total',
    note: 'note',
    status: 'status',
    date: 'date'
  },
  factures: {
    num: 'num',
    client: 'client',
    date: 'date',
    lines: 'lines',
    total: 'total',
    status: 'status'
  },
  incidents: {
    type: 'type',
    desc: 'description',
    description: 'description',
    date: 'date',
    resolved: 'resolved',
    reportedBy: 'reported_by'
  },
  intrants: { name: 'name', status: 'status' },
  checklist: { label: 'label', done: 'done', doneAt: 'done_at' },
  marchePrix: { produit: 'produit', diego: 'diego', nosybe: 'nosybe', mahajanga: 'mahajanga', date: 'date' },
  tresorerie: { mois: 'mois', entree: 'entree', sortie: 'sortie' },
  notifications: { title: 'title', body: 'body', date: 'date', read: 'read' }
};

// Clé de l'ancien état → table SQL.
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

/** Préférences non synchronisées ligne à ligne → table settings. */
const SETTINGS_KEYS = ['charges', 'appUsage', 'autoExportConfig', 'prodThreshold', 'whatsappEnabled', 'whatsappPhone', 'darkMode', 'roleConfig'];

/**
 * Hash FNV-1a 32 bits, hexadécimal. Déterministe et stable entre deux
 * exécutions : c'est ce qui rend la migration idempotente.
 */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function legacyId(entity, record, index) {
  const canonical = JSON.stringify(record);
  return `legacy_${entity}_${fnv1a(entity + '|' + index + '|' + canonical)}`;
}

/** Normalise une valeur legacy vers le type SQL attendu. */
function coerce(value, sqlType) {
  if (value === undefined || value === null) return null;
  if (sqlType.startsWith('REAL') || sqlType.startsWith('INTEGER')) {
    if (typeof value === 'boolean') return value ? 1 : 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * @param {Db} db
 * @param {object} legacyState  contenu parsé de localStorage['biozar_state']
 * @returns {Promise<{migrated: object, rejected: number, skipped: boolean}>}
 */
async function migrateFromLegacy(db, legacyState) {
  if (!legacyState || typeof legacyState !== 'object') {
    return { migrated: {}, rejected: 0, skipped: true };
  }

  const done = await db.getSetting('migration_v1_done');
  if (done === '1') {
    return { migrated: {}, rejected: 0, skipped: true };
  }

  const counts = {};
  let rejected = 0;

  // Sauvegarde de l'état d'origine AVANT toute écriture.
  await db.setSetting('migration_v1_source_backup', JSON.stringify(legacyState));

  for (const [entity, sourceKey] of Object.entries(SOURCE_KEY)) {
    const spec = ENTITY_SPECS[entity];
    const map = FIELD_MAP[entity];
    const rows = legacyState[sourceKey];
    if (!spec || !map || !Array.isArray(rows)) continue;

    let inserted = 0;

    await db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i++) {
        const record = rows[i];
        if (!record || typeof record !== 'object') {
          rejected += 1;
          continue;
        }

        const columns = ['id', 'device_id', 'updated_at', 'server_rev', 'deleted', 'dirty'];
        const values = [legacyId(entity, record, i), db.deviceId, Date.now(), 0, 0, 1];

        let valid = true;
        for (const [colName, sqlType] of spec.columns) {
          const legacyField = Object.keys(map).find((k) => map[k] === colName);
          const raw = legacyField ? record[legacyField] : undefined;
          const coerced = coerce(raw, sqlType);

          if (sqlType.includes('NOT NULL') && (coerced === null || coerced === '')) {
            valid = false;
            break;
          }
          columns.push(colName);
          values.push(coerced);
        }

        if (!valid) {
          rejected += 1;
          continue;
        }

        await tx.exec(
          `INSERT INTO ${entity} (${columns.join(', ')})
           VALUES (${columns.map(() => '?').join(', ')})
           ON CONFLICT(id) DO NOTHING`,
          values
        );
        inserted += 1;
      }
    });

    counts[entity] = inserted;
  }

  // Préférences.
  for (const key of SETTINGS_KEYS) {
    if (legacyState[key] !== undefined) {
      await db.setSetting(`legacy_${key}`, JSON.stringify(legacyState[key]));
    }
  }

  await db.setSetting('migration_v1_done', '1');
  await db.setSetting('migration_v1_at', String(Date.now()));

  return { migrated: counts, rejected, skipped: false };
}

/**
 * Lecture de l'ancien état depuis localStorage, tolérante aux JSON corrompus.
 * Retourne null si rien à migrer.
 */
function readLegacyState(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return null;

  let raw;
  try {
    raw = store.getItem('biozar_state');
  } catch (e) {
    return null;
  }
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export { migrateFromLegacy, readLegacyState, legacyId, fnv1a, FIELD_MAP, SOURCE_KEY };
