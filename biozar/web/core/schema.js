/**
 * BIOZAR — Schéma de la base locale
 * ─────────────────────────────────────────────────────────────────────
 * Un seul schéma SQL, identique sur Android (APK), Windows (EXE) et
 * navigateur. Les tables sont générées à partir de ENTITY_SPECS : ajouter
 * une entité métier = ajouter 5 lignes ici, rien d'autre.
 *
 * Chaque table entité porte le même tronc commun de synchronisation :
 *
 *   id           TEXT  clé primaire, uuid v7 généré LOCALEMENT
 *   device_id    TEXT  identifie l'appareil émetteur (arbitrage des conflits)
 *   updated_at   INTEGER  millisecondes epoch, horloge locale
 *   server_rev   INTEGER  révision renvoyée par le serveur
 *   deleted      INTEGER  suppression logique (jamais de DELETE physique)
 *   dirty        INTEGER  1 = en attente de push vers le serveur
 */

// ─── Tronc commun de synchronisation ────────────────────────────
const SYNC_COLUMNS = [
  ['id', 'TEXT PRIMARY KEY'],
  ['device_id', 'TEXT NOT NULL'],
  ['updated_at', 'INTEGER NOT NULL'],
  ['server_rev', 'INTEGER NOT NULL DEFAULT 0'],
  ['deleted', 'INTEGER NOT NULL DEFAULT 0'],
  ['dirty', 'INTEGER NOT NULL DEFAULT 1']
];

/**
 * Entités métier. `columns` ne déclare QUE les champs propres à l'entité ;
 * le tronc de synchronisation est ajouté automatiquement.
 *
 * `merge: 'union'` marque un champ critique : en cas de conflit, on garde la
 * valeur non vide la plus récente au lieu d'écraser aveuglément.
 */
const ENTITY_SPECS = {
  productions: {
    columns: [
      ['date', 'TEXT NOT NULL'],
      ['name', 'TEXT NOT NULL'],
      ['qty', 'REAL NOT NULL DEFAULT 0'],
      ['value', 'REAL NOT NULL DEFAULT 0'],
      ['reported_by', 'TEXT']
    ],
    // Une production déjà facturée ne doit pas être silencieusement écrasée.
    unionFields: ['qty', 'value'],
    indexes: [['date', 'DESC'], ['name']]
  },

  clients: {
    columns: [
      ['nom', 'TEXT NOT NULL'],
      ['etab', 'TEXT'],
      ['tel', 'TEXT'],
      ['seg', 'TEXT'],
      ['statut', 'TEXT'],
      ['note', 'TEXT'],
      ['added', 'TEXT']
    ],
    indexes: [['nom'], ['statut']]
  },

  products: {
    columns: [
      ['emoji', 'TEXT'],
      ['name', 'TEXT NOT NULL'],
      ['price', 'REAL NOT NULL DEFAULT 0'],
      ['cost', 'REAL NOT NULL DEFAULT 0'],
      ['target', 'TEXT']
    ],
    indexes: [['name']]
  },

  parcelles: {
    columns: [
      ['name', 'TEXT NOT NULL'],
      ['surface', 'REAL NOT NULL DEFAULT 0'],
      ['product', 'TEXT'],
      ['semis', 'TEXT'],
      ['recolte', 'TEXT'],
      ['rendement_obj', 'REAL NOT NULL DEFAULT 0'],
      ['rendement_reel', 'REAL NOT NULL DEFAULT 0'],
      ['status', 'TEXT']
    ],
    unionFields: ['rendement_reel'],
    indexes: [['status'], ['name']]
  },

  commandes: {
    columns: [
      ['client', 'TEXT'],
      ['product', 'TEXT'],
      ['qty', 'REAL NOT NULL DEFAULT 0'],
      ['total', 'REAL NOT NULL DEFAULT 0'],
      ['note', 'TEXT'],
      ['status', 'TEXT'],
      ['date', 'TEXT']
    ],
    indexes: [['status'], ['date'], ['client']]
  },

  factures: {
    columns: [
      ['num', 'TEXT'],
      ['client', 'TEXT'],
      ['date', 'TEXT'],
      ['lines', 'TEXT NOT NULL DEFAULT "[]"'],
      ['total', 'REAL NOT NULL DEFAULT 0'],
      ['status', 'TEXT']
    ],
    indexes: [['date'], ['client']]
  },

  incidents: {
    columns: [
      ['type', 'TEXT'],
      ['description', 'TEXT'],
      ['date', 'TEXT'],
      ['resolved', 'INTEGER NOT NULL DEFAULT 0'],
      ['reported_by', 'TEXT']
    ],
    indexes: [['resolved'], ['date']]
  },

  intrants: {
    columns: [
      ['name', 'TEXT NOT NULL'],
      ['status', 'TEXT']
    ],
    indexes: [['name']]
  },

  checklist: {
    columns: [
      ['label', 'TEXT NOT NULL'],
      ['done', 'INTEGER NOT NULL DEFAULT 0'],
      ['done_at', 'TEXT']
    ],
    indexes: [['done']]
  },

  marche_prix: {
    columns: [
      ['produit', 'TEXT NOT NULL'],
      ['diego', 'REAL'],
      ['nosybe', 'REAL'],
      ['mahajanga', 'REAL'],
      ['date', 'TEXT']
    ],
    indexes: [['date'], ['produit']]
  },

  tresorerie: {
    columns: [
      ['mois', 'TEXT NOT NULL'],
      ['entree', 'REAL NOT NULL DEFAULT 0'],
      ['sortie', 'REAL NOT NULL DEFAULT 0']
    ],
    indexes: [['mois']]
  },

  notifications: {
    columns: [
      ['title', 'TEXT'],
      ['body', 'TEXT'],
      ['date', 'TEXT'],
      ['read', 'INTEGER NOT NULL DEFAULT 0']
    ],
    indexes: [['read'], ['date']]
  }
};

/** Préférences locales : une seule ligne, non synchronisée ligne à ligne. */
const SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);`;

/**
 * File d'attente durable.
 *
 * L'insertion dans outbox se fait dans LA MÊME transaction que l'écriture
 * métier : une coupure réseau, un kill de l'app ou un crash ne peut plus
 * faire perdre une opération.
 */
const OUTBOX_TABLE = `
CREATE TABLE IF NOT EXISTS outbox (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  payload     TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  next_retry  INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending','in_flight','done','conflict','dead')),
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status, next_retry, seq);`;

/** Conflits résolus : rien n'est jamais supprimé, tout est auditable. */
const CONFLICTS_TABLE = `
CREATE TABLE IF NOT EXISTS conflicts_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  resolution  TEXT NOT NULL,
  local_json  TEXT NOT NULL,
  remote_json TEXT NOT NULL,
  winner      TEXT NOT NULL,
  resolved_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conflicts_entity ON conflicts_log(entity, entity_id);`;

/**
 * État de synchronisation persistant.
 *
 * `last_synced_at` était `window._lastRemoteUpdate` (mémoire seule) : après
 * un redémarrage il repartait à 0 et n'importe quel état distant, même plus
 * ancien, écrasait le local. Il est désormais en base.
 */
const SYNC_META_TABLE = `
CREATE TABLE IF NOT EXISTS sync_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);`;

const MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);`;

// ─── Génération ─────────────────────────────────────────────────

function tableSql(entity, spec) {
  const cols = [...SYNC_COLUMNS, ...spec.columns]
    .map(([name, type]) => `  ${name.padEnd(14)} ${type}`)
    .join(',\n');

  let sql = `CREATE TABLE IF NOT EXISTS ${entity} (\n${cols}\n);`;

  sql += `\nCREATE INDEX IF NOT EXISTS idx_${entity}_dirty ON ${entity}(dirty);`;
  sql += `\nCREATE INDEX IF NOT EXISTS idx_${entity}_updated ON ${entity}(updated_at DESC);`;

  for (const idx of spec.indexes || []) {
    const [col, dir] = Array.isArray(idx) ? idx : [idx, ''];
    sql += `\nCREATE INDEX IF NOT EXISTS idx_${entity}_${col} ON ${entity}(${col} ${dir || ''});`;
  }

  return sql;
}

function generateSchema() {
  const parts = [
    '-- Généré par biozar/web/core/schema.js — ne pas éditer à la main.',
    'PRAGMA foreign_keys = ON;',
    MIGRATIONS_TABLE,
    SYNC_META_TABLE,
    OUTBOX_TABLE,
    CONFLICTS_TABLE,
    SETTINGS_TABLE
  ];

  for (const [entity, spec] of Object.entries(ENTITY_SPECS)) {
    parts.push(tableSql(entity, spec));
  }

  return parts.join('\n\n');
}

const SCHEMA_VERSION = 1;

export { ENTITY_SPECS, SYNC_COLUMNS, SCHEMA_VERSION, generateSchema };
