import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = "https://v3.football.api-sports.io"; // API-FOOTBALL v3 host

function hasApiErrors(json) {
  const e = json?.errors;
  if (!e) return false;
  if (Array.isArray(e)) return e.length > 0;
  if (typeof e === "object") return Object.keys(e).length > 0;
  return Boolean(e);
}

export class ApiFootballClient {
  /**
   * @param {{ apiKey: string, minIntervalMs?: number, retries?: number }} opts
   */
  constructor(opts) {
    if (!opts?.apiKey) throw new Error("ApiFootballClient: missing apiKey");
    this.apiKey = opts.apiKey;
    this.minIntervalMs = opts.minIntervalMs ?? 250; // gentle pacing
    this.retries = opts.retries ?? 2;
    this._last = 0;
  }

  async _throttle() {
    const now = Date.now();
    const wait = Math.max(0, this.minIntervalMs - (now - this._last));
    if (wait > 0) await sleep(wait);
    this._last = Date.now();
  }

  async get(path, params = {}) {
    const url = new URL(BASE_URL + path);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      await this._throttle();

      let res;
      try {
        res = await fetch(url, {
          method: "GET",
          headers: {
            "x-apisports-key": this.apiKey
          }
        });
      } catch (err) {
        if (attempt < this.retries) {
          await sleep(800 * (attempt + 1));
          continue;
        }
        throw err;
      }

      const txt = await res.text();
      let json;
      try {
        json = JSON.parse(txt);
      } catch {
        json = { raw: txt };
      }

      // API-FOOTBALL às vezes devolve HTTP 200 com errors no JSON
      if (res.ok && json && !hasApiErrors(json)) return json;

      const retriable = res.status === 429 || (res.status >= 500 && res.status <= 599);
      if (attempt < this.retries && retriable) {
        await sleep(800 * (attempt + 1));
        continue;
      }

      const errPayload = json?.errors ?? json;
      const msg = `API-FOOTBALL error (HTTP ${res.status}) ${url.toString()} :: ${JSON.stringify(errPayload)}`;
      throw new Error(msg);
    }
  }
}
