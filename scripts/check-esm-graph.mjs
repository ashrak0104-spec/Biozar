#!/usr/bin/env node
/**
 * BIOZAR — Vérification du graphe d'imports ES modules
 * ─────────────────────────────────────────────────────────────────────
 * Le socle est chargé nativement par le navigateur, sans bundler. Un
 * import mal orthographié ou sans extension n'échoue qu'au runtime, dans
 * la WebView — c'est-à-dire sur le terrain.
 *
 * Ce contrôle vérifie statiquement, pour chaque module :
 *   • que chaque fichier importé existe ;
 *   • que chaque import relatif porte l'extension .js ;
 *   • que chaque nom importé est bien exporté par la cible ;
 *   • que le point d'entrée déclaré dans index.html existe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'biozar', 'web');
const CORE = path.join(WEB, 'core');

const problems = [];

/** Extrait les noms exportés d'un module (formes courantes). */
function exportsOf(file) {
  const s = fs.readFileSync(file, 'utf8');
  const names = new Set();

  for (const m of s.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/gm)) {
    names.add(m[1]);
  }
  for (const m of s.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  if (/^export\s+default/m.test(s)) names.add('default');
  return names;
}

const files = fs.readdirSync(CORE).filter((f) => f.endsWith('.js'));

for (const f of files) {
  const full = path.join(CORE, f);
  const src = fs.readFileSync(full, 'utf8');

  for (const m of src.matchAll(/^import\s+(.*?)\s+from\s+['"]([^'"]+)['"];?/gms)) {
    const clause = m[1];
    const spec = m[2];

    if (!spec.startsWith('.')) continue; // bare specifier (node:*), hors périmètre

    if (!spec.endsWith('.js')) {
      problems.push(`${f} : import sans extension → '${spec}' (le navigateur exige .js)`);
      continue;
    }

    const target = path.resolve(CORE, spec);
    if (!fs.existsSync(target)) {
      problems.push(`${f} : fichier importé introuvable → '${spec}'`);
      continue;
    }

    const named = clause.match(/\{([^}]+)\}/);
    if (!named) continue;

    const available = exportsOf(target);
    for (const part of named[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name && !available.has(name)) {
        problems.push(`${f} : '${name}' n'est pas exporté par ${path.basename(target)}`);
      }
    }
  }
}

// Le point d'entrée référencé par index.html doit exister.
const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
for (const m of html.matchAll(/import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/g)) {
  const spec = m[1];
  const target = path.resolve(WEB, spec);
  if (!fs.existsSync(target)) problems.push(`index.html : module introuvable → '${spec}'`);
}

if (!/<script type="module">/.test(html)) {
  problems.push('index.html : aucune balise <script type="module">, le socle n’est pas chargé');
}

if (problems.length) {
  console.log('✗ Graphe d’imports ES modules :');
  for (const p of problems) console.log('   • ' + p);
  process.exit(1);
}

console.log(
  `✓ Graphe d’imports ESM valide : ${files.length} modules, ` +
    `${files.reduce((n, f) => n + (fs.readFileSync(path.join(CORE, f), 'utf8').match(/^import /gm) || []).length, 0)} imports résolus`
);
