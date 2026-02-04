export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Só aceitamos /v1/*.json
    if (!url.pathname.startsWith("/v1/")) {
      return new Response("Not Found", { status: 404 });
    }

    // Ex: /v1/calendar_7d.json -> key "v1/calendar_7d.json"
    const key = url.pathname.replace(/^\/+/, ""); // remove "/" inicial

    // Busca no R2
    const obj = await env.RADARTIPS_DATA.get(key);
    if (!obj) return new Response("Not Found", { status: 404 });

    // ETag/304 (profissional: economiza banda e deixa cache bem comportado)
    const etag = obj.httpEtag || obj.etag;
    const ifNoneMatch = request.headers.get("if-none-match");
    if (etag && ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, { status: 304 });
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=60"); // 60s é um bom começo
    if (etag) headers.set("ETag", etag);

    return new Response(obj.body, { headers });
  }
};
