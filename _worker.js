const BLOCKED_PATHS = new Set([
  "/assets/js/app.js",
  "/assets/app.js",
  "/data/v1/radar_day.json"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (BLOCKED_PATHS.has(url.pathname)) {
      return new Response("not_found", {
        status: 404,
        headers: {
          "cache-control": "no-store"
        }
      });
    }

    return env.ASSETS.fetch(request);
  }
};