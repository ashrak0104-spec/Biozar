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
  url: 'https://plavawidmbtryfyausjr.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYXZhd2lkbWJ0cnlmeWF1c2pyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2MTk5OTMsImV4cCI6MjA5NjE5NTk5M30.C_l04kOX3ZqJ9O_j4nhokL7QaspRQY83Tpyn8XefNVk'
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

function supabaseAuthFetch(path, options = {}) {
  if (!isConfigured()) return null;
  const url = `${supabaseConfig.url}/auth/v1${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseConfig.anonKey,
    ...options.headers
  };
  return fetch(url, { ...options, headers });
}

const SupabaseAPI = {
  /** Authentifier un utilisateur par email/mot de passe */
  signIn: async function(email, password) {
    if (!isConfigured()) return null;
    const res = await supabaseAuthFetch('/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password, gotrue_meta_security: {} })
    });
    if (!res || !res.ok) return null;
    const data = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      user: data.user,
      profile: data.user?.user_metadata || {}
    };
  },

  /** Créer un nouveau compte utilisateur */
  signUp: async function(email, password, name, role) {
    if (!isConfigured()) return null;
    const res = await supabaseAuthFetch('/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: { name, role: role || 'operator' }
      })
    });
    if (!res || !res.ok) return null;
    return await res.json();
  },

  /** Récupérer le profil (rôle) depuis la table profiles */
  getProfile: async function(userId, accessToken) {
    if (!isConfigured()) return null;
    const res = await supabaseFetch(
      `/profiles?id=eq.${userId}&select=id,email,name,role`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!res) return null;
    const rows = await res.json();
    return rows && rows.length > 0 ? rows[0] : null;
  },

  /** Lister tous les profils (admin seulement) */
  listProfiles: async function(accessToken) {
    if (!isConfigured()) return null;
    const res = await supabaseFetch('/profiles?select=id,email,name,role,created_at&order=created_at.asc', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res) return [];
    return await res.json();
  },

  /** Mettre à jour un profil (admin) */
  updateProfile: async function(userId, data, accessToken) {
    if (!isConfigured()) return false;
    const res = await supabaseFetch(`/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });
    return res !== null && res.ok;
  },

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
  let lastPromise = null;
  return function(...args) {
    if (t) clearTimeout(t);
    lastPromise = new Promise((resolve) => {
      t = setTimeout(() => { t = null; resolve(fn.apply(this, args)); }, wait);
    });
    return lastPromise;
  };
}

// ══════════════════════════════════════════════════════════════
//  INITIALISATION
// ══════════════════════════════════════════════════════════════

// Interface de compatibilité avec l'ancien code qui utilise window.BIOZAR_FIREBASE
window.BIOZAR_FIREBASE = {
  status: SupabaseAPI.getStatus(),
  saveStateToFirestore: debounce(async function(state) {
    try {
      return await SupabaseAPI.saveStateToFirestore(state);
    } catch(e) {
      console.warn('[BIOZAR] Sync error:', e);
      return false;
    }
  }, 800),
  loadStateFromFirestore: SupabaseAPI.loadStateFromFirestore,
  saveBackupState: SupabaseAPI.saveBackupState
};

// Interface Auth simplifiée
window.BIOZAR_AUTH = {
  signIn: SupabaseAPI.signIn,
  signUp: SupabaseAPI.signUp,
  getProfile: SupabaseAPI.getProfile,
  listProfiles: SupabaseAPI.listProfiles,
  updateProfile: SupabaseAPI.updateProfile,
  ready: isConfigured()
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
// ==========================================
// Le vrai mécanisme de sync est géré via
// window.BIOZAR_FIREBASE / SupabaseAPI ci-dessus.
// Les fonctions saveAppState/loadAppState
// utilisant 'supabase' (non défini) ont été retirées.
// ==========================================
