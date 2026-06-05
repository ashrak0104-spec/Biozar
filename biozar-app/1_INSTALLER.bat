@echo off
chcp 65001 >nul
color 0A
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║     BIOZAR - Installation APK Android        ║
echo  ║     Bio de Madagascar 🌿                      ║
echo  ╚══════════════════════════════════════════════╝
echo.

REM ── Vérification Node.js ──────────────────────────────
echo [1/5] Vérification de Node.js...
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo  ❌ Node.js non trouvé !
  echo  👉 Installez Node.js depuis https://nodejs.org puis relancez ce script.
  pause
  exit /b 1
)
echo  ✅ Node.js OK - Version: 
node --version

REM ── Vérification Java ─────────────────────────────────
echo.
echo [2/5] Vérification de Java (JDK)...
java --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo  ❌ Java non trouvé !
  echo  👉 Installez JDK 17 depuis https://adoptium.net puis relancez ce script.
  pause
  exit /b 1
)
echo  ✅ Java OK
java --version 2>&1 | findstr /i "version"

REM ── Installation des dépendances npm ─────────────────
echo.
echo [3/5] Installation des dépendances Capacitor...
npm install
IF %ERRORLEVEL% NEQ 0 (
  echo  ❌ Erreur lors de l'installation npm.
  pause
  exit /b 1
)
echo  ✅ Dépendances installées !

REM ── Ajout de la plateforme Android ───────────────────
echo.
echo [4/5] Ajout de la plateforme Android...
npx cap add android
IF %ERRORLEVEL% NEQ 0 (
  echo  ❌ Erreur lors de l'ajout d'Android.
  pause
  exit /b 1
)
echo  ✅ Plateforme Android ajoutée !

REM ── Synchronisation des fichiers web ─────────────────
echo.
echo [5/5] Synchronisation des fichiers web → Android...
npx cap sync android
IF %ERRORLEVEL% NEQ 0 (
  echo  ❌ Erreur lors de la synchronisation.
  pause
  exit /b 1
)
echo  ✅ Synchronisation terminée !

echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   ✅ PROJET ANDROID PRÊT !                   ║
echo  ║                                              ║
echo  ║   Prochaine étape :                          ║
echo  ║   Lancez  open-android.bat                   ║
echo  ║   pour ouvrir Android Studio                 ║
echo  ╚══════════════════════════════════════════════╝
echo.
pause
