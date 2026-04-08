/** Block stray unversioned bundles / static radar JSON (Radar UI reads calendar_2d from the API only). */
const BLOCKED_PATHS = new Set([
  "/assets/js/app.js",
  "/assets/app.js",
  "/data/v1/radar_day.json"
]);

function shouldProxyDataApi(pathname) {
  return (
    pathname.startsWith("/api/v1/") ||
    pathname === "/data/coverage_allowlist.json"
  );
}

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

    const host = url.hostname;
    const isPagesDev = host.endsWith(".pages.dev");
    if (isPagesDev && shouldProxyDataApi(url.pathname)) {
      const origin = String(env.RADARTIPS_API_ORIGIN || "https://radartips.com").replace(
        /\/+$/,
        ""
      );
      const target = new URL(url.pathname + url.search, origin);
      const headers = new Headers(request.headers);
      headers.delete("host");
      const init = {
        method: request.method,
        headers,
        redirect: "follow"
      };
      if (request.method !== "GET" && request.method !== "HEAD") {
        init.body = request.body;
      }
      return fetch(new Request(target.toString(), init));
    }

    return env.ASSETS.fetch(request);
  }
};
