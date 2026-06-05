# 📱 GUIDE — Créer l'APK BIOZAR

## Structure du projet

```
biozar-app/
├── www/                          ← Votre application web
│   ├── index.html                ← Le dashboard BIOZAR
│   ├── manifest.json             ← Config PWA
│   └── biozar/                   ← Logos et fichiers Excel
├── android/                      ← Généré automatiquement
├── capacitor.config.json         ← Config Capacitor
├── package.json                  ← Dépendances
├── 1_INSTALLER.bat               ← ÉTAPE 1
├── 2_OUVRIR_ANDROID_STUDIO.bat   ← ÉTAPE 2
└── 3_METTRE_A_JOUR.bat           ← Pour les mises à jour
```

---

## ✅ ÉTAPE 1 — Installer les outils

### 1.1 Node.js
- Téléchargez : https://nodejs.org/en/download
- Choisissez **LTS (v20+)** → Windows Installer (.msi)
- Installez avec les options par défaut
- ✅ Redémarrez votre PC après l'installation

### 1.2 JDK 17
- Téléchargez : https://adoptium.net/temurin/releases/?version=17
- Choisissez **Windows x64 .msi**
- Installez avec les options par défaut

### 1.3 Android Studio
- Téléchargez : https://developer.android.com/studio
- Installez avec les options par défaut
- Au premier lancement, acceptez d'installer le SDK Android (cela prend ~15 min)

---

## ✅ ÉTAPE 2 — Lancer l'installation automatique

1. Ouvrez le dossier `biozar-app`
2. Double-cliquez sur **`1_INSTALLER.bat`**
3. Attendez que toutes les étapes se terminent (✅ vert)

---

## ✅ ÉTAPE 3 — Générer l'APK dans Android Studio

1. Double-cliquez sur **`2_OUVRIR_ANDROID_STUDIO.bat`**
2. Android Studio s'ouvre automatiquement
3. Attendez que la barre de progression en bas disparaisse (**Gradle Sync**)
4. Dans le menu : **Build → Build Bundle(s)/APK(s) → Build APK(s)**
5. Une notification apparaît → cliquez **"locate"**
6. Votre APK est dans :
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

---

## ✅ ÉTAPE 4 — Installer l'APK sur votre téléphone

### Option A — Via câble USB
1. Activez **Mode Développeur** sur votre téléphone :
   - Paramètres → À propos → Tapez 7 fois sur "Numéro de build"
2. Activez **Débogage USB** dans les options développeur
3. Branchez le câble, transférez le fichier `.apk`
4. Ouvrez le fichier sur le téléphone → Installer

### Option B — Via WhatsApp / Email
1. Envoyez le fichier `.apk` par WhatsApp ou email à vous-même
2. Ouvrez-le sur le téléphone
3. Autorisez l'installation depuis sources inconnues si demandé

---

## 🔄 Mettre à jour l'app après modifications

Quand vous modifiez le dashboard BIOZAR (`index.html`) :
1. Double-cliquez sur **`3_METTRE_A_JOUR.bat`**
2. Puis dans Android Studio : **Build → Build APK(s)**

---

## ❓ Problèmes fréquents

| Problème | Solution |
|---|---|
| `node n'est pas reconnu` | Réinstallez Node.js et redémarrez le PC |
| `java n'est pas reconnu` | Réinstallez JDK 17 et redémarrez le PC |
| Gradle Sync échoue | File → Invalidate Caches → Restart |
| APK ne s'installe pas | Activez "Sources inconnues" dans Paramètres → Sécurité |
| Écran blanc dans l'app | Vérifiez la connexion internet (pour les polices Google) |

---

## 📞 Infos de l'app

| Paramètre | Valeur |
|---|---|
| Nom de l'app | BIOZAR |
| Package ID | mg.biozar.app |
| Version | 1.0.0 |
| Langue | Français |
| Plateforme | Android 6.0+ |

---

*BIOZAR © 2026 · Bio de Madagascar · Antsiranana, Diana*
