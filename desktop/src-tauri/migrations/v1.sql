-- BIOZAR — schéma local v1
-- GÉNÉRÉ par : npm run gen:sql  (source : biozar/web/core/schema.js)
-- Ne pas éditer à la main : toute modification serait écrasée.
-- Généré par biozar/web/core/schema.js — ne pas éditer à la main.

PRAGMA foreign_keys = ON;


CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  applied_at  INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS sync_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);


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
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status, next_retry, seq);


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
CREATE INDEX IF NOT EXISTS idx_conflicts_entity ON conflicts_log(entity, entity_id);


CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS productions (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  date           TEXT NOT NULL,
  name           TEXT NOT NULL,
  qty            REAL NOT NULL DEFAULT 0,
  value          REAL NOT NULL DEFAULT 0,
  reported_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_productions_dirty ON productions(dirty);
CREATE INDEX IF NOT EXISTS idx_productions_updated ON productions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_productions_date ON productions(date DESC);
CREATE INDEX IF NOT EXISTS idx_productions_name ON productions(name );

CREATE TABLE IF NOT EXISTS clients (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  nom            TEXT NOT NULL,
  etab           TEXT,
  tel            TEXT,
  seg            TEXT,
  statut         TEXT,
  note           TEXT,
  added          TEXT
);
CREATE INDEX IF NOT EXISTS idx_clients_dirty ON clients(dirty);
CREATE INDEX IF NOT EXISTS idx_clients_updated ON clients(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(nom );
CREATE INDEX IF NOT EXISTS idx_clients_statut ON clients(statut );

CREATE TABLE IF NOT EXISTS products (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  emoji          TEXT,
  name           TEXT NOT NULL,
  price          REAL NOT NULL DEFAULT 0,
  cost           REAL NOT NULL DEFAULT 0,
  target         TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_dirty ON products(dirty);
CREATE INDEX IF NOT EXISTS idx_products_updated ON products(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name );

CREATE TABLE IF NOT EXISTS parcelles (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  name           TEXT NOT NULL,
  surface        REAL NOT NULL DEFAULT 0,
  product        TEXT,
  semis          TEXT,
  recolte        TEXT,
  rendement_obj  REAL NOT NULL DEFAULT 0,
  rendement_reel REAL NOT NULL DEFAULT 0,
  status         TEXT
);
CREATE INDEX IF NOT EXISTS idx_parcelles_dirty ON parcelles(dirty);
CREATE INDEX IF NOT EXISTS idx_parcelles_updated ON parcelles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_parcelles_status ON parcelles(status );
CREATE INDEX IF NOT EXISTS idx_parcelles_name ON parcelles(name );

CREATE TABLE IF NOT EXISTS commandes (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  client         TEXT,
  product        TEXT,
  qty            REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  note           TEXT,
  status         TEXT,
  date           TEXT
);
CREATE INDEX IF NOT EXISTS idx_commandes_dirty ON commandes(dirty);
CREATE INDEX IF NOT EXISTS idx_commandes_updated ON commandes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_status ON commandes(status );
CREATE INDEX IF NOT EXISTS idx_commandes_date ON commandes(date );
CREATE INDEX IF NOT EXISTS idx_commandes_client ON commandes(client );

CREATE TABLE IF NOT EXISTS factures (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  num            TEXT,
  client         TEXT,
  date           TEXT,
  lines          TEXT NOT NULL DEFAULT "[]",
  total          REAL NOT NULL DEFAULT 0,
  status         TEXT
);
CREATE INDEX IF NOT EXISTS idx_factures_dirty ON factures(dirty);
CREATE INDEX IF NOT EXISTS idx_factures_updated ON factures(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_factures_date ON factures(date );
CREATE INDEX IF NOT EXISTS idx_factures_client ON factures(client );

CREATE TABLE IF NOT EXISTS incidents (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  type           TEXT,
  description    TEXT,
  date           TEXT,
  resolved       INTEGER NOT NULL DEFAULT 0,
  reported_by    TEXT
);
CREATE INDEX IF NOT EXISTS idx_incidents_dirty ON incidents(dirty);
CREATE INDEX IF NOT EXISTS idx_incidents_updated ON incidents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_resolved ON incidents(resolved );
CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(date );

CREATE TABLE IF NOT EXISTS intrants (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  name           TEXT NOT NULL,
  status         TEXT
);
CREATE INDEX IF NOT EXISTS idx_intrants_dirty ON intrants(dirty);
CREATE INDEX IF NOT EXISTS idx_intrants_updated ON intrants(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_intrants_name ON intrants(name );

CREATE TABLE IF NOT EXISTS checklist (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  label          TEXT NOT NULL,
  done           INTEGER NOT NULL DEFAULT 0,
  done_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_checklist_dirty ON checklist(dirty);
CREATE INDEX IF NOT EXISTS idx_checklist_updated ON checklist(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_done ON checklist(done );

CREATE TABLE IF NOT EXISTS marche_prix (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  produit        TEXT NOT NULL,
  diego          REAL,
  nosybe         REAL,
  mahajanga      REAL,
  date           TEXT
);
CREATE INDEX IF NOT EXISTS idx_marche_prix_dirty ON marche_prix(dirty);
CREATE INDEX IF NOT EXISTS idx_marche_prix_updated ON marche_prix(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marche_prix_date ON marche_prix(date );
CREATE INDEX IF NOT EXISTS idx_marche_prix_produit ON marche_prix(produit );

CREATE TABLE IF NOT EXISTS tresorerie (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  mois           TEXT NOT NULL,
  entree         REAL NOT NULL DEFAULT 0,
  sortie         REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tresorerie_dirty ON tresorerie(dirty);
CREATE INDEX IF NOT EXISTS idx_tresorerie_updated ON tresorerie(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tresorerie_mois ON tresorerie(mois );

CREATE TABLE IF NOT EXISTS notifications (
  id             TEXT PRIMARY KEY,
  device_id      TEXT NOT NULL,
  updated_at     INTEGER NOT NULL,
  server_rev     INTEGER NOT NULL DEFAULT 0,
  deleted        INTEGER NOT NULL DEFAULT 0,
  dirty          INTEGER NOT NULL DEFAULT 1,
  title          TEXT,
  body           TEXT,
  date           TEXT,
  read           INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notifications_dirty ON notifications(dirty);
CREATE INDEX IF NOT EXISTS idx_notifications_updated ON notifications(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read );
CREATE INDEX IF NOT EXISTS idx_notifications_date ON notifications(date );
