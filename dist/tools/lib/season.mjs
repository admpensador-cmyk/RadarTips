import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_PATH = path.join(ROOT, 'tools', 'snapshots-config.json');

let _configCache = null;

function loadConfig() {
  if (_configCache) return _configCache;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    _configCache = JSON.parse(raw);
  } catch (e) {
    _configCache = { season_rules: { default: { type: 'europe_default' }, overrides: {} } };
  }
  return _configCache;
}

export function normalizeCountry(country, competitionName) {
  const direct = String(country || '').trim();
  if (direct) return direct;

  const comp = String(competitionName || '').toLowerCase();
  if (comp.includes('brazil') || comp.includes('brasil')) return 'Brazil';

  return '';
}

export function getSeasonFromKickoff(kickoffUTC, country, competitionName) {
  if (!kickoffUTC) return null;

  const d = new Date(kickoffUTC);
  if (isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  const config = loadConfig();
  const rules = config?.season_rules || {};
  const overrides = rules?.overrides || {};

  const normalizedCountry = normalizeCountry(country, competitionName);
  const overrideRule = normalizedCountry ? overrides[normalizedCountry] : null;
  const ruleType = (overrideRule && overrideRule.type) || (rules?.default && rules.default.type) || 'europe_default';

  if (ruleType === 'calendar_year') return year;

  // europe_default: season = month >= 7 ? year : year - 1
  if (month >= 7) return year;
  return year - 1;
}
