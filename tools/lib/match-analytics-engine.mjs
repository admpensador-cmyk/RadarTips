/**
 * Match analytics engine (pipeline-only).
 * Normalizes per-fixture analytical fields already produced upstream into
 * match_analytics + match_radar_ui (+ home_page_ui on calendar meta).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFullHomePageUi, HOME_PAGE_UI_SCHEMA } from "./home-page-ui-build.mjs";
import { attachHomeNavRoutesToMatch } from "./home-nav-routes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export { HOME_PAGE_UI_SCHEMA };

export const MATCH_ANALYTICS_SCHEMA = "match_analytics_v1";
export const MATCH_RADAR_UI_SCHEMA = "match_radar_ui_v1";
export const MATCH_RADAR_UI_SCHEMA_V2 = "match_radar_ui_v2";

function riskToConfidenceText(risk) {
  const r = String(risk || "").toLowerCase();
  if (r === "low") return "Standard";
  if (r === "high") return "Elevated";
  if (r === "med" || r === "medium") return "Moderate";
  return "—";
}

function riskToDisplayLabel(risk) {
  const r = String(risk || "").toLowerCase();
  if (r === "low") return "Low";
  if (r === "high") return "High";
  if (r === "med" || r === "medium") return "Medium";
  return "—";
}

function riskToCssClass(risk) {
  const r = String(risk || "").toLowerCase();
  if (r === "low") return "low";
  if (r === "high") return "high";
  return "med";
}

function confidencePercentFromRisk(risk) {
  const r = String(risk || "").toLowerCase();
  if (r === "low") return 78;
  if (r === "high") return 38;
  if (r === "med" || r === "medium") return 52;
  return 55;
}

function confidenceNoteEn(risk, analysis) {
  const a = analysis != null && String(analysis).trim() ? String(analysis).trim() : "";
  if (a) return a;
  const r = String(risk || "").toLowerCase();
  if (r === "low") return "Lower variance read on this matchup shape (pipeline default).";
  if (r === "high") return "Elevated variance — multiple credible game scripts (pipeline default).";
  return "Moderate variance — baseline reads apply (pipeline default).";
}

function goalsPairText(gf, ga) {
  const a = Number(gf);
  const b = Number(ga);
  const xs = Number.isFinite(a) ? String(Math.round(a)) : "0";
  const ys = Number.isFinite(b) ? String(Math.round(b)) : "0";
  return `${xs}/${ys}`;
}

function formTokensFromDetails(details, windowN) {
  const n = Number(windowN || 5);
  if (!Array.isArray(details) || !details.length) {
    return Array.from({ length: n }, () => "n");
  }
  return details.slice(0, n).map((d) => {
    const r = String(d?.result || "D").toUpperCase();
    if (r.startsWith("W")) return "W";
    if (r.startsWith("L")) return "L";
    if (r.startsWith("D")) return "D";
    return "n";
  });
}

/**
 * Build canonical match_analytics from a calendar row (mutates nothing).
 * @param {object} m - calendar_2d match row
 */
export function buildMatchAnalytics(m) {
  if (!m || typeof m !== "object") return null;
  const fixtureId = Number(m.fixture_id);
  return {
    schema: MATCH_ANALYTICS_SCHEMA,
    fixture_id: Number.isFinite(fixtureId) ? fixtureId : null,
    competition_id: Number(m.competition_id) || null,
    season: m.season != null ? Number(m.season) : null,
    pick_suggestion: m.suggestion_free != null ? String(m.suggestion_free) : null,
    risk_level: m.risk != null ? String(m.risk) : null,
    goals_for_home_window: Number.isFinite(Number(m.gf_home)) ? Number(m.gf_home) : null,
    goals_against_home_window: Number.isFinite(Number(m.ga_home)) ? Number(m.ga_home) : null,
    goals_for_away_window: Number.isFinite(Number(m.gf_away)) ? Number(m.gf_away) : null,
    goals_against_away_window: Number.isFinite(Number(m.ga_away)) ? Number(m.ga_away) : null,
    analysis: m.analysis != null ? m.analysis : null,
    analysis_text: m.analysis != null && String(m.analysis).trim() ? String(m.analysis).trim() : null,
  };
}

/**
 * Display-only slice for radar / calendar cards (English source strings).
 */
export function buildMatchRadarUi(m, matchAnalytics, options) {
  const ma = matchAnalytics || buildMatchAnalytics(m);
  const pick = ma?.pick_suggestion != null ? String(ma.pick_suggestion) : "—";
  const risk = ma?.risk_level != null ? String(ma.risk_level) : "—";
  const analysisRaw = ma?.analysis_text != null ? ma.analysis_text : m?.analysis;
  const pct = confidencePercentFromRisk(risk);
  const note = confidenceNoteEn(risk, analysisRaw);
  const band = riskToConfidenceText(risk);
  const meta = m && typeof m === "object" ? m : {};
  const formWindow = options?.form_window != null ? options.form_window : meta.form_window;
  const homeTok = formTokensFromDetails(meta.form_home_details, formWindow);
  const awayTok = formTokensFromDetails(meta.form_away_details, formWindow);
  const gHome = goalsPairText(meta.gf_home, meta.ga_home);
  const gAway = goalsPairText(meta.gf_away, meta.ga_away);

  const market_cards = [
    {
      key: "pick",
      title: "Suggested market (FREE)",
      body: pick,
      footnote: "Source: snapshot suggestion_free; not recomputed in the browser.",
    },
    {
      key: "risk_confidence",
      title: "Risk & confidence band",
      body: `${riskToDisplayLabel(risk)} risk · ${band} · ${pct}% (display index)`,
      footnote: note,
    },
    {
      key: "goals_window",
      title: "Goals window (last fixtures)",
      body: `Home side ${gHome} GF/GA · Away side ${gAway} GF/GA`,
      footnote: "Numbers copied from snapshot; formatting only in UI.",
    },
  ];

  return {
    schema: MATCH_RADAR_UI_SCHEMA_V2,
    pick_label: pick,
    pick_display: pick,
    risk_badge: risk,
    risk_display: riskToDisplayLabel(risk),
    risk_css_class: riskToCssClass(risk),
    confidence_text: band,
    confidence_percent: pct,
    confidence_note: note,
    goals_home_display: gHome,
    goals_away_display: gAway,
    form_home_tokens: homeTok,
    form_away_tokens: awayTok,
    market_cards,
    /** @deprecated v1 mirror */
    v1: {
      schema: MATCH_RADAR_UI_SCHEMA,
      pick_label: pick,
      risk_badge: risk,
      confidence_text: riskToConfidenceText(risk),
    },
  };
}

/** @deprecated use buildFullHomePageUi(calendar) after match enrichment */
export function buildHomePageUi(meta) {
  return {
    schema: HOME_PAGE_UI_SCHEMA,
    generated_at_utc: meta?.generated_at_utc != null ? String(meta.generated_at_utc) : null,
    today: meta?.today != null ? String(meta.today) : null,
    tomorrow: meta?.tomorrow != null ? String(meta.tomorrow) : null,
    leagues_count: Number.isFinite(Number(meta?.leagues_count)) ? Number(meta.leagues_count) : null,
    source: meta?.source != null ? String(meta.source) : "calendar_2d",
    note: "legacy stub — run enrichCalendar2dPayload for full home_page_ui_v2",
  };
}

function enrichMatchRow(m, options) {
  if (!m || typeof m !== "object") return;
  const ma = buildMatchAnalytics(m);
  m.match_analytics = ma;
  m.match_radar_ui = buildMatchRadarUi(m, ma, options);
}

/**
 * Mutates calendar_2d payload: adds match_analytics, match_radar_ui per match; meta.home_page_ui.
 * @param {object} calendar - calendar_2d root object
 */
export function enrichCalendar2dPayload(calendar) {
  if (!calendar || typeof calendar !== "object") return calendar;
  const meta = calendar.meta && typeof calendar.meta === "object" ? calendar.meta : {};
  calendar.meta = { ...meta };
  const formOpts = { form_window: meta.form_window };

  const lists = [calendar.today, calendar.tomorrow, calendar.matches].filter(Array.isArray);
  const seen = new Set();
  for (const list of lists) {
    for (const m of list) {
      const id = Number(m?.fixture_id);
      const key = Number.isFinite(id) ? id : JSON.stringify(m);
      if (seen.has(key)) continue;
      seen.add(key);
      enrichMatchRow(m, formOpts);
      attachHomeNavRoutesToMatch(m, REPO_ROOT);
    }
  }
  calendar.meta.home_page_ui = buildFullHomePageUi(calendar);
  return calendar;
}
