/**
 * Pipeline-only: full display-ready home_page_ui for radar-day / dayboard.
 * Mirrors league counts and top picks from calendar_2d + radar_day without browser analytics.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

export const HOME_PAGE_UI_SCHEMA = "home_page_ui_v2";

/** Keep in sync with assets/js/app.js NAV_TOP_LEAGUE_IDS */
const NAV_TOP_LEAGUE_IDS = [39, 140, 78, 135, 71, 61];

const LANGS = ["en", "pt", "es", "fr", "de"];

const COPY_KEYS = [
  "radar_day_title",
  "radar_day_empty",
  "hero_title_day",
  "hero_sub_day",
  "insight_kicker",
  "top3_title",
  "top3_sub",
  "pick_prefix",
  "confidence_label",
  "rank_tooltip",
  "match_radar",
  "suggestion_label",
  "free_badge",
  "kickoff_tooltip",
  "competition_tooltip",
  "country_tooltip",
  "competition_radar",
  "competition_radar_tip",
  "free_tooltip",
  "free_includes",
  "match_radar_tip",
  "suggestion_tooltip",
  "date_label_today",
  "date_label_tomorrow",
  "nav_all_matches",
  "nav_world",
  "nav_internationals",
  "nav_america",
  "nav_europe",
  "nav_asia",
  "nav_africa",
  "nav_oceania",
  "nav_coverage_unavailable",
  "nav_leagues_mode_group",
  "nav_leagues_list_all",
  "nav_leagues_with_matches",
  "cal_country_expand_tip",
  "cal_country_collapse_tip",
  "empty_calendar",
  "slot_curiosity_template",
  "calendar_title",
  "calendar_sub",
  "search_placeholder",
];

function matchKey(m) {
  if (!m || typeof m !== "object") return "";
  return `${m.kickoff_utc}|${m.home}|${m.away}`;
}

function matchCompetitionId(m) {
  const n = Number(m?.competition_id);
  return Number.isFinite(n) ? n : NaN;
}

function localDateKey(isoUtc) {
  try {
    const d = new Date(isoUtc);
    return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return "";
  }
}

function loadCopyBlocks() {
  const p = path.join(REPO_ROOT, "i18n", "strings.json");
  if (!fs.existsSync(p)) {
    return { en: {} };
  }
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  const byLang = {};
  for (const lang of LANGS) {
    const src = j[lang] || {};
    const row = {};
    for (const k of COPY_KEYS) {
      row[k] = src[k] != null ? String(src[k]) : "";
    }
    byLang[lang] = row;
  }
  return byLang;
}

function kickoffDisplayByLang(isoUtc) {
  const out = {};
  for (const lang of LANGS) {
    try {
      out[lang] = new Intl.DateTimeFormat(lang, { hour: "2-digit", minute: "2-digit" }).format(new Date(isoUtc));
    } catch {
      out[lang] = "--:--";
    }
  }
  return out;
}

function fmtDateShortForLang(date, lang) {
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : lang, { day: "2-digit", month: "2-digit" }).format(
      date
    );
  } catch {
    return "--/--";
  }
}

function fmtDateLongForLang(date, lang) {
  try {
    return new Intl.DateTimeFormat(lang, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(
      date
    );
  } catch {
    return "";
  }
}

function mergedMatches(cal) {
  const t = Array.isArray(cal?.today) ? cal.today : [];
  const tm = Array.isArray(cal?.tomorrow) ? cal.tomorrow : [];
  return t.concat(tm);
}

function findEnrichedMatch(cal, rawHighlight) {
  const lists = mergedMatches(cal);
  const id = Number(rawHighlight?.fixture_id);
  if (Number.isFinite(id)) {
    const hit = lists.find((m) => Number(m?.fixture_id) === id);
    if (hit) return hit;
  }
  const k = matchKey(rawHighlight);
  if (k) {
    const hit = lists.find((m) => matchKey(m) === k);
    if (hit) return hit;
  }
  return rawHighlight && typeof rawHighlight === "object" ? rawHighlight : null;
}

function filterMatchesByDate(matches, activeDateKey, todayKey, tomorrowKey) {
  if (activeDateKey === "both") return matches;
  return matches.filter((m) => localDateKey(m.kickoff_utc) === activeDateKey);
}

function buildLeagueCounts(matches, todayKey, tomorrowKey) {
  const byLeague = {};
  for (const m of matches) {
    const id = matchCompetitionId(m);
    if (!Number.isFinite(id)) continue;
    if (!byLeague[id]) byLeague[id] = { today: 0, tomorrow: 0, both: 0 };
    const k = localDateKey(m.kickoff_utc);
    if (k === todayKey) {
      byLeague[id].today++;
      byLeague[id].both++;
    } else if (k === tomorrowKey) {
      byLeague[id].tomorrow++;
      byLeague[id].both++;
    }
  }
  return byLeague;
}

function baseTotalForDate(matches, activeDateKey, todayKey, tomorrowKey) {
  return filterMatchesByDate(matches, activeDateKey, todayKey, tomorrowKey).length;
}

/**
 * @param {object} calendar - calendar_2d after enrichCalendar2dPayload (per-match radar slices present)
 */
export function buildFullHomePageUi(calendar) {
  const meta = calendar?.meta && typeof calendar.meta === "object" ? calendar.meta : {};
  const todayKey = typeof meta.today === "string" ? meta.today : "";
  const tomorrowKey = typeof meta.tomorrow === "string" ? meta.tomorrow : "";
  const matches = mergedMatches(calendar);
  const copy_blocks = loadCopyBlocks();

  const byLeagueId = buildLeagueCounts(matches, todayKey, tomorrowKey);
  const todayTotal = baseTotalForDate(matches, todayKey, todayKey, tomorrowKey);
  const tomorrowTotal = baseTotalForDate(matches, tomorrowKey, todayKey, tomorrowKey);
  const bothTotal = matches.length;

  const tabLabelsByLang = {};
  for (const lang of LANGS) {
    const c = copy_blocks[lang] || {};
    const d0 = todayKey ? fmtDateShortForLang(new Date(`${todayKey}T12:00:00Z`), lang) : "";
    const d1 = tomorrowKey ? fmtDateShortForLang(new Date(`${tomorrowKey}T12:00:00Z`), lang) : "";
    tabLabelsByLang[lang] = {
      today_tab: `${c.date_label_today || "Today"} ${d0} (${todayTotal})`.trim(),
      tomorrow_tab: `${c.date_label_tomorrow || "Tomorrow"} ${d1} (${tomorrowTotal})`.trim(),
      date_tip_today: todayKey ? fmtDateLongForLang(new Date(`${todayKey}T12:00:00Z`), lang) : "",
      date_tip_tomorrow: tomorrowKey ? fmtDateLongForLang(new Date(`${tomorrowKey}T12:00:00Z`), lang) : "",
    };
  }

  const rd = calendar?.radar_day && typeof calendar.radar_day === "object" ? calendar.radar_day : {};
  const highlights = Array.isArray(rd.highlights) ? rd.highlights : [];
  const top_picks = highlights.slice(0, 3).map((h, idx) => {
    const m = findEnrichedMatch(calendar, h);
    if (!m) return null;
    const ui = m.match_radar_ui && typeof m.match_radar_ui === "object" ? m.match_radar_ui : {};
    const comp = m.competition != null ? String(m.competition) : "";
    const curiosity_by_lang = {};
    for (const lang of LANGS) {
      const tpl = (copy_blocks[lang] && copy_blocks[lang].slot_curiosity_template) || "";
      curiosity_by_lang[lang] = tpl.replace(/\{\{comp\}\}/g, comp);
    }
    return {
      rank: idx + 1,
      match_key: matchKey(m),
      fixture_id: Number.isFinite(Number(m.fixture_id)) ? Number(m.fixture_id) : null,
      home: m.home != null ? String(m.home) : "",
      away: m.away != null ? String(m.away) : "",
      home_id: m.home_id,
      away_id: m.away_id,
      nav_routes: m.nav_routes && typeof m.nav_routes === "object" ? m.nav_routes : null,
      competition: comp,
      country: m.country != null ? String(m.country) : "",
      kickoff_utc: m.kickoff_utc != null ? String(m.kickoff_utc) : "",
      kickoff_display_by_lang: kickoffDisplayByLang(m.kickoff_utc),
      pick_display: ui.pick_display != null ? String(ui.pick_display) : String(m.suggestion_free || "—"),
      confidence_percent:
        ui.confidence_percent != null && Number.isFinite(Number(ui.confidence_percent))
          ? Math.round(Number(ui.confidence_percent))
          : null,
      confidence_note: ui.confidence_note != null ? String(ui.confidence_note) : "",
      risk_display: ui.risk_display != null ? String(ui.risk_display) : "",
      risk_css_class: ui.risk_css_class != null ? String(ui.risk_css_class) : "med",
      curiosity_line_by_lang: curiosity_by_lang,
    };
  }).filter(Boolean);

  const match_refs = {};
  for (const m of matches) {
    const k = matchKey(m);
    if (k) match_refs[k] = m;
  }

  const kpi_strip = {
    today_key: todayKey,
    tomorrow_key: tomorrowKey,
    counts: {
      today: todayTotal,
      tomorrow: tomorrowTotal,
      both: bothTotal,
    },
    tab_labels_by_lang: tabLabelsByLang,
  };

  const headlines_by_lang = {};
  for (const lang of LANGS) {
    const c = copy_blocks[lang] || {};
    headlines_by_lang[lang] = {
      radar_day_title: c.radar_day_title || "",
      radar_day_empty: c.radar_day_empty || "",
      hero_title_day: c.hero_title_day || "",
      hero_sub_day: c.hero_sub_day || "",
      top3_title: c.top3_title || "",
      top3_sub: c.top3_sub || "",
      calendar_title: c.calendar_title || "",
      calendar_sub: c.calendar_sub || "",
      search_placeholder: c.search_placeholder || "",
    };
  }

  const section_cards_by_lang = {};
  for (const lang of LANGS) {
    const c = copy_blocks[lang] || {};
    section_cards_by_lang[lang] = [
      {
        id: "calendar_head",
        title: c.calendar_title || "",
        sub: c.calendar_sub || "",
      },
    ];
  }

  const secondary_cards = [
    {
      id: "readout",
      title_key: "insight_kicker",
      body_template_key: "free_includes",
    },
  ];

  const league_groups = {
    schema: "league_groups_v1",
    top_league_ids: [...NAV_TOP_LEAGUE_IDS],
    by_league_id: byLeagueId,
    today_key: todayKey,
    tomorrow_key: tomorrowKey,
  };

  const secondary_cards_resolved = secondary_cards.map((card) => {
    const out = { ...card };
    if (card.title_key || card.body_template_key) {
      out.by_lang = {};
      for (const lang of LANGS) {
        const c = copy_blocks[lang] || {};
        out.by_lang[lang] = {
          title: card.title_key ? c[card.title_key] || "" : "",
          body: card.body_template_key ? c[card.body_template_key] || "" : "",
        };
      }
    }
    return out;
  });

  return {
    schema: HOME_PAGE_UI_SCHEMA,
    generated_at_utc: meta.generated_at_utc != null ? String(meta.generated_at_utc) : null,
    source: meta.source != null ? String(meta.source) : "calendar_2d",
    headlines_by_lang,
    kpi_strip,
    top_picks,
    secondary_cards: secondary_cards_resolved,
    section_cards_by_lang,
    league_groups,
    match_refs,
    copy_blocks,
    counts: {
      today_key: todayKey,
      tomorrow_key: tomorrowKey,
      base_by_date: {
        [todayKey]: todayTotal,
        [tomorrowKey]: tomorrowTotal,
        both: bothTotal,
      },
      by_league_id: byLeagueId,
    },
  };
}
