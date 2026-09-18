# BIOZAR — Audit technique & plan de refonte semi-offline

**Date :** 2026-09-18
**Commit audité :** `45b1961` (`Auto-push hook + RLS documentation + script autonome`)
**Périmètre :** APK Android (Capacitor) + EXE Windows (à créer) + PWA Cloudflare Pages
**Méthode :** lecture intégrale du code + exécution Node pour valider les rendus

---

## 0. Cartographie vérifiée du dépôt

| Chemin | Rôle réel | Taille |
|---|---|---|
| `biozar/web/index.html` | **Source de vérité** de l'application (4 259 lignes) | 259 453 o |
| `biozar-app/www/index.html` | **Copie générée** par `npm run copy-web` (4 265 lignes) | 263 721 o |
| `biozar/web/supabase-init.js` | Client REST Supabase sans SDK | 11 521 o |
| `biozar/web/sw.js` | Service Worker PWA | 6 659 o |
| `biozar/web/chart.js` | Chart.js vendorisé | 205 222 o |
| `biozar-app/capacitor.config.json` | Config Capacitor (`appId: mg.biozar.app`) | — |
| `.github/workflows/build-apk.yml` | CI APK | — |
| `.github/workflows/deploy.yml` | CI Cloudflare Pages | — |

**Fait 1 — L'architecture est un monolithe.** Toute l'application (HTML + 409 lignes de CSS +
3 263 lignes de JS) tient dans un seul `index.html`. Aucune modularisation, aucun bundler.

**Fait 2 — Aucune plateforme desktop n'existe dans le dépôt.**
`find . -iname '*tauri*' -o -iname '*electron*' -o -iname '*.exe'` ne renvoie **aucun résultat**.
Le format EXE annoncé n'est pas encore implémenté, seulement l'APK.

**Fait 3 — Le dépôt a dérivé.** `biozar/web/index.html` et `biozar-app/www/index.html` ont des
MD5 différents (`93a0cfc3…` vs `4babf276…`). Les 5 autres fichiers sont identiques.

---

## 1. BLOQUANTS (P0) — à corriger avant tout le reste

### 1.1 La CI APK est cassée : la plateforme Android n'est jamais créée

`biozar-app/android/` est listé dans `.gitignore` (ligne 3) et absent du dépôt. Or
`.github/workflows/build-apk.yml` enchaîne :

```
npm run copy-web  →  npx cap sync --verbose  →  chmod +x gradlew (dans biozar-app/android)
                                             →  ./gradlew assembleRelease
```

Il manque l'étape `npx cap add android`. `cap sync` exige que la plateforme soit déjà
scaffoldée (docs Capacitor : *« Then, add the Android platform. `npx cap add android` »*).
Sur un checkout CI vierge, `cap sync` échoue, et `chmod +x gradlew` échoue aussi car le
dossier n'existe pas.

### 1.2 La signature release ne fonctionne pas par ce chemin

`capacitor.config.json` déclare :

```json
"android": { "buildOptions": {
  "keystorePath": "biozar-release.keystore",
  "keystorePassword": "biozar2026", ...
}}
```

`android.buildOptions` est un champ réel de Capacitor, mais il est lu par
**`npx cap build android`**, pas par Gradle. La CI appelle `./gradlew assembleRelease`,
qui l'ignore totalement. Il faut un bloc `signingConfigs { release { … } }` dans
`android/app/build.gradle` — impossible aujourd'hui puisque `android/` n'est pas versionné.

Incohérence supplémentaire : la CI écrit le keystore dans
`biozar-app/android/app/biozar-release.keystore`, alors que `keystorePath` pointe vers
`biozar-release.keystore` (racine de `biozar-app/`).

### 1.3 Le keystore de production et 57 Mo d'APK sont commités

`git ls-files` renvoie :

```
keystore-b64.txt          ← clé de signature en base64, en clair
biozar-v1.0.1.apk         ← 28 Mo
biozar-v1.0.1-final.apk   ← 28 Mo
```

Quiconque a accès au dépôt peut signer une mise à jour à ta place. À retirer de l'historique
et à remplacer par un secret CI. Le mot de passe `biozar2026` est de plus en dur dans
`capacitor.config.json`.

### 1.4 La base de données distante est ouverte au monde

`migration-auth.sql`, table `biozar_state` :

```sql
CREATE POLICY "Allow read biozar_state"   ON public.biozar_state FOR SELECT USING (true);
CREATE POLICY "Allow insert biozar_state" ON public.biozar_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update biozar_state" ON public.biozar_state FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete biozar_state" ON public.biozar_state FOR DELETE USING (true);
```

L'URL du projet et la clé `anon` sont embarquées en clair dans `supabase-init.js`
(obligatoire pour du client-side, ce n'est pas le problème). Combiné au RLS permissif :
**n'importe qui peut lire, écraser ou supprimer l'intégralité des données métier de BIOZAR
avec deux `curl`**. C'est le risque n°1 du projet, avant toute question de performance.

### 1.5 La synchronisation détruit les écritures hors-ligne

Le modèle actuel : **un seul document JSON** (`biozar_state.id = 'appState'`), upserté en
bloc via `Prefer: resolution=merge-duplicates`.

`index.html:1310` — `mergeStateWithDefaults()` :

```js
} else if (Array.isArray(saved[key])) {
  if (saved[key].length > 0) result[key] = saved[key];   // remplacement intégral
}
```

Aucune fusion par élément, aucune clé primaire, aucun horodatage par enregistrement.
Conséquence : un agent saisit 12 productions hors-ligne ; dès qu'un autre appareil
a poussé son blob, `pullRemoteState()` remplace le tableau local par le tableau distant et
**les 12 saisies disparaissent sans trace ni notification**.

### 1.6 Il n'y a pas de file d'attente hors-ligne

`index.html:1288` — `saveState()` :

```js
if (window.BIOZAR_FIREBASE?.saveStateToFirestore && navigator.onLine) { … }
else if (!navigator.onLine) { window._pendingSave = true; }   // un simple booléen
```

Le seul état persistant de la file est un booléen en mémoire. Aucune opération n'est
enregistrée, aucun ordre n'est garanti, aucun retry avec backoff, aucune idempotence.
Si la synchronisation est interrompue à mi-chemin (cas explicitement demandé), rien n'est
rejoué.

### 1.7 L'état « Erreur de synchro » n'existe pas

`index.html:1296` :

```js
window.BIOZAR_FIREBASE.saveStateToFirestore(s).then(ok => {
  updateCloudStatus('online');      // ← même quand ok === false
```

`updateCloudStatus` (`index.html:1369`) ne connaît que `online | syncing | offline`, et le
CSS (`.cloud-dot`, lignes 72-75) ne définit que ces trois classes. Un échec HTTP 401/409/500
est silencieusement affiché comme « Cloud actif ».

### 1.8 `navigator.onLine` n'est pas fiable en WebView Android

Toutes les décisions réseau passent par `navigator.onLine`. Dans une WebView Capacitor, ce
flag reste souvent `true` alors qu'aucune donnée ne circule (Wi-Fi captif, 3G sans data).
`biozar-app/package.json` ne contient que `@capacitor/android`, `@capacitor/cli`,
`@capacitor/core` — **aucun plugin `@capacitor/network`**.

---

## 2. MAJEURS (P1)

### 2.1 `localStorage` comme seule base locale

`index.html:1292` — `localStorage.setItem('biozar_state', JSON.stringify(s))`.
Vérifié : `grep -c 'indexedDB|openDatabase|IDBRequest'` → **0 occurrence**.

- Plafond ~5 Mo en WebView ; au-delà, `QuotaExceededError` silencieux (`catch(e) {}`).
- Écriture **synchrone sur le thread principal** → gels perceptibles sur mobile.
- Effacé par « Vider le cache » dans les réglages Android.
- Pas de requêtes, pas d'index, pas de transactions → tout est rechargé et re-sérialisé.

### 2.2 Sauvegarde complète à chaque clic

`saveState()` est appelé **41 fois**, dont dans `trackPageView()` (ligne 2158) et
`trackFeatureClick()` (ligne 2164). Chaque navigation et chaque clic instrumenté déclenche :

```
JSON.parse(JSON.stringify(state))  →  JSON.stringify(s)  →  localStorage  →  POST cloud
```

Deux sérialisations complètes de l'état + un upload de tout le document, par clic.

### 2.3 `_lastRemoteUpdate` n'est jamais persisté

`window._lastRemoteUpdate` (`index.html:1298`, `1404`, `1412`) vit en mémoire.
Après un redémarrage de l'app, `lastSync = 0` → **tout état distant, même plus ancien,
est considéré comme plus récent** et écrase le local (`pullRemoteState`, ligne 1404).

### 2.4 Le Service Worker gèle l'application

`sw.js` applique **cache-first** sur `request.mode === 'navigate'`, sur `.js`, `.css` et
`*.json` de même origine. Donc `index.html` et `version.json` sont servis depuis le cache
indéfiniment : **l'app déployée ne se met jamais à jour**. Il faut du network-first (ou
stale-while-revalidate) sur le shell et garder le cache-first uniquement pour les assets
immuables.

### 2.5 L'app n'est pas réellement autonome hors-ligne

- `index.html:15` — Google Fonts via `<link>` réseau. Hors-ligne → polices de substitution.
  `GUIDE_APK.md` le reconnaît : *« Écran blanc dans l'app → Vérifiez la connexion internet
  (pour les polices Google) »*.
- `index.html:18-19` — `html2canvas` et `jsPDF` chargés depuis `cdnjs.cloudflare.com`.
  Le pré-cache CDN de `sw.js` est dans un `try/catch` silencieux : sur une première
  installation hors-ligne, **l'export PDF est mort** et rien ne le dit à l'utilisateur.

### 2.6 Rendu complet à chaque mutation

`renderAll()` (`index.html:2702`) enchaîne **31 fonctions de rendu**, dont 9 destructions /
recréations d'instances Chart.js. Appelé 10 fois, y compris après chaque import et chaque
synchronisation distante.

### 2.7 Tableaux de télémétrie non bornés

`state.appUsage.sessions` est borné à 200 (`index.html:2178`), mais `dailyActive`,
`pageViews` et `featureClicks` croissent sans limite et sont inclus dans le blob
`biozar_state` poussé au cloud à chaque sauvegarde.

### 2.8 Authentification contournable

`state.users` est en clair dans le code avec des SHA-256 **non salés** (`index.html:1112-1120`).
`doLoginAsync()` retombe sur cette liste locale si l'appel Supabase échoue — donc
**hors-ligne, n'importe qui connaissant un hash se connecte avec les droits associés**.
Deux comptes (`admin`, `jean`) partagent le même hash.

---

## 3. BUGS CONCRETS VÉRIFIÉS PAR EXÉCUTION

### 3.1 Mojibake dans le rendu des parcelles (source de vérité)

`biozar/web/index.html` lignes **1712, 1737, 1840** contiennent des échappements `\xNN`
littéraux. J'ai extrait la ligne 1712 et je l'ai évaluée avec Node :

```
RENDU HTML GÉNÉRÉ:
ð Objectif: <strong>4000</strong> kg Â· RÃ©el: <input type="number" value="3800" …/> kg

Contient le mojibake "Ã©" ?  true
Contient le mojibake "Â·" ?  true
Emoji 🎯 présent ?           false
```

`'\xf0\x9f\x8e\xaf'` n'est **pas** 🎯 : JavaScript interprète `\xNN` comme du Latin-1,
donc les octets UTF-8 deviennent 4 caractères distincts. `'\xc3\xa9'` → `Ã©`,
`'\xc2\xb7'` → `Â·`.

### 3.2 Bug fonctionnel : le statut de parcelle se vide à l'édition

```js
// ligne 1737
document.getElementById('pcm-status').value = p.status || 'Sem\xc3\xa9e';
// ligne 1840
document.getElementById('pcm-status').value = 'Sem\xc3\xa9e';
```

`'Sem\xc3\xa9e'` vaut `SemÃ©e`, alors que l'option HTML s'écrit `<option value="Semée">`.
**La valeur ne correspond à aucune option** → le `<select>` tombe à vide quand on ouvre une
parcelle « Semée » en édition, et l'enregistrement écrase le statut.

Cause probable : `fix_parcelles_export.py` écrit `'…(m\\xc2\\xb2);'` — en Python,
`\\x` produit un antislash littéral, pas l'octet. Le correctif a corrompu ce qu'il touchait.

### 3.3 19 chaînes illisibles dans l'APK livrée

`biozar-app/www/index.html` contient **50** échappements `\uXXXX` / `\UXXXXXXXX`, dont 19
situés entre les lignes 533 et 596 — c'est-à-dire **dans du HTML brut**, avant la balise
`<script>` (ligne 994). Ils s'affichent donc tels quels :

```html
<h3 …>\U0001f5fa\ufe0f Parcelle</h3>
<label>Surface (m\u00b2)</label>
<option value="Sem\u00e9e">\U0001f4a7 Sem\u00e9e</option>
```

Dans `biozar/web/index.html`, les 20 échappements restants sont tous à la ligne ≥ 1087,
donc à l'intérieur de chaînes JS où `\uXXXX` est correctement interprété : inoffensifs.

### 3.4 Fonction définie deux fois

`renderForecastKPIs()` est déclarée **deux fois** (lignes 3332 et 3432 de
`biozar-app/www/index.html`). La seconde écrase la première. L'une des deux implémentations
est du code mort — impossible de savoir laquelle est attendue sans arbitrage.

### 3.5 Échappement HTML non appliqué

`escapeHtml()` est défini (ligne 1170) mais utilisé **2 fois** sur **63** affectations
`innerHTML`. Les noms de clients, descriptions d'incidents et notes libres sont injectés
sans échappement.

---

## 4. ARCHITECTURE CIBLE PROPOSÉE

### 4.1 Persistance locale — SQLite natif partout

| Plateforme | Moteur | Fichier |
|---|---|---|
| Android (APK) | `@capacitor-community/sqlite` → SQLite natif | `databases/biozar.db` dans `getDatabasePath()` |
| Windows (EXE) | Tauri 2 + `tauri-plugin-sql` (rusqlite) | `%APPDATA%\mg.biozar.app\biozar.db` |
| PWA (navigateur) | `sql.js` sur OPFS ou repli IndexedDB | même schéma |

Un seul schéma SQL, un seul fichier d'abstraction. Aucun droit Windows à demander :
`%APPDATA%` est accessible sans élévation. Sur Android, `getDatabasePath()` est dans le
sandbox applicatif → **aucune permission de stockage n'est requise**, ce qui supprime le
problème de droits évoqué dans le cahier des charges.

### 4.2 Schéma — une table par entité, plus de blob JSON

```sql
CREATE TABLE productions (
  id            TEXT PRIMARY KEY,          -- uuid v7, généré localement
  device_id     TEXT NOT NULL,             -- identifie l'APK/EXE émetteur
  date          TEXT NOT NULL,
  name          TEXT NOT NULL,
  qty           REAL, value REAL,
  updated_at    INTEGER NOT NULL,          -- ms epoch, horloge locale
  server_rev    INTEGER,                   -- révision renvoyée par le serveur
  deleted       INTEGER DEFAULT 0,         -- suppression logique
  dirty         INTEGER DEFAULT 1,         -- en attente de push
  created_offline INTEGER DEFAULT 0
);
CREATE INDEX idx_productions_dirty      ON productions(dirty);
CREATE INDEX idx_productions_updated_at ON productions(updated_at DESC);
```

Même tronc commun (`id / device_id / updated_at / server_rev / deleted / dirty`) pour
`clients`, `parcelles`, `commandes`, `factures`, `incidents`, `checklist`, `marche_prix`.

### 4.3 File d'attente hors-ligne durable

```sql
CREATE TABLE outbox (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,  -- ordre strict garanti
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  op          TEXT NOT NULL,                      -- upsert | delete
  payload     TEXT NOT NULL,
  attempts    INTEGER DEFAULT 0,
  next_retry  INTEGER DEFAULT 0,
  last_error  TEXT,
  status      TEXT DEFAULT 'pending'              -- pending|in_flight|done|conflict|dead
);
```

- Transaction SQLite : écriture métier **et** insertion dans `outbox` → atomique.
  Une coupure réseau en cours de sync ne peut plus perdre une opération.
- Rejeu strictement séquentiel par `seq`, avec backoff exponentiel plafonné.
- `in_flight` remis à `pending` au démarrage (reprise après kill de l'app).
- Idempotence côté serveur via `(entity, entity_id, updated_at)`.

### 4.4 Résolution de conflits

Par défaut **Last-Write-Wins par entité** sur `updated_at`, avec garde-fous :

1. `updated_at` strictement supérieur gagne.
2. À égalité (±50 ms), l'horloge locale étant non fiable : `device_id` le plus grand gagne
   → déterministe et reproductible.
3. Le perdant est archivé dans `conflicts_log` (jamais supprimé) et affiché dans l'UI.
4. Champs critiques (ex. `qty` d'une production déjà facturée) : merge **union** plutôt
   qu'écrasement, configurable par colonne.

C'est du LWW simple, mais appliqué **ligne par ligne** et non sur un document entier —
c'est ce qui change tout.

### 4.5 Détection réseau fiable

- Capacitor : `@capacitor/network` (`addListener('networkStatusChange')`) + sonde active
  vers `/api/health` (le Worker Cloudflare existe déjà).
- Tauri : évènement natif + même sonde.
- `navigator.onLine` conservé uniquement en repli PWA.
- États de la machine : `ONLINE → SYNCING → ONLINE | OFFLINE | SYNC_ERROR(n)`,
  avec compteur d'éléments en attente affiché.

### 4.6 Indicateur de synchro — sobre et informatif

Un seul composant discret en bas de sidebar (l'emplacement `#cloud-status` existe déjà) :

```
● Synchronisé            — vert #2d6a35, point plein
◐ 3 en attente           — ambre #f9a825, point plein, compteur réel
○ Hors-ligne             — gris #8a8f8c, point creux, zéro animation
! Échec · 2 éléments     — rouge #c0392b, avec action « Réessayer »
```

Aucune pulsation permanente, aucun halo, aucun dégradé. Un état = une couleur + un texte
explicite + une action quand c'est pertinent. Le badge de compteur remplace l'animation :
il informe au lieu de décorer.

### 4.7 Direction artistique

La palette existante est **saine et cohérente** (`--green-dark #1a3d1f`,
`--green-mid #2d6a35`, `--green-light #4caf50`, `--gold #f9a825`, Inter + Playfair Display,
thème sombre complet). Elle ne ressemble pas à une sortie d'IA. Les dérives à corriger sont
ponctuelles :

- **17 `linear-gradient` dans le bloc CSS** (lignes 20-429), 20 dans le fichier entier :
  `.sidebar`, `.nav-item.active`, `.admin-tab.active`, les 5 barres `::before` des cartes KPI,
  `.topbar-badge`, `#prod-alert-banner`… → remplacer par des aplats + filet de 2 px.
- `box-shadow: 0 0 6px rgba(…)` sur `.cloud-dot` (3 occurrences, lignes 73-75) : halo
  lumineux permanent → point plein, sans glow.
- `.page` (ligne 92) animé en `transform: translateY(20px)` + `opacity .5s` à **chaque**
  changement d'onglet → supprimer la translation, garder un fondu de 120 ms.
- `.kpi-card:hover { transform: translateY(-3px) }` (ligne 99) : effet sans objet sur
  tactile → l'encapsuler dans `@media (hover: hover)`.
- Densité : `padding: 24px` (6 occurrences) et `gap: 20px` (5 occurrences) → passer à
  16 px / 12 px, tableaux en `font-size: 13px` avec lignes de 36 px. C'est un outil
  d'exploitation, pas une landing page.
- Polices **auto-hébergées** (WOFF2 dans `www/fonts/`) : supprime la dépendance réseau
  et règle le point 2.5.

---

## 5. ÉTAPE 1 — Le socle de persistance

Ordre imposé par les dépendances : **rien ne peut être corrigé en amont de la persistance**,
parce que la file d'attente, la résolution de conflits et l'indicateur de synchro se
construisent tous sur un stockage transactionnel qui n'existe pas encore.

Livrables de cette étape :

1. `biozar/web/core/db.js` — couche d'abstraction SQLite (Capacitor / Tauri / OPFS),
   migrations versionnées, ouverture transactionnelle.
2. `schema/v1.sql` — les 10 tables entités + `outbox` + `conflicts_log` + `sync_meta`.
3. `biozar/web/core/migration.js` — import idempotent depuis `localStorage.biozar_state`
   vers SQLite, avec sauvegarde de l'ancienne clé et journal de conversion.
4. `biozar/web/core/outbox.js` — enqueue transactionnel, rejeu séquentiel, backoff.
5. Tests automatisés du parcours : saisie hors-ligne → coupure → reconnexion → reprise.

Ce qui est **volontairement exclu** de l'étape 1 : la refonte UI, le shell Tauri,
le durcissement du RLS (étape 2, car il nécessite le nouveau schéma serveur).

---

## 6. Corrections immédiates indépendantes (livrables tout de suite)

Ces six points ne dépendent d'aucune décision d'architecture :

| # | Fichier | Correction |
|---|---|---|
| A | `biozar/web/index.html:1712,1737,1840` | Remplacer `\xNN` par les caractères UTF-8 réels |
| B | `biozar-app/www/index.html:533-596` | Resynchroniser depuis `biozar/web/` (19 chaînes corrompues) |
| C | `biozar/web/index.html:3332/3432` | Supprimer le doublon `renderForecastKPIs` |
| D | `biozar/web/sw.js` | Network-first sur le shell, cache-first sur les assets fingerprintés |
| E | `biozar-app/www/index.html` + polices | Auto-héberger Inter/Playfair, retirer les `<link>` Google |
| F | `.gitignore` + `git filter-repo` | Sortir `keystore-b64.txt` et les 2 APK de l'historique |

---

## 7. Ce qui reste à trancher avant de coder

1. **Shell Windows** : Tauri 2 (Rust, ~4 Mo, SQLite natif, pas de Chromium embarqué) ou
   Electron (Node, ~90 Mo, écosystème plus connu) ?
2. **Schéma Supabase** : peut-on remplacer la table `biozar_state` par des tables par entité
   avec RLS sur `auth.uid()` ? Cela conditionne tout le modèle de conflit.
3. **Compatibilité ascendante** : les données déjà saisies sur les appareils en service
   doivent-elles être migrées automatiquement, ou repart-on d'une base vierge ?
4. **Périmètre de l'étape 1** : socle de persistance seul, ou socle + les 6 corrections
   immédiates de la section 6 ?
