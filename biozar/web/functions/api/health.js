/* ═══════════════════════════════════════
   BIOZAR – Health Check API
   ═══════════════════════════════════════
*/

export async function onRequest(context) {
  const data = {
    status: "ok",
    app: "BIOZAR",
    version: "1.1.1",
    uptime: context.env?.BIOZAR_START_TIME
      ? `${Math.floor((Date.now() - Number(context.env.BIOZAR_START_TIME)) / 1000)}s`
      : "unknown",
    timestamp: new Date().toISOString()
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
