-- ═══════════════════════════════════════════════════════════════════
--  BIOZAR — Migration 002 : tables par entité + RLS authentifiée
-- ═══════════════════════════════════════════════════════════════════
--  GÉNÉRÉ par : node scripts/gen-server-sql.js
--  Source     : biozar/web/core/schema.js  (ne pas éditer à la main)
--
--  À exécuter dans Supabase → SQL Editor, APRÈS 001 (migration-auth.sql).
--
--  Objectifs :
--    1. Remplacer le blob JSON unique par des tables par entité, seules
--       capables de porter une résolution de conflits ligne à ligne.
--    2. Fermer la faille d'accès : les 4 politiques USING (true) de
--       biozar_state exposaient l'intégralité des données métier à
--       quiconque connaissait l'URL du projet et la clé anon.
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Révision serveur ────────────────────────────────────────────────
-- Le client ne fournit JAMAIS server_rev : c'est le serveur qui l'incrémente,
-- ce qui en fait une référence fiable pour détecter les écritures concurrentes.
CREATE SEQUENCE IF NOT EXISTS public.biozar_rev_seq;

CREATE OR REPLACE FUNCTION public.biozar_assign_rev()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.server_rev := nextval('public.biozar_rev_seq');
  ELSIF TG_OP = 'UPDATE' THEN
    -- On ne régresse jamais, même si le client renvoie une valeur ancienne.
    NEW.server_rev := GREATEST(COALESCE(OLD.server_rev, 0), 0) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 2. Horodatage serveur ──────────────────────────────────────────────
-- « updated_at » vient du client (nécessaire au Last-Write-Wins hors-ligne).
-- « server_updated_at » est l'heure du serveur, utile au diagnostic des
-- dérives d'horloge embarquée.
CREATE OR REPLACE FUNCTION public.biozar_touch_server()
RETURNS TRIGGER AS $$
BEGIN
  NEW.server_updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── productions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.productions (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date              TEXT NOT NULL,
  name              TEXT NOT NULL,
  qty               DOUBLE PRECISION NOT NULL DEFAULT 0,
  value             DOUBLE PRECISION NOT NULL DEFAULT 0,
  reported_by       TEXT
);

CREATE INDEX IF NOT EXISTS idx_productions_updated_at ON public.productions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_productions_not_deleted ON public.productions(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_productions_created_by  ON public.productions(created_by);

DROP TRIGGER IF EXISTS trg_productions_rev ON public.productions;
CREATE TRIGGER trg_productions_rev
  BEFORE INSERT OR UPDATE ON public.productions
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_productions_touch ON public.productions;
CREATE TRIGGER trg_productions_touch
  BEFORE INSERT OR UPDATE ON public.productions
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "productions_select" ON public.productions;
CREATE POLICY "productions_select"
  ON public.productions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "productions_insert" ON public.productions;
CREATE POLICY "productions_insert"
  ON public.productions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "productions_update" ON public.productions;
CREATE POLICY "productions_update"
  ON public.productions FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "productions_delete" ON public.productions;
CREATE POLICY "productions_delete"
  ON public.productions FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── clients ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  nom               TEXT NOT NULL,
  etab              TEXT,
  tel               TEXT,
  seg               TEXT,
  statut            TEXT,
  note              TEXT,
  added             TEXT
);

CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON public.clients(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_not_deleted ON public.clients(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_clients_created_by  ON public.clients(created_by);

DROP TRIGGER IF EXISTS trg_clients_rev ON public.clients;
CREATE TRIGGER trg_clients_rev
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_clients_touch ON public.clients;
CREATE TRIGGER trg_clients_touch
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select"
  ON public.clients FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert"
  ON public.clients FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update"
  ON public.clients FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "clients_delete" ON public.clients;
CREATE POLICY "clients_delete"
  ON public.clients FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── products ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emoji             TEXT,
  name              TEXT NOT NULL,
  price             DOUBLE PRECISION NOT NULL DEFAULT 0,
  cost              DOUBLE PRECISION NOT NULL DEFAULT 0,
  target            TEXT
);

CREATE INDEX IF NOT EXISTS idx_products_updated_at ON public.products(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_not_deleted ON public.products(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_products_created_by  ON public.products(created_by);

DROP TRIGGER IF EXISTS trg_products_rev ON public.products;
CREATE TRIGGER trg_products_rev
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_products_touch ON public.products;
CREATE TRIGGER trg_products_touch
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "products_select" ON public.products;
CREATE POLICY "products_select"
  ON public.products FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "products_insert" ON public.products;
CREATE POLICY "products_insert"
  ON public.products FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update"
  ON public.products FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "products_delete" ON public.products;
CREATE POLICY "products_delete"
  ON public.products FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── parcelles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.parcelles (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name              TEXT NOT NULL,
  surface           DOUBLE PRECISION NOT NULL DEFAULT 0,
  product           TEXT,
  semis             TEXT,
  recolte           TEXT,
  rendement_obj     DOUBLE PRECISION NOT NULL DEFAULT 0,
  rendement_reel    DOUBLE PRECISION NOT NULL DEFAULT 0,
  status            TEXT
);

CREATE INDEX IF NOT EXISTS idx_parcelles_updated_at ON public.parcelles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_parcelles_not_deleted ON public.parcelles(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_parcelles_created_by  ON public.parcelles(created_by);

DROP TRIGGER IF EXISTS trg_parcelles_rev ON public.parcelles;
CREATE TRIGGER trg_parcelles_rev
  BEFORE INSERT OR UPDATE ON public.parcelles
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_parcelles_touch ON public.parcelles;
CREATE TRIGGER trg_parcelles_touch
  BEFORE INSERT OR UPDATE ON public.parcelles
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.parcelles ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "parcelles_select" ON public.parcelles;
CREATE POLICY "parcelles_select"
  ON public.parcelles FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "parcelles_insert" ON public.parcelles;
CREATE POLICY "parcelles_insert"
  ON public.parcelles FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "parcelles_update" ON public.parcelles;
CREATE POLICY "parcelles_update"
  ON public.parcelles FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "parcelles_delete" ON public.parcelles;
CREATE POLICY "parcelles_delete"
  ON public.parcelles FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── commandes ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commandes (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client            TEXT,
  product           TEXT,
  qty               DOUBLE PRECISION NOT NULL DEFAULT 0,
  total             DOUBLE PRECISION NOT NULL DEFAULT 0,
  note              TEXT,
  status            TEXT,
  date              TEXT
);

CREATE INDEX IF NOT EXISTS idx_commandes_updated_at ON public.commandes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_commandes_not_deleted ON public.commandes(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_commandes_created_by  ON public.commandes(created_by);

DROP TRIGGER IF EXISTS trg_commandes_rev ON public.commandes;
CREATE TRIGGER trg_commandes_rev
  BEFORE INSERT OR UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_commandes_touch ON public.commandes;
CREATE TRIGGER trg_commandes_touch
  BEFORE INSERT OR UPDATE ON public.commandes
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "commandes_select" ON public.commandes;
CREATE POLICY "commandes_select"
  ON public.commandes FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "commandes_insert" ON public.commandes;
CREATE POLICY "commandes_insert"
  ON public.commandes FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "commandes_update" ON public.commandes;
CREATE POLICY "commandes_update"
  ON public.commandes FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "commandes_delete" ON public.commandes;
CREATE POLICY "commandes_delete"
  ON public.commandes FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── factures ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.factures (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  num               TEXT,
  client            TEXT,
  date              TEXT,
  lines             TEXT NOT NULL DEFAULT '[]',
  total             DOUBLE PRECISION NOT NULL DEFAULT 0,
  status            TEXT
);

CREATE INDEX IF NOT EXISTS idx_factures_updated_at ON public.factures(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_factures_not_deleted ON public.factures(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_factures_created_by  ON public.factures(created_by);

DROP TRIGGER IF EXISTS trg_factures_rev ON public.factures;
CREATE TRIGGER trg_factures_rev
  BEFORE INSERT OR UPDATE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_factures_touch ON public.factures;
CREATE TRIGGER trg_factures_touch
  BEFORE INSERT OR UPDATE ON public.factures
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.factures ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "factures_select" ON public.factures;
CREATE POLICY "factures_select"
  ON public.factures FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "factures_insert" ON public.factures;
CREATE POLICY "factures_insert"
  ON public.factures FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "factures_update" ON public.factures;
CREATE POLICY "factures_update"
  ON public.factures FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "factures_delete" ON public.factures;
CREATE POLICY "factures_delete"
  ON public.factures FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── incidents ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incidents (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type              TEXT,
  description       TEXT,
  date              TEXT,
  resolved          INTEGER NOT NULL DEFAULT 0,
  reported_by       TEXT
);

CREATE INDEX IF NOT EXISTS idx_incidents_updated_at ON public.incidents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_not_deleted ON public.incidents(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_incidents_created_by  ON public.incidents(created_by);

DROP TRIGGER IF EXISTS trg_incidents_rev ON public.incidents;
CREATE TRIGGER trg_incidents_rev
  BEFORE INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_incidents_touch ON public.incidents;
CREATE TRIGGER trg_incidents_touch
  BEFORE INSERT OR UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "incidents_select" ON public.incidents;
CREATE POLICY "incidents_select"
  ON public.incidents FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "incidents_insert" ON public.incidents;
CREATE POLICY "incidents_insert"
  ON public.incidents FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "incidents_update" ON public.incidents;
CREATE POLICY "incidents_update"
  ON public.incidents FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "incidents_delete" ON public.incidents;
CREATE POLICY "incidents_delete"
  ON public.incidents FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── intrants ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.intrants (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name              TEXT NOT NULL,
  status            TEXT
);

CREATE INDEX IF NOT EXISTS idx_intrants_updated_at ON public.intrants(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_intrants_not_deleted ON public.intrants(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_intrants_created_by  ON public.intrants(created_by);

DROP TRIGGER IF EXISTS trg_intrants_rev ON public.intrants;
CREATE TRIGGER trg_intrants_rev
  BEFORE INSERT OR UPDATE ON public.intrants
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_intrants_touch ON public.intrants;
CREATE TRIGGER trg_intrants_touch
  BEFORE INSERT OR UPDATE ON public.intrants
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.intrants ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "intrants_select" ON public.intrants;
CREATE POLICY "intrants_select"
  ON public.intrants FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "intrants_insert" ON public.intrants;
CREATE POLICY "intrants_insert"
  ON public.intrants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "intrants_update" ON public.intrants;
CREATE POLICY "intrants_update"
  ON public.intrants FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "intrants_delete" ON public.intrants;
CREATE POLICY "intrants_delete"
  ON public.intrants FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── checklist ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checklist (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  label             TEXT NOT NULL,
  done              INTEGER NOT NULL DEFAULT 0,
  done_at           TEXT
);

CREATE INDEX IF NOT EXISTS idx_checklist_updated_at ON public.checklist(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_not_deleted ON public.checklist(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_checklist_created_by  ON public.checklist(created_by);

DROP TRIGGER IF EXISTS trg_checklist_rev ON public.checklist;
CREATE TRIGGER trg_checklist_rev
  BEFORE INSERT OR UPDATE ON public.checklist
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_checklist_touch ON public.checklist;
CREATE TRIGGER trg_checklist_touch
  BEFORE INSERT OR UPDATE ON public.checklist
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.checklist ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "checklist_select" ON public.checklist;
CREATE POLICY "checklist_select"
  ON public.checklist FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "checklist_insert" ON public.checklist;
CREATE POLICY "checklist_insert"
  ON public.checklist FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "checklist_update" ON public.checklist;
CREATE POLICY "checklist_update"
  ON public.checklist FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "checklist_delete" ON public.checklist;
CREATE POLICY "checklist_delete"
  ON public.checklist FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── marche_prix ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.marche_prix (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  produit           TEXT NOT NULL,
  diego             DOUBLE PRECISION,
  nosybe            DOUBLE PRECISION,
  mahajanga         DOUBLE PRECISION,
  date              TEXT
);

CREATE INDEX IF NOT EXISTS idx_marche_prix_updated_at ON public.marche_prix(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_marche_prix_not_deleted ON public.marche_prix(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_marche_prix_created_by  ON public.marche_prix(created_by);

DROP TRIGGER IF EXISTS trg_marche_prix_rev ON public.marche_prix;
CREATE TRIGGER trg_marche_prix_rev
  BEFORE INSERT OR UPDATE ON public.marche_prix
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_marche_prix_touch ON public.marche_prix;
CREATE TRIGGER trg_marche_prix_touch
  BEFORE INSERT OR UPDATE ON public.marche_prix
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.marche_prix ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "marche_prix_select" ON public.marche_prix;
CREATE POLICY "marche_prix_select"
  ON public.marche_prix FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "marche_prix_insert" ON public.marche_prix;
CREATE POLICY "marche_prix_insert"
  ON public.marche_prix FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "marche_prix_update" ON public.marche_prix;
CREATE POLICY "marche_prix_update"
  ON public.marche_prix FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "marche_prix_delete" ON public.marche_prix;
CREATE POLICY "marche_prix_delete"
  ON public.marche_prix FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── tresorerie ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tresorerie (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mois              TEXT NOT NULL,
  entree            DOUBLE PRECISION NOT NULL DEFAULT 0,
  sortie            DOUBLE PRECISION NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tresorerie_updated_at ON public.tresorerie(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tresorerie_not_deleted ON public.tresorerie(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_tresorerie_created_by  ON public.tresorerie(created_by);

DROP TRIGGER IF EXISTS trg_tresorerie_rev ON public.tresorerie;
CREATE TRIGGER trg_tresorerie_rev
  BEFORE INSERT OR UPDATE ON public.tresorerie
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_tresorerie_touch ON public.tresorerie;
CREATE TRIGGER trg_tresorerie_touch
  BEFORE INSERT OR UPDATE ON public.tresorerie
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.tresorerie ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "tresorerie_select" ON public.tresorerie;
CREATE POLICY "tresorerie_select"
  ON public.tresorerie FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "tresorerie_insert" ON public.tresorerie;
CREATE POLICY "tresorerie_insert"
  ON public.tresorerie FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "tresorerie_update" ON public.tresorerie;
CREATE POLICY "tresorerie_update"
  ON public.tresorerie FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "tresorerie_delete" ON public.tresorerie;
CREATE POLICY "tresorerie_delete"
  ON public.tresorerie FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ─── notifications ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL,
  updated_at        BIGINT NOT NULL,
  server_rev        BIGINT NOT NULL DEFAULT 0,
  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted           INTEGER NOT NULL DEFAULT 0,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title             TEXT,
  body              TEXT,
  date              TEXT,
  read              INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notifications_updated_at ON public.notifications(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_not_deleted ON public.notifications(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_notifications_created_by  ON public.notifications(created_by);

DROP TRIGGER IF EXISTS trg_notifications_rev ON public.notifications;
CREATE TRIGGER trg_notifications_rev
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_notifications_touch ON public.notifications;
CREATE TRIGGER trg_notifications_touch
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select"
  ON public.notifications FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update"
  ON public.notifications FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete"
  ON public.notifications FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ─── 3. Fermeture de la faille sur biozar_state ─────────────────────────
-- Les politiques précédentes autorisaient SELECT / INSERT / UPDATE / DELETE
-- avec USING (true) : n'importe qui disposant de l'URL du projet et de la
-- clé anon (toutes deux embarquées dans le client) pouvait lire, écraser
-- ou supprimer l'intégralité des données métier.
DROP POLICY IF EXISTS "Allow read biozar_state"   ON public.biozar_state;
DROP POLICY IF EXISTS "Allow insert biozar_state" ON public.biozar_state;
DROP POLICY IF EXISTS "Allow update biozar_state" ON public.biozar_state;
DROP POLICY IF EXISTS "Allow delete biozar_state" ON public.biozar_state;

ALTER TABLE public.biozar_state ENABLE ROW LEVEL SECURITY;

-- biozar_state ne sert plus que de miroir de compatibilité pendant la
-- transition (double écriture). Même règle que les tables par entité.
CREATE POLICY "biozar_state_select"
  ON public.biozar_state FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "biozar_state_insert"
  ON public.biozar_state FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "biozar_state_update"
  ON public.biozar_state FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "biozar_state_delete"
  ON public.biozar_state FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════
--  ⚠️  ACTION REQUISE APRÈS EXÉCUTION
-- ═══════════════════════════════════════════════════════════════════
--  1. Le client doit désormais envoyer un jeton d'authentification.
--     Dans core/transport-supabase.js, renseignez « accessToken » (obtenu
--     via BIOZAR_AUTH.signIn) : sans lui, toutes les requêtes renvoient 401.
--  2. Les appareils déjà en service continuent d'écrire dans le miroir
--     biozar_state jusqu'à leur mise à jour. Vérifiez dans
--     Settings → Auth que la création de compte est contrôlée avant
--     d'exposer l'application.
--  3. La clé anon reste publique : c'est normal. Ce qui protège les
--     données, c'est le RLS ci-dessus, pas la confidentialité de la clé.
-- ═══════════════════════════════════════════════════════════════════
