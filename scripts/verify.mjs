#!/usr/bin/env node
/**
 * BIOZAR — Vérification d'intégrité du paquet semi-offline
 * ─────────────────────────────────────────────────────────────────────
 * Contrôle les invariants qui garantissent que l'APK et l'EXE fonctionnent
 * réellement sans réseau. À lancer avant chaque build :  npm run verify
 *
 * Code de sortie 0 = tout est vert, 1 = au moins un échec bloquant.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { generateSchema } from '../biozar/web/core/schema.js';
import { ENTITY_SPECS } from '../biozar/web/core/schema.js';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'biozar', 'web');
const WWW = path.join(ROOT, 'biozar-app', 'www');
const TAURI = path.join(ROOT, 'desktop', 'src-tauri');

const results = [];
let failures = 0;

function check(label, fn) {
  try {
    const detail = fn();
    results.push(['✓', label, detail || '']);
  } catch (e) {
    failures += 1;
    results.push(['✗', label, e.message]);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function md5(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

function read(file) {
  return fs.readFileSync(path.join(WEB, file), 'utf8');
}

// ── 1. La copie Capacitor doit être strictement identique à la source ──
check('source web ↔ copie Capacitor identiques', () => {
  const files = ['index.html', 'sw.js', 'supabase-init.js', 'manifest.json', 'version.json', 'chart.js'];
  const drifted = files.filter(
    (f) => fs.existsSync(path.join(WWW, f)) && md5(path.join(WEB, f)) !== md5(path.join(WWW, f))
  );
  assert(drifted.length === 0, `dérive détectée : ${drifted.join(', ')} — lancer npm run copy-web`);
  return `${files.length} fichiers en phase`;
});

check('polices et libs vendorisées présentes dans le paquet', () => {
  for (const d of ['fonts', 'vendor', 'icons']) {
    assert(fs.existsSync(path.join(WWW, d)), `biozar-app/www/${d}/ absent du paquet`);
  }
  const fonts = fs.readdirSync(path.join(WWW, 'fonts')).filter((f) => f.endsWith('.woff2'));
  assert(fonts.length >= 7, `${fonts.length} polices seulement, 7 attendues`);
  return `${fonts.length} polices, ${fs.readdirSync(path.join(WWW, 'vendor')).length} libs`;
});

// ── 2. Zéro dépendance réseau pour le shell applicatif ──
check('aucune dépendance réseau dans index.html', () => {
  const html = read('index.html');
  const hits = html.match(/fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare|unpkg\.com|jsdelivr\.net/g) || [];
  assert(hits.length === 0, `références externes restantes : ${[...new Set(hits)].join(', ')}`);
  return 'polices, html2canvas et jsPDF servis en local';
});

check('polices embarquées référencées par @font-face', () => {
  const html = read('index.html');
  const faces = (html.match(/@font-face/g) || []).length;
  assert(faces >= 7, `${faces} règles @font-face, 7 attendues`);
  for (const w of [300, 400, 500, 600, 700, 800]) {
    assert(html.includes(`fonts/inter-${w}.woff2`), `inter-${w}.woff2 non référencée`);
  }
  assert(html.includes('fonts/playfair-700.woff2'), 'playfair-700.woff2 non référencée');
  return `${faces} règles, toutes résolues`;
});

// ── 3. Intégrité du code ──
check('aucun échappement mojibake dans le HTML brut', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('<script>'));
  const bad = (head.match(/\\u[0-9a-fA-F]{4}|\\U[0-9a-fA-F]{8}|\\x[0-9a-f]{2}/g) || []).length;
  assert(bad === 0, `${bad} échappement(s) littéral(aux) dans le HTML — texte illisible à l'écran`);
  return 'HTML propre';
});

check('aucun échappement mojibake dans les chaînes JS', () => {
  const html = read('index.html');
  const bad = (html.match(/\\x[0-9a-f]{2}/g) || []).length;
  assert(bad === 0, `${bad} échappement(s) \\xNN — rendus en Latin-1, pas en UTF-8`);
  return 'JS propre';
});

check('aucune fonction définie deux fois', () => {
  const html = read('index.html');
  const names = [...html.matchAll(/^function (\w+)/gm)].map((m) => m[1]);
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  assert(dupes.length === 0, `définitions en double : ${[...new Set(dupes)].join(', ')}`);
  return `${names.length} fonctions, aucune en double`;
});

check('le Service Worker ne met pas le shell en cache-first', () => {
  const sw = read('sw.js');
  assert(
    sw.includes("request.mode === 'navigate'") && sw.includes('networkFirst(request, CACHE_SHELL)'),
    'la navigation doit passer par networkFirst, sinon les mises à jour ne sont jamais livrées'
  );
  assert(
    sw.includes("url.hostname.endsWith('.supabase.co')") && sw.includes('networkOnly(request)'),
    'les données Supabase ne doivent jamais être mises en cache'
  );
  return 'shell en network-first, données métier jamais cachées';
});

// ── 4. Socle de persistance ──
check('le socle est en ES modules (chargeable par le navigateur)', () => {
  const files = fs.readdirSync(path.join(WEB, 'core')).filter((f) => f.endsWith('.js'));
  const offenders = [];
  for (const f of files) {
    const s = fs.readFileSync(path.join(WEB, 'core', f), 'utf8');
    if (/^module\.exports/m.test(s) || /^const .* = require\(/m.test(s)) offenders.push(f);
    // Les imports relatifs doivent porter l'extension : le navigateur l'exige.
    const bare = [...s.matchAll(/from '(\.\/[^']+?)'/g)].filter((m) => !m[1].endsWith('.js'));
    if (bare.length) offenders.push(`${f} (import sans extension)`);
  }
  assert(offenders.length === 0, `modules non conformes : ${offenders.join(', ')}`);
  return `${files.length} modules ESM, imports avec extension`;
});

check('schéma SQL généré et exécutable sur SQLite', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(generateSchema());

  // sqlite_sequence (créée par AUTOINCREMENT) et sqlite_autoindex_* sont des
  // objets internes : les compter ferait passer le schéma pour plus riche
  // qu'il ne l'est.
  const tables = db
    .prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .get().n;
  const indexes = db
    .prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'")
    .get().n;

  assert(tables === 17, `${tables} tables applicatives, 17 attendues`);
  assert(indexes >= 47, `${indexes} index explicites, au moins 47 attendus`);
  return `${tables} tables applicatives, ${indexes} index`;
});

check('migration Tauri en phase avec la source JS', () => {
  const file = fs.readFileSync(path.join(TAURI, 'migrations', 'v1.sql'), 'utf8');
  const fromPragma = (s) => s.slice(s.indexOf('PRAGMA')).trim();
  const expected = fromPragma(generateSchema());
  assert(file.includes('PRAGMA'), 'v1.sql ne contient aucun PRAGMA');
  assert(fromPragma(file) === expected, 'v1.sql est périmé — lancer npm run gen:sql');
  return `desktop/src-tauri/migrations/v1.sql à jour (${expected.length} o de SQL)`;
});

// ── 5. Shell Windows ──
check('configuration Tauri valide et cohérente', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(TAURI, 'tauri.conf.json'), 'utf8'));
  const dist = path.resolve(TAURI, cfg.build.frontendDist);
  assert(fs.existsSync(path.join(dist, 'index.html')), `frontendDist ne pointe pas vers un site : ${dist}`);
  for (const icon of cfg.bundle.icon) {
    assert(fs.existsSync(path.join(TAURI, icon)), `icône manquante : ${icon}`);
  }
  const lib = fs.readFileSync(path.join(TAURI, 'src', 'lib.rs'), 'utf8');
  assert(lib.includes('include_str!("../migrations/v1.sql")'), 'lib.rs doit embarquer le schéma partagé');
  return `frontendDist → ${path.relative(ROOT, dist)}, ${cfg.bundle.icon.length} icônes`;
});

// ── 6. Migration SQL serveur ──
check('migration serveur couvre toutes les entités', () => {
  const file = path.join(ROOT, 'supabase', 'migrations', '002_serveur_entites.sql');
  assert(fs.existsSync(file), 'supabase/migrations/002_serveur_entites.sql absent');
  const sql = fs.readFileSync(file, 'utf8');
  const missing = Object.keys(ENTITY_SPECS).filter((e) => !sql.includes(`public.${e}`));
  assert(missing.length === 0, `tables manquantes côté serveur : ${missing.join(', ')}`);
  assert(!/USING \(true\)/.test(sql.split('DROP POLICY IF EXISTS "Allow read')[1] || ''), '');
  assert(sql.includes('auth.uid() IS NOT NULL'), 'la RLS doit exiger un utilisateur authentifié');
  return `${Object.keys(ENTITY_SPECS).length} tables, RLS sur auth.uid()`;
});

check('le graphe d’imports ESM résout (chargement navigateur)', () => {
  try {
    const out = execSync('node scripts/check-esm-graph.mjs', { cwd: ROOT, encoding: 'utf8' });
    return out.trim().replace(/^✓\s*/, '');
  } catch (e) {
    const detail = (e.stdout || '') + (e.stderr || '');
    throw new Error(detail.trim().split('\n').slice(-3).join(' | '));
  }
});

check('le socle est câblé dans index.html', () => {
  const html = read('index.html');
  assert(
    html.includes("import { install } from './core/wiring.js'"),
    'index.html doit installer le socle via core/wiring.js'
  );
  assert(
    html.includes('window.__biozarOffline'),
    'l’installation doit exposer son état pour le diagnostic'
  );
  assert(
    /catch \(e\) \{[\s\S]*console\.warn\('\[BIOZAR\] socle semi-offline non installé/.test(html),
    'une défaillance du socle ne doit jamais bloquer l’application'
  );
  return 'mode shadow, défaillance non bloquante';
});

check('aucun dégradé ni halo décoratif dans l’UI', () => {
  const html = read('index.html');
  const gradients = (html.match(/linear-gradient/g) || []).length;
  const glows = (html.match(/box-shadow:\s*0 0 \d+px/g) || []).length;
  assert(gradients === 0, `${gradients} dégradé(s) décoratif(s) réintroduit(s)`);
  assert(glows === 0, `${glows} halo(x) lumineux permanent(s)`);
  assert(
    html.includes('@media (hover:hover){.kpi-card:hover'),
    'le hover des cartes doit être réservé aux périphériques à pointeur'
  );
  return 'applats, aucun glow, hover conditionné';
});

check('pas d’animation de translation au changement d’onglet', () => {
  const html = read('index.html');
  const page = (html.match(/\.page\{[^}]*\}/) || [''])[0];
  assert(!/transform:translateY/.test(page), '.page ne doit plus se translater à chaque onglet');
  assert(/transition:opacity \.12s/.test(page), 'un fondu court suffit');
  return 'fondu 120 ms, aucune translation';
});

check('le Service Worker précharge tout le socle', () => {
  const sw = read('sw.js');
  const precached = new Set(
    [...sw.matchAll(/^\s*'([^']+)'/gm)].map((m) => m[1]).filter((p) => !p.startsWith('http'))
  );

  const modules = fs
    .readdirSync(path.join(WEB, 'core'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => `core/${f}`);

  const missing = modules.filter((m) => !precached.has(m));
  assert(
    missing.length === 0,
    `absents du précache (l'app ne démarrera pas hors-ligne) : ${missing.join(', ')}`
  );

  // Un fichier préchargé qui n'existe pas fait échouer l'installation du SW.
  const ghost = [...precached].filter(
    (p) => p.startsWith('core/') && !fs.existsSync(path.join(WEB, p))
  );
  assert(ghost.length === 0, `préchargés mais inexistants : ${ghost.join(', ')}`);

  assert(
    /if \(request\.mode === 'navigate'\) return caches\.match\('index\.html'\)/.test(sw),
    'le repli sur index.html doit être réservé aux navigations, pas aux modules'
  );

  return `${modules.length} modules préchargés, repli réservé aux navigations`;
});

check('le jeton d’authentification atteint le transport', () => {
  // Depuis la migration 002, les politiques RLS exigent auth.uid(). Sans
  // jeton, chaque requête renvoie 401 et la file ne se vide jamais.
  const wiring = fs.readFileSync(path.join(WEB, 'core', 'wiring.js'), 'utf8');
  const transport = fs.readFileSync(path.join(WEB, 'core', 'transport-supabase.js'), 'utf8');
  const index = fs.readFileSync(path.join(WEB, 'core', 'index.js'), 'utf8');

  // Méthode de classe dans le transport, fonction dans la façade : les deux
  // formes sont acceptées, ce qui compte est que le jeton soit modifiable
  // après construction.
  assert(
    /setAccessToken\(token\)\s*\{/.test(transport),
    'le transport doit pouvoir recevoir un jeton après sa construction'
  );
  assert(
    /Bearer \$\{this\.accessToken\}/.test(transport),
    'le jeton doit être envoyé dans l’en-tête Authorization'
  );
  assert(
    /currentUser\.accessToken/.test(wiring),
    'le câblage doit reprendre le jeton de la session courante'
  );
  assert(
    /refreshAccessToken\(\);/.test(wiring) && /function trigger\(/.test(wiring),
    'le jeton doit être rafraîchi avant chaque cycle de synchro'
  );
  assert(
    /function setAccessToken\(token\)/.test(index) && /function isAuthorized\(\)/.test(index),
    'bootstrap() doit exposer setAccessToken et isAuthorized'
  );
  assert(
    !/window\.initCloudMonitor = function/.test(wiring),
    'les déclencheurs de synchro ne doivent plus dépendre d’initCloudMonitor : ce module est deferred'
  );
  return 'jeton repris de la session, rafraîchi à chaque cycle';
});

// ── 7. Aucun secret versionné ──
check('aucun secret ni binaire de build versionné', () => {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const leaked = tracked.filter((f) => /keystore|\.jks$|\.apk$|\.aab$/i.test(f));
  assert(leaked.length === 0, `fichiers sensibles suivis : ${leaked.join(', ')}`);
  return 'dépôt propre';
});

// ── Rapport ──
const width = Math.max(...results.map((r) => r[1].length));
console.log('');
console.log('  BIOZAR — vérification du paquet semi-offline');
console.log('  ' + '─'.repeat(width + 34));
for (const [mark, label, detail] of results) {
  console.log(`  ${mark} ${label.padEnd(width)}  ${detail}`);
}
console.log('  ' + '─'.repeat(width + 34));
console.log(
  failures === 0
    ? `  ✓ ${results.length} contrôles réussis\n`
    : `  ✗ ${failures} échec(s) sur ${results.length} contrôles\n`
);

process.exit(failures === 0 ? 0 : 1);
