import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiFootballClient } from "./api-football-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.resolve(__dirname, "api-football.config.json");
const OUT_DIR = path.resolve(__dirname, "..", "data", "v1");

// cache local (best-effort) pra não ficar dependente de /leagues search toda hora
const LEAGUE_CACHE_PATH = path.resolve(__dirname, ".league-cache.json");

const API_KEY =
  process.env.APIFOOTBALL_KEY ||
  process.env.API_FOOTBALL_KEY ||
  process.env.X_APISPORTS_KEY;

if (!API_KEY) {
  console.error("Missing API key. Set APIFOOTBALL_KEY in env/secrets.");
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));

function loadLeagueCache() {
  try {
    const txt = fs.readFileSync(LEAGUE_CACHE_PATH, "utf8");
    const j = JSON.parse(txt);
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}
function saveLeagueCache(cache) {
  try {
    fs.writeFileSync(LEAGUE_CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch {}
}
const LEAGUE_CACHE = loadLeagueCache();

const TZ = cfg.timezone ?? "America/Sao_Paulo";
const DAYS = Number(cfg.days_ahead ?? 7);
const LAST_N = Number(cfg.last_n ?? 5);
const MAX_G = Number(cfg.max_goals_matrix ?? 6);

const MAX_FIX_PER_LEAGUE =
  cfg.max_fixtures_per_league == null
    ? Infinity
    : Number(cfg.max_fixtures_per_league);

const MAX_FIX_TOTAL =
  cfg.max_fixtures_total == null ? Infinity : Number(cfg.max_fixtures_total);

const client = new ApiFootballClient({ apiKey: API_KEY });

// CLI
const MODE = (
  process.argv.find((a) => a.startsWith("--mode="))?.split("=")[1] || "daily"
).toLowerCase();
const DO_DAILY = MODE === "daily" || MODE === "both";
const DO_WEEKLY = MODE === "weekly" || MODE === "both";

const isoDate = (d) => d.toISOString().slice(0, 10);

function teamLogoUrl(teamId) {
  if (!teamId) return null;
  return `https://media.api-sports.io/football/teams/${teamId}.png`;
}
function leagueLogoUrl(leagueId) {
  if (!leagueId) return null;
  return `https://media.api-sports.io/football/leagues/${leagueId}.png`;
}

// Season heuristics
function seasonFor(rule, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  if (rule === "calendar_year") return y;
  // europe_split: season named by start year (e.g., 2025 for 2025/26)
  return m >= 7 ? y : y - 1;
}

async function resolveConfiguredLeagues(leagues, today = new Date()) {
  const leagueCache = LEAGUE_CACHE;
  const out = [];
  const unresolved = [];
  const seen = new Set();

  // in-run cache
  if (!resolveConfiguredLeagues._cache)
    resolveConfiguredLeagues._cache = new Map();
  const cache = resolveConfiguredLeagues._cache;

  const normalizeCountry = (c) => (c ?? "").toString().trim().toLowerCase();
  const normalizeType = (t) => (t ?? "").toString().trim().toLowerCase();
  const normalizeName = (n) => (n ?? "").toString().trim().toLowerCase();

  function scoreCandidate(entry, item) {
    const ln = normalizeName(item?.league?.name);
    const cn = normalizeCountry(item?.country?.name);
    const type = normalizeType(item?.league?.type);
    let score = 0;

    if (entry.country && cn === normalizeCountry(entry.country)) score += 6;
    if (entry.type && type === normalizeType(entry.type)) score += 4;

    const q = normalizeName(entry.search);
    if (q && ln === q) score += 10;
    if (q && ln.includes(q)) score += 5;

    const seasons = item?.seasons ?? [];
    if (seasons.some((s) => s?.current === true)) score += 1;

    return score;
  }

  async function lookupBySearch(entry, season) {
    // cache hit (evita regressão de snapshot)
    const ck = JSON.stringify({
      search: entry.search,
      country: entry.country ?? "",
      type: entry.type ?? "",
    });
    const cached = leagueCache[ck];
    if (cached?.league?.id) return cached;

    const key = JSON.stringify({
      search: entry.search,
      country: entry.country ?? "",
      type: entry.type ?? "",
      season: season ?? "",
    });
    if (cache.has(key)) return cache.get(key);

    const baseSearch = `/leagues?search=${encodeURIComponent(entry.search)}`;

    // tenta com filtros, depois relaxa
    const tryUrls = [];

    if (season != null) {
      const u1 = new URL(baseSearch, "https://x.invalid");
      u1.searchParams.set("season", String(season));
      if (entry.country) u1.searchParams.set("country", entry.country);
      if (entry.type) u1.searchParams.set("type", entry.type);
      tryUrls.push(u1.pathname + u1.search);

      const u2 = new URL(baseSearch, "https://x.invalid");
      u2.searchParams.set("season", String(season));
      tryUrls.push(u2.pathname + u2.search);
    }

    const u3 = new URL(baseSearch, "https://x.invalid");
    if (entry.country) u3.searchParams.set("country", entry.country);
    if (entry.type) u3.searchParams.set("type", entry.type);
    tryUrls.push(u3.pathname + u3.search);

    tryUrls.push(baseSearch);

    let json;
    let lastErr = null;

    for (const url of tryUrls) {
      try {
        json = await client.get(url);
        if (json?.response?.length) break;
      } catch (e) {
        lastErr = e;
      }
    }

    const items = Array.isArray(json?.response) ? json.response : [];
    if (!items.length) {
      cache.set(key, null);
      return null;
    }

    let best = null;
    let bestScore = -1;
    for (const it of items) {
      const sc = scoreCandidate(entry, it);
      if (sc > bestScore) {
        bestScore = sc;
        best = it;
      }
    }

    cache.set(key, best);

    // persiste cache best-effort
    try {
      leagueCache[ck] = best;
      saveLeagueCache(leagueCache);
    } catch {}

    return best;
  }

  async function expandBrazilStates(autoEntry) {
    const season =
      autoEntry.season ??
      seasonFor(autoEntry.season_rule ?? "calendar_year", today);
    const key = `brazil_states|${season}`;
    if (cache.has(key)) return cache.get(key);

    let json;
    try {
      json = await client.get("/leagues", {
        country: "Brazil",
        type: "league",
        season,
      });
    } catch {
      json = { response: [] };
    }

    const items = json.response ?? [];
    const res = [];

    const isStateTopTier = (name) => {
      const n = (name ?? "").toString();
      if (!n.includes(" - ")) return false;
      const low = n.toLowerCase();
      if (low.includes("serie a") || low.includes("serie b") || low.includes("serie c"))
        return false;
      if (low.includes("copa")) return false;
      if (low.includes("brasileir") || low.includes("brasil")) return false;

      const suffix = n.split(" - ").pop().trim().toLowerCase();
      return suffix === "1" || suffix === "a1";
    };

    for (const it of items) {
      const id = it?.league?.id;
      const name = it?.league?.name;
      if (!id || !name) continue;
      if (!isStateTopTier(name)) continue;

      res.push({
        league: id,
        name,
        country: "Brazil",
        season_rule: "calendar_year",
        source: "auto",
      });
    }

    res.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    cache.set(key, res);
    return res;
  }

  for (const L of leagues ?? []) {
    if (!L) continue;

    if (typeof L.league === "number") {
      if (!seen.has(L.league)) {
        out.push(L);
        seen.add(L.league);
      }
      continue;
    }

    if (L.auto === "brazil_state_championships") {
      const states = await expandBrazilStates(L);
      for (const s of states) {
        if (!seen.has(s.league)) {
          out.push(s);
          seen.add(s.league);
        }
      }
      continue;
    }

    if (L.search) {
      const season = L.season ?? seasonFor(L.season_rule ?? "europe_split", today);
      const best = await lookupBySearch(L, season);

      if (best?.league?.id) {
        const resolved = {
          ...L,
          league: best.league.id,
          name: L.name ?? best.league.name,
          country: L.country ?? best.country?.name ?? "World",
          resolved_from: "search",
        };
        if (!seen.has(resolved.league)) {
          out.push(resolved);
          seen.add(resolved.league);
        }
      } else {
        console.warn("Could not resolve league:", L);
        unresolved.push(L);
      }
      continue;
    }

    console.warn("Invalid league config entry (missing league/search/auto):", L);
    unresolved.push(L);
  }

  // write cache (best-effort)
  saveLeagueCache(leagueCache);
  return { resolved: out, unresolved };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonPMF(k, lambda) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function computeProbs(lambdaH, lambdaA, maxGoals = 6) {
  const pH = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPMF(k, lambdaH));
  const pA = Array.from({ length: maxGoals + 1 }, (_, k) => poissonPMF(k, lambdaA));

  let homeWin = 0, draw = 0, awayWin = 0;
  let under35 = 0, over15 = 0;

  for (let i = 0; i <= maxGoals; i++) {
    for (let j = 0; j <= maxGoals; j++) {
      const p = pH[i] * pA[j];
      if (i > j) homeWin += p;
      else if (i === j) draw += p;
      else awayWin += p;

      const total = i + j;
      if (total <= 3) under35 += p;
      if (total >= 2) over15 += p;
    }
  }

  return { homeWin, draw, awayWin, under35, over15 };
}

function pickSuggestion(probs, strengthBias = 0) {
  const candidates = [];

  candidates.push({ market: "1X (Home or Draw)", lose: probs.awayWin });
  candidates.push({ market: "X2 (Away or Draw)", lose: probs.homeWin });

  candidates.push({ market: "Under 3.5", lose: 1 - probs.under35 });
  candidates.push({ market: "Over 1.5", lose: 1 - probs.over15 });

  for (const c of candidates) {
    let bonus = 0;
    if (c.market.startsWith("1X") && strengthBias > 0.15) bonus += 0.02;
    if (c.market.startsWith("X2") && strengthBias < -0.15) bonus += 0.02;
    if (c.market.startsWith("Under") && probs.under35 > 0.65) bonus += 0.02;
    if (c.market.startsWith("Over") && probs.over15 > 0.75) bonus += 0.01;
    c.score = 1 - c.lose + bonus;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function riskBucket(loseProb) {
  if (loseProb <= 0.35) return "low";
  if (loseProb <= 0.45) return "medium";
  return "high";
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function lastNFinished(fixtures, n = 5) {
  const done = fixtures
    .filter((f) => ["FT", "AET", "PEN"].includes(f?.fixture?.status?.short))
    .sort((a, b) => (b?.fixture?.timestamp ?? 0) - (a?.fixture?.timestamp ?? 0));
  return done.slice(0, n);
}

function writeJson(fp, data) {
  fs.writeFileSync(fp, JSON.stringify(data, null, 2));
}

async function fetchUpcomingFixtures(cfg, today = new Date()) {
  const { resolved: leaguesResolved, unresolved } = await resolveConfiguredLeagues(
    cfg.leagues,
    today
  );

  // ✅ GUARDRAIL: se config pede ligas fora do Brasil e não resolveu nenhuma,
  // aborta pra NÃO sobrescrever snapshot e evitar voltar pra "só estaduais".
  const expectNonBrazil = (cfg.leagues || []).some(
    (l) => l && l.country && String(l.country).toLowerCase() !== "brazil"
  );
  const hasNonBrazil = leaguesResolved.some(
    (l) => String(l.country || "").toLowerCase() !== "brazil"
  );

  if (expectNonBrazil && !hasNonBrazil) {
    throw new Error(
      "Resolution too incomplete: no non-Brazil leagues resolved. Aborting to avoid overwriting snapshots."
    );
  }

  if (
    unresolved.length &&
    leaguesResolved.length < Math.max(3, Math.floor((cfg.leagues || []).length * 0.4))
  ) {
    throw new Error(
      `Resolution too incomplete: resolved=${leaguesResolved.length} unresolved=${unresolved.length}. Aborting.`
    );
  }

  // fetch fixtures for each league in date window
  const start = new Date(today);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + DAYS);

  const from = isoDate(start);
  const to = isoDate(end);

  let all = [];
  const leaguesMeta = [];

  for (const L of leaguesResolved) {
    const season =
      L.season ??
      seasonFor(L.season_rule ?? (String(L.country || "").toLowerCase() === "brazil" ? "calendar_year" : "europe_split"), today);

    let json;
    try {
      json = await client.get("/fixtures", {
        league: L.league,
        season,
        from,
        to,
        timezone: TZ,
      });
    } catch (e) {
      console.warn("fixtures fetch failed:", L, e?.message || e);
      continue;
    }

    const arr = Array.isArray(json?.response) ? json.response : [];
    const trimmed = arr.slice(0, MAX_FIX_PER_LEAGUE);

    leaguesMeta.push({
      league: L.league,
      name: L.name ?? null,
      country: L.country ?? null,
      season,
      count: trimm
