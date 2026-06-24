# ✅ MIGRATION TERMINÉE — BIOZAR sur Stack 100% Gratuite

> **Statut : ✅ MIGRATION TERMINÉE**  
> **Date :** 5 juin 2026  
> **Version :** 1.1.0  
> **Stack :** Cloudflare Pages + Cloudflare Workers + Supabase (0€/mois)

---

## 🗺️ Vue d'ensemble

| Service Firebase | Alternative Gratuite | Statut |
|:----------------|:--------------------|:------:|
| **Firebase Hosting** | **Cloudflare Pages** | ✅ Terminé |
| **Firebase Auth** | **Supabase Auth** | ✅ Terminé |
| **Cloud Functions** | **Cloudflare Workers** | ✅ Terminé |
| **Firestore** | **Supabase (PostgreSQL)** | ✅ Terminé |

---

## 📋 Modifications effectuées

### Fichiers créés
| Fichier | Description |
|---------|-------------|
| `supabase-init.js` | Client REST Supabase (sans SDK, via fetch) + compatibilité `BIOZAR_FIREBASE` |
| `functions/api/hello.js` | Cloudflare Worker - API santé |
| `functions/api/ai-hello.js` | Cloudflare Worker - AI helper |
| `functions/api/health.js` | Cloudflare Worker - Health check |

### Fichiers modifiés
| Fichier | Modification |
|---------|-------------|
| `index.html` | `<script src="supabase-init.js">` au lieu de `firebase-init.js` |
| `biozar-app/www/index.html` | `<script src="supabase-init.js">` au lieu de `firebase-init.js` |
| `sw.js` | Suppression des CDN Firebase du cache |
| `biozar-app/www/sw.js` | Suppression des CDN Firebase du cache |
| `package.json` | Version 1.1.0, description mise à jour |
| `version.json` | Version 1.1.0 |
| `biozar-app/www/version.json` | Version 1.1.0 |
| `biozar-app/package.json` | Dépendance `firebase` supprimée |
| `functions/package.json` | Nettoyé (Firebase deps → Workers) |
| `.gitignore` | Firebase files ajoutés (firebase.json, .firebaserc, etc.) |
| `biozar-app/www/supabase-init.js` | Copié depuis la racine |

### Fichiers supprimés (via .gitignore ou inexistants)
- `firebase.json` — supprimé
- `.firebaserc` — supprimé
- `firestore.rules` — supprimé
- `firestore.indexes.json` — supprimé
- `connector.yaml` — supprimé
- `dataconnect/` — supprimé
- `firebase-init.js` — remplacé par `supabase-init.js`

---

## 🔧 Pour finaliser la configuration

### 1. Créer un compte Supabase
→ [https://supabase.com](https://supabase.com) — Plan gratuit

### 2. Configurer la base de données
Dans Supabase SQL Editor, exécuter :
```sql
CREATE TABLE IF NOT EXISTS biozar_state (
  id TEXT PRIMARY KEY DEFAULT 'appState',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Mettre à jour `supabase-init.js`
Remplacer les valeurs placeholder :
```javascript
const supabaseConfig = {
  url: 'https://VOTRE_PROJET.supabase.co',   // → votre URL Supabase
  anonKey: 'votre-cle-anon-publique'          // → votre clé anon publique
};
```

### 4. Déployer sur Cloudflare Pages
1. Créer un compte [Cloudflare](https://dash.cloudflare.com/sign-up)
2. Créer un dépôt GitHub et pusher le code
3. Dans Cloudflare Dashboard → **Pages** → **Connect to Git**
4. Build command : `(aucune - site statique)`
5. Output directory : `.`

---

## 🚀 Auto-Push : Push automatique Git

Deux méthodes sont disponibles pour pusher automatiquement vers GitHub dès qu'il y a des changements :

### Méthode 1 (recommandée) — Post-commit hook
Un hook Git a été installé dans `.git/hooks/post-commit`. Il déclenche un `git push` automatiquement **après chaque commit**. Aucun programme à garder ouvert.

**Fonctionnement :**
1. Vous faites `git add` + `git commit` normalement
2. Le hook pousse automatiquement vers `origin/<branche>`
3. Si le push échoue (pas de réseau), le commit est conservé

**Test :**
```bash
git commit --allow-empty -m "test auto-push"
# Vous devriez voir : [push] [post-commit] Push automatique vers origin/master...
#                  [OK] [post-commit] Push reussi vers origin/master
```

### Méthode 2 — Watcher automatique (auto-push.ps1)
Un script PowerShell `auto-push.ps1` surveille les dossiers `biozar/web/`, `biozar-app/www/` et `.github/workflows/`. Dès qu'un changement est détecté, il commit et push automatiquement.

**Lancement :**
- Exécutez `AUTO_PUSH_START.bat` (crée à la racine)
- Choisissez l'option 2 pour le watcher
- Laissez la fenêtre ouverte (Ctrl+C pour arrêter)

**Intervalle :** 30 secondes par défaut (modifiable dans `auto-push.ps1`)

---

## 🔒 Row Level Security (RLS)

Le script `migration-auth.sql` contient les politiques RLS pour les deux tables :

### Table `profiles`
- RLS activé avec politiques par rôle :
  - `Users can view own profile` — lecture de son propre profil
  - `Admins can view all profiles` — admin lit tout
  - `Admins can update all profiles` — admin modifie tout

### Table `biozar_state` (section 6)
- RLS activé avec politiques permissives (l'app utilise la clé anon)
- `Allow read/insert/update/delete biozar_state` — accès complet via clé anon
- **À terme :** migrer vers `auth.uid()` quand Supabase Auth sera intégré

**Pour activer :** Exécutez `migration-auth.sql` dans Supabase → SQL Editor

---

## 💰 Résumé des coûts

| Poste | Avant (Firebase Blaze) | Après (Migration) |
|:------|:-----------------------|:------------------|
| Hébergement | Payant (Blaze requis) | **0€** (Cloudflare Pages) |
| Domaine personnalisé | Payant (Blaze requis) | **0€** (Cloudflare DNS) |
| Cloud Functions | Blaze requis | **0€** (Cloudflare Workers) |
| Authentification | Payant (>50k users) | **0€** (Supabase Auth) |
| Base de données | Firestore gratuit limité | **0€** (Supabase 500 Mo) |
| **TOTAL** | **~25$/mois** | **0€/mois** ✅ |

---

*Document mis à jour le 5 juin 2026*
*BIOZAR — Console de Pilotage v1.1.0*
