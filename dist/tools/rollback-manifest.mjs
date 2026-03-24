// tools/rollback-manifest.mjs — Rollback instantâneo do manifest
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dist = path.resolve('dist');
const assets = path.join(dist, 'assets');
const manifestPrev = path.join(assets, 'manifest.prev.json');
const manifest = path.join(assets, 'manifest.json');

if (!fs.existsSync(manifestPrev)) {
  console.error('manifest.prev.json não encontrado. Rollback impossível.');
  process.exit(1);
}
fs.copyFileSync(manifestPrev, manifest);
console.log('Manifest rollback realizado.');

const wrangler = spawnSync('wrangler', ['pages', 'deploy', 'dist', '--project-name', 'radartips', '--branch', 'main'], { stdio: 'inherit' });
if (wrangler.status !== 0) {
  console.error('Deploy falhou após rollback.');
  process.exit(1);
}
console.log('Deploy realizado com manifest rollback.');
