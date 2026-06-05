# 🌿 RAPPORT INVESTISSEUR — BIOZAR
## Ferme Bio de Contre-Saison | Diana, Madagascar

---

## 🚀 Application de Pilotage — Prête pour Démo

### Accès en Ligne
| Service | URL |
|---------|-----|
| **Application Web** | [https://biozar-010204.web.app](https://biozar-010204.web.app) |
| **Console Firebase** | [https://console.firebase.google.com/project/biozar-010204/overview](https://console.firebase.google.com/project/biozar-010204/overview) |
| **APK Android** | `biozar-v1.0.1-final.apk` (dans le dossier projet) |

### Identifiants de Démo
| Rôle | Identifiant | Mot de passe |
|------|-------------|--------------|
| **Admin** (Jean) | `admin` ou `jean` | `biozar2026` |
| **Commercial** | `commercial` ou `pascal` | `biozar2026` |
| **Production** | (tout autre) | `biozar2026` |

---

## 📊 Fonctionnalités Développées

### ✅ Tableau de Bord (Dashboard)
- KPI temps réel : Revenus, charges, clients, solde
- Graphiques de trésorerie prévisionnelle
- Segmentation clients (Premium, Urbain, Santé, Distribution)
- Barres de progression des phases de production

### ✅ Gestion Financière
- Suivi des charges mensuelles (7 catégories)
- Graphique de répartition (doughnut)
- Marges par produit
- Tableau de trésorerie interactive (Juin → Novembre 2026)

### ✅ Suivi de Production
- Calendrier des phases de culture
- Saisie de production par produit/quantité
- Journal de production avec historique
- Rendement par produit (graphique à barres)
- Gestion des intrants (stock)
- Signalement d'incidents (irrigation, nuisibles, etc.)
- Checklist des tâches

### ✅ CRM Clients
- Ajout/édition de contacts
- Segmentation : Premium, Urbain, Santé, Distribution
- Pipeline commercial (Kanban : Prospection → Échantillon → Ponctuel → Abonné)
- Campagnes marketing simulées (envoi WhatsApp)

### ✅ Produits & Prix
- 4 produits phares : Tomate, Salade, Concombre, Herbes Aromatiques
- Calcul des marges
- Arguments de vente par segment
- Simulateur de marges

### ✅ Marketing & Lancement
- Calendrier de lancement (4 semaines)
- Stratégie : contenu vidéo → nutrition → paniers → livraison

### ✅ Matrice des Risques
- Élevés : Sécheresse, Nuisibles
- Moyens : Pluies hors saison
- Radar des risques interactif

### ✅ Business Model Canvas
- Partenaires, activités, valeur, ressources, relations, canaux, coûts, revenus

### ✅ Reporting Avancé
- KPI de production (total, CA, moyenne, top produit)
- Tendance production et ventes (jour/semaine/mois)
- Comparaison mensuelle
- Performance produits
- Données brutes avec filtres date

### ✅ Prévisions Intelligentes
- Régression linéaire sur données historiques
- Prévisions jusqu'à 12 semaines
- Indicateur de fiabilité R²
- Analyse saisonnière (mois par mois)
- Variabilité et cycles

### ✅ Simulateur de Scénarios
- Multiplicateur de production (0.5× à 3×)
- Kg supplémentaires par semaine
- Sauvegarde de scénarios multiples
- Export CSV multi-scénarios
- Export automatique configurable

### ✅ Export & Documentation
- Export PDF (KPI + données brutes)
- Export CSV (prévisions, multi-scénarios)
- Export/Import JSON complet
- Impression optimisée

---

## 🛠️ Stack Technique

| Technologie | Usage |
|-------------|-------|
| **Firebase Hosting** | Hébergement web (HTTPS, CDN) |
| **Firebase Firestore** | Base de données temps réel |
| **Firebase Auth** | Authentification (optionnelle) |
| **Firebase Functions** | API backend (Node.js 24) |
| **PWA** | Service Worker, mode hors-ligne, installable |
| **Capacitor** | Application Android native |
| **Chart.js** | Graphiques interactifs |
| **html2canvas + jsPDF** | Export PDF |

---

## 📈 Métriques Clés pour Investisseurs

- **Marge brute moyenne** : +200 % sur les produits
- **Segments clients** : 4 (Premium, Urbain, Santé, Distribution)
- **Taux de croissance projeté** : Visible dans les prévisions
- **Coûts mensuels** : ~5 000 000 Ar (paramétrable)
- **Capacité de production** : Variable selon saison

---

## 🔜 Prochaines Étapes Recommandées

1. **🔑 Activer Firebase Auth** dans la console Google pour la synchronisation cloud
2. **💳 Passer au plan Blaze** (pay-as-you-go) pour déployer les Cloud Functions
3. **📱 Publier l'APK Android** sur Google Play Store
4. **🌐 Connecter un nom de domaine personnalisé** (ex: biozar.mg)
5. **📊 Ajouter des données réelles** de production et clients

---

*Rapport généré le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}*
*Projet BIOZAR © 2026 — Console de Pilotage v1.0.1*
