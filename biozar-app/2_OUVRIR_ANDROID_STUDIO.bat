@echo off
chcp 65001 >nul
color 0A
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   BIOZAR - Ouverture Android Studio          ║
echo  ╚══════════════════════════════════════════════╝
echo.
echo  📱 Ouverture du projet dans Android Studio...
echo  (Peut prendre quelques secondes)
echo.
npx cap open android
echo.
echo  ════════════════════════════════════════════════
echo  Dans Android Studio :
echo  1. Attendez que Gradle se synchronise (barre verte en bas)
echo  2. Menu : Build → Build Bundle(s)/APK(s) → Build APK(s)
echo  3. Cliquez "locate" pour trouver votre APK
echo  ════════════════════════════════════════════════
echo.
pause
