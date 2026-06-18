/* ═══════════════════════════════════════
   BIOZAR – API Hello (Cloudflare Pages Functions)
   Remplace functions/src/index.ts (Firebase)
   ═══════════════════════════════════════
   
   URL après déploiement : https://biozar.pages.dev/api/hello
   (ou https://votre-domaine.mg/api/hello)
*/

export async function onRequest(context) {
  const { request, env } = context;

  const data = {
    message: "BIOZAR API is ready!",
    version: "1.1.1",
    status: "healthy",
    timestamp: new Date().toISOString(),
    endpoints: {
      hello: "/api/hello",
      ai: "/api/ai-hello",
      health: "/api/health"
    }
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache"
    }
  });
}
