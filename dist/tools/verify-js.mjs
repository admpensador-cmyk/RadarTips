import { execSync } from 'node:child_process';
import fs from 'node:fs';

function check(file) {
  try {
    execSync(`node -c "${file}"`, { stdio: 'inherit' });
    return true;
  } catch {
    console.error(`\n[SYNTAX ERROR] ${file}`);
    process.exit(1);
  }
}

check('assets/js/app.js');
if (fs.existsSync('dist/assets/js/app.js')) check('dist/assets/js/app.js');
check('assets/js/match-radar-v2.js');
