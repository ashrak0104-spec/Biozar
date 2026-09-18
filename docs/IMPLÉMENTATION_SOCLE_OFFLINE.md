# BIOZAR — Socle semi-offline : ce qui est fait, ce qui reste

**Date :** 2026-09-18 · **Branche :** `arena/01a0b31d-biozar`
**Décisions actées :** Tauri 2 (Windows) · double écriture Supabase · migration automatique · socle + corrections immédiates

---

## 1. Commandes

```bash
npm test                # 107 tests, ~9 s
npm run verify          # 16 contrôles d'intégrité du paquet semi-offline
npm run gen:sql         # régénère le schéma SQLite consommé par Tauri
npm run gen:server-sql  # régénère la migration PostgreSQL/Supabase
npm run copy-web        # biozar/web → biozar-app/www
```

**État vérifié :** `107 pass / 0 fail`, `22 contrôles réussis`, codes de sortie 0.

---

## 2. Corrections immédiates livrées

| # | Correction | Preuve |
|---|---|---|
| A | Mojibake `\xNN` corrigé (lignes 1712, 1737, 1840) | `grep '\\x[0-9a-f]{2}'` → 0 (verify n° 6) |
| B | `biozar-app/www/` resynchronisé (19 chaînes corrompues en HTML brut) | MD5 source ≡ copie (verify n° 1) |
| C | Doublon `renderForecastKPIs` supprimé, `updateReportingKPIs()` réinjecté | 164 fonctions, 0 doublon (verify n° 7) |
| D | Service Worker réécrit : shell network-first, données Supabase jamais cachées | verify n° 8 |
| E | 7 polices WOFF2 auto-hébergées (172 Ko) + html2canvas/jsPDF vendorisés (556 Ko) | 0 référence externe (verify n° 3) |
| F | `keystore-b64.txt` + 2 APK retirés du suivi Git, `.gitignore` durci | verify n° 16 |

**L'app n'a plus aucune dépendance réseau pour son shell.**

### Bugs corrigés au passage, non prévus au plan

- **`fix_parcelles_export.py` était la source du mojibake** : il écrivait `'…\\xc2\\xb2…'` ;
  en Python `\\x` produit un antislash littéral. Ne plus relancer ce script.
- **Le statut de parcelle se vidait à l'édition** : `'Sem\xc3\xa9e'` (= `SemÃ©e`) ne
  correspondait à aucune `<option value="Semée">`.
- **`last_synced_at` avançait même après une coupure** → le pull suivant aurait manqué
  définitivement les changements intermédiaires. Le jalon n'avance plus que si
  `!aborted && errors === 0`.
- **La machine à états réseau restait bloquée sur `syncing`** : connectivité et phase de
  synchro étaient confondues dans une seule variable. Refondue sur deux dimensions,
  8 tests dédiés.
- **La CI produisait un APK non signé** : `android.buildOptions` est lu par `cap build`,
  pas par `./gradlew assembleRelease`. `scripts/android-signing.sh` injecte le
  `signingConfigs` dans `build.gradle`. **Premier jet testé : la regex ciblait le mauvais
  bloc `release`** (celui de `signingConfigs`, pas celui de `buildTypes`) — l'APK serait
  resté non signé sans erreur. Corrigé et re-vérifié structurellement.
- **Le jeton d'authentification n'atteignait pas la synchro** : les politiques RLS de la migration 002 exigent `auth.uid()`, mais le câblage ne transmettait que la clé anonyme. Chaque requête aurait renvoyé 401 — et la file d'attente ne se serait jamais vidée, sans message d'erreur. Le jeton vit dans `state.currentUser.accessToken`, donc il n'existe qu'**après** la connexion : le transport a maintenant un `setAccessToken()`, rafraîchi avant chaque cycle.
- **Le Service Worker ne préchargeait pas le socle** : `PRECACHE_ASSETS` datait d'avant l'existence de `core/`. Les 10 modules n'étaient ni préchargés ni routés — l'application n'aurait pas démarré hors-ligne au premier lancement, ce qui est précisément la promesse du produit. Ils sont maintenant préchargés (cache passé en `biozar-v5` pour invalider l'ancien).
- **Le repli hors-ligne renvoyait du HTML pour un module** : `networkFirst()` retombait sur `index.html` pour *toute* requête en échec. Pour un `import` ES, cela produit une erreur de type MIME opaque, bien plus difficile à diagnostiquer qu'un 503 explicite. Le repli est désormais réservé aux navigations.
- **Les déclencheurs de synchro ne s'exécutaient jamais** : ils étaient posés dans un `initCloudMonitor()` remplacé, mais le socle est chargé en module `deferred` — il s'exécute donc **après** le script inline de démarrage qui a déjà appelé `initCloudMonitor()`. Remplacer la fonction à ce stade ne servait à rien. Les écouteurs `online` / `visibilitychange` sont maintenant posés directement à l'installation.
- **Le chemin legacy aurait perdu la synchro cloud** : la migration 002 soumet
  `biozar_state` à `auth.uid()`, mais `supabase-init.js` n'envoyait que la clé
  anonyme. Ses écritures auraient échoué **silencieusement** — `supabaseFetch`
  avale l'erreur et renvoie `null`, l'app croyant avoir sauvegardé. Le jeton est
  maintenant résolu à l'appel (`window.__biozarAccessToken`, publié par le socle,
  avec repli sur la session en cours) et joint à l'en-tête `Authorization`.
- **`lib.rs` ne compilait pas** : `app.get_webview_window("main")` vient du trait
  `tauri::Manager`, qui n'était pas importé. Erreur de compilation certaine au
  `cargo build`, invisible ici puisque Rust n'est pas installable. Trouvée en
  croisant la documentation officielle.
- **Schéma décalé des données réelles** : `commandes` et `factures` étaient modélisées
  avec des noms inventés (`produit`, `montant`, `numero`, `lignes`) alors que l'app écrit
  `product`, `total`, `num`, `lines`. Schéma aligné sur le réel.

---

## 3. Socle de persistance

```
biozar/web/core/            10 modules ES (chargement natif navigateur, sans bundler)
├── schema.js               12 entités + outbox + conflicts_log + sync_meta
├── db.js                   Db + 4 adaptateurs (Capacitor / Tauri / node:sqlite)
├── sync-engine.js          push séquentiel + pull LWW + backoff + reprise
├── net.js                  NetworkMonitor (2 dimensions) + sonde HTTP
├── transport-supabase.js   tables par entité + miroir legacy (double écriture)
├── migration.js            localStorage → SQLite, idempotente
├── bridge.js               différenciation d'état → opérations SQL
├── sync-status.js          indicateur UI sobre
├── wiring.js               installation dans l'app existante (mode shadow)
└── index.js                bootstrap()
```

Le schéma produit **17 tables applicatives et 47 index explicites**, en 65 instructions.
`sqlite_sequence` (créée par `AUTOINCREMENT`) et `sqlite_autoindex_*` sont des objets
internes de SQLite : les compter ferait passer le schéma pour plus riche qu'il ne l'est.
Le contrôle `verify` les exclut désormais — il annonçait auparavant « 18 tables ».

### Conversion en ES modules — pourquoi

Le socle était écrit en CommonJS (`require` / `module.exports`). L'application n'a
**aucun bundler** : `biozar/web/` est déployé tel quel sur Cloudflare Pages et copié tel
quel dans l'APK. Un navigateur ne sait pas charger `require()`.

Plutôt que d'introduire une étape de build, le socle est passé en ES modules, chargés
nativement (`<script type="module">`). Contrainte vérifiée automatiquement : **tout import
relatif doit porter l'extension `.js`**, sinon l'échec n'apparaît que dans la WebView,
sur le terrain.

### Ce que les 107 tests prouvent

| Test | Code réellement exécuté |
|---|---|
| `une écriture crée la ligne ET son entrée de file, atomiquement` | `Db.upsert()` → transaction → 2 INSERT |
| `un échec dans la transaction annule aussi la mise en file` | ROLLBACK réel sur SQLite |
| `les opérations déjà envoyées ne sont pas perdues` | `SyncEngine.push()` interrompu par `TypeError`, puis rejeu |
| `recoverInterrupted remet en file ce qu'un crash avait laissé in_flight` | `SyncEngine.recoverInterrupted()` |
| `une panne totale ne vide pas la file en boucle` | `last_synced_at` vérifié inchangé |
| `à égalité d'horodatage, l'arbitrage sur device_id est déterministe` | `resolveWinner()` dans les deux sens |
| `une ligne distante plus récente remplace la locale et archive la perdante` | `applyRemote()` + lecture de `conflicts_log` |
| `saisie hors-ligne → coupure → reconnexion → reprise sans perte` | 12 `upsert` hors-ligne, cycle en échec, cycle réussi, ordre vérifié |
| `est idempotente : un second passage ne crée aucun doublon` | `migrateFromLegacy()` deux fois |
| `hors-ligne pendant une synchro : offline l'emporte sur syncing` | `NetworkMonitor.recompute()` |
| `modifier une ligne ne crée pas de doublon en base` | `applyOps()` deux fois sur la même clé naturelle |
| `deux récoltes du même produit le même jour restent distinctes` | `stableId()` avec indice d'occurrence |
| `parcours réaliste : plusieurs éditions successives` | 4 `syncState()` successifs, quantités vérifiées en base |
| `une écriture via la façade est durable puis synchronisée` | `bootstrap()` + `syncNow()` + `writeLegacyMirror` |
| `chaque instruction découpée s'exécute individuellement sur SQLite` | `splitStatements()` sur le vrai schéma : 65 instructions rejouées une par une |
| `une transaction valide fait BEGIN puis COMMIT` | `CapacitorAdapter.transaction()` contre un faux greffon Capacitor |
| `un échec dans la transaction fait ROLLBACK` | `TauriAdapter.transaction()` contre un faux greffon tauri-plugin-sql |
| `Db.open fonctionne sur CapacitorAdapter` | `Db` + `upsert` + `findAll` adossés à un vrai SQLite via le faux greffon |
| `install() reprend le jeton de state.currentUser` | `wiring.install()` dans un DOM factice, en-têtes `Authorization` capturés |
| `sync_error : alerte, rouge, bouton Réessayer` | `createSyncIndicator()` monté dans jsdom, attributs lus sur le DOM réel |
| `aucune animation permanente : le mouvement est conditionné` | le CSS **injecté** est relu : toute `animation:` doit être derrière `prefers-reduced-motion` |

Tous tournent contre un **vrai SQLite** (`node:sqlite`). Seul le transport réseau est
simulé — et le faux serveur applique lui aussi le LWW, pour que les tests de conflit ne
passent pas pour de mauvaises raisons.

---

## 4. Migration SQL serveur

`supabase/migrations/002_serveur_entites.sql` — **générée** depuis `core/schema.js`, donc
client et serveur ne peuvent pas diverger silencieusement.

- 12 tables PostgreSQL, colonnes dérivées de `ENTITY_SPECS`
- `server_rev` attribué par trigger (`biozar_assign_rev`) — **jamais fourni par le client**
- `server_updated_at` pour diagnostiquer les dérives d'horloge embarquée
- RLS : `auth.uid() IS NOT NULL` partout ; suppression physique réservée aux admins
- **Les 4 politiques `USING (true)` de `biozar_state` sont supprimées**

**Syntaxe validée par le vrai parseur PostgreSQL 18** (`libpg-query`, WASM) :
218 instructions analysées — 12 `CreateStmt`, 52 `CreatePolicyStmt`, 36 `IndexStmt`,
24 `CreateTrigStmt`, 13 `AlterTableStmt`, 2 `CreateFunctionStmt`, 1 `CreateSeqStmt`.

> ⚠️ Après exécution, le client **doit** envoyer un jeton d'authentification
> (`accessToken` dans `SupabaseTransport`). Sans lui, toutes les requêtes renvoient 401.

---

## 5. Câblage dans l'application — mode shadow

`index.html` charge désormais :

```html
<script type="module">
  import { install } from './core/wiring.js';
  window.__biozarOffline = await install({ … });
</script>
```

**Pourquoi en mode shadow ?** L'app appelle `saveState()` à 41 endroits. Les réécrire d'un
coup ferait courir un risque inutile à une application en service. En mode shadow :

- le localStorage **reste la source de vérité** — le chemin existant n'est pas modifié ;
- `saveState()` est doublé : il diffère l'état et ne pousse vers SQLite **que** les lignes
  réellement ajoutées, modifiées ou supprimées ;
- `updateCloudStatus()` et `initCloudMonitor()` sont remplacés par le vrai moniteur ;
- **si le socle échoue, aucune exception ne remonte vers l'UI** : l'app continue sur
  localStorage. C'est vérifié par le contrôle verify n° 15.

Le point délicat est l'identité des enregistrements : la plupart des tableaux legacy n'ont
pas de clé primaire. `NATURAL_KEY` définit par entité les champs qui identifient une ligne.
Sans ça, **modifier un client créerait un doublon** — et la synchro le propagerait au
serveur. Trois tests verrouillent ce comportement.

---

## 6. Ce qui n'est PAS vérifié ici

| Élément | Statut | Raison |
|---|---|---|
| **Exécution dans un navigateur** | ⚠️ partielle | Aucun navigateur dans le sandbox (Chromium : paquets système manquants **et** CDN de téléchargement bloqué — les deux tentés). `jsdom` couvre la couche DOM : l'indicateur de synchronisation y est monté et ses attributs relus (21 tests). **Reste non vérifié** : le rendu visuel réel, les WebView Android/WebView2, et le chargement des modules par un vrai moteur. Le graphe d'imports ESM est vérifié statiquement (10 modules, 16 imports). |
| **Compilation Rust / Tauri** | ⚠️ partielle | `cargo` non installable : rustup renvoie `000` (injoignable) et apt n'a pas les droits. **Le code Rust n'a donc jamais été compilé.** En revanche `tauri.conf.json` et `capabilities/default.json` ont été validés contre les schémas JSON officiels extraits de `tauri-apps/tauri` (branche `dev`), et les 6 identifiants de permission vérifiés un par un dans `crates/tauri/permissions/` et `plugins/sql/permissions/`. |
| **Build APK de bout en bout** | ❌ non vérifié | Android SDK et JDK absents. Le workflow corrigé n'a pas été exécuté. |
| **Adaptateurs Capacitor / Tauri** | ⚠️ partiellement | Exercés contre de faux greffons imitant les APIs documentées (19 tests) : noms de méthodes, paramètres liés, ordre BEGIN/COMMIT/ROLLBACK, découpage du script SQL. **Jamais exécutés contre les vrais greffons** — il faut un APK et un EXE réels pour ça. |
| **PWA navigateur** | ❌ non câblé | `createAdapter('browser')` lève une erreur explicite ; manque sql.js + OPFS. APK et EXE n'en ont pas besoin. |
| **Migration SQL appliquée** | ❌ non exécutée | Syntaxe validée par le parseur PostgreSQL 18, mais jamais passée contre un vrai serveur. |
| **Mode shadow en conditions réelles** | ❌ non observé | La logique de différenciation est testée (17 tests), pas son comportement dans la WebView. |
| **Refonte UI complète** | ⚠️ partielle | La sobriété est faite (0 dégradé, 0 halo) ; la refonte de la densité et des tableaux reste à affiner visuellement dans un navigateur. |

---


---

## 8. Passe de sobriété UI (faite)

`scripts/ui-sobriete.mjs` applique 28 ajustements, vérifiés par les contrôles
verify n° 16 et 17 :

| Avant | Après |
|---|---|
| 17 `linear-gradient` décoratifs | **0** — aplats de couleur |
| 3 halos `box-shadow:0 0 6px` sur `.cloud-dot` | **0** — point plein |
| `.page` se translatait de 20 px à chaque onglet (500 ms) | fondu 120 ms, sans translation |
| `.kpi-card:hover` actif sur tactile | réservé à `@media (hover:hover)` |
| `.content` 32 px, cartes 24 px, grilles 20 px | 24–28 px / 16–20 px / 14 px |

Le dégradé ne portait aucune information : un aplat plus un filet de couleur
de 3 px exprime la même hiérarchie. La densité resserrée est ce qu'attendent
les consignes — un outil d'exploitation, pas une vitrine.

**Ce qui reste sur l'UI** : la refonte des tableaux denses (pagination, filtres
persistants, colonnes masquables) et le mode sombre du socle. Ces ajustements
doivent se valider à l'œil, dans un navigateur — pas par un script.

---

## 9. Ordre proposé pour la suite

1. **Ouvrir l'app et regarder la console.** `window.__biozarOffline` doit valoir
   `{ available: true, platform: 'android' | 'tauri' }`. Si `available: false`, le message
   dit pourquoi. C'est le premier test réel, et il ne demande aucun outillage.
2. **Comparer les deux bases** après une journée d'usage : le compte de lignes SQLite doit
   correspondre au localStorage. Tant que ce n'est pas le cas, ne pas promouvoir.
3. **Exécuter la migration SQL** sur le projet Supabase, puis renseigner `accessToken`.
   Sans cette étape, la faille d'accès reste ouverte.
4. **Lancer `build-apk.yml` corrigé** sur une branche de test, confirmer l'APK signé.
5. **Builder l'EXE** : toolchain Rust, `npm --prefix desktop run tauri build`, valider
   l'installeur NSIS sur une machine Windows réelle.
6. **Promouvoir entité par entité** hors du mode shadow.
