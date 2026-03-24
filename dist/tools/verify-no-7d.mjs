#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const failures = [];

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf8');
}

function walkFiles(startDir) {
  const out = [];
  if (!fs.existsSync(startDir)) return out;
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(abs));
    } else {
      out.push(abs);
    }
  }
  return out;
}

function pushFailure(msg) {
  failures.push(msg);
}

function findLineMatches(content, needle, allowLineFn = null) {
  const lines = String(content || '').split(/\r?\n/);
  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(needle)) continue;
    if (allowLineFn && allowLineFn(line)) continue;
    matches.push({ lineNumber: i + 1, line });
  }
  return matches;
}

function verifyNoDistCalendar7d() {
  const distDataDir = path.join(ROOT, 'dist', 'data');
  const files = walkFiles(distDataDir);
  const offenders = files.filter((filePath) => path.basename(filePath).toLowerCase() === 'calendar_7d.json');
  for (const filePath of offenders) {
    const rel = toPosix(path.relative(ROOT, filePath));
    pushFailure(`[NO_7D] Forbidden file found in dist/data: ${rel}`);
  }
}

function verifyNoCalendar7dReferenceInAppAndWorker() {
  const targetFiles = [
    path.join(ROOT, 'assets', 'js', 'app.js'),
    path.join(ROOT, 'workers', 'radartips-api', 'src', 'index.js'),
    path.join(ROOT, 'dist', 'assets', 'js', 'app.js'),
    path.join(ROOT, 'dist', 'workers', 'radartips-api', 'src', 'index.js')
  ];

  for (const filePath of targetFiles) {
    const content = readIfExists(filePath);
    if (content == null) continue;
    const rel = toPosix(path.relative(ROOT, filePath));

    const allowWorkerLegacy410 = rel.endsWith('workers/radartips-api/src/index.js') || rel.endsWith('dist/workers/radartips-api/src/index.js');
    const matches = findLineMatches(content, 'calendar_7d', (line) => {
      if (!allowWorkerLegacy410) return false;
      const trimmed = line.trim();
      return trimmed.includes('"/v1/calendar_7d"') || trimmed.includes('"calendar_7d_deprecated"');
    });

    for (const match of matches) {
      pushFailure(`[NO_7D] Forbidden reference in ${rel}:${match.lineNumber} -> ${match.line.trim()}`);
    }
  }
}

function verifyNoCalendar7dUpload() {
  const scanRoots = [
    path.join(ROOT, '.github', 'workflows'),
    path.join(ROOT, 'tools'),
    path.join(ROOT, 'workers'),
    ROOT
  ];

  const includeExt = new Set(['.yml', '.yaml', '.mjs', '.js', '.sh']);
  const seen = new Set();
  const files = [];

  for (const scanRoot of scanRoots) {
    if (!fs.existsSync(scanRoot)) continue;
    for (const filePath of walkFiles(scanRoot)) {
      const rel = toPosix(path.relative(ROOT, filePath));
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (rel.startsWith('dist/')) continue;
      if (rel.startsWith('node_modules/')) continue;
      if (rel.startsWith('.git/')) continue;
      if (rel.startsWith('docs/')) continue;
      if (rel.endsWith('.md') || rel.endsWith('.txt')) continue;
      const ext = path.extname(filePath).toLowerCase();
      if (!includeExt.has(ext)) continue;
      files.push(filePath);
    }
  }

  const uploadHint = /(wrangler|r2\s+object\s+(put|upload)|\bupload\b|\bput\b)/i;

  for (const filePath of files) {
    const content = readIfExists(filePath);
    if (!content) continue;
    const rel = toPosix(path.relative(ROOT, filePath));
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/calendar_7d/i.test(line)) continue;
      if (!uploadHint.test(line)) continue;
      if (/BLOCKED_7D/i.test(line)) continue;
      pushFailure(`[NO_7D] Forbidden upload signal in ${rel}:${i + 1} -> ${line.trim()}`);
    }
  }
}

verifyNoDistCalendar7d();
verifyNoCalendar7dReferenceInAppAndWorker();
verifyNoCalendar7dUpload();

if (failures.length > 0) {
  console.error('\n❌ verify:no-7d FAILED\n');
  for (const msg of failures) console.error(msg);
  process.exit(1);
}

console.log('✅ verify:no-7d passed');
