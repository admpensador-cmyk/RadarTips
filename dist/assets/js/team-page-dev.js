/**
 * Team Page — Identity, Profile engine, four-section stats stack, match events.
 * UI chrome: meta[name="radartips-team-env"] development|production; localhost defaults to development.
 */
(function () {
  const root = document.getElementById("team_public_root") || document.getElementById("team_dev_root");
  if (!root) return;

  function teamPageEnv() {
    const m = document.querySelector('meta[name="radartips-team-env"]');
    const raw = String(m?.getAttribute("content") || "").trim().toLowerCase();
    if (raw === "production") return "production";
    if (raw === "development") return "development";
    const h = location.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h.endsWith(".local")) return "development";
    return "production";
  }

  const TEAM_PAGE_ENV = teamPageEnv();
  const showDevTeamChrome = TEAM_PAGE_ENV === "development";
  const PAGE_LANG = String(window.RT_LOCALE || root.dataset.locale || "en").trim().toLowerCase() || "en";

  function qsVal(name) {
    const params = new URLSearchParams(location.search);
    const raw = params.get(name);
    return raw == null ? "" : String(raw).trim();
  }

  function canonicalTeamUrl(lang, teamId, season, competitionId) {
    const L = ["en", "pt", "es", "fr", "de"].includes(lang) ? lang : "en";
    const q = new URLSearchParams();
    if (teamId) q.set("team", String(teamId));
    if (season) q.set("season", String(season));
    if (competitionId) q.set("competition", String(competitionId));
    const query = q.toString();
    return `https://radartips.com/${L}/team/${query ? `?${query}` : ""}`;
  }

  function setOrCreateMetaByName(name, content) {
    if (!name) return;
    let el = document.querySelector(`meta[name="${name}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", name);
      document.head.appendChild(el);
    }
    el.setAttribute("content", String(content || ""));
  }

  function setOrCreateMetaByProperty(property, content) {
    if (!property) return;
    let el = document.querySelector(`meta[property="${property}"]`);
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("property", property);
      document.head.appendChild(el);
    }
    el.setAttribute("content", String(content || ""));
  }

  function setCanonicalAndAlternates(teamId, season, competitionId) {
    const langs = ["en", "pt", "es", "fr", "de"];
    const canonHref = canonicalTeamUrl(PAGE_LANG, teamId, season, competitionId);
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", canonHref);

    const existing = Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'));
    existing.forEach((el) => el.remove());
    for (const L of langs) {
      const alt = document.createElement("link");
      alt.setAttribute("rel", "alternate");
      alt.setAttribute("hreflang", L);
      alt.setAttribute("href", canonicalTeamUrl(L, teamId, season, competitionId));
      document.head.appendChild(alt);
    }
    const xdef = document.createElement("link");
    xdef.setAttribute("rel", "alternate");
    xdef.setAttribute("hreflang", "x-default");
    xdef.setAttribute("href", canonicalTeamUrl("en", teamId, season, competitionId));
    document.head.appendChild(xdef);
  }

  function applySeo(team, competitionName, season, competitionId) {
    const teamName = String(team?.name || "").trim() || "Team";
    const comp = String(competitionName || "").trim() || "Competition";
    const seasonText = String(season || "").trim() || "season";
    const country = String(team?.country || "").trim();
    const countrySeg = country ? `${country} · ` : "";
    const title = `${teamName} ${seasonText} · ${comp} | RadarTips`;
    const desc = `${teamName} ${seasonText} in ${comp}. ${countrySeg}Team profile, form context, goals, discipline and match-level snapshot stats on RadarTips.`;
    const canonHref = canonicalTeamUrl(PAGE_LANG, qsVal("team") || team?.team_id || "", season, competitionId);

    document.title = title;
    setOrCreateMetaByName("description", desc);
    setOrCreateMetaByName("robots", "index, follow");
    setOrCreateMetaByProperty("og:type", "website");
    setOrCreateMetaByProperty("og:title", title);
    setOrCreateMetaByProperty("og:description", desc);
    setOrCreateMetaByProperty("og:url", canonHref);
    setOrCreateMetaByProperty("og:site_name", "RadarTips");
    setOrCreateMetaByName("twitter:card", "summary_large_image");
    setOrCreateMetaByName("twitter:title", title);
    setOrCreateMetaByName("twitter:description", desc);
    setCanonicalAndAlternates(qsVal("team") || team?.team_id || "", season, competitionId);

    const oldLd = document.getElementById("rt-team-jsonld");
    if (oldLd) oldLd.remove();
    const ld = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "SportsTeam",
          name: teamName,
          sport: "Association football",
          homeLocation: country || undefined,
          url: canonHref,
        },
        {
          "@type": "SportsOrganization",
          name: comp,
          sport: "Association football",
          url: canonicalTeamUrl(PAGE_LANG, "", "", competitionId || ""),
        },
      ],
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "rt-team-jsonld";
    script.textContent = JSON.stringify(ld);
    document.head.appendChild(script);
  }

  function isTestCompetitionEntry(c) {
    if (!c || typeof c !== "object") return true;
    if (c.is_test === true) return true;
    const name = String(c.competition_name || "");
    if (/\b(sample|mock)\b|test\s*only/i.test(name)) return true;
    return false;
  }

  const DEFAULT_TEAM = root.dataset.defaultTeam || "33";
  const DEFAULT_SEASON = root.dataset.defaultSeason || "2025";

  /** competition_id → static league JSON slug (pipeline `team_page_ui_by_team_id`). */
  const LEAGUE_TEAM_PAGE_UI_SLUG = {
    71: "brasileirao",
  };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fmtPct(rate) {
    if (rate == null || Number.isNaN(rate)) return "—";
    const n = rate <= 1 ? rate * 100 : rate;
    return `${Math.round(n)}%`;
  }

  function fmtNum(v, digits) {
    if (v == null || Number.isNaN(v)) return "—";
    if (typeof digits === "number") return Number(v).toFixed(digits);
    return String(v);
  }

  /** Per-match averages: 1 decimal by default on the Stats page. */
  function fmtAvg1(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toFixed(1);
  }

  /** Analytical ratios (e.g. goals per shot): max 2 decimals. */
  function fmtRatio2(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toFixed(2);
  }

  /** Snapshot `discipline.rates` percentages are already 0–100. */
  function fmtDiscPct(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    const n = Number(v);
    const t = Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(1);
    return `${t}%`;
  }

  function fmtDiscPerGame(v, digits) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toFixed(digits ?? 1);
  }

  function fmtDiscInt(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return String(Math.round(Number(v)));
  }

  /** Bar width from snapshot rate only — no derived match counts (rate × matches) in browser. */
  function pctDisplayParts(rate, matches) {
    const p = fmtPct(rate);
    if (p === "—") return { pct: "—", sub: "", barPct: null };
    const raw = rate <= 1 ? rate * 100 : Number(rate);
    const barPct = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : null;
    return { pct: p, sub: "", barPct };
  }

  function metricPctBar(barPct) {
    if (barPct == null || Number.isNaN(barPct)) return "";
    const w = Math.round(barPct * 10) / 10;
    return `<div class="rt-team-events-track" aria-hidden="true"><span class="rt-team-events-fill" style="width:${w}%"></span></div>`;
  }

  function eventMetric(label, rate, matches) {
    const parts = pctDisplayParts(rate, matches);
    return `<div class="rt-team-events-metric">
      <span class="rt-team-events-k">${esc(label)}</span>
      <span class="rt-team-events-pct">${esc(parts.pct)}</span>
      ${metricPctBar(parts.barPct)}
      ${parts.sub ? `<span class="rt-team-events-sub">${esc(parts.sub)}</span>` : ""}
    </div>`;
  }

  async function loadJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("load failed");
    return r.json();
  }

  function flagUrl(countryCode) {
    const c = String(countryCode || "").toLowerCase();
    if (!c) return "";
    return `/assets/flags/countries/${c}.svg`;
  }

  function primaryCompetition(compPlayed) {
    if (!compPlayed?.length) return null;
    const p = compPlayed.find((x) => x.is_primary_context);
    return p || compPlayed[0];
  }

  function rateToPct(rate) {
    if (rate == null || !Number.isFinite(Number(rate))) return null;
    const r = Number(rate);
    return r <= 1 ? r * 100 : r;
  }

  function renderIdentity(team) {
    const flagSrc = flagUrl(team.country_code);
    const countryName = team.country != null && team.country !== "" ? String(team.country) : "";

    const cells = [];

    if (countryName || flagSrc) {
      const flagEl = flagSrc
        ? `<img class="rt-team-dev-identity-country-flag rt-team-flag" src="${esc(flagSrc)}" alt="" width="22" height="16" decoding="async"/>`
        : "";
      const nameEl = countryName ? `<span class="rt-team-dev-identity-country-name">${esc(countryName)}</span>` : "";
      const line = `<div class="rt-team-dev-identity-country-line">${flagEl}${nameEl}</div>`;
      cells.push(
        `<div class="rt-team-dev-identity-cell rt-team-dev-identity-cell--country"><span class="rt-team-dev-identity-k">Country</span><div class="rt-team-dev-identity-v">${line}</div></div>`
      );
    }

    const plainRows = [
      ["Founded", team.founded],
      ["City", team.city],
      ["Stadium", team.stadium],
    ].filter(([, v]) => v != null && v !== "");
    plainRows.forEach(([k, v]) => {
      cells.push(
        `<div class="rt-team-dev-identity-cell"><span class="rt-team-dev-identity-k">${esc(k)}</span><span class="rt-team-dev-identity-v">${esc(String(v))}</span></div>`
      );
    });

    if (!cells.length) {
      return `<section class="rt-team-dev-identity" aria-label="Identity">
      <h2 class="rt-team-dev-identity-title">Identity</h2>
      <p class="rt-team-muted rt-team-dev-identity-empty">No identity fields in this dataset.</p>
    </section>`;
    }

    return `<section class="rt-team-dev-identity" aria-label="Identity">
      <h2 class="rt-team-dev-identity-title">Identity</h2>
      <div class="rt-team-dev-identity-grid">${cells.join("")}</div>
    </section>`;
  }

  function pillarCell(label, main, sub) {
    if (main == null && sub == null) return "";
    const m = main != null && main !== "" ? esc(String(main)) : "—";
    return `<div class="rt-team-pillar-cell">
      <span class="rt-team-pillar-k">${esc(label)}</span>
      <span class="rt-team-pillar-v">${m}</span>
      ${sub ? `<span class="rt-team-pillar-sub">${esc(sub)}</span>` : ""}
    </div>`;
  }

  function pillarSection(title, inner) {
    const t = inner && inner.replace(/\s/g, "") ? inner : "";
    if (!t) return "";
    return `<section class="rt-team-pillar-sec" aria-label="${esc(title)}">
      <h3 class="rt-team-pillar-h">${esc(title)}</h3>
      <div class="rt-team-pillar-grid">${t}</div>
    </section>`;
  }

  /** One stats section: title + theme tag + grid. */
  function statsSectionBlock(title, themeTag, innerHtml) {
    const t = innerHtml && innerHtml.replace(/\s/g, "") ? innerHtml : "";
    if (!t) return "";
    const tag = themeTag ? `<span class="rt-team-stats-sec-theme">${esc(themeTag)}</span>` : "";
    return `<section class="rt-team-stats-sec" aria-label="${esc(title)}">
      <header class="rt-team-stats-sec-head">
        <h3 class="rt-team-stats-sec-title">${esc(title)}</h3>
        ${tag}
      </header>
      <div class="rt-team-stats-sec-grid">${t}</div>
    </section>`;
  }

  /** Full-width subheading inside .rt-team-stats-sec-grid (does not break outer layout). */
  function statsSubrowHeading(label) {
    return `<h4 class="rt-team-stats-subrow-h">${esc(label)}</h4>`;
  }

  function splitPoints(split) {
    const w = Number(split?.wins) || 0;
    const d = Number(split?.draws) || 0;
    return w * 3 + d;
  }

  /**
   * Discipline: preview snapshot row and/or trend fouls/cards (no API calls).
   * Order: team card totals → per-match → threshold pcts (+ counts as sub) → fouls when trends exist.
   */
  function renderDisciplineInner(discipline, sc, t, previewUiLabels) {
    const tr = t && typeof t === "object" ? t : {};
    const cardsOn = sc && sc.cards;
    const preview = discipline && typeof discipline === "object";

    function foulsAndRatioPillars(yellowPgForRatio, redPgForRatio) {
      const parts = [];
      if (!cardsOn) return parts;
      if (tr.fouls_committed_pg != null && Number.isFinite(Number(tr.fouls_committed_pg))) {
        parts.push(pillarCell("Team fouls committed / match", fmtAvg1(tr.fouls_committed_pg), ""));
      }
      if (tr.fouls_drawn_pg != null && Number.isFinite(Number(tr.fouls_drawn_pg))) {
        parts.push(pillarCell("Team fouls suffered / match", fmtAvg1(tr.fouls_drawn_pg), ""));
      }
      const fpg = Number(tr.fouls_committed_pg);
      if (Number.isFinite(fpg) && fpg > 0) {
        if (yellowPgForRatio != null && Number.isFinite(Number(yellowPgForRatio))) {
          parts.push(
            pillarCell("Team yellow cards per foul", fmtRatio2(Number(yellowPgForRatio) / fpg), "")
          );
        }
        if (redPgForRatio != null && Number.isFinite(Number(redPgForRatio))) {
          parts.push(pillarCell("Team red cards per foul", fmtRatio2(Number(redPgForRatio) / fpg), ""));
        }
      }
      return parts;
    }

    if (preview) {
      const ttot = discipline.totals && typeof discipline.totals === "object" ? discipline.totals : {};
      const c = discipline.counts && typeof discipline.counts === "object" ? discipline.counts : {};
      const r = discipline.rates && typeof discipline.rates === "object" ? discipline.rates : {};
      const sp = discipline.splits && typeof discipline.splits === "object" ? discipline.splits : {};
      const mDisc = c.matches;

      const noteSub =
        mDisc != null && Number.isFinite(Number(mDisc))
          ? previewUiLabels === false
            ? `${fmtDiscInt(mDisc)} matches`
            : `Preview sample · ${fmtDiscInt(mDisc)} matches`
          : "";

      const mainPillars = [
        pillarCell("Team yellow cards (total)", fmtDiscInt(ttot.yellow_cards), ""),
        pillarCell("Team red cards (total)", fmtDiscInt(ttot.red_cards), ""),
        pillarCell("Team yellow cards / match", fmtDiscPerGame(r.yellow_cards_per_game, 1), ""),
        pillarCell("Team red cards / match", fmtDiscPerGame(r.red_cards_per_game, 1), ""),
        pillarCell(
          "Team matches with 1+ yellow",
          fmtDiscPct(r.matches_with_1plus_yellow_pct),
          c.matches_with_1plus_yellow_count != null && mDisc != null
            ? `${fmtDiscInt(c.matches_with_1plus_yellow_count)} / ${fmtDiscInt(mDisc)} matches`
            : ""
        ),
        pillarCell(
          "Team matches with 2+ yellows",
          fmtDiscPct(r.matches_with_2plus_yellows_pct),
          c.matches_with_2plus_yellows_count != null && mDisc != null
            ? `${fmtDiscInt(c.matches_with_2plus_yellows_count)} / ${fmtDiscInt(mDisc)} matches`
            : ""
        ),
        pillarCell(
          "Team matches with a red",
          fmtDiscPct(r.matches_with_red_pct),
          c.matches_with_red_count != null && mDisc != null
            ? `${fmtDiscInt(c.matches_with_red_count)} / ${fmtDiscInt(mDisc)} matches`
            : ""
        ),
        ...foulsAndRatioPillars(r.yellow_cards_per_game, r.red_cards_per_game),
      ].join("");

      function splitBand(label, block) {
        if (!block || typeof block !== "object") return "";
        const bt = block.totals && typeof block.totals === "object" ? block.totals : {};
        const bcObj = block.counts && typeof block.counts === "object" ? block.counts : {};
        const br = block.rates && typeof block.rates === "object" ? block.rates : {};
        const m = bcObj.matches;
        const cells = [
          pillarCell("Yellow cards (total)", fmtDiscInt(bt.yellow_cards), ""),
          pillarCell("Red cards (total)", fmtDiscInt(bt.red_cards), ""),
          pillarCell("Yellow cards / match", fmtDiscPerGame(br.yellow_cards_per_game, 1), ""),
          pillarCell("Red cards / match", fmtDiscPerGame(br.red_cards_per_game, 1), ""),
          pillarCell(
            "Matches with 1+ yellow",
            fmtDiscPct(br.matches_with_1plus_yellow_pct),
            bcObj.matches_with_1plus_yellow_count != null && m != null
              ? `${fmtDiscInt(bcObj.matches_with_1plus_yellow_count)} / ${fmtDiscInt(m)}`
              : ""
          ),
          pillarCell(
            "Matches with 2+ yellows",
            fmtDiscPct(br.matches_with_2plus_yellows_pct),
            bcObj.matches_with_2plus_yellows_count != null && m != null
              ? `${fmtDiscInt(bcObj.matches_with_2plus_yellows_count)} / ${fmtDiscInt(m)}`
              : ""
          ),
          pillarCell(
            "Matches with a red",
            fmtDiscPct(br.matches_with_red_pct),
            bcObj.matches_with_red_count != null && m != null
              ? `${fmtDiscInt(bcObj.matches_with_red_count)} / ${fmtDiscInt(m)}`
              : ""
          ),
        ].join("");
        const sub = m != null ? `${fmtDiscInt(m)} matches` : "";
        return `${statsSubrowHeading(label)}${cells}${sub ? `<p class="rt-team-disc-split-note">${esc(sub)}</p>` : ""}`;
      }

      const homeAway =
        (sp.home ? splitBand("Home", sp.home) : "") + (sp.away ? splitBand("Away", sp.away) : "");

      const note = noteSub ? `<p class="rt-team-disc-split-note">${esc(noteSub)}</p>` : "";
      const inner = [note, mainPillars, homeAway].join("");
      if (!inner.replace(/\s/g, "")) return "";
      return inner;
    }

    if (!cardsOn) return "";

    const trendPillars = [
      tr.yellows_per_game != null && Number.isFinite(Number(tr.yellows_per_game))
        ? pillarCell("Team yellow cards / match", fmtAvg1(tr.yellows_per_game), "")
        : "",
      tr.reds_per_game != null && Number.isFinite(Number(tr.reds_per_game))
        ? pillarCell("Team red cards / match", fmtAvg1(tr.reds_per_game), "")
        : "",
      ...foulsAndRatioPillars(tr.yellows_per_game, tr.reds_per_game),
    ].join("");
    if (!trendPillars.replace(/\s/g, "")) return "";
    return trendPillars;
  }

  /**
   * Corners block inner only (preview snapshot); used inside Behaviour.
   * Order: absolute totals → match total → per-match → threshold counts → threshold %.
   */
  function renderCornersInner(corners, previewUiLabels) {
    if (!corners || typeof corners !== "object") return "";
    const t = corners.totals && typeof corners.totals === "object" ? corners.totals : {};
    const c = corners.counts && typeof corners.counts === "object" ? corners.counts : {};
    const r = corners.rates && typeof corners.rates === "object" ? corners.rates : {};
    const sp = corners.splits && typeof corners.splits === "object" ? corners.splits : {};

    const cf = t.corners_for;
    const ca = t.corners_against;
    let matchCorners = null;
    if (cf != null && ca != null && Number.isFinite(Number(cf)) && Number.isFinite(Number(ca))) {
      matchCorners = Math.round(Number(cf) + Number(ca));
    }

    const m = c.matches;
    const noteSub =
      m != null && Number.isFinite(Number(m))
        ? previewUiLabels === false
          ? `${fmtDiscInt(m)} matches`
          : `Preview sample · ${fmtDiscInt(m)} matches`
        : "";

    const strip = `<div class="rt-team-cor-strip" aria-label="Corners headline">
      <div class="rt-team-cor-strip-main">
        <span class="rt-team-cor-strip-k">Team corners for / match</span>
        <span class="rt-team-cor-strip-v">${esc(fmtDiscPerGame(r.corners_for_per_game, 1))}</span>
      </div>
      <div class="rt-team-cor-strip-side">
        <span class="rt-team-cor-strip-sk">Against / match</span>
        <span class="rt-team-cor-strip-sv">${esc(fmtDiscPerGame(r.corners_against_per_game, 1))}</span>
      </div>
    </div>`;

    const secondaries = [
      pillarCell("Team corners for (total)", fmtDiscInt(cf), ""),
      pillarCell("Team corners against (total)", fmtDiscInt(ca), ""),
      matchCorners != null
        ? pillarCell("Total match corners (for + against)", String(matchCorners), "")
        : "",
      pillarCell("Team corners for / match", fmtDiscPerGame(r.corners_for_per_game, 1), ""),
      pillarCell("Team corners against / match", fmtDiscPerGame(r.corners_against_per_game, 1), ""),
      pillarCell(
        "Matches with 3+ corners for",
        fmtDiscInt(c.matches_with_3plus_corners_for_count),
        fmtDiscPct(r.matches_with_3plus_corners_for_pct)
      ),
      pillarCell(
        "Matches with 5+ corners for",
        fmtDiscInt(c.matches_with_5plus_corners_for_count),
        fmtDiscPct(r.matches_with_5plus_corners_for_pct)
      ),
      pillarCell(
        "Matches with 7+ corners for",
        fmtDiscInt(c.matches_with_7plus_corners_for_count),
        fmtDiscPct(r.matches_with_7plus_corners_for_pct)
      ),
    ].join("");

    function splitBand(label, block) {
      if (!block || typeof block !== "object") return "";
      const bt = block.totals && typeof block.totals === "object" ? block.totals : {};
      const bcObj = block.counts && typeof block.counts === "object" ? block.counts : {};
      const br = block.rates && typeof block.rates === "object" ? block.rates : {};
      const bcf = bt.corners_for;
      const bca = bt.corners_against;
      let bMatch = null;
      if (bcf != null && bca != null && Number.isFinite(Number(bcf)) && Number.isFinite(Number(bca))) {
        bMatch = Math.round(Number(bcf) + Number(bca));
      }
      const bm = bcObj.matches;
      const cells = [
        pillarCell("Corners for (total)", fmtDiscInt(bcf), ""),
        pillarCell("Corners against (total)", fmtDiscInt(bca), ""),
        bMatch != null ? pillarCell("Match corners (total)", String(bMatch), "") : "",
        pillarCell("Corners for / match", fmtDiscPerGame(br.corners_for_per_game, 1), ""),
        pillarCell("Corners against / match", fmtDiscPerGame(br.corners_against_per_game, 1), ""),
        pillarCell(
          "3+ corners for (matches)",
          fmtDiscInt(bcObj.matches_with_3plus_corners_for_count),
          fmtDiscPct(br.matches_with_3plus_corners_for_pct)
        ),
        pillarCell(
          "5+ corners for (matches)",
          fmtDiscInt(bcObj.matches_with_5plus_corners_for_count),
          fmtDiscPct(br.matches_with_5plus_corners_for_pct)
        ),
        pillarCell(
          "7+ corners for (matches)",
          fmtDiscInt(bcObj.matches_with_7plus_corners_for_count),
          fmtDiscPct(br.matches_with_7plus_corners_for_pct)
        ),
      ].join("");
      const sub = bm != null ? `${fmtDiscInt(bm)} matches` : "";
      return `${statsSubrowHeading(label)}${cells}${sub ? `<p class="rt-team-cor-split-note">${esc(sub)}</p>` : ""}`;
    }

    const homeAway =
      (sp.home ? splitBand("Home", sp.home) : "") + (sp.away ? splitBand("Away", sp.away) : "");

    const note = noteSub ? `<p class="rt-team-cor-split-note">${esc(noteSub)}</p>` : "";
    const inner = [note, strip, secondaries, homeAway].join("");
    if (!inner.replace(/\s/g, "")) return "";
    return inner;
  }

  /**
   * Goalkeeper block inner only (preview `teams[].goalkeeper`); used inside Defense.
   * Compact strip + dense grid; SoT faced total is not present on v6 preview rows (see blockers in rollout notes).
   */
  function renderGoalkeeperInner(goalkeeper, previewUiLabels) {
    if (!goalkeeper || typeof goalkeeper !== "object") return "";
    const t = goalkeeper.totals && typeof goalkeeper.totals === "object" ? goalkeeper.totals : {};
    const c = goalkeeper.counts && typeof goalkeeper.counts === "object" ? goalkeeper.counts : {};
    const r = goalkeeper.rates && typeof goalkeeper.rates === "object" ? goalkeeper.rates : {};
    const sp = goalkeeper.splits && typeof goalkeeper.splits === "object" ? goalkeeper.splits : {};

    const spg = r.saves_per_game;
    const noteSub =
      c.matches != null && Number.isFinite(Number(c.matches))
        ? previewUiLabels === false
          ? `${fmtDiscInt(c.matches)} matches`
          : `${fmtDiscInt(c.matches)} matches · fixture-derived preview`
        : "";

    const strip = `<div class="rt-team-gk-strip" aria-label="Goalkeeper summary">
      <div class="rt-team-gk-strip-cell rt-team-gk-strip-cell--lead">
        <span class="rt-team-gk-strip-k">Saves / match</span>
        <span class="rt-team-gk-strip-v">${esc(fmtDiscPerGame(spg, 1))}</span>
      </div>
      <div class="rt-team-gk-strip-cell">
        <span class="rt-team-gk-strip-k">Total saves</span>
        <span class="rt-team-gk-strip-v">${esc(fmtDiscInt(t.saves))}</span>
      </div>
      <div class="rt-team-gk-strip-cell">
        <span class="rt-team-gk-strip-k">Save %</span>
        <span class="rt-team-gk-strip-v">${esc(fmtDiscPct(r.save_pct))}</span>
      </div>
    </div>`;

    const secondaries = [
      pillarCell(
        "Matches with 3+ saves",
        fmtDiscPct(r.matches_with_3plus_saves_pct),
        c.matches_with_3plus_saves_count != null && c.matches != null
          ? `${fmtDiscInt(c.matches_with_3plus_saves_count)} / ${fmtDiscInt(c.matches)} matches`
          : ""
      ),
      pillarCell(
        "Matches with 5+ saves",
        fmtDiscPct(r.matches_with_5plus_saves_pct),
        c.matches_with_5plus_saves_count != null && c.matches != null
          ? `${fmtDiscInt(c.matches_with_5plus_saves_count)} / ${fmtDiscInt(c.matches)} matches`
          : ""
      ),
    ].join("");

    const grid = secondaries.replace(/\s/g, "")
      ? `<div class="rt-team-gk-pillars">${secondaries}</div>`
      : "";

    function splitBand(label, block) {
      if (!block || typeof block !== "object") return "";
      const br = block.rates && typeof block.rates === "object" ? block.rates : {};
      const bt = block.totals && typeof block.totals === "object" ? block.totals : {};
      const bcObj = block.counts && typeof block.counts === "object" ? block.counts : null;
      const cells = [
        pillarCell("Saves / match", fmtDiscPerGame(br.saves_per_game, 1), ""),
        pillarCell("Total saves", fmtDiscInt(bt.saves), ""),
        pillarCell("Save %", fmtDiscPct(br.save_pct), ""),
        pillarCell(
          "3+ saves (share)",
          fmtDiscPct(br.matches_with_3plus_saves_pct),
          bcObj && bcObj.matches_with_3plus_saves_count != null && bcObj.matches != null
            ? `${fmtDiscInt(bcObj.matches_with_3plus_saves_count)} / ${fmtDiscInt(bcObj.matches)}`
            : ""
        ),
        pillarCell(
          "5+ saves (share)",
          fmtDiscPct(br.matches_with_5plus_saves_pct),
          bcObj && bcObj.matches_with_5plus_saves_count != null && bcObj.matches != null
            ? `${fmtDiscInt(bcObj.matches_with_5plus_saves_count)} / ${fmtDiscInt(bcObj.matches)}`
            : ""
        ),
      ].join("");
      const sub =
        bcObj && bcObj.matches != null ? `${fmtDiscInt(bcObj.matches)} matches` : "";
      return `${statsSubrowHeading(label)}${cells}${sub ? `<p class="rt-team-gk-split-note">${esc(sub)}</p>` : ""}`;
    }

    const homeAway =
      (sp.home ? splitBand("Home", sp.home) : "") + (sp.away ? splitBand("Away", sp.away) : "");

    const note = noteSub ? `<p class="rt-team-gk-split-note">${esc(noteSub)}</p>` : "";
    const inner = [note, strip, grid, homeAway].join("");
    if (!inner.replace(/\s/g, "")) return "";
    return inner;
  }

  /**
   * Behaviour: Discipline (preview + fouls from trends) + Corners preview; optional Match trends for non-preview corners only.
   */
  function renderBehaviourSection(sc, t, disciplineFromPreview, cornersFromPreview, previewUiLabels) {
    const chunks = [];
    const discInner = renderDisciplineInner(disciplineFromPreview || null, sc, t, previewUiLabels);
    if (discInner) chunks.push(statsSubrowHeading("Discipline") + discInner);
    const corInner = renderCornersInner(cornersFromPreview, previewUiLabels);
    if (corInner) chunks.push(statsSubrowHeading("Corners") + corInner);

    const trendParts = [];
    if (sc.corners && !cornersFromPreview && t.corners_per_game != null) {
      trendParts.push(pillarCell("Team corners for / match", fmtAvg1(t.corners_per_game), ""));
    }
    if (sc.corners && !cornersFromPreview && t.corners_against_pg != null) {
      trendParts.push(pillarCell("Team corners against / match", fmtAvg1(t.corners_against_pg), ""));
    }
    if (trendParts.length) {
      chunks.push(statsSubrowHeading("Match trends") + trendParts.join(""));
    }

    const inner = chunks.join("");
    if (!inner.replace(/\s/g, "")) return "";
    return statsSectionBlock("Behaviour", "Physicality & pressure", inner);
  }

  function previewBrDocLooksValid(doc) {
    const s = doc?.meta?.schema;
    return (
      doc &&
      doc.meta &&
      (s === "preview_brasileirao_team_stats_v4" ||
        s === "preview_brasileirao_team_stats_v5" ||
        s === "preview_brasileirao_team_stats_v6")
    );
  }

  function previewBrFinishedMatchesLookValid(doc) {
    const schema = String(doc?.meta?.schema || "").trim();
    return (
      doc &&
      doc.meta &&
      (schema === "preview_brasileirao_profile_finished_matches_v2" ||
        schema === "preview_brasileirao_profile_finished_matches_v1") &&
      doc.by_team_id &&
      typeof doc.by_team_id === "object"
    );
  }

  function findPreviewDisciplineRow(previewDoc, teamId) {
    if (!previewBrDocLooksValid(previewDoc) || !Array.isArray(previewDoc.teams)) return null;
    const tid = Number(teamId);
    if (!Number.isFinite(tid)) return null;
    return previewDoc.teams.find((row) => Number(row?.identity?.team_id) === tid) || null;
  }

  /**
   * Preview `team-stats.json` applies only when its league_id matches the loaded competition
   * (by league_id or competition_id). No cross-competition reuse.
   */
  function previewBrSnapshotMatchesCompetition(previewDoc, competitionData) {
    if (!previewBrDocLooksValid(previewDoc)) return false;
    const lid = Number(previewDoc.meta.league_id);
    if (!Number.isFinite(lid)) return false;
    const comp = competitionData?.competition;
    if (!comp || typeof comp !== "object") return false;
    if (Number(comp.league_id) === lid) return true;
    if (Number(comp.competition_id) === lid) return true;
    return false;
  }

  function previewBrCompetitionLooksValid(doc) {
    return (
      doc &&
      doc.meta &&
      String(doc.meta.schema || "").trim() === "preview_brasileirao_competition_v1" &&
      Array.isArray(doc.standings)
    );
  }

  function findPreviewStanding(competitionDoc, teamId) {
    if (!competitionDoc?.standings || !Array.isArray(competitionDoc.standings)) return null;
    const tid = Number(teamId);
    if (!Number.isFinite(tid)) return null;
    return competitionDoc.standings.find((r) => Number(r?.team_id) === tid) || null;
  }

  /** totals / counts / rates for total | home | away on `teams[]` preview row */
  function pickPreviewStatsBlock(row, splitKey) {
    if (!row || typeof row !== "object") return null;
    const sk = String(splitKey || "total").toLowerCase();
    if (sk === "total") {
      return {
        totals: row.totals && typeof row.totals === "object" ? row.totals : {},
        counts: row.counts && typeof row.counts === "object" ? row.counts : {},
        rates: row.rates && typeof row.rates === "object" ? row.rates : {},
      };
    }
    const sub = row.splits && typeof row.splits === "object" ? row.splits[sk] : null;
    if (!sub || typeof sub !== "object") {
      return { totals: {}, counts: {}, rates: {} };
    }
    return {
      totals: sub.totals && typeof sub.totals === "object" ? sub.totals : {},
      counts: sub.counts && typeof sub.counts === "object" ? sub.counts : {},
      rates: sub.rates && typeof sub.rates === "object" ? sub.rates : {},
    };
  }

  /**
   * Venue slice for nested preview blocks (discipline / corners / GK): total object vs one split band.
   */
  function previewNestedForVenue(fullNode, splitKey) {
    const sk = String(splitKey || "total").toLowerCase();
    if (!fullNode || typeof fullNode !== "object") return null;
    if (sk === "total") return fullNode;
    const band = fullNode.splits && typeof fullNode.splits === "object" ? fullNode.splits[sk] : null;
    if (!band || typeof band !== "object") return fullNode;
    return {
      totals: band.totals && typeof band.totals === "object" ? band.totals : {},
      counts: band.counts && typeof band.counts === "object" ? band.counts : {},
      rates: band.rates && typeof band.rates === "object" ? band.rates : {},
      splits: {},
    };
  }

  /**
   * Stats pillars from preview `team-stats.json` (+ standings for total-split game profile only).
   * No competition_overview, no trends, no per_game×matches shot reconstruction, no Match events block.
   */
  function renderPreviewStatsStack(splitKey, block, standing, discipline, corners, goalkeeper, previewUiLabels) {
    const sk = String(splitKey || "total").toLowerCase();
    const tot = block.totals && typeof block.totals === "object" ? block.totals : {};
    const cnt = block.counts && typeof block.counts === "object" ? block.counts : {};
    const rt = block.rates && typeof block.rates === "object" ? block.rates : {};
    const m = Number(cnt.matches) || 0;

    const attackParts = [];
    if (tot.goals_for != null && Number.isFinite(Number(tot.goals_for))) {
      const sub =
        rt.goals_for_per_game != null && Number.isFinite(Number(rt.goals_for_per_game))
          ? `${fmtAvg1(rt.goals_for_per_game)} / match`
          : "";
      attackParts.push(pillarCell("Goals for", String(tot.goals_for), sub));
    }
    if (rt.over_15_pct != null && Number.isFinite(Number(rt.over_15_pct))) {
      const sub =
        cnt.over_15_count != null && m > 0
          ? `${fmtDiscInt(cnt.over_15_count)} / ${m} matches (match total O1.5)`
          : "";
      attackParts.push(pillarCell("Match over 1.5 goals", fmtDiscPct(rt.over_15_pct), sub));
    }
    if (rt.over_25_pct != null && Number.isFinite(Number(rt.over_25_pct))) {
      const sub =
        cnt.over_25_count != null && m > 0 ? `${fmtDiscInt(cnt.over_25_count)} / ${m} matches` : "";
      attackParts.push(pillarCell("Match over 2.5 goals", fmtDiscPct(rt.over_25_pct), sub));
    }
    if (rt.under_25_pct != null && Number.isFinite(Number(rt.under_25_pct))) {
      const sub =
        cnt.under_25_count != null && m > 0 ? `${fmtDiscInt(cnt.under_25_count)} / ${m} matches` : "";
      attackParts.push(pillarCell("Match under 2.5 goals", fmtDiscPct(rt.under_25_pct), sub));
    }
    if (rt.over_35_pct != null && Number.isFinite(Number(rt.over_35_pct))) {
      const sub =
        cnt.over_35_count != null && m > 0 ? `${fmtDiscInt(cnt.over_35_count)} / ${m} matches` : "";
      attackParts.push(pillarCell("Match over 3.5 goals", fmtDiscPct(rt.over_35_pct), sub));
    }
    if (rt.btts_pct != null && Number.isFinite(Number(rt.btts_pct))) {
      const sub =
        cnt.btts_count != null && m > 0 ? `${fmtDiscInt(cnt.btts_count)} / ${m} matches` : "";
      attackParts.push(pillarCell("Both teams scored", fmtDiscPct(rt.btts_pct), sub));
    }
    if (rt.failed_to_score_pct != null && Number.isFinite(Number(rt.failed_to_score_pct))) {
      const sub =
        cnt.failed_to_score_count != null && m > 0
          ? `${fmtDiscInt(cnt.failed_to_score_count)} / ${m} matches`
          : "";
      attackParts.push(pillarCell("Failed to score", fmtDiscPct(rt.failed_to_score_pct), sub));
    }

    const defParts = [];
    if (tot.goals_against != null && Number.isFinite(Number(tot.goals_against))) {
      const sub =
        rt.goals_against_per_game != null && Number.isFinite(Number(rt.goals_against_per_game))
          ? `${fmtAvg1(rt.goals_against_per_game)} / match`
          : "";
      defParts.push(pillarCell("Goals against", String(tot.goals_against), sub));
    }
    if (cnt.clean_sheets_count != null && Number.isFinite(Number(cnt.clean_sheets_count))) {
      const sub =
        rt.clean_sheets_pct != null && Number.isFinite(Number(rt.clean_sheets_pct))
          ? fmtDiscPct(rt.clean_sheets_pct)
          : "";
      defParts.push(pillarCell("Clean sheets", String(cnt.clean_sheets_count), sub));
    }

    const gkInner = renderGoalkeeperInner(goalkeeper, previewUiLabels);
    const defInner = [
      defParts.join(""),
      gkInner ? statsSubrowHeading("Goalkeeper") + gkInner : "",
    ].join("");

    const flowParts = [];
    if (sk === "total" && standing && typeof standing === "object") {
      const played = Number(standing.played) || 0;
      const pts = Number(standing.points);
      if (standing.position != null) {
        flowParts.push(pillarCell("League position", String(standing.position), ""));
      }
      if (Number.isFinite(pts) && played > 0) {
        flowParts.push(pillarCell("Points per match", fmtAvg1(pts / played), ""));
      }
      if (Number.isFinite(pts)) flowParts.push(pillarCell("Points", String(pts), ""));
      if (played > 0) flowParts.push(pillarCell("Matches played", String(played), ""));
      if (standing.wins != null) flowParts.push(pillarCell("Wins", String(standing.wins), ""));
      if (standing.draws != null) flowParts.push(pillarCell("Draws", String(standing.draws), ""));
      if (standing.losses != null) flowParts.push(pillarCell("Losses", String(standing.losses), ""));
      if (standing.goal_diff != null && String(standing.goal_diff) !== "") {
        flowParts.push(pillarCell("Goal difference", String(standing.goal_diff), ""));
      }
      if (standing.form_last5 != null && String(standing.form_last5).trim() !== "") {
        flowParts.push(pillarCell("Form (last 5)", String(standing.form_last5), ""));
      }
    }

    const profileSec = flowParts.join("")
      ? statsSectionBlock("Game profile", "Standings · total split", flowParts.join(""))
      : "";

    const behaviourSec = renderBehaviourSection({}, {}, discipline, corners, previewUiLabels);

    const note =
      previewUiLabels === false
        ? ""
        : `<p class="rt-team-muted">Fixture-derived preview · same source as Team profile</p>`;

    return `<div class="rt-team-stats-four">
      ${note}
      ${statsSectionBlock("Attack", "Scoring", attackParts.join(""))}
      ${statsSectionBlock("Defense", "Resistance", defInner)}
      ${profileSec}
      ${behaviourSec}
    </div>`;
  }

  function statsTabBodyPreview(splitKey, row, standing, previewUiLabels) {
    if (!row) {
      return '<div class="rt-team-stats-tab-inner"><p class="rt-team-muted">No preview row for this team.</p></div>';
    }
    const block = pickPreviewStatsBlock(row, splitKey);
    const disc = previewNestedForVenue(row.discipline, splitKey);
    const cor = previewNestedForVenue(row.corners, splitKey);
    const gk = previewNestedForVenue(row.goalkeeper, splitKey);
    const pillars = renderPreviewStatsStack(splitKey, block, standing, disc, cor, gk, previewUiLabels);
    return `<div class="rt-team-stats-tab-inner">${pillars}</div>`;
  }

  /**
   * Four product sections: Attack (incl. conversion), Defense (incl. preview goalkeeper),
   * Game Profile, Behaviour (discipline + corners + trends).
   */
  function renderPillarStatsStack(
    split,
    trends,
    sc,
    disciplineFromPreview,
    cornersFromPreview,
    goalkeeperFromPreview,
    previewUiLabels
  ) {
    const s = split && typeof split === "object" ? split : {};
    const t = trends && typeof trends === "object" ? trends : {};
    const m = Number(s.matches) || 0;
    const gf = s.goals_for;
    const ga = s.goals_against;
    const pts = m ? splitPoints(s) : null;
    const ppg = m && pts != null ? fmtAvg1(pts / m) : null;

    const shotsTot =
      t.shots_per_game != null && m ? Math.round(Number(t.shots_per_game) * m) : null;
    const sotTot =
      t.sot_per_game != null && m ? Math.round(Number(t.sot_per_game) * m) : null;
    const shotsAgainstTot =
      t.shots_conceded_pg != null && m ? Math.round(Number(t.shots_conceded_pg) * m) : null;
    const sotAgainstTot =
      t.sot_conceded_pg != null && m ? Math.round(Number(t.sot_conceded_pg) * m) : null;

    const spgVal =
      gf != null && Number(gf) > 0 && shotsTot != null && shotsTot > 0
        ? shotsTot / Number(gf)
        : null;
    const gfPerShot =
      gf != null && shotsTot != null && shotsTot > 0 ? Number(gf) / shotsTot : null;
    const gfPerSoT =
      gf != null && sotTot != null && sotTot > 0 ? Number(gf) / sotTot : null;
    const gaPerShot =
      ga != null && shotsAgainstTot != null && shotsAgainstTot > 0
        ? Number(ga) / shotsAgainstTot
        : null;
    const gaPerSoT =
      ga != null && sotAgainstTot != null && sotAgainstTot > 0
        ? Number(ga) / sotAgainstTot
        : null;

    let failedPct = null;
    if (s.failed_to_score != null && m > 0 && Number.isFinite(Number(s.failed_to_score))) {
      failedPct = `${fmtNum((Number(s.failed_to_score) / m) * 100, 1)}%`;
    }
    let cleanPct = null;
    if (s.clean_sheets != null && m > 0 && Number.isFinite(Number(s.clean_sheets))) {
      cleanPct = `${fmtNum((Number(s.clean_sheets) / m) * 100, 1)}%`;
    }

    const gfSub =
      t.goals_per_game != null
        ? `${fmtAvg1(t.goals_per_game)} / match`
        : m && gf != null
          ? `${fmtAvg1(Number(gf) / m)} / match`
          : "";
    const gaSub =
      t.conceded_per_game != null
        ? `${fmtAvg1(t.conceded_per_game)} / match`
        : m && ga != null
          ? `${fmtAvg1(Number(ga) / m)} / match`
          : "";

    const attackParts = [];
    if (gf != null) attackParts.push(pillarCell("Goals for", String(gf), gfSub));
    if (s.over25_rate != null && s.over15_rate != null) {
      attackParts.push(pillarCell("Team over 1.5 goals", fmtPct(s.over15_rate), "share of matches"));
    }
    if (sc.advanced_trends && t.xg_for_pg != null) {
      attackParts.push(pillarCell("xG for", fmtAvg1(t.xg_for_pg), "per match"));
    }
    if (sc.shots && t.shots_per_game != null) {
      attackParts.push(pillarCell("Shots per match", fmtAvg1(t.shots_per_game), ""));
    }
    if (sc.shots && t.sot_per_game != null) {
      attackParts.push(pillarCell("Shots on target / match", fmtAvg1(t.sot_per_game), ""));
    }

    const effParts = [];
    if (spgVal != null) effParts.push(pillarCell("Shots per goal", fmtRatio2(spgVal), ""));
    if (gfPerShot != null) effParts.push(pillarCell("Team goals per shot", fmtRatio2(gfPerShot), ""));
    if (gfPerSoT != null) {
      effParts.push(pillarCell("Team goals per shot on target", fmtRatio2(gfPerSoT), ""));
    }
    if (failedPct) effParts.push(pillarCell("Failed to score", failedPct, ""));

    const attackInner = [
      attackParts.join(""),
      effParts.length ? statsSubrowHeading("Conversion") + effParts.join("") : "",
    ].join("");

    const defParts = [];
    if (ga != null) defParts.push(pillarCell("Goals against", String(ga), gaSub));
    if (sc.advanced_trends && t.xg_against_pg != null) {
      defParts.push(pillarCell("xG against", fmtAvg1(t.xg_against_pg), "per match"));
    }
    if (sc.shots && t.shots_conceded_pg != null) {
      defParts.push(pillarCell("Shots conceded / match", fmtAvg1(t.shots_conceded_pg), ""));
    }
    if (sc.shots && t.sot_conceded_pg != null) {
      defParts.push(pillarCell("SoT conceded / match", fmtAvg1(t.sot_conceded_pg), ""));
    }
    if (gaPerShot != null) {
      defParts.push(pillarCell("Team goals against per shot faced", fmtRatio2(gaPerShot), ""));
    }
    if (gaPerSoT != null) {
      defParts.push(pillarCell("Team goals against per SoT faced", fmtRatio2(gaPerSoT), ""));
    }
    if (s.clean_sheets != null && m > 0) {
      defParts.push(pillarCell("Clean sheets", String(s.clean_sheets), cleanPct || ""));
    }

    const gkInner = renderGoalkeeperInner(goalkeeperFromPreview, previewUiLabels);
    const defInner = [
      defParts.join(""),
      gkInner ? statsSubrowHeading("Goalkeeper") + gkInner : "",
    ].join("");

    const flowParts = [];
    if (ppg) flowParts.push(pillarCell("Points per match", ppg, ""));
    if (sc.results_core) {
      if (s.scored_first_rate != null) {
        flowParts.push(pillarCell("Scored first", fmtPct(s.scored_first_rate), ""));
      }
      if (s.conceded_first_rate != null) {
        flowParts.push(pillarCell("Conceded first", fmtPct(s.conceded_first_rate), ""));
      }
      if (s.lead_at_ht_rate != null) {
        flowParts.push(pillarCell("Leading at HT", fmtPct(s.lead_at_ht_rate), ""));
      }
      if (s.comeback_wins != null) {
        flowParts.push(
          pillarCell(
            "Comebacks",
            String(s.comeback_wins),
            m ? `${fmtNum((Number(s.comeback_wins) / m) * 100, 1)}% of games` : ""
          )
        );
      }
      if (s.won_to_nil != null) {
        flowParts.push(pillarCell("Wins to nil", String(s.won_to_nil), ""));
      }
      if (s.comeback_losses != null && Number.isFinite(Number(s.comeback_losses))) {
        flowParts.push(
          pillarCell("Comebacks against (blown leads)", String(s.comeback_losses), "")
        );
      }
      if (s.losses_to_nil != null && Number.isFinite(Number(s.losses_to_nil))) {
        flowParts.push(
          pillarCell("Losses to nil (no goals scored)", String(s.losses_to_nil), "")
        );
      }
      if (s.defeats_without_scoring != null && Number.isFinite(Number(s.defeats_without_scoring))) {
        flowParts.push(
          pillarCell("Defeats without scoring", String(s.defeats_without_scoring), "")
        );
      }
    }

    const profileInner = flowParts.join("");
    const profileSec = profileInner.replace(/\s/g, "")
      ? statsSectionBlock("Game Profile", "Match dynamics", profileInner)
      : "";

    const behaviourSec = renderBehaviourSection(sc, t, disciplineFromPreview, cornersFromPreview, previewUiLabels);

    return `<div class="rt-team-stats-four">
      ${statsSectionBlock("Attack", "Scoring", attackInner)}
      ${statsSectionBlock("Defense", "Resistance", defInner)}
      ${profileSec}
      ${behaviourSec}
    </div>`;
  }

  function renderMatchEventsPanel(split, sc) {
    if (!split || !sc.goals_markets) {
      return '<p class="rt-team-muted">Goal-market aggregates are not available for this view.</p>';
    }
    const m = split.matches || 0;
    const goalsBlock = [
      eventMetric("Both teams scored", split.btts_rate, m),
      eventMetric("Over 1.5", split.over15_rate, m),
      eventMetric("Over 2.5", split.over25_rate, m),
      eventMetric("Over 3.5", split.over35_rate, m),
      eventMetric("Under 2.5", split.under25_rate, m),
    ].join("");
    const scoringBlock = [
      eventMetric("Team scored 0.5+", split.team_over_05_rate, m),
      eventMetric("Team scored 1.5+", split.team_over_15_rate, m),
    ].join("");
    const defBlock = [
      eventMetric("Conceded 0.5+", split.conceded_over_05_rate, m),
      eventMetric("Conceded 1.5+", split.conceded_over_15_rate, m),
    ].join("");
    return `<div class="rt-team-events-stack">
      <section class="rt-team-events-group" aria-label="Goals behaviour"><h4 class="rt-team-events-h">Goals behaviour</h4><div class="rt-team-events-grid">${goalsBlock}</div></section>
      <section class="rt-team-events-group" aria-label="Scoring"><h4 class="rt-team-events-h">Scoring</h4><div class="rt-team-events-grid">${scoringBlock}</div></section>
      <section class="rt-team-events-group" aria-label="Defensive events"><h4 class="rt-team-events-h">Defensive events</h4><div class="rt-team-events-grid">${defBlock}</div></section>
    </div>`;
  }

  function statsTabBody(
    split,
    trends,
    scMeta,
    disciplineFromPreview,
    cornersFromPreview,
    goalkeeperFromPreview,
    previewUiLabels
  ) {
    const pillars = renderPillarStatsStack(
      split,
      trends,
      scMeta,
      disciplineFromPreview,
      cornersFromPreview,
      goalkeeperFromPreview,
      previewUiLabels
    );
    const events = renderMatchEventsPanel(split, scMeta);
    return `<div class="rt-team-stats-tab-inner">
      ${pillars}
      <div class="rt-team-match-events-wrap">
        <h2 class="rt-team-match-events-title">Match events</h2>
        ${events}
      </div>
    </div>`;
  }

  function splitToggle(groupId, label) {
    return `<div class="rt-team-split" role="group" aria-label="${esc(label)}">
      <button type="button" class="rt-team-split-btn is-on" data-g="${esc(groupId)}" data-v="total">Total</button>
      <button type="button" class="rt-team-split-btn" data-g="${esc(groupId)}" data-v="home">Home</button>
      <button type="button" class="rt-team-split-btn" data-g="${esc(groupId)}" data-v="away">Away</button>
    </div>`;
  }

  function bindSplit(rootEl, groupId, onChange) {
    rootEl.querySelectorAll(`.rt-team-split-btn[data-g="${groupId}"]`).forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = btn.getAttribute("data-v") || "total";
        rootEl
          .querySelectorAll(`.rt-team-split-btn[data-g="${groupId}"]`)
          .forEach((b) => b.classList.toggle("is-on", b === btn));
        onChange(v);
      });
    });
  }

  function syncSplitGroup(rootEl, groupId, value) {
    const v = value || "total";
    rootEl.querySelectorAll(`.rt-team-split-btn[data-g="${groupId}"]`).forEach((b) => {
      b.classList.toggle("is-on", (b.getAttribute("data-v") || "total") === v);
    });
  }

  function activateTab(rootEl, tabId) {
    rootEl.querySelectorAll(".rt-team-tab").forEach((b) => {
      const on = b.getAttribute("data-tab") === tabId;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    rootEl.querySelectorAll(".rt-team-panel").forEach((p) => {
      p.hidden = p.getAttribute("data-panel") !== tabId;
    });
  }

  function leagueLockupHtml(comp) {
    if (!comp?.name && !comp?.logo_url) return "";
    const logo = comp.logo_url
      ? `<img class="rt-team-league-ico" src="${esc(comp.logo_url)}" alt="" width="36" height="36" decoding="async"/>`
      : "";
    return `<span class="rt-team-league-lockup">${logo}<span class="rt-team-league-name">${esc(comp.name || "")}</span></span>`;
  }

  function renderTeamPageUiSummaryCards(cards) {
    const list = Array.isArray(cards) ? cards : [];
    if (!list.length) return '<p class="rt-team-muted">No summary cards in snapshot.</p>';
    return `<div class="rt-team-ui-cards">${list
      .map(
        (c) => `<article class="rt-team-ui-card">
      <span class="rt-team-ui-card-k">${esc(c.label)}</span>
      <span class="rt-team-ui-card-v">${esc(c.value)}</span>
      ${c.note ? `<span class="rt-team-ui-card-n">${esc(c.note)}</span>` : ""}
    </article>`
      )
      .join("")}</div>`;
  }

  function renderTeamPageUiHtml(ui) {
    const h = ui.header || {};
    const headLine = [h.competition_name, h.season, h.country].filter(Boolean).join(" · ");
    const metaLine = `Table ${h.position_text || "—"} · ${h.points_text || "—"} pts · Form ${h.form_display || "—"}`;
    const trends = ui.trends_reading || {};
    const trendBlock =
      (trends.primary_text && trends.primary_text !== "—") || trends.tags_line || trends.league_context_line
        ? `<section class="rt-team-ui-trends" aria-label="Trend reading">
      <h3 class="rt-team-ui-h">Narrative</h3>
      <p class="rt-team-ui-trends-p">${esc(trends.primary_text || "—")}</p>
      ${trends.tags_line ? `<p class="rt-team-ui-muted">${esc(trends.tags_line)}</p>` : ""}
      ${trends.league_context_line ? `<p class="rt-team-ui-muted">${esc(trends.league_context_line)}</p>` : ""}
    </section>`
        : "";
    const compRows = (ui.comparison_rows || [])
      .map(
        (r) => `<div class="rt-team-ui-crow">
      <span class="rt-team-ui-crow-k">${esc(r.label)}</span>
      <span class="rt-team-ui-crow-v">${esc(r.value_text)}</span>
      ${r.note ? `<span class="rt-team-ui-crow-n">${esc(r.note)}</span>` : ""}
    </div>`
      )
      .join("");
    const bars = (ui.profile_rows || [])
      .map(
        (row) => `<div class="rt-team-prof-row">
      <span class="rt-team-prof-label">${esc(row.label)}</span>
      <div class="rt-team-prof-track" aria-hidden="true"><span class="rt-team-prof-fill" style="width:${Math.min(
        100,
        Math.max(0, Number(row.bar_width_pct) || 0)
      )}%"></span></div>
      <span class="rt-team-prof-val">${esc(row.value_text)}</span>
    </div>`
      )
      .join("");
    const dq =
      ui.data_quality != null
        ? `<p class="rt-team-prof-dq">Data quality: ${esc(JSON.stringify(ui.data_quality))}</p>`
        : "";
    return `
    <div class="rt-team-prof-head">
      <h2 class="rt-team-prof-title">Team profile</h2>
      <p class="rt-team-prof-sub">${esc(headLine)}</p>
      <p class="rt-team-prof-sub">${esc(metaLine)}</p>
    </div>
    ${renderTeamPageUiSummaryCards(ui.summary_cards)}
    ${trendBlock}
    <section class="rt-team-ui-comp" aria-label="Cohort comparison">
      <h3 class="rt-team-ui-h">Cohort comparison</h3>
      <div class="rt-team-ui-crows">${compRows}</div>
    </section>
    <div class="rt-team-prof-overall">
      <div class="rt-team-prof-overall-left">
        <span class="rt-team-prof-overall-k">Overall</span>
        ${dq}
      </div>
      <div class="rt-team-prof-overall-spacer"></div>
      <div class="rt-team-prof-overall-v">${esc(ui.overall_text)}</div>
    </div>
    <div class="rt-team-prof-bars">${bars}</div>`;
  }

  async function run() {
    const params = new URLSearchParams(location.search);
    const teamId = params.get("team") || DEFAULT_TEAM;
    const season = params.get("season") || DEFAULT_SEASON;
    const competitionParam = params.get("competition");

    const teamUrl = `/data/teams/${encodeURIComponent(teamId)}/${encodeURIComponent(season)}.json`;
    let teamData;
    try {
      teamData = await loadJSON(teamUrl);
    } catch {
      root.innerHTML =
        '<div class="rt-team-shell"><p class="rt-team-muted">Unable to load this team page.</p></div>';
      return;
    }

    if (teamData.meta?.entity !== "team_season_page") {
      root.innerHTML =
        '<div class="rt-team-shell"><p class="rt-team-muted">Unable to load this team page.</p></div>';
      return;
    }

    let previewBrTeamStatsDoc = null;
    let previewBrCompetitionDoc = null;
    let previewBrFinishedMatchesDoc = null;
    try {
      const pj = await loadJSON("/data/preview/brasileirao/team-stats.json");
      if (previewBrDocLooksValid(pj)) previewBrTeamStatsDoc = pj;
    } catch {
      /* Optional local snapshot — not present in all builds. */
    }
    try {
      const pc = await loadJSON("/data/preview/brasileirao/competition.json");
      if (previewBrCompetitionLooksValid(pc)) previewBrCompetitionDoc = pc;
    } catch {
      /* Optional — standings for Stats tab Game profile. */
    }
    try {
      const pf = await loadJSON("/data/preview/brasileirao/profile-finished-matches.json");
      if (previewBrFinishedMatchesLookValid(pf)) previewBrFinishedMatchesDoc = pf;
    } catch {
      /* Optional — per-finish rows for Profile Control/Consistency. */
    }

    const team = teamData.team || {};
    const header = teamData.header || {};
    const compPlayedRaw = header.competitions_played || [];
    const compPlayed = compPlayedRaw.filter((c) => !isTestCompetitionEntry(c));
    const primary = primaryCompetition(compPlayed);
    const so = teamData.season_overview || {};
    const scTeam = teamData.meta.stats_completeness || {};

    let activeCompId = competitionParam ? String(competitionParam) : primary ? String(primary.competition_id) : null;
    if (
      activeCompId &&
      !compPlayed.some((c) => String(c.competition_id) === String(activeCompId))
    ) {
      activeCompId = primary ? String(primary.competition_id) : null;
    }
    if (!activeCompId) {
      root.innerHTML =
        '<div class="rt-team-shell"><p class="rt-team-muted">No competition context for this team page. Use <code>?competition=</code>.</p></div>';
      return;
    }

    /** @type {Map<string, object|null>} */
    const compMap = new Map();
    await Promise.all(
      compPlayed.map(async (c) => {
        const id = String(c.competition_id);
        const url = `/data/team-competitions/${encodeURIComponent(teamId)}/${encodeURIComponent(id)}/${encodeURIComponent(season)}.json`;
        try {
          const j = await loadJSON(url);
          if (j.meta?.entity === "team_competition_detail") compMap.set(id, j);
          else compMap.set(id, null);
        } catch {
          compMap.set(id, null);
        }
      })
    );

    function getCompData(id) {
      return compMap.get(String(id)) || null;
    }

    let activeCompetitionData = getCompData(activeCompId);
    if (!activeCompetitionData) {
      const fallback = primary ? String(primary.competition_id) : null;
      if (fallback && getCompData(fallback)) {
        activeCompId = fallback;
        activeCompetitionData = getCompData(fallback);
      }
    }
    if (!activeCompetitionData) {
      root.innerHTML =
        '<div class="rt-team-shell"><p class="rt-team-muted">Unable to load team competition data for this season.</p></div>';
      return;
    }
    const activeCompetitionName =
      activeCompetitionData?.competition?.competition_name ||
      compPlayed.find((c) => String(c.competition_id) === String(activeCompId))?.competition_name ||
      "Competition";
    applySeo(team, activeCompetitionName, season, activeCompId);

    let leagueSnapshotForUi = null;
    let leagueUiCompetitionId = null;
    const leagueSlug = LEAGUE_TEAM_PAGE_UI_SLUG[Number(activeCompId)];
    if (leagueSlug) {
      try {
        const lg = await loadJSON(`/data/v1/leagues/${encodeURIComponent(leagueSlug)}.json`);
        const snapSeason = lg?.competition?.season != null ? String(lg.competition.season) : "";
        if (snapSeason && snapSeason === String(season) && lg.team_page_ui_by_team_id) {
          leagueSnapshotForUi = lg;
          leagueUiCompetitionId =
            lg.competition?.competition_id != null ? String(lg.competition.competition_id) : String(activeCompId);
        }
      } catch {
        /* optional */
      }
    }

    const tidNum = Number(teamId);
    const teamPageUi =
      leagueSnapshotForUi?.team_page_ui_by_team_id?.[tidNum] ??
      leagueSnapshotForUi?.team_page_ui_by_team_id?.[String(tidNum)] ??
      null;

    function teamPageUiForComp(compIdStr) {
      return teamPageUi && leagueUiCompetitionId && String(compIdStr) === leagueUiCompetitionId ? teamPageUi : null;
    }

    const logoHtml = team.logo_url
      ? `<img class="rt-team-id-logo" src="${esc(team.logo_url)}" alt="" width="88" height="88" decoding="async"/>`
      : "";

    const identityHtml = renderIdentity(team);

    const profileCompPillsHtml = compPlayed
      .filter((c) => compMap.get(String(c.competition_id)))
      .map((c) => {
        const id = String(c.competition_id);
        const active = id === activeCompId ? " is-on" : "";
        return `<button type="button" class="rt-team-comp-pill${active}" data-profile-comp="${esc(id)}">${esc(c.competition_name || "Competition")}</button>`;
      })
      .join("");

    const tabButtons = [
      `<button type="button" class="rt-team-tab is-on" role="tab" data-tab="profile" aria-selected="true">Profile</button>`,
      `<button type="button" class="rt-team-tab" role="tab" data-tab="general" aria-selected="false">General stats</button>`,
    ];
    const tabPanels = [
      `<div class="rt-team-panel" data-panel="profile" role="tabpanel">
        <div class="rt-team-profile-scope">
          <div class="rt-team-prof-card rt-team-prof-card--unified">
            <div class="rt-team-prof-toolbar" aria-label="Team profile filters">
              <div class="rt-team-prof-toolbar-inner">
                <div class="rt-team-prof-field">
                  <span id="rt_profile_comp_label" class="rt-team-prof-field-label">Competition</span>
                  <div class="rt-team-comp-pills" role="group" aria-labelledby="rt_profile_comp_label">${profileCompPillsHtml}</div>
                </div>
                <div class="rt-team-prof-field">
                  <span id="rt_profile_venue_label" class="rt-team-prof-field-label">Venue</span>
                  ${splitToggle("profile", "Venue split")}
                </div>
              </div>
            </div>
            <div id="rt_team_profile_body" class="rt-team-prof-main"></div>
          </div>
        </div>
      </div>`,
      `<div class="rt-team-panel" data-panel="general" role="tabpanel" hidden>
        <div class="rt-team-stats-scope">
          <div class="rt-team-stats-toolbar">
            <span class="rt-team-control-label">Venue</span>
            ${splitToggle("general", "Venue split")}
          </div>
          <div id="rt_team_general_inner" class="rt-team-stats-tab"></div>
        </div>
      </div>`,
    ];

    compPlayed.forEach((c) => {
      const id = String(c.competition_id);
      if (!compMap.get(id)) return;
      const tabId = `comp-${id}`;
      const tabLabel = `${c.competition_name || "Competition"} stats`;
      tabButtons.push(
        `<button type="button" class="rt-team-tab" role="tab" data-tab="${esc(tabId)}" aria-selected="false">${esc(tabLabel)}</button>`
      );
      tabPanels.push(
        `<div class="rt-team-panel" data-panel="${esc(tabId)}" role="tabpanel" hidden>
          <div class="rt-team-stats-scope">
            <div class="rt-team-stats-toolbar">
              <span class="rt-team-control-label">Venue</span>
              ${splitToggle(`comp-${id}`, "Venue split")}
            </div>
            <div id="rt_team_comp_${esc(id)}_inner" class="rt-team-stats-tab" data-comp-id="${esc(id)}"></div>
          </div>
        </div>`
      );
    });

    const q = (k, v) => `${k}=${encodeURIComponent(v)}`;
    const baseQs = [q("team", teamId), q("season", season), q("competition", activeCompId)].join("&");

    const devFooterHtml = showDevTeamChrome
      ? `
    <footer class="rt-team-previews rt-team-dev-footer">
      <div class="rt-team-dev-container rt-team-dev-footer-inner">
        <a href="?${esc(baseQs)}">Reload with current params</a>
        ·
        <a href="?team=33&amp;season=2025&amp;competition=39">English club sample</a>
        ·
        <a href="?team=2311&amp;season=2025&amp;competition=265">Chile sample</a>
        ·
        <a href="?team=118&amp;season=2026&amp;competition=71">Bahia · Brasileirão (preview)</a>
      </div>
    </footer>`
      : "";

    root.innerHTML = `
<div class="rt-team-shell">
  <div class="rt-team-dev-page">
    <div class="rt-team-dev-container">
      <div class="rt-team-dev-top">
      <header class="rt-team-dev-hero">
        <div class="rt-team-dev-hero-grid">
          <div class="rt-team-dev-hero-emblem">${logoHtml.replace("rt-team-id-logo", "rt-team-id-logo rt-team-dev-hero-logo")}</div>
          <div class="rt-team-dev-hero-copy">
            <h1 class="rt-team-dev-hero-name">${esc(header.team_name || team.name)}</h1>
            <div class="rt-team-dev-hero-meta">
              <span class="rt-team-dev-hero-competition" id="rt_team_header_league"></span>
            </div>
          </div>
        </div>
      </header>

      ${identityHtml}
      </div>

      <nav class="rt-team-dev-nav" aria-label="Team page sections">
        <div class="rt-team-tabs rt-team-dev-tabs" role="tablist">${tabButtons.join("")}</div>
      </nav>

      <div class="rt-team-dev-stage">
        ${tabPanels.join("")}
      </div>
    </div>
    ${devFooterHtml}
  </div>
</div>`;

    const shell = root.querySelector(".rt-team-shell");
    const leagueSlot = root.querySelector("#rt_team_header_league");
    const profileEl = root.querySelector("#rt_team_profile_body");

    let currentTab = "profile";
    let profileSplitKey = "total";
    let statsSplitKey = "total";

    function syncProfileCompPills(activeId) {
      shell.querySelectorAll(".rt-team-comp-pill").forEach((p) => {
        p.classList.toggle("is-on", p.getAttribute("data-profile-comp") === String(activeId));
      });
    }

    function syncUrlCompetition() {
      try {
        const u = new URL(location.href);
        u.searchParams.set("team", teamId);
        u.searchParams.set("season", season);
        u.searchParams.set("competition", activeCompId);
        history.replaceState({}, "", u);
      } catch {
        /* ignore */
      }
    }

    function headerLeagueForTab(tab) {
      if (tab === "general") {
        return `<span class="rt-team-season-ctx">${esc(header.team_name || team.name)} · ${esc(
          String(season)
        )} · all competitions</span>`;
      }
      const cd = getCompData(activeCompId);
      const c = cd?.competition || {};
      return leagueLockupHtml(c);
    }

    function paintHeader() {
      if (leagueSlot) leagueSlot.innerHTML = headerLeagueForTab(currentTab);
    }

    function paintProfile() {
      if (!profileEl) return;
      const ui = teamPageUiForComp(activeCompId);
      if (ui && (ui.schema >= 2 || ui.contract === "team_page_ui_v2")) {
        profileEl.innerHTML = renderTeamPageUiHtml(ui);
        return;
      }
      profileEl.innerHTML =
        '<p class="rt-team-muted">Team profile dimension scores are precomputed in the data pipeline. Load a league snapshot that includes <code>team_page_ui_by_team_id</code> (e.g. Brasileirão <code>?competition=71</code> with matching season) for the full display contract.</p>';
    }

    function paintGeneral() {
      const inner = root.querySelector("#rt_team_general_inner");
      if (!inner) return;
      const ui = teamPageUiForComp(activeCompId);
      if (ui && (ui.schema >= 2 || ui.contract === "team_page_ui_v2")) {
        inner.innerHTML = `${renderTeamPageUiSummaryCards(ui.summary_cards)}
        <p class="rt-team-muted">Season totals from the league snapshot. Venue splits are not shown here — values are pipeline-frozen for this competition.</p>`;
        return;
      }
      const soAg = teamData.season_overview;
      if (soAg?.splits && soAg.trends) {
        const s = soAg.splits[statsSplitKey] || soAg.splits.total || {};
        const tr = soAg.trends[statsSplitKey] || soAg.trends.total || {};
        const scM = teamData.meta?.stats_completeness || {};
        inner.innerHTML = statsTabBody(s, tr, scM, null, null, null, showDevTeamChrome);
        return;
      }
      const cdGeneral = getCompData(activeCompId);
      if (!cdGeneral) {
        inner.innerHTML =
          '<p class="rt-team-muted">No competition context for General stats. Use <code>?competition=</code>.</p>';
        return;
      }
      if (previewBrTeamStatsDoc && previewBrSnapshotMatchesCompetition(previewBrTeamStatsDoc, cdGeneral)) {
        const row = findPreviewDisciplineRow(previewBrTeamStatsDoc, team.team_id);
        const standing =
          statsSplitKey === "total" && previewBrCompetitionDoc
            ? findPreviewStanding(previewBrCompetitionDoc, team.team_id)
            : null;
        inner.innerHTML = statsTabBodyPreview(statsSplitKey, row, standing, showDevTeamChrome);
        return;
      }
      const co = cdGeneral.competition_overview || {};
      const scC = cdGeneral.meta.stats_completeness || {};
      const s = co.splits?.[statsSplitKey] || {};
      const tr = co.trends?.[statsSplitKey] || {};
      inner.innerHTML = statsTabBody(s, tr, scC, null, null, null, showDevTeamChrome);
    }

    function paintCompPanels() {
      compPlayed.forEach((c) => {
        const id = String(c.competition_id);
        const el = root.querySelector(`#rt_team_comp_${id}_inner`);
        const cd = getCompData(id);
        if (!el || !cd) return;
        const uiComp = teamPageUiForComp(id);
        if (uiComp && (uiComp.schema >= 2 || uiComp.contract === "team_page_ui_v2")) {
          el.innerHTML = `${renderTeamPageUiSummaryCards(uiComp.summary_cards)}
          <p class="rt-team-muted">Season totals from the league snapshot for this competition.</p>`;
          return;
        }
        if (
          previewBrTeamStatsDoc &&
          previewBrSnapshotMatchesCompetition(previewBrTeamStatsDoc, cd)
        ) {
          const row = findPreviewDisciplineRow(previewBrTeamStatsDoc, team.team_id);
          const standing =
            statsSplitKey === "total" && previewBrCompetitionDoc
              ? findPreviewStanding(previewBrCompetitionDoc, team.team_id)
              : null;
          el.innerHTML = statsTabBodyPreview(statsSplitKey, row, standing, showDevTeamChrome);
          return;
        }
        const co = cd.competition_overview || {};
        const scC = cd.meta.stats_completeness || {};
        const s = co.splits?.[statsSplitKey] || {};
        const tr = co.trends?.[statsSplitKey] || {};
        el.innerHTML = statsTabBody(s, tr, scC, null, null, null, showDevTeamChrome);
      });
    }

    function setStatsSplit(v) {
      statsSplitKey = v || "total";
      paintGeneral();
      paintCompPanels();
      syncSplitGroup(shell, "general", statsSplitKey);
      compPlayed.forEach((c) => {
        const id = String(c.competition_id);
        if (compMap.get(id)) syncSplitGroup(shell, `comp-${id}`, statsSplitKey);
      });
    }

    function paintAll() {
      paintHeader();
      paintProfile();
      paintGeneral();
      paintCompPanels();
    }

    paintAll();
    syncUrlCompetition();

    bindSplit(shell, "profile", (v) => {
      profileSplitKey = v || "total";
      paintProfile();
    });
    bindSplit(shell, "general", (v) => setStatsSplit(v));
    compPlayed.forEach((c) => {
      const id = String(c.competition_id);
      if (compMap.get(id)) bindSplit(shell, `comp-${id}`, (v) => setStatsSplit(v));
    });

    shell.querySelectorAll("[data-profile-comp]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-profile-comp");
        if (!id || !getCompData(id)) return;
        activeCompId = id;
        activeCompetitionData = getCompData(id);
        syncUrlCompetition();
        syncProfileCompPills(activeCompId);
        paintProfile();
        paintHeader();
        if (currentTab === "general") paintGeneral();
      });
    });

    shell.querySelectorAll(".rt-team-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.getAttribute("data-tab");
        if (!tab) return;
        const prevTab = currentTab;
        currentTab = tab;
        if (tab.startsWith("comp-")) {
          const id = tab.slice("comp-".length);
          if (getCompData(id)) {
            activeCompId = id;
            activeCompetitionData = getCompData(id);
            syncUrlCompetition();
            syncProfileCompPills(activeCompId);
            paintProfile();
            if (prevTab === "general") paintGeneral();
          }
        }
        activateTab(shell, tab);
        paintHeader();
        if (tab === "general") paintGeneral();
      });
    });

    syncSplitGroup(shell, "profile", profileSplitKey);
    syncSplitGroup(shell, "general", statsSplitKey);
    compPlayed.forEach((c) => {
      const id = String(c.competition_id);
      if (compMap.get(id)) syncSplitGroup(shell, `comp-${id}`, statsSplitKey);
    });

    const hash = (location.hash || "").replace(/^#/, "");
    if (hash && shell.querySelector(`[data-tab="${hash}"]`)) {
      currentTab = hash;
      if (hash.startsWith("comp-")) {
        const id = hash.slice("comp-".length);
        if (getCompData(id)) {
          activeCompId = id;
          activeCompetitionData = getCompData(id);
          syncUrlCompetition();
        }
      }
      activateTab(shell, hash);
      paintHeader();
      if (hash.startsWith("comp-")) {
        syncProfileCompPills(activeCompId);
        paintProfile();
      }
    }
  }

  run().catch((e) => {
    console.error("[team-page]", e);
    root.innerHTML =
      '<div class="rt-team-shell"><p class="rt-team-muted">Unable to load this team page.</p></div>';
  });
})();
