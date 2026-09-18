#!/usr/bin/env node
/**
 * BIOZAR — Génération de la migration SQL serveur (PostgreSQL / Supabase)
 * ─────────────────────────────────────────────────────────────────────
 * Même source de vérité que le schéma local : `biozar/web/core/schema.js`.
 * Les tables serveur sont dérivées de ENTITY_SPECS, donc client et serveur
 * ne peuvent pas diverger silencieusement.
 *
 * Sortie : supabase/migrations/002_serveur_entites.sql
 *
 * Différences volontaires avec le schéma local :
 *   • pas de colonne `dirty`  → c'est un état strictement local ;
 *   • `server_rev` attribué par trigger, jamais par le client ;
 *   • `created_by` / `created_at` ajoutés pour l'audit ;
 *   • REAL → DOUBLE PRECISION, INTEGER → INTEGER (les booléens restent
 *     0/1 côté client, on évite une conversion silencieuse).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ENTITY_SPECS } from '../biozar/web/core/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SQL_TYPE = {
  TEXT: 'TEXT',
  REAL: 'DOUBLE PRECISION',
  INTEGER: 'INTEGER'
};

function pgType(sqliteType) {
  const base = sqliteType.split(' ')[0].toUpperCase();
  return SQL_TYPE[base] || 'TEXT';
}

const REMOTE_TABLE = { marche_prix: 'marche_prix' };

const out = [];

out.push(`-- ═══════════════════════════════════════════════════════════════════
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
`);

// ─── Tables ───────────────────────────────────────────────────────────
for (const [entity, spec] of Object.entries(ENTITY_SPECS)) {
  const table = REMOTE_TABLE[entity] || entity;

  const cols = [
    '  id                TEXT PRIMARY KEY',
    '  device_id         TEXT NOT NULL',
    '  updated_at        BIGINT NOT NULL',
    '  server_rev        BIGINT NOT NULL DEFAULT 0',
    '  server_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
    '  deleted           INTEGER NOT NULL DEFAULT 0',
    '  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL',
    '  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()'
  ];

  for (const [name, sqliteType] of spec.columns) {
    const notNull = sqliteType.includes('NOT NULL') ? ' NOT NULL' : '';
    const dflt = sqliteType.match(/DEFAULT (.+)$/);
    let def = '';
    if (dflt) {
      const v = dflt[1].trim();
      def = ` DEFAULT ${v === '0' || /^[0-9.]+$/.test(v) ? v : `'${v.replace(/"/g, '')}'`}`;
    }
    cols.push(`  ${name.padEnd(16)}  ${pgType(sqliteType)}${notNull}${def}`);
  }

  out.push(`
-- ─── ${entity} ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.${table} (
${cols.join(',\n')}
);

CREATE INDEX IF NOT EXISTS idx_${table}_updated_at ON public.${table}(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_${table}_not_deleted ON public.${table}(deleted) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS idx_${table}_created_by  ON public.${table}(created_by);

DROP TRIGGER IF EXISTS trg_${table}_rev ON public.${table};
CREATE TRIGGER trg_${table}_rev
  BEFORE INSERT OR UPDATE ON public.${table}
  FOR EACH ROW EXECUTE FUNCTION public.biozar_assign_rev();

DROP TRIGGER IF EXISTS trg_${table}_touch ON public.${table};
CREATE TRIGGER trg_${table}_touch
  BEFORE INSERT OR UPDATE ON public.${table}
  FOR EACH ROW EXECUTE FUNCTION public.biozar_touch_server();

ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;

-- Tout membre authentifié de la ferme lit l'ensemble des données :
-- c'est le modèle métier (une seule exploitation, une équipe partagée).
DROP POLICY IF EXISTS "${table}_select" ON public.${table};
CREATE POLICY "${table}_select"
  ON public.${table} FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Écriture : il faut être authentifié. created_by est forcé côté serveur,
-- un client ne peut pas usurper l'auteur d'une saisie.
DROP POLICY IF EXISTS "${table}_insert" ON public.${table};
CREATE POLICY "${table}_insert"
  ON public.${table} FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "${table}_update" ON public.${table};
CREATE POLICY "${table}_update"
  ON public.${table} FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Suppression physique : administrateur uniquement. Le client n'en fait
-- jamais (suppression logique via deleted = 1), ceci ne sert qu'au RGPD.
DROP POLICY IF EXISTS "${table}_delete" ON public.${table};
CREATE POLICY "${table}_delete"
  ON public.${table} FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );`);
}

// ─── Verrouillage de biozar_state ─────────────────────────────────────
out.push(`

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
`);

const target = path.resolve(__dirname, '..', 'supabase', 'migrations', '002_serveur_entites.sql');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, out.join('\n'));

const size = fs.statSync(target).size;
console.log(`✓ ${path.relative(process.cwd(), target)}`);
console.log(`  ${Object.keys(ENTITY_SPECS).length} tables, ${(size / 1024).toFixed(1)} Ko`);
