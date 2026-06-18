@echo off
chcp 65001 >nul
color 0A
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   BIOZAR - Build APK Release Signé          ║
echo  ║   Distribution Play Store                    ║
echo  ╚══════════════════════════════════════════════╝
echo.

REM ── Étape 1 : Copier les fichiers web ────────────────
echo [1/4] Copie des fichiers web...
set WEB_SRC=..\biozar\web
copy /Y "%WEB_SRC%\index.html" "www\index.html" >nul
copy /Y "%WEB_SRC%\sw.js" "www\sw.js" >nul
copy /Y "%WEB_SRC%\manifest.json" "www\manifest.json" >nul
copy /Y "%WEB_SRC%\chart.js" "www\chart.js" >nul
copy /Y "%WEB_SRC%\supabase-init.js" "www\supabase-init.js" >nul
copy /Y "%WEB_SRC%\version.json" "www\version.json" >nul
if exist "%WEB_SRC%\icons" xcopy /E /Y "%WEB_SRC%\icons" "www\icons\" >nul
echo  ✅ Fichiers web à jour (v1.1.1)

REM ── Étape 2 : Synchroniser Capacitor ────────────────
echo.
echo [2/4] Synchronisation Capacitor...
call npx cap sync android
echo  ✅ Sync terminée

REM ── Étape 3 : Nettoyage et Build APK Release ──────
echo.
echo [3/4] Nettoyage et compilation Release...
cd android
call gradlew clean assembleRelease
if %ERRORLEVEL% NEQ 0 (
  echo  ❌ Erreur lors du build !
  pause
  exit /b 1
)
cd ..
echo  ✅ Build Release terminé

REM ── Étape 4 : Vérification ──────────────────────────
echo.
echo [4/4] Vérification de l'APK signé...
if exist "android\app\build\outputs\apk\release\app-release.apk" (
  for %%I in ("android\app\build\outputs\apk\release\app-release.apk") do set size=%%~zI
  echo  ✅ APK Release signé généré !
  echo  📍 android\app\build\outputs\apk\release\app-release.apk
  echo  📦 Taille : %size% octets
) else (
  echo  ⚠️ APK non trouvé. Vérifie dans :
  echo     android\app\build\outputs\apk\release\
)
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   INFO Keystore                              ║
echo  ║   Alias: biozar                               ║
echo  ║   Fichier: android\app\biozar-release.keystore║
echo  ║   Mot de passe: biozar2026                    ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  ⚠️  IMPORTANT : Change le mot de passe du keystore
echo     avant la distribution sur le Play Store !
echo.
echo  Pour vérifier la signature de l'APK :
echo     jarsigner -verify -certs -verbose app-release.apk
echo.
pause
