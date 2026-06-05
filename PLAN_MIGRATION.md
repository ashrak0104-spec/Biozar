# 🚀 PLAN DE MIGRATION — BIOZAR vers Stack 100% Gratuite

## Objectif : Remplacer Firebase (payant) par Cloudflare + Supabase (0€)

---

## 🗺️ Vue d'ensemble

| Service Firebase | Alternative Gratuite | Coût | Fichiers à modifier |
|:----------------|:--------------------|:-----|:--------------------|
| **Firebase Hosting** | **Cloudflare Pages** | **0€** (bande passante illimitée) | `firebase.json` → supprimer |
| **Firebase Auth** | **Supabase Auth** | **0€** (50 000 MAU) | `firebase-init.js`, `index.html` (state.user) |
| **Cloud Functions** | **Cloudflare Workers/Functions** | **0€** (exécutions illimitées) | `functions/src/index.ts`, `ai/src/index.ts` |
| **Firestore** | **Supabase (PostgreSQL)** | **0€** (500 Mo) | `firebase-init.js` (saveState/loadState) |
| **Domaine personnalisé** | **Cloudflare DNS** | **0€** (domaine ~5-10€/an) | Configuration DNS |

---

## 📂 ÉTAPE 1 — Créer le dépôt GitHub + compte Cloudflare

**Actions :**
1. Créer un dépôt GitHub public `biozar`
2. Push le code actuel (sans `node_modules`, `.dataconnect`, `android/build`)
3. Créer un compte [Cloudflare](https://dash.cloudflare.com/sign-up) (gratuit)
4. Connecter Cloudflare Pages au dépôt GitHub

**Fichiers à créer :**
- `.github/workflows/deploy.yml` — CI/CD vers Cloudflare Pages

---

## 🌐 ÉTAPE 2 — Déployer sur Cloudflare Pages + Domaine personnalisé

**Actions :**
1. Dans Cloudflare Dashboard → **Pages** → **Connect to Git**
2. Choisir le dépôt GitHub `biozar`
3. Configurer le build :
   - **Build command** : `(none - site statique)`
   - **Build output directory** : `.`
4. Dans **Custom domains** : ajouter votre domaine (ex: `biozar.mg`)
5. Cloudflare génère automatiquement le SSL (HTTPS)

**Fichiers à supprimer :**
- `firebase.json` (plus besoin)
- `.firebaserc`
- `firestore.rules`
- `firestore.indexes.json`
- `connector.yaml`
- `dataconnect/` (tout le dossier)

---

## 🔐 ÉTAPE 3 — Remplacer Firebase Auth → Supabase Auth

**Compte :** [supabase.com](https://supabase.com) — plan gratuit

**Fichiers à modifier :**

### 1. `firebase-init.js` → `supabase-init.js`
```javascript
// Au lieu de Firebase Auth
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xxx.supabase.co'
const supabaseKey = 'public-anon-key'
const supabase = createClient(supabaseUrl, supabaseKey)

window.BIOZAR_SUPABASE = {
  supabase,
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { user: data.user, error }
  },
  async signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password })
    return { user: data.user, error }
  }
}
```

### 2. `index.html` — Adapter le login
```javascript
// Remplacer checkLogin() pour utiliser Supabase
async function checkLogin() {
  const email = document.getElementById('loginUsername').value + '@biozar.local'
  const { user, error } = await window.BIOZAR_SUPABASE.signIn(email, password)
  if (error) { /* afficher erreur */ return }
  state.user = user.email
  // ... suite identique
}
```

---

## ⚡ ÉTAPE 4 — Cloud Functions → Cloudflare Workers

**Fichiers à créer :**

### `functions/api/hello.js` (remplace functions/src/index.ts)
```javascript
export async function onRequest(context) {
  return new Response(JSON.stringify({
    message: "BIOZAR API is ready!",
    version: "1.0.1"
  }), {
    headers: { "Content-Type": "application/json" }
  })
}
```

### `functions/api/ai-hello.js` (remplace ai/src/index.ts)
```javascript
export async function onRequest(context) {
  return new Response(JSON.stringify({
    message: "BIOZAR AI helper is online."
  }), {
    headers: { "Content-Type": "application/json" }
  })
}
```

**Fichiers à supprimer :**
- `functions/` (tout le dossier)
- `ai/` (tout le dossier)

---

## 🗄️ ÉTAPE 5 — Firestore → Supabase PostgreSQL

### 1. Créer la table dans Supabase
```sql
CREATE TABLE biozar_state (
  id TEXT PRIMARY KEY DEFAULT 'appState',
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Adapter `firebase-init.js` → `supabase-init.js`
```javascript
// Sauvegarde dans Supabase au lieu de Firestore
window.BIOZAR_SUPABASE.saveState = async function(state) {
  const { error } = await supabase
    .from('biozar_state')
    .upsert({ id: 'appState', data: state, updated_at: new Date() })
  return !error
}

window.BIOZAR_SUPABASE.loadState = async function() {
  const { data, error } = await supabase
    .from('biozar_state')
    .select('data')
    .eq('id', 'appState')
    .single()
  return data?.data || null
}
```

### 3. Adapter `index.html`
```javascript
// saveState() devient :
function saveState() {
  const s = JSON.parse(JSON.stringify(state))
  delete s.user; delete s.role; delete s.password
  localStorage.setItem('biozar_state', JSON.stringify(s))
  if (window.BIOZAR_SUPABASE?.saveState) {
    window.BIOZAR_SUPABASE.saveState(s)
  }
}

// loadState() utilise Supabase au lieu de Firestore
async function loadState() {
  // ... localStorage d'abord
  if (window.BIOZAR_SUPABASE?.loadState) {
    const remote = await window.BIOZAR_SUPABASE.loadState()
    if (remote) Object.assign(state, mergeStateWithDefaults(remote, state))
  }
}
```

---

## 📋 ÉTAPE 6 — Nettoyer et tester

**Fichiers à supprimer définitivement :**
```
firebase.json
.firebaserc
firestore.rules
firestore.indexes.json
connector.yaml
dataconnect/
functions/
ai/
biozar-app/ (à garder si app Android)
firebase-init.js (remplacé par supabase-init.js)
```

**Fichiers à mettre à jour :**
```
index.html → supprimer <script src="firebase-init.js">, ajouter <script src="supabase-init.js">
sw.js → supprimer Firebase CDN cache
package.json → supprimer dépendance firebase
```

**Tests à faire :**
1. ✅ Connexion avec Supabase Auth
2. ✅ Dashboard s'affiche avec données
3. ✅ Sauvegarde/chargement des données
4. ✅ API Functions fonctionnent
5. ✅ Domaine personnalisé HTTPS
6. ✅ Application Android toujours fonctionnelle

---

## 💰 Résumé des coûts

| Poste | Avant (Firebase) | Après (Migration) |
|:------|:-----------------|:------------------|
| Hébergement | Gratuit (Spark) | **0€** (Cloudflare) |
| Domaine personnalisé | Payant (Blaze requis) | **0€** (Cloudflare DNS) |
| Cloud Functions | Blaze requis | **0€** (Cloudflare Workers) |
| Authentification | Payant (>50k users) | **0€** (Supabase) |
| Base de données | Firestore gratuit limité | **0€** (Supabase 500 Mo) |
| **TOTAL** | **~25$/mois (Blaze)** | **0€/mois** |

---

## 🎯 Pourquoi cette stack ?

1. **Cloudflare Pages** — Bande passante illimitée, CDN mondial, SSL gratuit
2. **Cloudflare Workers** — Exécutions gratuites illimitées
3. **Supabase** — PostgreSQL open source avec Auth intégré
4. **GitHub** — Hébergement du code, CI/CD gratuit
5. **Domaine .mg** — ~5-10€/an chez un registrar

---

*Document créé le ${new Date().toLocaleDateString('fr-FR')}*
*Migration prévue : 1-2 jours de travail*
