/* ═══════════════════════════════════════
   BIOZAR – Supabase Initialisation
   Remplace firebase-init.js (migration 100% gratuite)
   ═══════════════════════════════════════

   🔧 CONFIGURATION REQUISE :
   1. Créez un compte gratuit sur https://supabase.com
   2. Créez un projet (ex: "biozar")
   3. Copiez l'URL du projet et la clé anon publique ci-dessous
   4. Dans SQL Editor, exécutez :
   
      CREATE TABLE IF NOT EXISTS biozar_state (
        id TEXT PRIMARY KEY DEFAULT 'appState',
        data JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
*/

const supabaseConfig = {
  url: 'https://VOTRE_PROJET.supabase.co',
  anonKey: 'votre-cle-anon-publique'
};

// ══════════════════════════════════════════════════════════════
//  SUPABASE REST CLIENT (sans SDK, via fetch simple)
// ══════════════════════════════════════════════════════════════

const SUPABASE_REST = SUPABASE_URL => `${SUPABASE_URL}/rest/v1`;

function isConfigured() {
  return !supabaseConfig.url.includes('VOTRE_PROJET')
      && !supabaseConfig.anonKey.includes('votre-cle');
}

async function supabaseFetch(path, options = {}) {
  if (!isConfigured()) return null;
  const url = `${SUPABASE_REST(supabaseConfig.url)}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseConfig.anonKey,
    'Accept': 'application/json',
    ...options.headers
  };
  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      console.warn('[Supabase] HTTP', res.status, res.statusText);
      return null;
    }
    return res;
  } catch (e) {
    console.warn('[Supabase] Network error (offline?):', e);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
//  API PUBLIQUE (compatible avec l'ancienne API BIOZAR_FIREBASE)
// ══════════════════════════════════════════════════════════════

const SupabaseAPI = {
  /** Sauvegarder l'état complet dans Supabase */
  saveStateToFirestore: async function(state) {
    if (!isConfigured()) return false;
    const res = await supabaseFetch('/biozar_state', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: 'appState',
        data: state,
        updated_at: new Date().toISOString()
      })
    });
    return res !== null && res.ok;
  },

  /** Charger l'état depuis Supabase */
  loadStateFromFirestore: async function() {
    if (!isConfigured()) return null;
    const res = await supabaseFetch(
      '/biozar_state?id=eq.appState&select=data,updated_at'
    );
    if (!res) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    return {
      state: rows[0].data || null,
      updatedAt: rows[0].updated_at ? new Date(rows[0].updated_at) : null
    };
  },

  /** Sauvegarder une sauvegarde avant action destructive */
  saveBackupState: async function(state) {
    if (!isConfigured()) return false;
    const backupId = String(Date.now());
    const res = await supabaseFetch('/biozar_state', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({
        id: `backup_${backupId}`,
        data: state,
        updated_at: new Date().toISOString()
      })
    });
    return res !== null && res.ok;
  },

  /** Obtenir le statut de la connexion */
  getStatus: function() {
    if (!isConfigured()) return 'not_configured';
    return 'connected';
  }
};

// ══════════════════════════════════════════════════════════════
//  DEBOUNCE (évite les appels HTTP trop fréquents)
// ══════════════════════════════════════════════════════════════

function debounce(fn, wait) {
  let t = null;
  return function(...args) {
    if (t) clearTimeout(t);
    t = setTimeout(() => { t = null; fn.apply(this, args); }, wait);
  };
}

// ══════════════════════════════════════════════════════════════
//  INITIALISATION
// ══════════════════════════════════════════════════════════════

// Interface de compatibilité avec l'ancien code qui utilise window.BIOZAR_FIREBASE
window.BIOZAR_FIREBASE = {
  status: SupabaseAPI.getStatus(),
  saveStateToFirestore: debounce(async function(state) {
    return await SupabaseAPI.saveStateToFirestore(state);
  }, 800),
  loadStateFromFirestore: SupabaseAPI.loadStateFromFirestore,
  saveBackupState: SupabaseAPI.saveBackupState
};

// Nouvelle interface Supabase directe
window.BIOZAR_SUPABASE = {
  ...SupabaseAPI,
  ready: isConfigured(),
  config: isConfigured() ? {
    url: supabaseConfig.url,
    status: 'ready'
  } : {
    url: null,
    status: 'pending_config'
  }
};

// Notification silencieuse de l'état
if (isConfigured()) {
  console.info('✅ BIOZAR connecté à Supabase');
} else {
  console.info(
    'ℹ️ Supabase non configuré. Les données sont sauvegardées localement.',
    '\n   Pour activer la synergie cloud : https://supabase.com'
  );
}
