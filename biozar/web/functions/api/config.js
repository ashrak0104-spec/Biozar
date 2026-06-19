/* ═══════════════════════════════════════
   BIOZAR – Configuration API
   Sert la config Supabase depuis les variables d'environnement Cloudflare
   ═══════════════════════════════════════
   URL : /api/config
   Utilisé par supabase-init.js au chargement de l'application
*/

export async function onRequest(context) {
  const { env } = context;

  // Essayer les variables d'environnement Cloudflare
  // Fallback sur les valeurs par défaut (hardcodées dans supabase-init.js)
  const config = {
    url: env.SUPABASE_URL || null,
    anonKey: env.SUPABASE_ANON_KEY || null,
    configured: !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY),
    version: '1.1.1',
    app: 'BIOZAR'
  };

  return new Response(JSON.stringify(config, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
