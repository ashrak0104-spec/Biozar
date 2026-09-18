#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  BIOZAR — Signature release de l'APK
# ───────────────────────────────────────────────────────────────────────
#  `android.buildOptions` de capacitor.config.json est lu par `cap build`,
#  PAS par Gradle. Or la CI appelle `./gradlew assembleRelease` : sans ce
#  script, l'APK produit n'est pas signé avec la clé de production.
#
#  Ce script injecte dans android/app/build.gradle un bloc signingConfigs
#  qui lit ses identifiants depuis l'environnement — jamais depuis un
#  fichier versionné.
#
#  Variables attendues :
#    KEYSTORE_PASSWORD   mot de passe du keystore
#    KEY_PASSWORD        mot de passe de la clé
#    KEYSTORE_ALIAS      alias (défaut : biozar)
#    KEYSTORE_PATH       chemin (défaut : biozar-release.keystore)
#
#  Usage :  bash scripts/android-signing.sh   (depuis biozar-app/android)
# ═══════════════════════════════════════════════════════════════════════
set -euo pipefail

GRADLE_FILE="app/build.gradle"
ALIAS="${KEYSTORE_ALIAS:-biozar}"
STORE_FILE="${KEYSTORE_PATH:-biozar-release.keystore}"

if [ ! -f "$GRADLE_FILE" ]; then
  echo "❌ $GRADLE_FILE introuvable. Lancez d'abord : npx cap add android"
  exit 1
fi

if [ -z "${KEYSTORE_PASSWORD:-}" ] || [ -z "${KEY_PASSWORD:-}" ]; then
  echo "❌ KEYSTORE_PASSWORD et KEY_PASSWORD doivent être fournis par l'environnement."
  echo "   Aucun mot de passe n'est accepté en dur dans ce dépôt."
  exit 1
fi

if [ -f "$GRADLE_FILE.signing-patched" ]; then
  echo "ℹ️  build.gradle déjà patché, rien à faire."
  exit 0
fi

cp "$GRADLE_FILE" "$GRADLE_FILE.bak"

python3 - "$GRADLE_FILE" "$ALIAS" "$STORE_FILE" <<'PY'
import sys, re

path, alias, store_file = sys.argv[1], sys.argv[2], sys.argv[3]
src = open(path, encoding="utf-8").read()

if "signingConfigs" in src:
    print("ℹ️  signingConfigs déjà présent, injection ignorée.")
    sys.exit(0)

signing = '''
    signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH") ?: "%s")
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEYSTORE_ALIAS") ?: "%s"
            keyPassword System.getenv("KEYSTORE_PASSWORD") ?: System.getenv("KEY_PASSWORD")
        }
    }
''' % (store_file, alias)

# 1. signingConfigs doit être déclaré dans le bloc `android { ... }`.
m = re.search(r"^android\s*\{", src, re.MULTILINE)
if not m:
    sys.exit("❌ bloc `android {` introuvable dans build.gradle")
src = src[: m.end()] + "\n" + signing + src[m.end():]

# 2. buildTypes.release doit référencer la config.
#    Attention : `release {` apparaît AUSSI dans le signingConfigs que l'on
#    vient d'injecter. Il faut cibler celui qui est à l'intérieur de
#    `buildTypes {`, sinon l'APK sort non signé sans aucune erreur.
if "signingConfig signingConfigs.release" not in src:
    bt = re.search(r"buildTypes\s*\{", src)
    if not bt:
        sys.exit("❌ bloc `buildTypes {` introuvable dans build.gradle")
    rel = re.compile(r"release\s*\{").search(src, bt.end())
    if not rel:
        sys.exit("❌ bloc `release {` introuvable dans buildTypes")
    src = src[: rel.end()] + "\n            signingConfig signingConfigs.release" + src[rel.end():]

open(path, "w", encoding="utf-8").write(src)
print("✅ signingConfigs.release injecté et rattaché à buildTypes.release")
PY

touch "$GRADLE_FILE.signing-patched"
echo "✅ Signature release configurée (alias: $ALIAS)"
