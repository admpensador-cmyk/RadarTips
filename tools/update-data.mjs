#!/usr/bin/env node
/**
 * RadarTips – data generator
 *
 * Generates:
 *   data/v1/calendar_7d.json
 *   data/v1/radar_day.json
 *   data/v1/radar_week.json
 *   data/v1/team_cache.json (optional cache to reduce API calls)
 *
 * Data source: football-data.org (requires FOOTBALL_DATA_TOKEN)
 */

import fs from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if(!TOKEN){
  console.error("[radartips] Missing env FOOTBALL_DATA_TOKEN. Set it in GitHub Secrets / local env.");
  process.exit(1);
}

const COMPETITIONS = (process.env.RADARTIPS_COMPETITIONS || "PL,PD,SA,BL1,FL1,BSA")
  .split(",")
  .map(s=>s.trim())
  .filter(Boolean);

const DAYS = clampInt(Number(process.env.RADARTIPS_DAYS || 7), 1, 14);
const FORM_WINDOW = clampInt(Number(process.env.RADARTIPS_FORM_WINDOW || 5), 3, 10);
const MAX_GOALS = clampInt(Number(process.env.RADARTIPS_MAX_GOALS || 8), 6, 12);

const OUT_DIR = path.resolve("data/v1");
const CACHE_PATH = path.join(OUT_DIR, "team_cache.json");

function clampInt(n, a, b){
  if(!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, Math.trunc(n)));
}

function isoDateUTC(d){
  const x = new Date(d);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth()+1).padStart(2,"0");
  const day = String(x.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function addDays(d, n){
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function nowIsoUTC(){
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function fdFetch(endpoint){
  const url = `https://api.football-data.org/v4${endpoint}`;
  const r = await fetch(url, {
    headers: {
      "X-Auth-Token": TOKEN,
      "Accept": "application/json"
    }
  });
  if(!r.ok){
    const txt = await r.text().catch(()=>"");
    throw new Error(`football-data API ${r.status} on ${endpoint}: ${txt.slice(0,200)}`);
  }
  return r.json();
}

function mapLimit(items, limit, fn){
  const out = [];
  let i = 0;
  const workers = Array.from({length: Math.max(1, limit)}, async ()=>{
    while(i < items.length){
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  return Promise.all(workers).then(()=>out);
}

function fact(n){
  let f = 1;
  for(let i=2;i<=n;i++) f *= i;
  return f;
}

function poissonP(k, lambda){
  // Stable enough for small k (<= 12)
  return Math.exp(-lambda) * Math.pow(lambda, k) / fact(k);
}

function matchOutcomeProbs(lambdaHome, lambdaAway, maxGoals){
  const pH = Array.from({length:maxGoals+1}, (_,k)=>poissonP(k, lambdaHome));
  const pA = Array.from({length:maxGoals+1}, (_,k)=>poissonP(k, lambdaAway));

  let pHomeWin = 0;
  let pDraw = 0;
  let pAwayWin = 0;

  for(let i=0;i<=maxGoals;i++){
    for(let j=0;j<=maxGoals;j++){
      const p = pH[i]*pA[j];
      if(i>j) pHomeWin += p;
      else if(i===j) pDraw += p;
      else pAwayWin += p;
    }
  }

  // Tail probability for goals > maxGoals is ignored; compensate lightly by renormalizing.
  const sum = pHomeWin + pDraw + pAwayWin;
  if(sum > 0.999 && sum < 1.001){
    return {pHomeWin, pDraw, pAwayWin};
  }
  if(sum > 0){
    return {pHomeWin: pHomeWin/sum, pDraw: pDraw/sum, pAwayWin: pAwayWin/sum};
  }
  return {pHomeWin: 0.33, pDraw: 0.34, pAwayWin: 0.33};
}

function underProb(lambdaTotal, line, maxGoals){
  // Under 3.5 means <=3
  const kMax = Math.floor(line - 0.5);
  let p = 0;
  for(let k=0;k<=Math.min(kMax, maxGoals);k++) p += poissonP(k, lambdaTotal);
  return clamp01(p);
}

function clamp01(x){
  return Math.max(0, Math.min(1, x));
}

function pickMarket(model){
  const {pHomeWin, pDraw, pAwayWin, pUnder35, lambdaTotal} = model;

  const cand = [];

  // 1X
  const p1x = pHomeWin + pDraw;
  cand.push({
    market: "1X",
    p: p1x,
    loss: pAwayWin
  });

  // Under 3.5
  cand.push({
    market: "Under 3.5",
    p: pUnder35,
    loss: 1 - pUnder35
  });

  // DNB Home
  cand.push({
    market: "DNB Home",
    p: pHomeWin,
    loss: pAwayWin,
    push: pDraw
  });

  // Heuristic: prefer safest option, but require at least 0.55 confidence if possible
  const safe = cand
    .filter(c => (1 - c.loss) >= 0.55)
    .sort((a,b)=> (a.loss - b.loss) || (b.p - a.p));

  const best = (safe[0]) || cand.sort((a,b)=> (a.loss - b.loss) || (b.p - a.p))[0];

  const risk = (best.loss <= 0.30) ? "low" : (best.loss <= 0.45) ? "medium" : "high";

  // Safety score for ranking
  const score = (1 - best.loss) * 100 + Math.max(0, best.p - 0.50) * 20 + (lambdaTotal <= 3.0 ? 2 : 0);

  return {
    suggestion_free: best.market,
    risk,
    model_pick: {
      market: best.market,
      p: round3(best.p),
      loss: round3(best.loss),
      push: best.push != null ? round3(best.push) : undefined,
      score: round2(score)
    }
  };
}

function round2(x){ return Math.round(x*100)/100; }
function round3(x){ return Math.round(x*1000)/1000; }

function computeLambdas(statsHome, statsAway){
  const fallbackGF = 1.25;
  const fallbackGA = 1.25;

  const hGF = statsHome?.gfPer ?? fallbackGF;
  const hGA = statsHome?.gaPer ?? fallbackGA;
  const aGF = statsAway?.gfPer ?? fallbackGF;
  const aGA = statsAway?.gaPer ?? fallbackGA;

  // Simple blend (keeps model explainable)
  const lambdaHome = clamp01ish((hGF + aGA) / 2, 0.2, 3.8);
  const lambdaAway = clamp01ish((aGF + hGA) / 2, 0.2, 3.5);

  return {lambdaHome, lambdaAway, lambdaTotal: lambdaHome + lambdaAway};
}

function clamp01ish(x, a, b){
  if(!Number.isFinite(x)) return (a+b)/2;
  return Math.max(a, Math.min(b, x));
}

function buildTeamStats(teamMatches, teamId){
  const details = [];
  let gf = 0;
  let ga = 0;

  for(const m of teamMatches){
    const isHome = m.homeTeam?.id === teamId;
    const opp = isHome ? m.awayTeam?.name : m.homeTeam?.name;

    const hs = Number(m.score?.fullTime?.home ?? 0);
    const as = Number(m.score?.fullTime?.away ?? 0);

    const teamGoals = isHome ? hs : as;
    const oppGoals = isHome ? as : hs;

    const result = (teamGoals > oppGoals) ? "W" : (teamGoals === oppGoals) ? "D" : "L";

    gf += teamGoals;
    ga += oppGoals;

    details.push({
      result,
      venue: isHome ? "H" : "A",
      opp: opp || "—",
      score: `${hs}-${as}`,
      date_utc: m.utcDate
    });
  }

  const n = details.length || 1;
  return {
    details,
    gf,
    ga,
    gfPer: gf / n,
    gaPer: ga / n
  };
}

function areaToCountry(areaName){
  // football-data sometimes returns "World" or "Europe" etc
  return areaName || "—";
}

function simplifyTeamName(name){
  // Keep as-is, but trim and normalize spaces
  return String(name || "—").replace(/\s+/g, " ").trim();
}

async function main(){
  await fs.mkdir(OUT_DIR, {recursive:true});

  // Load existing cache (optional)
  let teamCache = {};
  try{
    teamCache = JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
  }catch{ teamCache = {}; }

  const dateFrom = isoDateUTC(new Date());
  const dateTo = isoDateUTC(addDays(new Date(), DAYS-1));

  console.log(`[radartips] Fetching matches ${dateFrom} → ${dateTo} for competitions: ${COMPETITIONS.join(", ")}`);

  const byCompetition = await mapLimit(COMPETITIONS, 2, async (code)=>{
    try{
      const data = await fdFetch(`/competitions/${encodeURIComponent(code)}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      return {code, ok:true, data};
    }catch(err){
      console.warn(`[radartips] WARN: ${code}: ${err.message}`);
      return {code, ok:false, data:null};
    }
  });

  const matches = [];
  const teamIds = new Set();

  for(const item of byCompetition){
    if(!item.ok || !item.data) continue;
    const compName = item.data.competition?.name || item.code;
    const areaName = areaToCountry(item.data.competition?.area?.name);

    for(const m of (item.data.matches || [])){
      if(!m || !m.homeTeam || !m.awayTeam || !m.utcDate) continue;
      if(m.status && m.status !== "SCHEDULED" && m.status !== "TIMED") continue;

      matches.push({
        kickoff_utc: m.utcDate,
        country: areaName,
        competition: compName,
        home: simplifyTeamName(m.homeTeam.name),
        away: simplifyTeamName(m.awayTeam.name),
        home_id: m.homeTeam.id,
        away_id: m.awayTeam.id
      });

      if(m.homeTeam.id) teamIds.add(String(m.homeTeam.id));
      if(m.awayTeam.id) teamIds.add(String(m.awayTeam.id));
    }
  }

  matches.sort((a,b)=> new Date(a.kickoff_utc) - new Date(b.kickoff_utc));

  console.log(`[radartips] Upcoming matches collected: ${matches.length}`);

  // Determine which teams need refresh
  const teamIdList = [...teamIds];
  const now = Date.now();
  const STALE_MS = 20 * 60 * 60 * 1000; // 20h

  const need = teamIdList.filter(id=>{
    const entry = teamCache[id];
    if(!entry || !entry.updated_at) return true;
    const t = Date.parse(entry.updated_at);
    if(!Number.isFinite(t)) return true;
    return (now - t) > STALE_MS;
  });

  console.log(`[radartips] Teams needing refresh: ${need.length}/${teamIdList.length} (form_window=${FORM_WINDOW})`);

  // Refresh with a small concurrency to avoid rate limits
  await mapLimit(need, 3, async (id)=>{
    try{
      const data = await fdFetch(`/teams/${encodeURIComponent(id)}/matches?status=FINISHED&limit=${FORM_WINDOW}`);
      const ms = (data.matches || []).slice(0, FORM_WINDOW);
      const stats = buildTeamStats(ms, Number(id));
      teamCache[id] = {
        updated_at: nowIsoUTC(),
        gf: stats.gf,
        ga: stats.ga,
        gfPer: stats.gfPer,
        gaPer: stats.gaPer,
        details: stats.details
      };
    }catch(err){
      console.warn(`[radartips] WARN team ${id}: ${err.message}`);
      // Keep old cache if present; otherwise set minimal fallback
      if(!teamCache[id]){
        teamCache[id] = { updated_at: nowIsoUTC(), gf:0, ga:0, gfPer:1.25, gaPer:1.25, details: [] };
      }
    }
  });

  // Build final calendar payload
  const enriched = matches.map(m=>{
    const hs = teamCache[String(m.home_id)] || {gf:0,ga:0,gfPer:1.25,gaPer:1.25,details:[]};
    const as = teamCache[String(m.away_id)] || {gf:0,ga:0,gfPer:1.25,gaPer:1.25,details:[]};

    const lambdas = computeLambdas(hs, as);
    const outcomes = matchOutcomeProbs(lambdas.lambdaHome, lambdas.lambdaAway, MAX_GOALS);
    const pUnder35 = underProb(lambdas.lambdaTotal, 3.5, MAX_GOALS);

    const model = {
      ...lambdas,
      ...outcomes,
      pUnder35
    };

    const pick = pickMarket(model);

    return {
      kickoff_utc: m.kickoff_utc,
      country: m.country,
      competition: m.competition,
      home: m.home,
      away: m.away,
      risk: pick.risk,
      suggestion_free: pick.suggestion_free,

      // Form + goals (last N finished matches)
      gf_home: hs.gf,
      ga_home: hs.ga,
      gf_away: as.gf,
      ga_away: as.ga,
      form_home_details: hs.details,
      form_away_details: as.details,

      // Keep model for future PRO screens (small, explainable)
      pro_model: {
        lambda_home: round3(model.lambdaHome),
        lambda_away: round3(model.lambdaAway),
        p_home_win: round3(model.pHomeWin),
        p_draw: round3(model.pDraw),
        p_away_win: round3(model.pAwayWin),
        p_under_35: round3(model.pUnder35),
        pick: pick.model_pick
      }
    };
  });

  const calendar = {
    schema_version: "v2",
    generated_at_utc: nowIsoUTC(),
    source: "football-data.org",
    form_window: FORM_WINDOW,
    goals_window: FORM_WINDOW,
    days: DAYS,
    matches: enriched
  };

  // Day highlights: prefer matches within next 24h, else earliest
  const nowDt = new Date();
  const horizon = new Date(nowDt.getTime() + 24*60*60*1000);

  let pool = enriched.filter(m=>{
    const k = new Date(m.kickoff_utc);
    return k >= nowDt && k <= horizon;
  });
  if(pool.length < 3) pool = enriched.filter(m=> new Date(m.kickoff_utc) >= nowDt);
  if(pool.length < 3) pool = enriched;

  const dayHighlights = pool
    .slice()
    .sort((a,b)=> (b.pro_model?.pick?.score ?? 0) - (a.pro_model?.pick?.score ?? 0))
    .slice(0, 3)
    .map(m=>({
      country: m.country,
      competition: m.competition,
      home: m.home,
      away: m.away,
      kickoff_utc: m.kickoff_utc,
      risk: m.risk,
      suggestion_free: m.suggestion_free
    }));

  const radarDay = {
    generated_at_utc: calendar.generated_at_utc,
    highlights: dayHighlights
  };

  // Week highlights: top 3 across the whole 7-day pool
  const weekHighlights = enriched
    .slice()
    .sort((a,b)=> (b.pro_model?.pick?.score ?? 0) - (a.pro_model?.pick?.score ?? 0))
    .slice(0, 3)
    .map(m=>({
      country: m.country,
      competition: m.competition,
      home: m.home,
      away: m.away,
      kickoff_utc: m.kickoff_utc,
      risk: m.risk,
      suggestion_free: m.suggestion_free
    }));

  const radarWeek = {
    generated_at_utc: calendar.generated_at_utc,
    highlights: weekHighlights
  };

  // Persist
  await writeJSON(path.join(OUT_DIR, "calendar_7d.json"), calendar);
  await writeJSON(path.join(OUT_DIR, "radar_day.json"), radarDay);
  await writeJSON(path.join(OUT_DIR, "radar_week.json"), radarWeek);
  await writeJSON(CACHE_PATH, teamCache);

  console.log("[radartips] OK: data/v1/*.json updated.");
}

async function writeJSON(p, obj){
  const txt = JSON.stringify(obj, null, 2) + "\n";
  await fs.writeFile(p, txt, "utf8");
}

main().catch(err=>{
  console.error("[radartips] ERROR:", err);
  process.exit(1);
});
