/* ═══════════════════════════════════════
   BIOZAR – AI Helper API (Cloudflare Pages Functions)
   Remplace ai/src/index.ts (Firebase)
   ═══════════════════════════════════════
*/

export async function onRequest(context) {
  const data = {
    message: "BIOZAR AI helper is online.",
    version: "1.0.1",
    status: "healthy"
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
