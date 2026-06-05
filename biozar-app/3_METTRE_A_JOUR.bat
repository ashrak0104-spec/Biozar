@echo off
chcp 65001 >nul
color 0B
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   BIOZAR - Mise à jour de l'app              ║
echo  ║   (Après modification du dashboard)          ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  📋 Copie des fichiers web mis à jour...

REM Copier les fichiers depuis le dossier parent
copy /Y "..\index.html" "www\index.html" >nul
copy /Y "..\sw.js" "www\sw.js" >nul
copy /Y "..\manifest.json" "www\manifest.json" >nul
copy /Y "..\chart.js" "www\chart.js" >nul
copy /Y "..\firebase-init.js" "www\firebase-init.js" >nul
copy /Y "..\version.json" "www\version.json" >nul

REM Copier les icônes
xcopy /Y /E "..\icons\*" "www\icons\" >nul

echo  ✅ Fichiers web mis à jour (v1.0.1)

REM Synchronisation avec Android
echo.
echo  🔄 Synchronisation avec le projet Android...
npx cap sync android

echo.
echo  ✅ Mise à jour terminée !
echo  Relancez Android Studio et rebuilder l'APK.
echo.
pause
