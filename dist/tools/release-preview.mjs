// tools/release-preview.mjs — Canary/Preview Release
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const dist = path.join(root, 'dist');
const assets = path.join(dist, 'assets');
const manifestPath = path.join(assets, 'manifest.json');
const metaPath = path.join(assets, 'manifest.meta.json');

function runStep(cmd, args, label) {
  console.log('> ' + label);
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('FALHA: ' + label);
    process.exit(1);
  }
}

runStep('node', [path.join('tools', 'build-static.mjs')], 'Build');
runStep('wrangler', ['pages', 'deploy', 'dist', '--project-name', 'radartips', '--branch', 'preview'], 'Deploy Preview');

let manifest, meta;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch {
  console.error('Erro ao ler manifest.json');
  process.exit(1);
}
if (fs.existsSync(metaPath)) {
  try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch {}
}

console.log('PREVIEW RELEASE OK');
if (manifest && manifest["radar-day"]) console.log('radar-day:', manifest["radar-day"]);
if (meta && meta.timestamp) console.log('timestamp:', meta.timestamp);
if (meta && meta.git) console.log('git:', meta.git);
