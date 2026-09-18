#!/usr/bin/env node
/**
 * BIOZAR — Passe de sobriété UI
 * ─────────────────────────────────────────────────────────────────────
 * Applique les règles énoncées dans l'audit :
 *
 *   • aplats à la place des dégradés décoratifs (un aplat + un filet de
 *     couleur porte la même hiérarchie, sans l'effet « généré ») ;
 *   • suppression des halos lumineux permanents (box-shadow 0 0 Npx) ;
 *   • suppression de l'animation de translation à chaque changement
 *     d'onglet ;
 *   • hover réservé aux périphériques qui en ont un ;
 *   • densité resserrée : c'est un outil d'exploitation, pas une vitrine.
 *
 * Chaque remplacement est vérifié : un motif absent est signalé, jamais
 * ignoré silencieusement.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'biozar', 'web', 'index.html');

let s = fs.readFileSync(FILE, 'utf8');
const before = s;
const done = [];
const missed = [];

function rep(label, from, to) {
  if (!s.includes(from)) {
    missed.push(label);
    return;
  }
  s = s.split(from).join(to);
  done.push(label);
}

// ── 1. Dégradés décoratifs → aplats ─────────────────────────────
rep('sidebar (clair)', 'background:linear-gradient(180deg,var(--green-dark) 0%,#0f2612 100%)', 'background:var(--green-dark)');
rep('sidebar (sombre)', "background:linear-gradient(180deg,#0a120c 0%,#050a06 100%)", "background:#0a120c");
rep('nav-item.active', 'background:linear-gradient(135deg,var(--green-mid),var(--green-light))', 'background:var(--green-mid)');
rep('topbar-badge', '.topbar-badge{background:linear-gradient(135deg,var(--green-mid),var(--green-light))', '.topbar-badge{background:var(--green-mid)');
rep('btn-primary', '.btn-primary{background:linear-gradient(135deg,var(--green-mid),var(--green-light))', '.btn-primary{background:var(--green-mid)');
rep('btn-admin', '.btn-admin{background:linear-gradient(135deg,#6a1b9a,#ab47bc)', '.btn-admin{background:#6a1b9a');
rep('admin-tab.active (sombre)', ".admin-tab.active{background:linear-gradient(135deg,var(--green-mid),var(--green-light))", ".admin-tab.active{background:var(--green-mid)");
rep('admin-tab.active (clair)', '.admin-tab.active{background:linear-gradient(135deg,#6a1b9a,#ab47bc)', '.admin-tab.active{background:#6a1b9a');
rep('stat-banner', '.stat-banner{background:linear-gradient(135deg,var(--green-dark) 0%,var(--green-mid) 100%)', '.stat-banner{background:var(--green-dark)');
rep('progress-fill', '.progress-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--green-mid),var(--green-light))', '.progress-fill{height:100%;border-radius:4px;background:var(--green-mid)');
rep('prod-alert-banner', '#prod-alert-banner{display:none;background:linear-gradient(135deg,#ffebee,#fff)', '#prod-alert-banner{display:none;background:#fff5f5');
rep('tl-dot.active', '.tl-dot.active{background:linear-gradient(135deg,var(--green-mid),var(--green-light))', '.tl-dot.active{background:var(--green-mid)');

// Les 5 filets d'accent des cartes KPI : un aplat suffit, le dégradé n'apporte rien.
rep('kpi-card.green', '.kpi-card.green::before{background:linear-gradient(90deg,var(--green-mid),var(--green-light))}', '.kpi-card.green::before{background:var(--green-mid)}');
rep('kpi-card.gold', '.kpi-card.gold::before{background:linear-gradient(90deg,#f57f17,var(--gold))}', '.kpi-card.gold::before{background:var(--gold)}');
rep('kpi-card.blue', '.kpi-card.blue::before{background:linear-gradient(90deg,#1565c0,var(--blue))}', '.kpi-card.blue::before{background:var(--blue)}');
rep('kpi-card.red', '.kpi-card.red::before{background:linear-gradient(90deg,#b71c1c,var(--red))}', '.kpi-card.red::before{background:var(--red)}');
rep('kpi-card.purple', '.kpi-card.purple::before{background:linear-gradient(90deg,#4a148c,var(--purple))}', '.kpi-card.purple::before{background:var(--purple)}');

// ── 2. Halos lumineux permanents ────────────────────────────────
rep('halo cloud-dot.online', '.cloud-dot.online{background:#4caf50;box-shadow:0 0 6px rgba(76,175,80,.6)}', '.cloud-dot.online{background:#4caf50}');
rep('halo cloud-dot.syncing', '.cloud-dot.syncing{background:#f9a825;box-shadow:0 0 6px rgba(249,168,67,.6);animation:pulse 1s infinite}', '.cloud-dot.syncing{background:#f9a825}');
rep('halo cloud-dot.syncing (variante)', '.cloud-dot.syncing{background:#f9a825;box-shadow:0 0 6px rgba(249,168,37,.6);animation:pulse 1s infinite}', '.cloud-dot.syncing{background:#f9a825}');
rep('halo cloud-dot.offline', '.cloud-dot.offline{background:#e53935;box-shadow:0 0 6px rgba(229,57,53,.4)}', '.cloud-dot.offline{background:#e53935}');
rep('halo nav-item.active', '.nav-item.active{background:var(--green-mid);color:#fff;box-shadow:0 4px 12px rgba(76,175,80,.35)}', '.nav-item.active{background:var(--green-mid);color:#fff}');

// ── 3. Animation de translation à chaque changement d'onglet ────
rep(
  'transition .page',
  '.page{opacity:0;transform:translateY(20px);pointer-events:none;position:absolute;width:100%;left:0;top:0;transition:opacity .5s cubic-bezier(.4,0,.2,1),transform .5s cubic-bezier(.4,0,.2,1)}',
  '.page{opacity:0;pointer-events:none;position:absolute;width:100%;left:0;top:0;transition:opacity .12s ease}'
);
rep('transition .page.active', '.page.active{opacity:1;transform:translateY(0);pointer-events:auto;position:relative}', '.page.active{opacity:1;pointer-events:auto;position:relative}');

// ── 4. Hover réservé aux périphériques à pointeur ───────────────
rep(
  'hover kpi-card conditionné',
  '.kpi-card:hover{transform:translateY(-3px);box-shadow:var(--shadow-lg)}',
  '@media (hover:hover){.kpi-card:hover{box-shadow:var(--shadow-lg)}}'
);

// ── 5. Densité ──────────────────────────────────────────────────
rep('densité .content', '.content{padding:32px;flex:1}', '.content{padding:24px 28px;flex:1}');
rep('densité .kpi-grid', '.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;margin-bottom:28px}', '.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-bottom:22px}');
rep('densité .kpi-card', '.kpi-card{background:var(--surface);border-radius:var(--radius);padding:24px;', '.kpi-card{background:var(--surface);border-radius:12px;padding:18px 20px;');
rep('densité .card-header', '.card-header{padding:20px 24px 14px;', '.card-header{padding:16px 20px 12px;');
rep('densité .card-body', '.card-body{padding:20px 24px}', '.card-body{padding:16px 20px}');

fs.writeFileSync(FILE, s);

console.log(`✓ ${done.length} ajustements appliqués`);
if (missed.length) {
  console.log(`⚠ ${missed.length} motif(s) non trouvé(s) :`);
  for (const m of missed) console.log('   • ' + m);
}

const remaining = (s.match(/linear-gradient/g) || []).length;
const glows = (s.match(/box-shadow:0 0 \d+px/g) || []).length;
console.log('');
console.log(`  dégradés restants      : ${remaining}`);
console.log(`  halos permanents       : ${glows}`);
console.log(`  taille index.html      : ${before.length} → ${s.length}`);
