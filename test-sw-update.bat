@echo off
chcp 65001 >nul
color 0B
echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║   BIOZAR - Test du Badge de Mise à Jour PWA        ║
echo ║   Simule une mise à jour et redéploie sur Hosting   ║
echo ╚══════════════════════════════════════════════════════╝
echo.

REM ── Lire le numéro de version actuel ──────────────────
set /p CURRENT_VER=<version.txt 2>nul
if "%CURRENT_VER%"=="" set CURRENT_VER=1

set /a NEXT_VER=CURRENT_VER+1

echo [1/4] Incrémentation de CACHE_NAME : biozar-v%CURRENT_VER% → biozar-v%NEXT_VER%
powershell -Command ^
  "(Get-Content sw.js) -replace 'biozar-v%CURRENT_VER%', 'biozar-v%NEXT_VER%' | Set-Content sw.js"
echo  ✅ CACHE_NAME mis à jour

echo.
echo [2/4] Mise à jour version.json...
powershell -Command ^
  "$json = Get-Content version.json -Raw | ConvertFrom-Json; $json.version = '1.0.%NEXT_VER%'; $json | ConvertTo-Json | Set-Content version.json"
echo  ✅ version.json mis à jour (1.0.%NEXT_VER%)

REM Mettre à jour le compteur
echo %NEXT_VER%> version.txt

echo.
echo [3/4] Déploiement sur Firebase Hosting...
call npx -y firebase-tools@latest deploy --only hosting
if %ERRORLEVEL% NEQ 0 (
  echo  ❌ Échec du déploiement !
  echo  ⚠️ Vérifie que tu es connecté : npx firebase-tools login
  pause
  exit /b 1
)
echo  ✅ Déploiement réussi

echo.
echo [4/4] Instructions pour le test mobile :
echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║   ÉTAPES SUR LE TÉLÉPHONE :                     ║
echo  ╠══════════════════════════════════════════════════╣
echo  ║  1. Ouvre l'app BIOZAR sur ton téléphone        ║
echo  ║  2. Si l'app était déjà ouverte, RE-CHARGE-LA   ║
echo  ║  3. Un badge "🔄 Nouvelle version disponible"   ║
echo  ║     devrait apparaître en haut de l'écran       ║
echo  ║  4. Clique "Mettre à jour" pour activer la      ║
echo  ║     nouvelle version                             ║
echo  ║  5. Va dans Admin > Export pour vérifier la     ║
echo  ║     version affichée (1.0.%NEXT_VER%)           ║
echo  ╚══════════════════════════════════════════════════╝
echo.
echo Pour RESTAURER la version précédente :
echo   1. git checkout sw.js version.json
echo   2. npx firebase-tools deploy --only hosting
echo.

pause
