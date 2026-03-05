#!/usr/bin/env node
/**
 * seed-team-window-5-from-calendar-2d.mjs
 *
 * Objetivo:
 * - Ler fixtures de today+tomorrow (calendar_2d)
 * - Extrair alvos únicos (league_id, season, team_id)
 * - Para snapshots ausentes/parciais, buscar fixtures finalizadas via API-Football
 * - Alimentar fixture-stats-cache + snapshots v2 via generateFromCalendarMatch
 * - Sincronizar team-window-5 para R2 no final
 *
 * Uso:
 *   node tools/seed-team-window-5-from-calendar-2d.mjs
 *   node tools/seed-team-window-5-from-calendar-2d.mjs --local --no-sync --max-fixtures 30 --verbose
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { ApiFootballClient } from './api-football-client.mjs';
import { generateFromCalendarMatch, loadTeamWindow5Snapshot } from './lib/team-window-5-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);

const args = process.argv.slice(2);
const hasFlag = (flag) => args.includes(flag);
const getArg = (name, fallback = null) => {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
};

const verbose = hasFlag('--verbose');
const useLocalOnly = hasFlag('--local');
const noSync = hasFlag('--no-sync');
const maxFixtures = Math.max(20, Math.min(40, Number(getArg('--max-fixtures', '30')) || 30));
const calendarUrl = getArg('--calendar-url', 'https://radartips.com/api/v1/calendar_2d.json?tz=America/Sao_Paulo');
const localCalendarPath = getArg('--calendar-file', path.join(ROOT, 'data', 'v1', 'calendar_2d.json'));
const outputDir = getArg('--output-dir', path.join(ROOT, 'data', 'v1', 'team-window-5'));

const apiKey = process.env.API_FOOTBALL_KEY || process.env.APIFOOTBALL_KEY || '';

function log(message) {
  console.log(`[seed-2d] ${message}`);
}

function vlog(message) {
  if (verbose) log(message);
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function deriveSeason(match) {
  const fromPayload = toNum(match?.season);
  if (fromPayload) return fromPayload;

  const dt = String(match?.kickoff_utc || match?.fixture?.date || '');
  const y = Number(dt.slice(0, 4));
  if (Number.isFinite(y) && y > 2000 && y < 2100) return y;

  return new Date().getUTCFullYear();
}

function normalizeCalendarMatch(raw) {
  return {
    fixture_id: toNum(raw?.fixture_id ?? raw?.id ?? raw?.fixture?.id),
    league_id: toNum(raw?.league_id ?? raw?.competition_id ?? raw?.league?.id),
    season: deriveSeason(raw),
    home_id: toNum(raw?.home_id ?? raw?.home?.id ?? raw?.teams?.home?.id),
    away_id: toNum(raw?.away_id ?? raw?.away?.id ?? raw?.teams?.away?.id),
    home: raw?.home || raw?.home_team || raw?.home?.name || raw?.teams?.home?.name || 'Home',
    away: raw?.away || raw?.away_team || raw?.away?.name || raw?.teams?.away?.name || 'Away',
    kickoff_utc: raw?.kickoff_utc || raw?.date_utc || raw?.fixture?.date || null,
    status: raw?.status || raw?.fixture?.status?.short || 'NS',
    goals_home: toNum(raw?.goals_home ?? raw?.goals?.home ?? raw?.home?.score),
    goals_away: toNum(raw?.goals_away ?? raw?.goals?.away ?? raw?.away?.score)
  };
}

function normalizeApiFixture(row) {
  return {
    fixture_id: toNum(row?.fixture?.id),
    league_id: toNum(row?.league?.id),
    season: toNum(row?.league?.season),
    home_id: toNum(row?.teams?.home?.id),
    away_id: toNum(row?.teams?.away?.id),
    home: row?.teams?.home?.name || 'Home',
    away: row?.teams?.away?.name || 'Away',
    kickoff_utc: row?.fixture?.date || null,
    status: row?.fixture?.status?.short || 'NS',
    goals_home: toNum(row?.goals?.home),
    goals_away: toNum(row?.goals?.away)
  };
}

async function loadCalendar2d() {
  if (!useLocalOnly) {
    try {
      log(`Fetching calendar_2d from ${calendarUrl}`);
      const res = await fetch(calendarUrl, { headers: { 'cache-control': 'no-cache' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.today) && Array.isArray(data?.tomorrow)) {
          return { data, source: 'remote' };
        }
      }
      log(`Remote calendar_2d unavailable (status=${res.status}), falling back to local file`);
    } catch (e) {
      log(`Remote calendar_2d fetch failed (${e.message}), falling back to local file`);
    }
  }

  if (!fs.existsSync(localCalendarPath)) {
    throw new Error(`Local calendar_2d not found at ${localCalendarPath}`);
  }

  const local = JSON.parse(fs.readFileSync(localCalendarPath, 'utf8'));
  if (!Array.isArray(local?.today) || !Array.isArray(local?.tomorrow)) {
    throw new Error('Invalid local calendar_2d shape (expected today/tomorrow arrays)');
  }
  return { data: local, source: 'local' };
}

function extractTargets(calendar2d) {
  const matches = [
    ...(Array.isArray(calendar2d?.today) ? calendar2d.today : []),
    ...(Array.isArray(calendar2d?.tomorrow) ? calendar2d.tomorrow : [])
  ].map(normalizeCalendarMatch);

  const map = new Map();
  for (const m of matches) {
    const leagueId = toNum(m.league_id);
    const season = toNum(m.season);

    if (!leagueId || !season) continue;

    const addTeam = (teamId, teamName) => {
      const tId = toNum(teamId);
      if (!tId) return;
      const key = `${leagueId}:${season}:${tId}`;
      if (!map.has(key)) {
        map.set(key, {
          leagueId,
          season,
          teamId: tId,
          teamName: teamName || `Team ${tId}`
        });
      }
    };

    addTeam(m.home_id, m.home);
    addTeam(m.away_id, m.away);
  }

  return Array.from(map.values());
}

function needsRefresh(target) {
  const snapshot = loadTeamWindow5Snapshot(target.teamId, target.leagueId, target.season, outputDir);
  if (!snapshot) return { needed: true, reason: 'missing' };

  const partialHome = snapshot?.meta?.partial_home === true;
  const partialAway = snapshot?.meta?.partial_away === true;
  if (partialHome || partialAway) {
    return { needed: true, reason: 'partial' };
  }

  return { needed: false, reason: 'complete' };
}

async function fetchRecentFinishedFixtures(client, target) {
  const response = await client.get('/fixtures', {
    team: target.teamId,
    league: target.leagueId,
    season: target.season,
    last: maxFixtures
  });

  const rows = Array.isArray(response?.response) ? response.response : [];
  const normalized = rows
    .map(normalizeApiFixture)
    .filter((m) => FINAL_STATUSES.has(String(m.status || '').toUpperCase()))
    .filter((m) => Number(m.league_id) === Number(target.leagueId) && Number(m.season) === Number(target.season))
    .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime());

  const uniq = new Map();
  for (const m of normalized) {
    if (!m.fixture_id) continue;
    uniq.set(m.fixture_id, m);
  }

  return Array.from(uniq.values());
}

function runSyncToR2() {
  log('Running sync-team-window-5-to-r2.mjs ...');
  const res = spawnSync('node', ['sync-team-window-5-to-r2.mjs'], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit'
  });

  if (res.status !== 0) {
    throw new Error(`sync-team-window-5-to-r2.mjs failed with exit code ${res.status}`);
  }
}

async function main() {
  const startedAt = Date.now();

  const { data: calendar2d, source } = await loadCalendar2d();
  log(`calendar_2d source: ${source}`);

  const targets = extractTargets(calendar2d);
  log(`targets extracted: ${targets.length}`);

  const toProcess = [];
  for (const t of targets) {
    const state = needsRefresh(t);
    if (state.needed) {
      toProcess.push({ ...t, reason: state.reason });
    }
  }

  log(`targets needing refresh: ${toProcess.length}`);

  if (toProcess.length === 0) {
    log('No missing/partial snapshots detected.');
    if (!noSync) {
      runSyncToR2();
    }
    log('Done.');
    return;
  }

  if (!apiKey) {
    throw new Error('Missing API key. Set API_FOOTBALL_KEY or APIFOOTBALL_KEY.');
  }

  const client = new ApiFootballClient({ apiKey, minIntervalMs: 300, retries: 2 });

  let fixturesProcessed = 0;
  let targetsUpdated = 0;
  let targetsWithoutFixtures = 0;
  let targetsFailed = 0;

  for (const target of toProcess) {
    try {
      log(`target ${target.teamName} (${target.teamId}) league=${target.leagueId} season=${target.season} reason=${target.reason}`);
      const fixtures = await fetchRecentFinishedFixtures(client, target);
      vlog(`  fetched finished fixtures: ${fixtures.length}`);

      if (fixtures.length === 0) {
        targetsWithoutFixtures++;
        continue;
      }

      let anyUpdated = false;
      for (const match of fixtures) {
        const result = await generateFromCalendarMatch({
          match,
          leagueId: target.leagueId,
          season: target.season,
          outputDir
        });
        fixturesProcessed++;
        if (result?.updated) anyUpdated = true;
      }

      if (anyUpdated) targetsUpdated++;
    } catch (e) {
      targetsFailed++;
      log(`  ERROR: ${e.message}`);
    }
  }

  log(`fixtures processed: ${fixturesProcessed}`);
  log(`targets updated: ${targetsUpdated}`);
  log(`targets without finished fixtures: ${targetsWithoutFixtures}`);
  log(`targets failed: ${targetsFailed}`);

  if (!noSync) {
    runSyncToR2();
  }

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  log(`Completed in ${elapsed}s`);

  if (targetsFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(`[seed-2d] FATAL: ${e.message}`);
  process.exit(1);
});
