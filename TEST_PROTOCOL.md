# 📱 Protocole de Test — BIOZAR PWA sur Mobile

> 🔗 **URL de test :** https://biozar-010204--mobile-test-izw7e64u.web.app  
> Version : 1.0.1  
> Build : 2026-06-03  
> ⏳ Preview expire dans 7 jours. Pour passer en production : `npx firebase-tools deploy --only hosting`

---

## ✅ Test 1 : Splash Screen

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 1.1 | Ouvrir l'URL sur le téléphone | Splash BIOZAR apparaît (fond vert foncé, logo, points animés) | ☐ |
| 1.2 | Attendre 2.2 secondes | Splash disparaît en fondu → écran de login visible | ☐ |
| 1.3 | Tapper l'écran avant 2.2s | Splash disparaît immédiatement | ☐ |

---

## ✅ Test 2 : Login

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 2.1 | Saisir `admin` / `biozar2026` | Connexion réussie, toast "Bienvenue admin !" | ☐ |
| 2.2 | Saisir mauvais identifiant | Message rouge "❌ Identifiant ou mot de passe incorrect." | ☐ |
| 2.3 | Appui sur Enter dans le champ mot de passe | Déclenche la connexion | ☐ |

---

## ✅ Test 3 : Navigation & Interface

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 3.1 | Cliquer sur "Tableau de Bord" | Dashboard avec KPI, graphiques, animations d'entrée | ☐ |
| 3.2 | Cliquer sur "Finances" | Page finances avec graphiques et tableau de trésorerie | ☐ |
| 3.3 | Cliquer sur "Production" | Suivi de production, phases, checklist | ☐ |
| 3.4 | Cliquer sur "Clients" | CRM avec 3 sous-onglets (Portefeuille, Pipeline, Campagnes) | ☐ |
| 3.5 | Cliquer sur "Produits" | Grille des produits + simulateur de marges | ☐ |
| 3.6 | Cliquer sur "Panneau Admin" | Interface admin avec 7 onglets | ☐ |
| 3.7 | Vérifier les animations | Transitions fluides entre les pages | ☐ |

---

## ✅ Test 4 : Mode Hors Ligne (Offline)

**⚠️ Important : Avant de passer en mode Avion, visitez TOUTES les pages ci-dessous**
pour que le Service Worker les mette en cache :
- Tableau de Bord → Finances → Production → Clients → Produits → Admin (Export)

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 4.1 | Visiter TOUTES les pages (ci-dessus) | SW met en cache chaque page visitée | ☐ |
| 4.2 | Activer le mode Avion sur le téléphone | — | ☐ |
| 4.3 | Recharger l'app | L'app s'affiche **sans connexion** (Service Worker sert le cache) | ☐ |
| 4.4 | Naviguer entre les pages visitées | Les pages se chargent depuis le cache | ☐ |
| 4.5 | Désactiver le mode Avion | L'app continue de fonctionner normalement | ☐ |

---

## ✅ Test 5 : Installation PWA (Ajouter à l'écran d'accueil)

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 5.1 | Sur Chrome Android, appuyer sur le menu | Option "Ajouter à l'écran d'accueil" ou bannière "Installer" | ☐ |
| 5.2 | Appuyer sur "Installer" | L'app s'installe comme une app native | ☐ |
| 5.3 | Ouvrir l'app depuis l'écran d'accueil | Splash screen → Login (pas d'URL bar) | ☐ |
| 5.4 | Vérifier l'icône sur l'écran d'accueil | Icône carrée BIOZAR (192x192 ou 512x512) | ☐ |

---

## ✅ Test 6 : Badge de Mise à Jour PWA

**Principe :** Le badge apparaît quand une nouvelle version du Service Worker est détectée.

### Phase A — Première visite (enregistrement du SW v1.0.0)

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 6.1 | Ouvrir l'app et se connecter | SW s'enregistre (v1.0.0) | ☐ |
| 6.2 | Aller dans Admin > Export | Version affichée : `1.0.0`, SW badge : `SW ✓` | ☐ |

### Phase B — Simuler une mise à jour

> **Sur votre PC**, exécutez : `test-sw-update.bat` (ou suivez les étapes manuelles)

**Étapes manuelles :**
1. Ouvrez `sw.js` → changez `CACHE_NAME = 'biozar-v1'` → `biozar-v2`
2. Ouvrez `index.html` → changez `APP_VERSION = '1.0.0'` → `'1.0.1'`
3. Déployez : `npx -y firebase-tools@latest deploy --only hosting`

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 6.3 | Recharger l'app sur le téléphone | ✅ Badge apparaît en haut : "🔄 Nouvelle version disponible" | ☐ |
| 6.4 | Cliquer ✕ pour fermer le badge | Badge disparaît avec fondu | ☐ |
| 6.5 | Re-déclencher (recharger à nouveau) | Badge réapparaît | ☐ |
| 6.6 | Cliquer "🔄 Mettre à jour" | L'app se recharge automatiquement avec la nouvelle version | ☐ |
| 6.7 | Vérifier Admin > Export | Version affichée : `1.0.1` | ☐ |

### Phase C — Restaurer la version originale

```bash
git checkout sw.js version.json
npx -y firebase-tools@latest deploy --only hosting
```

---

## ✅ Test 7 : Admin — Export / Import

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 7.1 | Admin > Export > Exporter tout (JSON) | Un fichier JSON se télécharge | ☐ |
| 7.2 | Vérifier le JSON | Présence de : products, charges, clients, production, tresorerie | ☐ |
| 7.3 | Exporter Clients (CSV) | Fichier CSV s'ouvre dans Excel | ☐ |
| 7.4 | Exporter Production (CSV) | CSV avec dates, produits, quantités | ☐ |
| 7.5 | Version affichée | `1.0.0`, PWA ✓, SW ✓ | ☐ |

---

## ✅ Test 8 : Admin — Gestion des Agents

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 8.1 | Admin > Agents > Créer agent "test"/"1234"/"Production" | Agent créé | ☐ |
| 8.2 | Se déconnecter, se reconnecter avec test/1234 | Accès limité à Production uniquement | ☐ |
| 8.3 | Vérifier que les onglets Finance/Clients sont cachés | Masqués pour rôle Production | ☐ |
| 8.4 | Se reconnecter avec admin/biozar2026 | Accès complet restauré | ☐ |

---

## ✅ Test 9 : Barre Latérale Mobile

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 9.1 | Ouvrir l'app en portrait sur mobile | Barre latérale masquée, bouton ☰ visible en haut à gauche | ☐ |
| 9.2 | Appuyer sur ☰ | Barre latérale coulisse depuis la gauche | ☐ |
| 9.3 | Appuyer sur un élément de navigation | Barre se ferme, page change | ☐ |
| 9.4 | Appuyer sur l'overlay gris derrière la barre | Barre se ferme | ☐ |

---

## ✅ Test 10 : Performance & Console

| # | Action | Résultat Attendu | OK? |
|---|--------|-------------------|-----|
| 10.1 | Vérifier les temps de chargement | App chargée en < 3s (1ère visite), < 1s (retour) | ☐ |
| 10.2 | Ouvrir Chrome DevTools à distance | `chrome://inspect` sur le téléphone → vérifier 0 erreur rouge | ☐ |
| 10.3 | Scroller les longues pages | Fluide, pas de saccades | ☐ |
| 10.4 | Vérifier la console pour `[SW]` messages | SW doit loguer son installation et activation | ☐ |

---

## 📊 Récapitulatif

| Section | Tests | Passés | Échecs |
|---------|-------|--------|--------|
| Splash Screen | 3 | ☐ | ☐ |
| Login | 3 | ☐ | ☐ |
| Navigation | 7 | ☐ | ☐ |
| Mode Hors Ligne | 5 | ☐ | ☐ |
| Installation PWA | 4 | ☐ | ☐ |
| Badge Mise à Jour | 7 | ☐ | ☐ |
| Export / Import | 5 | ☐ | ☐ |
| Agents | 4 | ☐ | ☐ |
| Barre Latérale | 4 | ☐ | ☐ |
| Performance | 4 | ☐ | ☐ |
| **Total** | **46** | **0** | **0** |

### ✅ Critères de validation

- [ ] **Splash** : affiché et disparaît dans les 3s
- [ ] **Login** : admin/biozar2026 fonctionne
- [ ] **PWA** : installable sur l'écran d'accueil
- [ ] **Offline** : fonctionne sans connexion après cache
- [ ] **Badge mise à jour** : apparaît après modification du SW
- [ ] **Admin** : export JSON/CSV fonctionnel, version affichée
- [ ] **Console** : aucune erreur JS (vérifier avec `chrome://inspect`)

> **Date du test :** ______________  
> **Appareil :** ______________ (Android)  
> **Navigateur :** Chrome ______________  
> **Testé par :** ______________
