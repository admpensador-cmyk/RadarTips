/**
 * Pipeline-only: explicit locale-keyed URLs for home / radar-day navigation.
 * Team links only when data/teams/{id}/{season}.json exists AND {lang}/team/index.html exists.
 * League links only for LEAGUE_PAGE_V1_DEFINITIONS slugs.
 */
import fs from "node:fs";
import path from "node:path";

export const HOME_NAV_ROUTES_SCHEMA = "home_nav_routes_v1";

const LANGS = ["en", "pt", "es", "fr", "de"];

/** Keep in sync with tools/lib/league-v1-snapshot.mjs LEAGUE_PAGE_V1_DEFINITIONS (avoid import cycle with match-analytics-engine). */
const LEAGUE_SLUG_BY_ID = new Map([
  [39, "premier-league"],
  [140, "la-liga"],
  [135, "serie-a"],
  [78, "bundesliga"],
  [61, "ligue-1"],
  [71, "brasileirao"],
]);

function leagueSlugForCompetitionId(competitionId) {
  const n = Number(competitionId);
  return Number.isFinite(n) ? LEAGUE_SLUG_BY_ID.get(n) || null : null;
}

function teamPageJsonExists(repoRoot, teamId, season) {
  if (!Number.isFinite(teamId) || !Number.isFinite(season)) return false;
  const p = path.join(repoRoot, "data", "teams", String(teamId), `${season}.json`);
  return fs.existsSync(p);
}

function localeTeamHtmlExists(repoRoot, lang) {
  const p = path.join(repoRoot, String(lang || "").trim(), "team", "index.html");
  return fs.existsSync(p);
}

function teamUrlForLang(repoRoot, lang, teamId, season, competitionId) {
  if (!localeTeamHtmlExists(repoRoot, lang)) return null;
  if (!teamPageJsonExists(repoRoot, teamId, season)) return null;
  const comp = Number(competitionId);
  if (!Number.isFinite(comp)) return null;
  return `/${lang}/team/?team=${encodeURIComponent(String(teamId))}&season=${encodeURIComponent(String(season))}&competition=${encodeURIComponent(String(comp))}`;
}

/**
 * Mutates match row: sets nav_routes or overwrites when repo layout allows published targets.
 * @param {object} m - calendar match row
 * @param {string} repoRoot - repository root (absolute)
 */
export function attachHomeNavRoutesToMatch(m, repoRoot) {
  if (!m || typeof m !== "object" || !repoRoot) return;
  const competitionId = Number(m.competition_id ?? m.league_id);
  const season = m.season != null ? Number(m.season) : NaN;
  const homeId = Number(m.home_id);
  const awayId = Number(m.away_id);

  const league_slug = leagueSlugForCompetitionId(competitionId);

  const league_url_by_lang = {};
  for (const lang of LANGS) {
    league_url_by_lang[lang] = league_slug
      ? `/${lang}/competition/?league=${encodeURIComponent(league_slug)}`
      : null;
  }

  const home_team_url_by_lang = {};
  const away_team_url_by_lang = {};
  for (const lang of LANGS) {
    home_team_url_by_lang[lang] = teamUrlForLang(repoRoot, lang, homeId, season, competitionId);
    away_team_url_by_lang[lang] = teamUrlForLang(repoRoot, lang, awayId, season, competitionId);
  }

  m.nav_routes = {
    schema: HOME_NAV_ROUTES_SCHEMA,
    league_slug,
    league_url_by_lang,
    home_team_url_by_lang,
    away_team_url_by_lang,
  };
}
