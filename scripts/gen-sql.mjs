#!/usr/bin/env node
/**
 * Génère le fichier SQL consommé par le shell Tauri depuis la source
 * unique `biozar/web/core/schema.js`.
 *
 * Une seule définition de schéma pour les deux plateformes : l'APK
 * l'applique via core/db.js, l'EXE via include_str!() dans lib.rs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateSchema, SCHEMA_VERSION } from '../biozar/web/core/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const target = path.resolve(__dirname, '..', 'desktop', 'src-tauri', 'migrations', 'v1.sql');

const header = [
  `-- BIOZAR — schéma local v${SCHEMA_VERSION}`,
  '-- GÉNÉRÉ par : npm run gen:sql  (source : biozar/web/core/schema.js)',
  '-- Ne pas éditer à la main : toute modification serait écrasée.',
  ''
].join('\n');

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, header + generateSchema() + '\n');

const size = fs.statSync(target).size;
console.log(`✓ ${path.relative(process.cwd(), target)} (${size} o, schéma v${SCHEMA_VERSION})`);
