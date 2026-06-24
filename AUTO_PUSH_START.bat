@echo off
TITLE BIOZAR Auto-Push Watcher
echo ═══════════════════════════════════════════
echo  BIOZAR - Auto-Push Watcher
echo ═══════════════════════════════════════════
echo.
echo  Deux methodes disponibles :
echo   1. Hook post-commit (recommande)
echo   2. Watcher PowerShell (surveille les fichiers)
echo.
echo  METHODE 1 - Post-commit hook (deja installe)
echo    Apres chaque "git commit", le push est automatique.
echo    Aucun programme a garder ouvert.
echo.
echo  METHODE 2 - Watcher auto-push.ps1
echo    Surveille les fichiers et commit/push automatiquement.
echo    Cette fenetre doit rester ouverte.
echo.
set /p choix="Choix (1/2, defaut=1) : "
if "%choix%"=="2" (
  echo.
  echo  Lancement du watcher toutes les 30 secondes...
  echo  Appuie sur Ctrl+C pour arreter.
  echo.
  powershell -ExecutionPolicy Bypass -File "auto-push.ps1" -Interval 30
  pause
) else (
  echo.
  echo  ✅ Hook post-commit deja installe dans .git/hooks/post-commit
  echo  Il suffit de faire "git commit" et le push se fait tout seul.
  echo.
  pause
)
