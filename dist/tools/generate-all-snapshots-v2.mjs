#!/usr/bin/env node
/**
 * PIPELINE PADRÃO v2 - Resolve season via /leagues + Gera standings/copas
 * 
 * Fluxo:
 * 1. Baixa calendario de produção
 * 2. Extrai leagues únicas do calendario
 * 3. Para cada league: resolve season oficial via /leagues endpoint
 * 4. Gera standings (ou cup structure se standings=false) com retry automático
 * 5. Upload AUTOMÁTICO para R2 production
 * 
 * Uso:
 *   node tools/generate-all-snapshots.mjs [--maxLeagues 27] [--concurrency 2]
 * 
 * Env:
 *   APIFOOTBALL_KEY (obrigatório)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import https from 'https';
import { resolveSeasonForLeague } from './lib/season-from-leagues.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const SNAPSHOTS_DIR = path.join(ROOT, 'data', 'v1');

const PRODUCTION_CALENDAR_URL = 'https://radartips-data.m2otta-music.workers.dev/v1/calendar_7d.json';
const R2_BUCKET = 'radartips-data';

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    maxLeagues: null,
    concurrency: 2,
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const val = args[i + 1];
    if (!key || !val) continue;

    if (key === '--maxLeagues') {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) config.maxLeagues = n;
    } else if (key === '--concurrency') {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) config.concurrency = n;
    }
  }

  return config;
}

function resolveWranglerBin() {
  const binDir = path.join(ROOT, 'node_modules', '.bin');
  const candidates = [
    path.join(binDir, 'wrangler'),
    path.join(binDir, 'wrangler.cmd'),
    path.join(binDir, 'wrangler.exe'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function getWranglerInvocation(args) {
  const localBin = resolveWranglerBin();
  const baseArgs = args.map(String);
  if (localBin) {
    return { command: localBin, args: baseArgs, shell: false };
  }

  return { command: 'npx', args: ['-y', 'wrangler', ...baseArgs], shell: true };
}

async function runWrangler(args, opts = {}) {
  const invocation = getWranglerInvocation(args);
  const cwd = opts.cwd || ROOT;
  const env = { ...process.env, ...(opts.env || {}) };

  return await new Promise((resolve, reject) => {
    const proc = spawn(invocation.command, invocation.args, {
      cwd,
      env,
      shell: invocation.shell,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (d) => { stdout += String(d); });
    proc.stderr?.on('data', (d) => { stderr += String(d); });

    proc.on('close', (code) => {
      const result = { code, stdout, stderr };
      if (code === 0) {
        resolve(result);
      } else {
        const err = new Error(
          `Wrangler failed (code ${code}).\n` +
          (stdout ? `stdout:\n${stdout}\n` : '') +
          (stderr ? `stderr:\n${stderr}\n` : '')
        );
        err.result = result;
        reject(err);
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Wrangler spawn failed: ${err.message}`));
    });
  });
}

// ============================================================================
// PASSO 1: Baixar calendario de produção
// ============================================================================
async function downloadProductionCalendar() {
  console.log('📥 Baixando calendario de produção...\n');
  
  return new Promise((resolve, reject) => {
    https.get(PRODUCTION_CALENDAR_URL, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const calendar = JSON.parse(data);
          resolve(calendar);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    }).on('error', reject);
  });
}

// ============================================================================
// PASSO 2: Extrair leagues ÚNICAS com kickoff representativo
// ============================================================================
function extractLeaguesWithKickoff(calendar) {
  if (!calendar?.matches || !Array.isArray(calendar.matches)) {
    console.warn('⚠️  No matches found in calendar\n');
    return [];
  }

  const leaguesMap = new Map();
  
  calendar.matches.forEach(match => {
    const leagueId = match.competition_id || match.league_id || match.leagueId;
    if (!leagueId) return;
    
    if (!leaguesMap.has(leagueId)) {
      leaguesMap.set(leagueId, {
        leagueId,
        competition: match.competition || 'Unknown',
        country: match.country || 'Unknown',
        kickoffUTC: match.kickoff_utc || new Date().toISOString(),
      });
    }
  });

  const list = Array.from(leaguesMap.values());
  console.log(`✅ Found ${list.length} unique leagues:\n`);
  list.forEach(p => {
    console.log(`   [${p.leagueId}] ${p.competition} (${p.country})`);
  });
  console.log('');
  
  return list;
}

// ============================================================================
// PASSO 3: Gerar snapshots com season resolvida via /leagues
// ============================================================================
function generateSnapshotForLeague(leagueId, season, seasonSource, options = {}) {
  const { maxRetries = 2, timeout = 180000, concurrency = 2 } = options;
  let attempt = 0;

  return new Promise((resolve) => {
    const tryGenerate = async () => {
      attempt++;
      console.log(`📊 League ${leagueId}, Season ${season} (source: ${seasonSource})${attempt > 1 ? ` (attempt ${attempt})` : ''}`);

      const proc = spawn('node', [
        path.join(__dirname, 'update-competition-extras-v2.mjs'),
        '--leagueId', String(leagueId),
        '--season', String(season),
        '--outDir', SNAPSHOTS_DIR,
        '--concurrency', String(concurrency),
      ], {
        cwd: ROOT,
        stdio: 'pipe',
        env: { ...process.env }
      });

      let outputData = '';
      proc.stdout?.on('data', d => outputData += d);
      proc.stderr?.on('data', d => outputData += d);

      const timeoutHandle = setTimeout(() => {
        console.warn(`   ⚠️  Timeout (${timeout}ms), killing process...`);
        proc.kill('SIGTERM');
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        
        if (code === 0) {
          console.log(`   ✅ Success\n`);
          resolve({ success: true, leagueId, season, seasonSource });
        } else if (attempt < maxRetries) {
          console.warn(`   ❌ Error (code ${code}), retrying in 2s...\n`);
          setTimeout(tryGenerate, 2000);
        } else {
          console.warn(`   ❌ Permanent failure (${maxRetries} attempts)\n`);
          resolve({ success: false, leagueId, season, seasonSource, error: code });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        if (attempt < maxRetries) {
          console.warn(`   ❌ Error: ${err.message}, retrying in 2s...\n`);
          setTimeout(tryGenerate, 2000);
        } else {
          console.warn(`   ❌ Permanent failure: ${err.message}\n`);
          resolve({ success: false, leagueId, season, seasonSource, error: err.message });
        }
      });
    };

    tryGenerate();
  });
}

// ============================================================================
// PASSO 4: Gerar todos os snapshots (ligas em série, com concorrência interna)
// ============================================================================
async function generateAllSnapshots(leagues, options = {}) {
  const { maxLeagues, concurrency = 2 } = options;
  const toProcess = maxLeagues ? leagues.slice(0, maxLeagues) : leagues;

  console.log(`⏳ Starting generation for ${toProcess.length} league(s)...\n`);

  const results = [];
  const seasonResolutions = [];

  for (const league of toProcess) {
    try {
      const resolution = await resolveSeasonForLeague({
        leagueId: league.leagueId,
        kickoffUTC: league.kickoffUTC
      });

      seasonResolutions.push({
        leagueId: league.leagueId,
        season: resolution.year,
        reason: resolution.reason,
        coverage: resolution.coverage,
        leagueName: resolution.leagueMeta.name
      });

      const result = await generateSnapshotForLeague(
        league.leagueId,
        resolution.year,
        resolution.reason,
        { maxRetries: 2, timeout: 180000, concurrency }
      );

      results.push(result);
    } catch (error) {
      console.error(`❌ Failed to resolve season for league ${league.leagueId}: ${error.message}\n`);
      results.push({
        success: false,
        leagueId: league.leagueId,
        season: null,
        seasonSource: null,
        error: error.message
      });
    }
  }

  return { results, seasonResolutions };
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  try {
    const config = parseArgs();
    
    console.log(`╔════════════════════════════════════════════════╗`);
    console.log(`║ 📊 PIPELINE PADRÃO v2 - Season via /leagues   ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);

    const calendar = await downloadProductionCalendar();
    const leagues = extractLeaguesWithKickoff(calendar);

    if (leagues.length === 0) {
      console.warn('⚠️  No leagues to process');
      process.exit(0);
    }

    const { results, seasonResolutions } = await generateAllSnapshots(leagues, config);

    console.log(`\n╔════════════════════════════════════════════════╗`);
    console.log(`║ ✅ Generation Summary                          ║`);
    console.log(`╚════════════════════════════════════════════════╝\n`);

    console.log('📊 SEASON RESOLUTIONS:\n');
    seasonResolutions.forEach(sr => {
      console.log(`  [${sr.leagueId}] ${sr.leagueName}`);
      console.log(`      Season: ${sr.season} (reason: ${sr.reason})`);
      console.log(`      Coverage: standings=${sr.coverage.standings}, fixtures=${sr.coverage.fixtures}\n`);
    });

    const successful = results.filter(r => r.success).length;
    const failed = results.length - successful;

    console.log(`Summary: ${successful} successful, ${failed} failed\n`);

    if (failed > 0) {
      console.warn('⚠️  Some generations failed. Check logs above for details.\n');
    }

  } catch (error) {
    console.error('❌ Pipeline error:', error.message);
    process.exit(1);
  }
}

main();
