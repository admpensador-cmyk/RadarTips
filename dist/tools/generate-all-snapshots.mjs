#!/usr/bin/env node
/**
 * PIPELINE PADRÃO - Gera standings + stats para TODAS as ligas
 * 
 * Fluxo:
 * 1. Baixa calendario da produção
 * 2. Extrai todos os league/season pairs únicos
 * 3. Para cada par, gera standings + compstats com retry automático
 * 4. Trata erros: timeout, API instável, dados inconsistentes
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
import { getSeasonFromKickoff, normalizeCountry } from './lib/season.mjs';

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

  if (!invocation.command) {
    throw new Error('Wrangler command resolution failed: empty command');
  }

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
// PASSO 2: Extrair league/season pairs ÚNICOS
// ============================================================================
function extractLeaguePairs(calendar) {
  if (!calendar?.matches || !Array.isArray(calendar.matches)) {
    console.warn('⚠️  Nenhum match encontrado no calendario\n');
    return [];
  }

  const pairs = new Map();
  
  calendar.matches.forEach(match => {
    const leagueId = match.competition_id || match.league_id || match.leagueId;
    const season = getSeasonFromKickoff(match.kickoff_utc, match.country, match.competition);
    if (!leagueId || !Number.isFinite(season)) return;
    const normalizedCountry = normalizeCountry(match.country, match.competition);
    
    const key = `${leagueId}|${season}`;
    if (!pairs.has(key)) {
      pairs.set(key, {
        leagueId,
        season,
        competition: match.competition || 'Unknown',
        country: normalizedCountry || match.country || 'Unknown'
      });
    }
  });

  const list = Array.from(pairs.values());
  console.log(`✅ Extraídos ${list.length} league/season pairs:\n`);
  list.forEach(p => {
    console.log(`   [${p.leagueId}] ${p.competition} (${p.country}) - Season ${p.season}`);
  });
  console.log('');
  
  return list;
}

// ============================================================================
// PASSO 3: Gerar standings + stats com RETRY automático
// ============================================================================
function generateSnapshotForLeague(leagueId, season, options = {}) {
  const { maxRetries = 2, timeout = 180000, concurrency = 2 } = options;
  let attempt = 0;

  return new Promise((resolve) => {
    const tryGenerate = async () => {
      attempt++;
      console.log(`📊 League ${leagueId}, Season ${season}${attempt > 1 ? ` (tentativa ${attempt})` : ''}`);

      const proc = spawn('node', [
        path.join(__dirname, 'update-competition-extras.mjs'),
        '--leagueId', String(leagueId),
        '--season', String(season),
        '--outDir', SNAPSHOTS_DIR,
        '--concurrency', String(concurrency),
      ], {
        cwd: ROOT,
        stdio: 'pipe', // Captura output
        env: { ...process.env }
      });

      let outputData = '';
      proc.stdout?.on('data', d => outputData += d);
      proc.stderr?.on('data', d => outputData += d);

      // Timeout de segurança
      const timeoutHandle = setTimeout(() => {
        console.warn(`   ⚠️  Timeout (${timeout}ms), matando processo...`);
        proc.kill('SIGTERM');
      }, timeout);

      proc.on('close', (code) => {
        clearTimeout(timeoutHandle);
        
        if (code === 0) {
          console.log(`   ✅ Sucesso\n`);
          resolve({ success: true, leagueId, season });
        } else if (attempt < maxRetries) {
          console.warn(`   ❌ Erro (código ${code}), retrying em 2s...\n`);
          setTimeout(tryGenerate, 2000);
        } else {
          console.warn(`   ❌ Falha permanente (${maxRetries} tentativas)\n`);
          resolve({ success: false, leagueId, season, error: code });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutHandle);
        if (attempt < maxRetries) {
          console.warn(`   ❌ Erro: ${err.message}, retrying em 2s...\n`);
          setTimeout(tryGenerate, 2000);
        } else {
          console.warn(`   ❌ Falha permanente: ${err.message}\n`);
          resolve({ success: false, leagueId, season, error: err.message });
        }
      });
    };

    tryGenerate();
  });
}

// ============================================================================
// PASSO 4: Fazer upload para R2 (com verificação)
// ============================================================================
async function uploadToR2(filePath, remoteKey) {
  const fileName = path.basename(filePath);
  const args = [
    'r2', 'object', 'put',
    `${R2_BUCKET}/${remoteKey}`,
    '--file', filePath,
    '--remote'
  ];
  const invocation = getWranglerInvocation(args);

  console.log(`   📤 Uploading: ${fileName}`);
  console.log(`      Remote key: ${remoteKey}`);
  console.log(`      Command: ${invocation.command} ${invocation.args.join(' ')}`);

  try {
    await runWrangler(args, { cwd: ROOT });
    console.log(`   ✅ R2: ${fileName}`);
    return true;
  } catch (err) {
    console.warn(`   ⚠️  R2 upload failed: ${fileName}`);
    console.warn(`      ${err.message}`);
    return false;
  }
}

// ============================================================================
// PASSO 5: Verificar quais arquivos foram gerados e fazer upload
// ============================================================================
async function uploadGeneratedFiles(leagueId, season) {
  const standingsFile = path.join(SNAPSHOTS_DIR, `standings_${leagueId}_${season}.json`);
  const compstatsFile = path.join(SNAPSHOTS_DIR, `compstats_${leagueId}_${season}.json`);
  
  let uploadCount = 0;
  
  if (fs.existsSync(standingsFile)) {
    const uploaded = await uploadToR2(standingsFile, `v1/standings_${leagueId}_${season}.json`);
    if (uploaded) uploadCount++;
  }
  
  if (fs.existsSync(compstatsFile)) {
    const uploaded = await uploadToR2(compstatsFile, `v1/compstats_${leagueId}_${season}.json`);
    if (uploaded) uploadCount++;
  }
  
  return uploadCount;
}

// ============================================================================
// PASSO 6: Gerar manifest e fazer upload
// ============================================================================
async function buildManifest() {
  return new Promise((resolve) => {
    const proc = spawn('node', [
      path.join(__dirname, 'build-manifest.mjs')
    ], {
      cwd: ROOT,
      stdio: 'pipe'
    });

    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================
async function main() {
  console.log(`
╔════════════════════════════════════════════════╗
║   📊 PIPELINE PADRÃO - Generate All Snapshots  ║
╚════════════════════════════════════════════════╝
`);

  try {
    const cli = parseArgs();
    // PASSO 1: Baixar calendario
    const calendar = await downloadProductionCalendar();
    console.log(`📅 Encontrados ${calendar.matches?.length || 0} matches\n`);

    // PASSO 2: Extrair pairs
    let leaguePairs = extractLeaguePairs(calendar);
    if (leaguePairs.length === 0) {
      console.warn('❌ Nenhuma liga encontrada. Abortando.\n');
      process.exit(1);
    }

    if (cli.maxLeagues && leaguePairs.length > cli.maxLeagues) {
      leaguePairs = leaguePairs.slice(0, cli.maxLeagues);
      console.log(`🔎 Limitando execução para ${leaguePairs.length} ligas (maxLeagues=${cli.maxLeagues})\n`);
    }

    // PASSO 3: Gerar snapshots com retry
    console.log(`⏳ Iniciando geração de ${leaguePairs.length} ligas...\n`);
    
    let successCount = 0;
    let uploadCount = 0;
    
    for (const pair of leaguePairs) {
      const result = await generateSnapshotForLeague(pair.leagueId, pair.season, {
        concurrency: cli.concurrency,
      });
      
      if (result.success) {
        successCount++;
        
        // PASSO 4: Upload automático
        console.log(`   Fazendo upload para R2...`);
        const uploaded = await uploadGeneratedFiles(pair.leagueId, pair.season);
        uploadCount += uploaded;
      }
    }

    // PASSO 6: Gerar manifest e upload
    console.log('🧾 Gerando manifest de snapshots...');
    const manifestBuilt = await buildManifest();
    let manifestUploaded = false;
    if (manifestBuilt) {
      const manifestPath = path.join(SNAPSHOTS_DIR, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        manifestUploaded = await uploadToR2(manifestPath, 'v1/manifest.json');
      }
    }

    // RESUMO FINAL
    console.log(`
╔════════════════════════════════════════════════╗
║              📊 RESUMO FINAL                    ║
╚════════════════════════════════════════════════╝

✅ Gerado com sucesso: ${successCount}/${leaguePairs.length}
📤 Arquivos enviados para R2: ${uploadCount}
🧾 Manifest: ${manifestBuilt ? 'gerado' : 'falhou'} / ${manifestUploaded ? 'enviado' : 'não enviado'}

Próximas etapas:
1. Limpar cache do navegador (Ctrl+Shift+Delete)
2. Testar em modo anônimo: https://radartips.com/es/radar/day/
3. Verificar cada liga: Classificación + Estadísticas

Notas:
- Se alguma liga falhar > 2x, verifique:
  * Compatibilidade de season (europeu vs sul-americano)
  * Grupos/divisões múltiplas no país
  * API-Football timeout (aguarde ou aumente timeout)
`);

  } catch (err) {
    console.error('\n❌ Erro fatal:', err.message);
    process.exit(1);
  }
}

main();
