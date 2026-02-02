import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ApiFootballClient } from "./api-football-client.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.resolve(__dirname, "api-football.config.json");
const OUT_DIR = path.resolve(__dirname, "..", "data", "v1");

const API_KEY = process.env.APIFOOTBALL_KEY || process.env.API_FOOTBALL_KEY || process.env.X_APISPORTS_KEY;
if (!API_KEY) {
  console.error("Missing API key. Set APIFOOTBALL_KEY in env/secrets.");
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const TZ = cfg.timezone ?? "America/Sao_Paulo";
const DAYS = Number(cfg.days_ahead ?? 7);
const LAST_N = Number(cfg.last_n ?? 5);
const MAX_G = Number(cfg.max_goals_matrix ?? 6);

const MAX_FIX_PER_LEAGUE = Number(cfg.max_fixtures_per_league ?? 9999);
const MAX_FIX_TOTAL = Number(cfg.max_fixtures_total ?? 9999);

const client = new ApiFootballClient({ apiKey: API_KEY });

const isoDate = (d) => d.toISOString().slice(0, 10);

// Season heuristics (works for most leagues)
function seasonFor(rule, date = new Date()) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  if (rule === "calendar_year") return y;
  // europe_split: season named by start year (e.g., 2025 for 2025/26)
  return (m >= 7) ? y : (y - 1);
}


// Resolve config league entries that use {search,country,type} or {auto:"brazil_state_championships"}.
// This avoids hardcoding provider-specific league IDs.
async function resolveConfiguredLeagues(leagues, today = new Date()) {
  const out = [];
  const seen = new Set();

  // small in-run cache for /leagues lookups
  if (!resolveConfiguredLeagues._cache) resolveConfiguredLeagues._cache = new Map();
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

    // reward stronger name matches
    const q = normalizeName(entry.search);
    if (q && ln === q) score += 10;
    if (q && ln.includes(q)) score += 5;

    // slight preference for current seasons if present
    const seasons = item?.seasons ?? [];
    if (seasons.some(s => s?.current === true)) score += 1;

    return score;
  }

  async function lookupBySearch(entry, season) {
    const key = JSON.stringify({ search: entry.search, country: entry.country ?? "", type: entry.type ?? "", season: season ?? "" });
    if (cache.has(key)) return cache.get(key);

    const params = { search: entry.search };
    if (entry.country) params.country = entry.country;
    if (entry.type) params.type = entry.type;
    if (season) params.season = season;

    let json;
    try {
      json = await client.get("/leagues", params);
    } catch (e) {
      json = { response: [] };
    }

    let items = json.response ?? [];
    if ((!items || items.length === 0) && season) {
      // retry without season constraint
      try {
        json = await client.get("/leagues", { ...params, season: undefined });
        items = json.response ?? [];
      } catch (e) {
        items = [];
      }
    }

    // pick best candidate
    let best = null;
    let bestScore = -1;
    for (const it of items) {
      const sc = scoreCandidate(entry, it);
      if (sc > bestScore) { bestScore = sc; best = it; }
    }
    cache.set(key, best);
    return best;
  }

  async function expandBrazilStates(autoEntry) {
    const season = autoEntry.season ?? seasonFor(autoEntry.season_rule ?? "calendar_year", today);
    const key = `brazil_states|${season}`;
    if (cache.has(key)) return cache.get(key);

    let json;
    try {
      json = await client.get("/leagues", { country: "Brazil", type: "league", season });
    } catch (e) {
      json = { response: [] };
    }

    const items = json.response ?? [];
    const res = [];
    const isStateTopTier = (name) => {
      const n = (name ?? "").toString();
      if (!n.includes(" - ")) return false;
      const low = n.toLowerCase();
      // exclude national leagues/cups and obvious non-state competitions
      if (low.includes("serie a") || low.includes("serie b") || low.includes("serie c")) return false;
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

      const obj = {
        league: id,
        name,
        country: "Brazil",
        season_rule: "calendar_year",
        source: "auto"
      };
      res.push(obj);
    }

    // stable ordering by name
    res.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    cache.set(key, res);
    return res;
  }

  for (const L of (leagues ?? [])) {
    if (!L) continue;

    if (typeof L.league === "number") {
      if (!seen.has(L.league)) { out.push(L); seen.add(L.league); }
      continue;
    }

    if (L.auto === "brazil_state_championships") {
      const states = await expandBrazilStates(L);
      for (const s of states) {
        if (!seen.has(s.league)) { out.push(s); seen.add(s.league); }
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
          resolved_from: "search"
        };
        if (!seen.has(resolved.league)) { out.push(resolved); seen.add(resolved.league); }
      } else {
        console.warn("Could not resolve league:", L);
      }
      continue;
    }

    console.warn("Invalid league config entry (missing league/search/auto):", L);
  }

  return out;
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
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
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

  // probability mass beyond maxGoals is ignored; keep it simple.
  return { homeWin, draw, awayWin, under35, over15 };
}

function pickSuggestion(probs, strengthBias = 0) {
  // strengthBias: + favors home, - favors away
  const candidates = [];

  // 1X / X2
  candidates.push({
    market: "1X (Home or Draw)",
    lose: probs.awayWin
  });
  candidates.push({
    market: "X2 (Away or Draw)",
    lose: probs.homeWin
  });

  // Totals
  candidates.push({
    market: "Under 3.5",
    lose: 1 - probs.under35
  });
  candidates.push({
    market: "Over 1.5",
    lose: 1 - probs.over15
  });

  // Simple scoring: prefer low lose prob, then prefer market coherent with bias
  for (const c of candidates) {
    let bonus = 0;
    if (c.market.startsWith("1X") && strengthBias > 0.15) bonus += 0.02;
    if (c.market.startsWith("X2") && strengthBias < -0.15) bonus += 0.02;
    if (c.market.startsWith("Under") && (probs.under35 > 0.65)) bonus += 0.02;
    if (c.market.startsWith("Over") && (probs.over15 > 0.75)) bonus += 0.01;
    c.score = (1 - c.lose) + bonus;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

function riskBucket(loseProb) {
  if (loseProb <= 0.35) return "low";
  if (loseProb <= 0.45) return "medium";
  return "high";
}

function formString(results) {
  return results.map(r => r.result).join("");
}

function computeTeamForm(fixtures, teamId) {
  const last = fixtures.slice(0, LAST_N);
  let gf = 0, ga = 0;
  const items = [];

  for (const fx of last) {
    const isHome = fx.teams.home.id === teamId;
    const gfMatch = isHome ? fx.goals.home : fx.goals.away;
    const gaMatch = isHome ? fx.goals.away : fx.goals.home;

    // ignore missing scores (future fixtures)
    if (gfMatch === null || gaMatch === null) continue;

    gf += gfMatch;
    ga += gaMatch;

    let result = "D";
    if (gfMatch > gaMatch) result = "W";
    else if (gfMatch < gaMatch) result = "L";

    const opponent = isHome ? fx.teams.away.name : fx.teams.home.name;

    items.push({
      fixture_id: fx.fixture.id,
      date_utc: fx.fixture.date,
      venue: isHome ? "H" : "A",
      vs: opponent,
      gf: gfMatch,
      ga: gaMatch,
      result
    });
  }

  // Ensure exactly LAST_N items if possible
  const form = formString(items.slice(0, LAST_N));
  return {
    form,
    gf,
    ga,
    last: items.slice(0, LAST_N)
  };
}


async function fetchUpcomingFixtures() {
  const today = new Date();
  const from = isoDate(today);
  const to = isoDate(new Date(today.getTime() + (DAYS * 24 * 3600 * 1000)));

  const leagues = await resolveConfiguredLeagues(cfg.leagues, today);

  const all = [];
  for (const L of leagues) {
    const baseSeason = L.season ?? seasonFor(L.season_rule, today);

    // Try adjacent seasons when the provider's season labeling differs (e.g., split seasons).
    const seasonsToTry = Array.from(new Set(
      [baseSeason, baseSeason - 1, baseSeason + 1].filter((x) => Number.isFinite(x))
    ));

    let seasonUsed = baseSeason;
    let fixtures = [];

    for (const season of seasonsToTry) {
      let json;
      try {
        json = await client.get("/fixtures", {
          league: L.league,
          season,
          from,
          to,
          timezone: TZ
        });
      } catch (e) {
        // fallback: fetch day-by-day
        const merged = [];
        for (let d = 0; d <= DAYS; d++) {
          const dt = new Date(today.getTime() + d * 24 * 3600 * 1000);
          const j = await client.get("/fixtures", { league: L.league, season, date: isoDate(dt), timezone: TZ });
          merged.push(...(j.response ?? []));
        }
        json = { response: merged };
      }

      const resp = json.response ?? [];
      if (resp.length > 0) {
        seasonUsed = season;
        fixtures = resp;
        break;
      }
    }

    if (fixtures.length === 0) continue;

    // Cap per-league volume (keeps API usage and payload sane)
    fixtures = fixtures.slice(0, MAX_FIX_PER_LEAGUE);

    for (const fx of fixtures) {
      all.push({ fx, league: L, season: seasonUsed });
      if (all.length >= MAX_FIX_TOTAL * 2) break; // soft cap; final cap after sorting
    }
    if (all.length >= MAX_FIX_TOTAL * 2) break;
  }

  // sort by kickoff
  all.sort((a, b) => new Date(a.fx.fixture.date) - new Date(b.fx.fixture.date));
  return all.slice(0, MAX_FIX_TOTAL);
}


async function fetchLastFixtures(teamId, leagueId, season) {
  // Cache in-memory to avoid repeated calls
  const key = `${teamId}|${leagueId}|${season}`;
  if (!fetchLastFixtures.cache) fetchLastFixtures.cache = new Map();
  if (fetchLastFixtures.cache.has(key)) return fetchLastFixtures.cache.get(key);

  const json = await client.get("/fixtures", {
    team: teamId,
    league: leagueId,
    season,
    last: LAST_N,
    timezone: TZ
  });

  const list = (json.response ?? []).filter(x => x?.goals);
  fetchLastFixtures.cache.set(key, list);
  return list;
}

function buildCalendarMatchRow(entry, formHome, formAway, suggestion) {
  const fx = entry.fx;

  return {
    kickoff_utc: fx.fixture.date,
    country: fx.league.country || entry.league.country,
    competition: fx.league.name || entry.league.name,
    competition_id: fx.league.id,
    fixture_id: fx.fixture.id,
    home: fx.teams.home.name,
    away: fx.teams.away.name,
    home_id: fx.teams.home.id,
    away_id: fx.teams.away.id,

    home_logo: fx.teams.home.logo || null,
    away_logo: fx.teams.away.logo || null,
    competition_logo: fx.league.logo || null,
    country_flag: fx.league.flag || null,

    risk: riskBucket(suggestion.lose),
    suggestion_free: suggestion.market,

    form_home: formHome.form,
    form_away: formAway.form,
    gf_home: formHome.gf,
    ga_home: formHome.ga,
    gf_away: formAway.gf,
    ga_away: formAway.ga,

    form_home_last: formHome.last,
    form_away_last: formAway.last
  };
}

function chooseHighlights(calendarMatches) {
  // pick first 3 for today (local-ish) with best confidence
  const now = new Date();
  const today = isoDate(now);

  const todayMatches = calendarMatches.filter(m => m.kickoff_utc.slice(0, 10) === today);
  const pool = todayMatches.length ? todayMatches : calendarMatches.slice(0, 12);

  const scored = pool.map(m => ({
    m,
    score: (m.risk === "low" ? 3 : m.risk === "medium" ? 2 : 1) - (m.suggestion_free.startsWith("Over") ? 0.2 : 0)
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map(x => ({
    country: x.m.country,
    competition: x.m.competition,
    home: x.m.home,
    away: x.m.away,
    home_logo: x.m.home_logo || null,
    away_logo: x.m.away_logo || null,
    competition_logo: x.m.competition_logo || null,
    country_flag: x.m.country_flag || null,
    kickoff_utc: x.m.kickoff_utc,
    risk: x.m.risk,
    suggestion_free: x.m.suggestion_free,
    pro_locked: true
  }));
}

function chooseWeekItems(calendarMatches) {
  // top 10 by lowest lose (approx by risk) across week, keep diversity
  const ranked = [...calendarMatches];
  const riskRank = { low: 0, medium: 1, high: 2 };
  ranked.sort((a, b) => riskRank[a.risk] - riskRank[b.risk] || new Date(a.kickoff_utc) - new Date(b.kickoff_utc));

  const out = [];
  const seenComp = new Map();
  for (const m of ranked) {
    const k = m.competition_id;
    const c = seenComp.get(k) ?? 0;
    if (c >= 3) continue; // avoid flooding same league
    out.push({
      country: m.country,
      competition: m.competition,
      home: m.home,
      away: m.away,
      home_logo: m.home_logo || null,
      away_logo: m.away_logo || null,
      competition_logo: m.competition_logo || null,
      country_flag: m.country_flag || null,
      kickoff_utc: m.kickoff_utc,
      risk: m.risk,
      suggestion_free: m.suggestion_free,
      result: "pending"
    });
    seenComp.set(k, c + 1);
    if (out.length >= 10) break;
  }
  return out;
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function main() {
  console.log("Fetching upcoming fixtures...");
  const upcoming = await fetchUpcomingFixtures();

  const calendarMatches = [];
  for (const entry of upcoming) {
    const fx = entry.fx;

    // Skip if teams missing
    if (!fx?.teams?.home?.id || !fx?.teams?.away?.id) continue;

    // Get last fixtures for both teams (cached)
    const [homeLast, awayLast] = await Promise.all([
      fetchLastFixtures(fx.teams.home.id, fx.league.id, entry.season),
      fetchLastFixtures(fx.teams.away.id, fx.league.id, entry.season)
    ]);

    const formHome = computeTeamForm(homeLast, fx.teams.home.id);
    const formAway = computeTeamForm(awayLast, fx.teams.away.id);

    // Strength bias: points per game from form (W=3,D=1,L=0)
    const pts = (f) => [...f].reduce((s, ch) => s + (ch === "W" ? 3 : ch === "D" ? 1 : 0), 0);
    const bias = (pts(formHome.form) - pts(formAway.form)) / Math.max(1, LAST_N * 3);

    // Expected goals
    const homeAttack = formHome.gf / Math.max(1, LAST_N);
    const homeDef = formHome.ga / Math.max(1, LAST_N);
    const awayAttack = formAway.gf / Math.max(1, LAST_N);
    const awayDef = formAway.ga / Math.max(1, LAST_N);

    const lambdaH = Math.max(0.2, ((homeAttack + awayDef) / 2) * 1.08);
    const lambdaA = Math.max(0.2, ((awayAttack + homeDef) / 2) * 0.98);

    const probs = computeProbs(lambdaH, lambdaA, MAX_G);
    const suggestion = pickSuggestion(probs, bias);

    const row = buildCalendarMatchRow(entry, formHome, formAway, suggestion);
    calendarMatches.push(row);
  }

  ensureDir(OUT_DIR);

  const generated_at_utc = new Date().toISOString();

  // calendar_7d
  writeJson(path.join(OUT_DIR, "calendar_7d.json"), {
    generated_at_utc,
    matches: calendarMatches
  });

  // radar_day (highlights)
  writeJson(path.join(OUT_DIR, "radar_day.json"), {
    generated_at_utc,
    highlights: chooseHighlights(calendarMatches)
  });

  // radar_week
  writeJson(path.join(OUT_DIR, "radar_week.json"), {
    generated_at_utc,
    week_scope: `${DAYS}d`,
    items: chooseWeekItems(calendarMatches)
  });

  console.log("Done. Files written to data/v1/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
