import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = "https://v3.football.api-sports.io"; // API-FOOTBALL v3 host

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
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "x-apisports-key": this.apiKey
        }
      });

      const txt = await res.text();
      let json;
      try { json = JSON.parse(txt); } catch { json = { raw: txt }; }

      if (res.ok && json && !json.errors?.length) return json;

      // Retry on 429/5xx
      const retriable = res.status === 429 || (res.status >= 500 && res.status <= 599);
      if (attempt < this.retries && retriable) {
        await sleep(800 * (attempt + 1));
        continue;
      }

      const msg = `API-FOOTBALL error (${res.status}) ${url.toString()} :: ${JSON.stringify(json?.errors ?? json)}`;
      throw new Error(msg);
    }
  }
}
