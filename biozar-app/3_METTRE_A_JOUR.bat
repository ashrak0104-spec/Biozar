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

REM Copier les fichiers depuis le dossier parent (biozar/web/)
set WEB_SRC=..\biozar\web
copy /Y "%WEB_SRC%\index.html" "www\index.html" >nul
copy /Y "%WEB_SRC%\sw.js" "www\sw.js" >nul
copy /Y "%WEB_SRC%\manifest.json" "www\manifest.json" >nul
copy /Y "%WEB_SRC%\chart.js" "www\chart.js" >nul
copy /Y "%WEB_SRC%\supabase-init.js" "www\supabase-init.js" >nul
copy /Y "%WEB_SRC%\version.json" "www\version.json" >nul

REM Copier les icônes
if exist "%WEB_SRC%\icons" xcopy /Y /E "%WEB_SRC%\icons\*" "www\icons\" >nul

echo  ✅ Fichiers web mis à jour (v1.1.1)

REM Synchronisation avec Android
echo.
echo  🔄 Synchronisation avec le projet Android...
npx cap sync android

echo.
echo  ✅ Mise à jour terminée !
echo  Relancez Android Studio et rebuilder l'APK.
echo.
pause
