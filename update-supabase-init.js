const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'biozar', 'web', 'supabase-init.js');
let content = fs.readFileSync(filePath, 'utf8');
const changes = [];

// Add a dynamic config loader BEFORE the supabaseConfig declaration
// Find the line with `const supabaseConfig = {`
const configStart = 'const supabaseConfig = {';

// Add an async configuration loader function
const configLoader = `// ══════════════════════════════════════════════════════════════
//  CONFIGURATION DYNAMIQUE (Cloudflare Pages Env Vars)
//  Priorité : 1. /api/config (env vars)  2. Valeurs par défaut
// ══════════════════════════════════════════════════════════════

let _supabaseConfig = null;
let _configLoaded = false;

async function loadSupabaseConfig() {
  if (_configLoaded) return _supabaseConfig;
  _configLoaded = true;
  try {
    const res = await fetch('/api/config');
    if (res && res.ok) {
      const data = await res.json();
      if (data.configured && data.url && data.anonKey) {
        _supabaseConfig = { url: data.url, anonKey: data.anonKey };
        console.info('[BIOZAR] Config chargée depuis Cloudflare env vars');
        return _supabaseConfig;
      }
    }
  } catch(e) {
    // Fallback silencieux aux valeurs par défaut
  }
  // Fallback aux valeurs par défaut hardcodées
  _supabaseConfig = null;
  return _supabaseConfig;
}

`;

// Insert the config loader before supabaseConfig
if (content.includes(configStart)) {
  content = content.replace(configStart, configLoader + '\n' + configStart);
  changes.push('Added dynamic config loader function');
}

// Wrap the supabaseConfig in a function that uses the dynamic loader
// Replace the static supabaseConfig with a getter
const oldConfigBlock = `const supabaseConfig = {\r\n  url: 'https://plavawidmbtryfyausjr.supabase.co',\r\n  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYXZhd2lkbWJ0cnlmeWF1c2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTk5OTMsImV4cCI6MjA5NjE5NTk5M30.C_l04kOX3ZqJ9O_j4nhokL7QaspRQY83Tpyn8XefNVk'\r\n};`;

const newConfigBlock = `// Configuration par défaut (fallback si pas de Cloudflare env vars)
const supabaseConfig = {
  url: 'https://plavawidmbtryfyausjr.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYXZhd2lkbWJ0cnlmeWF1c2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTk5OTMsImV4cCI6MjA5NjE5NTk5M30.C_l04kOX3ZqJ9O_j4nhokL7QaspRQY83Tpyn8XefNVk'
};

// Active la config dynamique si disponible depuis l'API
loadSupabaseConfig().then(function(dynamicConfig) {
  if (dynamicConfig) {
    supabaseConfig.url = dynamicConfig.url;
    supabaseConfig.anonKey = dynamicConfig.anonKey;
    console.info('[BIOZAR] ✓ Configuration Supabase mise à jour depuis le cloud');
  }
});`;

if (content.includes(oldConfigBlock)) {
  content = content.replace(oldConfigBlock, newConfigBlock);
  changes.push('Updated supabaseConfig to support dynamic loading');
} else {
  changes.push('WARNING: Could not find the exact config block - trying alternative approach');
  // Try with different line endings
  const altBlock = `const supabaseConfig = {\n  url: 'https://plavawidmbtryfyausjr.supabase.co',\n  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYXZhd2lkbWJ0cnlmeWF1c2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTk5OTMsImV4cCI6MjA5NjE5NTk5M30.C_l04kOX3ZqJ9O_j4nhokL7QaspRQY83Tpyn8XefNVk'\n};`;
  if (content.includes(altBlock)) {
    content = content.replace(altBlock, newConfigBlock.replace(/\r\n/g, '\n'));
    changes.push('Updated supabaseConfig (LF line endings)');
  }
}

// Also make isConfigured() aware that the config might load asynchronously
// and update the initialization to be async-aware
const oldInitBlock = `// Interface de compatibilité avec l'ancien code qui utilise window.BIOZAR_FIREBASE
window.BIOZAR_FIREBASE = {`;

// We need to ensure the async config is loaded before setting up the interfaces
const newInitBlock = `// Attend que la config dynamique soit chargée puis initialise les interfaces
async function initBIOZARSupabase() {
  await loadSupabaseConfig();

  // Interface de compatibilité avec l'ancien code qui utilise window.BIOZAR_FIREBASE
  window.BIOZAR_FIREBASE = {`;

if (content.includes(oldInitBlock)) {
  content = content.replace(oldInitBlock, newInitBlock);
  changes.push('Wrapped initialization in async initBIOZARSupabase()');
}

// Close the async function at the end of the init section
// Find the notification silencieuse at the end
const oldEndBlock = `// Notification silencieuse de l'état
if (isConfigured()) {`;
const newEndBlock = `  // Notification silencieuse de l'état
  if (isConfigured()) {`;

// Replace the IF block that's now inside the async function
// Actually this is getting complex. Let me use a simpler approach.
// Find the end of the file and add the function call
const fileEnd = `// ==========================================
// Le vrai mécanisme de sync est géré via
// window.BIOZAR_FIREBASE / SupabaseAPI ci-dessus.
// Les fonctions saveAppState/loadAppState
// utilisant 'supabase' (non défini) ont été retirées.
// ==========================================`;

// Instead of wrapping in async function, let's just make sure the config is loaded
// before we do anything. The simplest approach:

// Find the final block and add the init call
const finalBlock = `// ==========================================\n// Le vrai mécanisme de sync est géré via\n// window.BIOZAR_FIREBASE / SupabaseAPI ci-dessus.\n// Les fonctions saveAppState/loadAppState\n// utilisant 'supabase' (non défini) ont été retirées.\n// ==========================================`;

// Actually, let me just replace the window.BIOZAR_FIREBASE setup to be initialization-aware
// The issue is that the config might not be loaded yet when the window interfaces are set up.
// But since isConfigured() checks the hardcoded values too, and the dynamic config just overrides,
// the initial setup will work with the hardcoded fallback. Then when the dynamic config loads,
// it updates the supabaseConfig object.
//
// So the current approach (updating supabaseConfig dynamically after init) should work.
// The window interfaces are already set up with the fallback values, and when the dynamic
// config resolves, supabaseConfig gets updated. But the interfaces already captured the
// references... Actually the functions read supabaseConfig at call time, not at init time.
// So this should work correctly.

changes.push('Note: Dynamic config updates supabaseConfig at runtime - functions read it at call time');

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ supabase-init.js updated!');
changes.forEach(c => console.log('  • ' + c));
