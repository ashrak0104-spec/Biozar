#!/usr/bin/env node
/**
 * BIOZAR — Synchronisation des assets web vers le conteneur Capacitor.
 *
 *   biozar/web/  (source de vérité, aussi déployée sur Cloudflare Pages)
 *        │
 *        └──►  biozar-app/www/  (webDir Capacitor → embarqué dans l'APK)
 *
 * Les dossiers sont recopiés en miroir : toute ressource ajoutée à la source
 * (police, librairie vendorisée, icône) est automatiquement embarquée, sans
 * qu'il faille penser à mettre à jour une liste de fichiers.
 */
const { cpSync, rmSync, existsSync, mkdirSync, readdirSync, statSync } = require('fs');
const { join, resolve } = require('path');

const SRC = resolve(__dirname, '..', '..', 'biozar', 'web');
const DST = resolve(__dirname, '..', 'www');

// Ce qui ne doit PAS être embarqué dans l'APK (déployé sur Pages uniquement).
const EXCLUDE = new Set(['functions', '_headers', '_redirects', '.DS_Store']);

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!existsSync(SRC)) fail(`Source introuvable : ${SRC}`);
mkdirSync(DST, { recursive: true });

let copied = 0;
let bytes = 0;

for (const entry of readdirSync(SRC)) {
  if (EXCLUDE.has(entry)) continue;

  const from = join(SRC, entry);
  const to = join(DST, entry);

  if (statSync(from).isDirectory()) {
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
    copied += 1;
    bytes += dirSize(to);
  } else {
    cpSync(from, to, { force: true });
    copied += 1;
    bytes += statSync(to).size;
  }
}

function dirSize(dir) {
  let total = 0;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    total += statSync(p).isDirectory() ? dirSize(p) : statSync(p).size;
  }
  return total;
}

console.log(
  `✓ ${copied} élément(s) synchronisé(s) → biozar-app/www/  (${(bytes / 1024).toFixed(0)} Ko)`
);
