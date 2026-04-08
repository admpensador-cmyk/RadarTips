const LANGS = ["en","pt","es","fr","de"];
const LEGAL_PATHS = {
  en: { how:"/en/how-it-works/", about:"/en/about/", contact:"/en/contact/", terms:"/en/terms/", privacy:"/en/privacy/", aff:"/en/affiliates/", rg:"/en/responsible-gambling/" },
  pt: { how:"/pt/como-funciona/", about:"/pt/sobre/", contact:"/pt/contato/", terms:"/pt/termos/", privacy:"/pt/privacidade/", aff:"/pt/afiliados/", rg:"/pt/jogo-responsavel/" },
  es: { how:"/es/como-funciona/", about:"/es/sobre/", contact:"/es/contacto/", terms:"/es/terminos/", privacy:"/es/privacidad/", aff:"/es/afiliados/", rg:"/es/juego-responsable/" },
  fr: { how:"/fr/comment-ca-marche/", about:"/fr/a-propos/", contact:"/fr/contact/", terms:"/fr/conditions/", privacy:"/fr/confidentialite/", aff:"/fr/affiliation/", rg:"/fr/jeu-responsable/" },
  de: { how:"/de/so-funktioniert-es/", about:"/de/uber-uns/", contact:"/de/kontakt/", terms:"/de/bedingungen/", privacy:"/de/datenschutz/", aff:"/de/partnerhinweis/", rg:"/de/verantwortungsvolles-spielen/" }
};

function renderComplianceFooter(lang){
  const foot = qs(".footer");
  if(!foot) return;
  const p = LEGAL_PATHS[lang] || LEGAL_PATHS.en;
  const labels = {
    en:{how:"How it works",about:"About",contact:"Contact",terms:"Terms",privacy:"Privacy",aff:"Affiliates",rg:"Responsible",note:"Informational content • We are not a bookmaker • 18+"},
    pt:{how:"Como funciona",about:"Sobre",contact:"Contato",terms:"Termos",privacy:"Privacidade",aff:"Afiliados",rg:"Jogo responsável",note:"Conteúdo informativo • Não somos casa de apostas • +18"},
    es:{how:"Cómo funciona",about:"Sobre",contact:"Contacto",terms:"Términos",privacy:"Privacidad",aff:"Afiliados",rg:"Juego responsable",note:"Contenido informativo • No somos casa de apuestas • 18+"},
    fr:{how:"Comment ça marche",about:"À propos",contact:"Contact",terms:"Conditions",privacy:"Confidentialité",aff:"Affiliation",rg:"Jeu responsable",note:"Contenu informatif • Pas un bookmaker • 18+"},
    de:{how:"So funktioniert es",about:"Über uns",contact:"Kontakt",terms:"Bedingungen",privacy:"Datenschutz",aff:"Affiliate",rg:"Verantwortungsvoll",note:"Info-Inhalt • Kein Buchmacher • 18+"}
  }[lang] || {how:"How it works",about:"About",contact:"Contact",terms:"Terms",privacy:"Privacy",aff:"Affiliates",rg:"Responsible",note:"Informational content • We are not a bookmaker • 18+"};

  foot.innerHTML = `
    <div class="foot-wrap">
      <div class="foot-links">
        <a href="${p.how}">${labels.how}</a>
        <a href="${p.about}">${labels.about}</a>
        <a href="${p.contact}">${labels.contact}</a>
        <a href="${p.terms}">${labels.terms}</a>
        <a href="${p.privacy}">${labels.privacy}</a>
        <a href="${p.aff}">${labels.aff}</a>
        <a href="${p.rg}">${labels.rg}</a>
      </div>
      <div class="foot-meta">
        <span>${labels.note}</span>
        <span>© <span id="year"></span> RadarTips</span>
      </div>
    </div>
  `;
}


function pathLang(){
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return LANGS.includes(seg) ? seg : null;
}
function detectLang(){
  const host = (location.hostname||"").toLowerCase();
  if(host.endsWith(".com.br")) return "pt";
  const n = (navigator.language||"").toLowerCase();
  if(n.startsWith("pt")) return "pt";
  if(n.startsWith("es")) return "es";
  if(n.startsWith("fr")) return "fr";
  if(n.startsWith("de")) return "de";
  return "en";
}
function pageType(){
  const parts = location.pathname.split("/").filter(Boolean);
  const p = parts.slice(1).join("/");
  if(p.startsWith("radar/day")) return "day";
  if(p.startsWith("calendar")) return "calendar";
  if(p.startsWith("team")) return "team";
  return null;
}

/** Explicit hydration contract on body (must match HTML + verify-no-zombie-radar.mjs). */
function rtSurface(){
  return (document.body && document.body.getAttribute("data-rt-surface")) || "";
}

function warnRtDomContract(p){
  if(!document.body) return;
  const shell = document.body.getAttribute("data-shell");
  if(shell !== "day-v2"){
    console.warn("[RadarTips] Radar product pages expect body[data-shell=day-v2].");
    return;
  }
  const surface = rtSurface();
  if(p === "day"){
    if(surface !== "radar-day"){
      console.warn("[RadarTips] radar/day: expected body[data-rt-surface=radar-day] (DOM contract).");
    }
    const n = qsa(".rt-slot[data-slot]").length;
    if(n !== 3){
      console.warn(`[RadarTips] radar/day: expected 3 .rt-slot[data-slot], found ${n}.`);
    }
  } else if(p === "calendar"){
    if(surface !== "calendar"){
      console.warn("[RadarTips] calendar: expected body[data-rt-surface=calendar] (DOM contract).");
    }
    if(qs(".rt-top3")){
      console.warn("[RadarTips] calendar: .rt-top3 must not exist on calendar surface.");
    }
    if(qsa(".rt-slot").length){
      console.warn("[RadarTips] calendar: .rt-slot must not exist on calendar surface.");
    }
  }
}
function fmtTime(isoUtc){
  try{
    const d = new Date(isoUtc);
    return new Intl.DateTimeFormat(undefined, {hour:"2-digit", minute:"2-digit"}).format(d);
  }catch{ return "--:--"; }
}
function localDateKey(isoUtc){
  try{
    const d = new Date(isoUtc);
    // en-CA yields YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {year:"numeric", month:"2-digit", day:"2-digit"}).format(d);
  }catch{ return ""; }
}
function fmtDateShortDDMM(date){
  try{
    return new Intl.DateTimeFormat("pt-BR", {day:"2-digit", month:"2-digit"}).format(date);
  }catch{ return "--/--"; }
}
function fmtDateLong(date, lang){
  try{
    // Keep weekday in current lang for clarity
    return new Intl.DateTimeFormat(lang || undefined, {weekday:"long", day:"2-digit", month:"2-digit", year:"numeric"}).format(date);
  }catch{ return ""; }
}
function squareFor(ch){
  if(ch==="W") return "g";
  if(ch==="D") return "y";
  return "r";
}

/** Snapshot `match_radar_ui.form_*_tokens`: display-only, no form aggregation in browser. */
function formSquaresFromRadarUiTokens(t, tokens, windowN){
  const n = Number(windowN || CAL_META?.form_window || 5);
  const missing = t.form_missing_tip || "Historical match details not provided yet.";
  const list = Array.isArray(tokens) ? tokens : [];
  if(!list.length){
    return Array.from({ length: n }).map(()=> `<span class="dot n" ${tipAttr(missing)}></span>`).join("");
  }
  return list.slice(0, n).map((ch)=>{
    const r = String(ch || "n").toLowerCase();
    if(r === "n") return `<span class="dot n" ${tipAttr(missing)}></span>`;
    const letter = r === "w" ? "W" : r === "l" ? "L" : "D";
    return `<span class="dot ${squareFor(letter)}" ${tipAttr(letter)}></span>`;
  }).join("");
}

const FETCH_NO_CACHE = { cache: "no-store", headers: { "cache-control": "no-cache" } };

async function fetchJsonStrict(url, label){
  const res = await fetch(url, FETCH_NO_CACHE);
  if(!res.ok){
    throw new Error(`[FATAL] ${label} HTTP ${res.status} ${url}`);
  }
  return res.json();
}

/** Single live data source for Radar product pages: Worker/R2 calendar_2d (embeds radar_day). */
async function fetchCalendar2dJson(){
  return fetchJsonStrict("/api/v1/calendar_2d", "calendar_2d");
}

/**
 * Geography + display names for the same league scope as `calendar_2d.meta.allowlist_league_ids`.
 * Used so leagues with no fixture in today/tomorrow still land in the correct sidebar bucket
 * (never a synthetic `country: "World"` club-football dump into Internationals).
 * @returns {Promise<Map<number, object>>}
 */
async function fetchCoverageAllowlistGeoByLeagueId(){
  const empty = new Map();
  try{
    const res = await fetch("/data/coverage_allowlist.json", FETCH_NO_CACHE);
    if(!res.ok) return empty;
    const j = await res.json();
    const leagues = j && Array.isArray(j.leagues) ? j.leagues : [];
    const map = new Map();
    for(const row of leagues){
      const id = Number(row && row.league_id);
      if(!Number.isFinite(id)) continue;
      map.set(id, row);
    }
    return map;
  }catch{
    return empty;
  }
}

function showFatalProductError(message){
  const el = document.createElement("div");
  el.setAttribute("role", "alert");
  el.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#1a0a0a;color:#fecaca;padding:max(16px,4vw);font:14px/1.5 system-ui,Segoe UI,sans-serif;overflow:auto;white-space:pre-wrap;word-break:break-word;";
  el.textContent = message;
  document.body.prepend(el);
}

/** @param {unknown} raw */
function calendarRawToMerged(raw){
  if(!raw || typeof raw !== "object"){
    throw new Error("[FATAL] calendar_2d: invalid payload (not an object)");
  }
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  const t = Array.isArray(raw.today) ? raw.today : [];
  const tm = Array.isArray(raw.tomorrow) ? raw.tomorrow : [];
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  const anchorToday = typeof meta.today === "string" && ymd.test(meta.today) ? meta.today : null;
  const anchorTomorrow = typeof meta.tomorrow === "string" && ymd.test(meta.tomorrow) ? meta.tomorrow : null;
  return {
    matches: t.concat(tm),
    form_window: Number(meta.form_window ?? 5),
    goals_window: Number(meta.goals_window ?? 5),
    anchorToday,
    anchorTomorrow,
  };
}

/**
 * Build coverage rows for the sidebar: calendar_2d allowlist + match-derived rows.
 * Prefers `meta.allowlist_leagues` from the pipeline; else hydrates from `coverage_allowlist.json` fetch map.
 * @param {unknown} raw
 * @param {Map<number, object>|undefined} geoByLeagueId fallback from fetchCoverageAllowlistGeoByLeagueId()
 * @returns {{ leagues: object[] }}
 */
function allowlistRowsFromCalendar2d(raw, geoByLeagueId){
  if(!raw || typeof raw !== "object"){
    throw new Error("[FATAL] allowlistRowsFromCalendar2d: invalid raw");
  }
  const geoMap = geoByLeagueId instanceof Map ? geoByLeagueId : new Map();
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  const embeddedById = new Map();
  const embList = Array.isArray(meta.allowlist_leagues) ? meta.allowlist_leagues : [];
  for(const r of embList){
    const lid = Number(r && r.league_id);
    if(Number.isFinite(lid)) embeddedById.set(lid, r);
  }
  const today = Array.isArray(raw.today) ? raw.today : [];
  const tomorrow = Array.isArray(raw.tomorrow) ? raw.tomorrow : [];
  const fromMatches = new Map();
  for(const m of today.concat(tomorrow)){
    const id = matchCompetitionId(m);
    if(!Number.isFinite(id)) continue;
    if(!fromMatches.has(id)){
      fromMatches.set(id, {
        league_id: id,
        country: String(m.country || "").trim(),
        display_name: String(m.competition || "").trim() || ("League " + id),
        region: null
      });
    }
  }
  const ids = Array.isArray(meta.allowlist_league_ids) ? meta.allowlist_league_ids : null;
  if(ids && ids.length){
    const rows = [];
    for(const idRaw of ids){
      const id = Number(idRaw);
      if(!Number.isFinite(id)) continue;
      if(fromMatches.has(id)){
        rows.push(fromMatches.get(id));
      } else {
        const emb = embeddedById.get(id);
        const geo = (emb && typeof emb === "object" ? emb : null) || geoMap.get(id);
        if(geo && typeof geo === "object"){
          rows.push({
            league_id: id,
            country: String(geo.country != null ? geo.country : "").trim(),
            display_name: String(geo.display_name != null ? geo.display_name : "").trim() || ("League " + id),
            region: geo.region != null && String(geo.region).trim() ? String(geo.region).trim() : null
          });
        } else {
          rows.push({
            league_id: id,
            country: "",
            display_name: "League " + id,
            region: null
          });
        }
      }
    }
    return { leagues: rows };
  }
  return { leagues: [...fromMatches.values()] };
}

/** @param {unknown} raw */
function headerLeagueCountFromCalendar2d(raw){
  if(!raw || typeof raw !== "object"){
    return 0;
  }
  const meta = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  const ids = meta.allowlist_league_ids;
  if(Array.isArray(ids) && ids.length > 0){
    return ids.length;
  }
  const n = Number(meta.leagues_count);
  if(Number.isFinite(n) && n > 0){
    return n;
  }
  return 0;
}

function assertRadarDayFromCalendar2d(calRaw){
  if(rtSurface() !== "radar-day"){
    return;
  }
  if(!qsa(top3SlotSelector()).length){
    return;
  }
  const meta = calRaw.meta && typeof calRaw.meta === "object" ? calRaw.meta : {};
  const hp = meta.home_page_ui;
  if(hp && hp.schema === "home_page_ui_v2" && Array.isArray(hp.top_picks) && hp.top_picks.length > 0){
    return;
  }
  const radar = calRaw.radar_day;
  const msg = "[FATAL] radar_day missing from /api/v1/calendar_2d (require object with non-empty highlights array)";
  if(!radar || typeof radar !== "object"){
    showFatalProductError(msg);
    throw new Error(msg);
  }
  if(!Array.isArray(radar.highlights) || radar.highlights.length === 0){
    showFatalProductError(msg);
    throw new Error(msg);
  }
}

function setText(id, val){
  const el = document.getElementById(id);
  if(el) el.textContent = val;
}
function setHTML(id, val){
  const el = document.getElementById(id);
  if(el) el.innerHTML = val;
}
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }

function escAttr(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("\"","&quot;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}
function tipAttr(text){
  const t = escAttr(text);
  return `title="${t}" data-tip="${t}"`;
}

function navRoutesEffectiveLang(){
  const L = String(LANG || pathLang() || "en").trim();
  return LANGS.includes(L) ? L : "en";
}

/** @param {"league"|"home"|"away"} which */
function navUrlFromRoutes(nav, which){
  if(!nav || nav.schema !== "home_nav_routes_v1") return "";
  const L = navRoutesEffectiveLang();
  const pick = (map)=>{
    if(!map || typeof map !== "object") return "";
    const u = map[L] != null ? map[L] : map.en;
    return u ? String(u) : "";
  };
  if(which === "league") return pick(nav.league_url_by_lang);
  if(which === "home") return pick(nav.home_team_url_by_lang);
  if(which === "away") return pick(nav.away_team_url_by_lang);
  return "";
}

function teamLineNavInnerHTML(name, crestInner, href){
  const inner = `${crestInner}<span>${escAttr(name)}</span>`;
  if(href){
    return `<a class="rt-surface-nav-link" href="${escAttr(href)}">${inner}</a>`;
  }
  return inner;
}

function rdPosterTeamNavHTML(name, crestInner, href){
  const inner =
    `<div class="rd-poster-crest">${crestInner}</div><span class="rd-poster-name">${escAttr(name)}</span>`;
  if(href){
    return `<div class="rd-poster-team"><a class="rt-surface-nav-link rd-poster-team-nav" href="${escAttr(href)}">${inner}</a></div>`;
  }
  return `<div class="rd-poster-team">${inner}</div>`;
}

// Inline icons (tiny, monochrome). Keeps UI "adult" without emojis.
const ICONS = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M5 4h2v3a4 4 0 0 1-2 3"/><path d="M19 4h-2v3a4 4 0 0 0 2 3"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18"/><path d="M12 3a15 15 0 0 0 0 18"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.2 6.4L21 10l-6.8 1.6L12 18l-2.2-6.4L3 10l6.8-1.6L12 2z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 5l7 7-7 7"/></svg>',
};

// --- Football identity helpers (lightweight crest badges) ---
function _hashHue(str){
  let h = 0;
  const s = String(str || "");
  for(let i=0;i<s.length;i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

function _initials(name){
  const s = String(name || "").trim();
  if(!s) return "??";
  const parts = s.split(/\s+/).filter(Boolean);
  if(parts.length === 1){
    return parts[0].slice(0, 3).toUpperCase();
  }
  const a = parts[0][0] || "";
  const b = parts[1][0] || "";
  const c = parts[parts.length-1][0] || "";
  const out = (a + b + (parts.length > 2 ? c : "")).toUpperCase();
  return out.slice(0, 3);
}

function crestHTML(teamName, teamId){
  const hue = _hashHue(teamName);
  const ini = _initials(teamName);
  const id = Number(teamId);
  if(Number.isFinite(id) && id > 0){
    const src = `https://media.api-sports.io/football/teams/${id}.png`;
    return `<span class="crest-wrap" aria-hidden="true"><img class="crest crest-img" src="${escAttr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="if(!this.naturalWidth||this.naturalWidth<8){this.style.display='none';}else{this.nextElementSibling.style.display='none';}" onerror="this.style.display='none';"><span class="crest crest-fallback" style="--h:${hue};display:inline-flex;">${escAttr(ini)}</span></span>`;
  }
  return `<span class="crest-wrap" aria-hidden="true"><span class="crest crest-fallback" style="--h:${hue};display:inline-flex;">${escAttr(ini)}</span></span>`;
}

/** Radar Day poster: crest image or lettermark only — no boxed tile (no .crest / .crest-wrap). */
function rdPosterCrestHTML(teamName, teamId){
  const ini = _initials(teamName);
  const id = Number(teamId);
  if(Number.isFinite(id) && id > 0){
    const src = `https://media.api-sports.io/football/teams/${id}.png`;
    return `<span class="rd-poster-crest-slot" aria-hidden="true">` +
      `<img class="rd-poster-crest-img" src="${escAttr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" ` +
      `onload="this.nextElementSibling&&(this.nextElementSibling.style.display='none');" ` +
      `onerror="this.style.display='none';var n=this.nextElementSibling;if(n)n.style.display='block';" />` +
      `<span class="rd-poster-crest-fallback" style="display:none" aria-hidden="true">${escAttr(ini)}</span>` +
      `</span>`;
  }
  return `<span class="rd-poster-crest-slot" aria-hidden="true"><span class="rd-poster-crest-fallback rd-poster-crest-fallback--solo">${escAttr(ini)}</span></span>`;
}

/** Competition logo for radar/day (API-Sports media); initials fallback, never empty. */
function navLeagueLogoHTML(leagueId, displayName){
  const hue = _hashHue(displayName);
  const ini = _initials(displayName);
  const id = Number(leagueId);
  if(Number.isFinite(id) && id > 0){
    const src = `https://media.api-sports.io/football/leagues/${id}.png`;
    return `<span class="rt-nav-league-logo-wrap" aria-hidden="true"><img class="rt-nav-league-logo-img" src="${escAttr(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onload="if(!this.naturalWidth||this.naturalWidth<8){this.style.display='none';}else{this.nextElementSibling.style.display='none';}" onerror="this.style.display='none';"><span class="rt-nav-league-logo-fallback" style="--h:${hue};">${escAttr(ini)}</span></span>`;
  }
  return `<span class="rt-nav-league-logo-wrap" aria-hidden="true"><span class="rt-nav-league-logo-fallback" style="--h:${hue};">${escAttr(ini)}</span></span>`;
}

function ico(name){
  return ICONS[name] || "";
}
function icoSpan(name){
  return `<span class="ico" aria-hidden="true">${ico(name)}</span>`;
}

// Lightweight tooltips using [data-tip]
function initTooltips(){
  if(document.querySelector(".radar-tooltip")) return;
  const tip = document.createElement("div");
  tip.className = "radar-tooltip";
  document.body.appendChild(tip);

  let active = null;

  function show(text, x, y){
    if(!text) return;
    tip.textContent = text;
    const pad = 14;
    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

    // Measure after setting text
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.classList.add("show");
    const r = tip.getBoundingClientRect();

    let nx = x + pad;
    let ny = y + pad;

    if(nx + r.width > vw - 8) nx = Math.max(8, vw - r.width - 8);
    if(ny + r.height > vh - 8) ny = Math.max(8, y - r.height - pad);

    tip.style.left = `${nx}px`;
    tip.style.top  = `${ny}px`;
  }

  function hide(){
    tip.classList.remove("show");
    active = null;
  }

  document.addEventListener("pointermove", (e)=>{
    // Mouse only: avoids random tooltips on touch scroll
    if(e.pointerType && e.pointerType !== "mouse") return;
    const el = e.target.closest("[data-tip]");
    if(!el){
      if(active) hide();
      return;
    }
    const text = el.getAttribute("data-tip") || "";
    if(!text){
      if(active) hide();
      return;
    }
    active = el;
    show(text, e.clientX, e.clientY);
  });

  document.addEventListener("pointerleave", (e)=>{
    if(e.pointerType && e.pointerType !== "mouse") return;
    if(e.target.closest && e.target.closest("[data-tip]")) hide();
  }, true);

  // Keyboard accessibility
  document.addEventListener("focusin", (e)=>{
    const el = e.target.closest && e.target.closest("[data-tip]");
    if(!el) return;
    const text = el.getAttribute("data-tip") || "";
    if(!text) return;
    const r = el.getBoundingClientRect();
    active = el;
    show(text, r.left + (r.width/2), r.top + (r.height/2));
  });

  document.addEventListener("focusout", (e)=>{
    const el = e.target.closest && e.target.closest("[data-tip]");
    if(el) hide();
  });
}

function syncLangPillsActive(lang){
  qsa("[data-lang]").forEach(b=>{
    const L = b.getAttribute("data-lang");
    b.classList.toggle("active", L === lang);
  });
}

/** Official site mark (PNG, do not substitute with redrawn SVG). Same asset on light/dark. */
const RT_OFFICIAL_LOGO_MARK = "/assets/logo-radartips-mark-official.png";
const RT_LOGO_ASSET_QS = "?v=7";

function headerLogoSrcForTheme(){
  return `${RT_OFFICIAL_LOGO_MARK}${RT_LOGO_ASSET_QS}`;
}

function refreshHeaderLogo(){
  const img = qs("#header_logo");
  if(!img) return;
  const path = headerLogoSrcForTheme();
  img.src = new URL(path, location.origin).href;
}

function formatHeaderValueLine(t, leagueCount){
  const raw = (t && t.header_value_template) || "Football insights • {{count}} leagues • 5 continents";
  const c = leagueCount > 0 ? String(leagueCount) : "—";
  const parts = raw.split("{{count}}");
  const span = `<span class="rt-header-value-num">${escAttr(c)}</span>`;
  const html = parts.map((p)=> escAttr(p)).join(span);
  const plain = parts.join(c);
  return { html, plain };
}

const COUNTRY_LABEL_TO_ISO = {
  argentina:"AR", australia:"AU", austria:"AT", belgium:"BE", bolivia:"BO", brazil:"BR",
  canada:"CA", chile:"CL", colombia:"CO", "costa rica":"CR", croatia:"HR", czechia:"CZ",
  denmark:"DK", ecuador:"EC", england:"GB", europe:"EU", finland:"FI", france:"FR",
  germany:"DE", greece:"GR", honduras:"HN", ireland:"IE", italy:"IT", japan:"JP",
  mexico:"MX", netherlands:"NL", norway:"NO", paraguay:"PY", peru:"PE", poland:"PL",
  portugal:"PT", romania:"RO", scotland:"GB", serbia:"RS", slovakia:"SK", slovenia:"SI",
  "south africa":"ZA", spain:"ES", sweden:"SE", switzerland:"CH", turkey:"TR", ukraine:"UA",
  uruguay:"UY", usa:"US", "united states":"US", venezuela:"VE", wales:"GB"
};

/** @returns {string|null} ISO 3166-1 alpha-2 upper, or null if unknown */
function countryLabelToIso(label){
  const s = String(label || "").trim().replace(/-/g, " ");
  if(!s) return null;
  const up = s.toUpperCase();
  if(up === "UK") return "GB";
  if(/^[A-Z]{2}$/.test(up)) return up;
  return COUNTRY_LABEL_TO_ISO[s.toLowerCase()] || null;
}

function countryFlagSvgFileCode(isoUpper){
  const up = String(isoUpper || "").trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(up)) return "xx";
  if(up === "UK") return "gb";
  return up.toLowerCase();
}

/** Graphic flag (SVG asset from /assets/flags/countries/). */
function countryFlagImgFromIso(iso, imgClass){
  const file = countryFlagSvgFileCode(iso);
  const src = `/assets/flags/countries/${file}.svg`;
  const cls = imgClass || "rt-flag-img";
  return `<img class="${escAttr(cls)}" src="${escAttr(src)}" alt="" width="20" height="15" decoding="async" loading="lazy" />`;
}

function regionGlobeIconHTML(wrapClass){
  const c = wrapClass || "rt-flag-fallback rt-flag-fallback--globe";
  return `<span class="${escAttr(c)}" aria-hidden="true">${icoSpan("globe")}</span>`;
}

/** Sidebar / calendar country row: flag image or neutral globe (no emoji, no ISO letters as “flags”). */
function countryFlagLeadHTML(countryLabel){
  const raw = String(countryLabel || "").trim();
  if(!raw || /^world$/i.test(raw)) return regionGlobeIconHTML();
  const iso = countryLabelToIso(raw);
  if(!iso) return regionGlobeIconHTML();
  return countryFlagImgFromIso(iso, "rt-flag-img");
}

/** Match row league line: EU / regional globe / country flag SVGs. */
function competitionMetaLeadHTML(item){
  const raw = String(item && item.country || "").trim();
  const comp = String(item && item.competition || "").trim();
  const compU = comp.toUpperCase();
  const worldish = !raw || /^world$/i.test(raw) || /^international$/i.test(raw);
  if(worldish){
    if(/UEFA|CHAMPIONS LEAGUE|EUROPA LEAGUE|CONFERENCE LEAGUE|EUROPA CONFERENCE|SUPER CUP|EUROPEAN/.test(compU)){
      return countryFlagImgFromIso("EU", "rt-flag-img rt-flag-img--slot");
    }
    if(/CONMEBOL|LIBERTADORES|SUDAMERICANA|RECOPA|CONCACAF|LEAGUES CUP|GOLD CUP|AFC|ASIAN CHAMPIONS|ACL\b|CAF|AFCON|AFRICAN/.test(compU)){
      return regionGlobeIconHTML("slot-league-flag slot-league-flag--icon");
    }
    return regionGlobeIconHTML("slot-league-flag slot-league-flag--icon");
  }
  const iso = countryLabelToIso(raw) || countryLabelToIso(raw.replace(/-/g, " "));
  if(iso) return countryFlagImgFromIso(iso, "rt-flag-img rt-flag-img--slot");
  return regionGlobeIconHTML("slot-league-flag slot-league-flag--icon");
}

function slotLeagueLineHTML(item){
  const ind = competitionMetaLeadHTML(item);
  const comp = escAttr(item.competition || "—");
  const time = escAttr(fmtTime(item.kickoff_utc));
  return `<div class="slot-league-line"><span class="slot-league-flagwrap" aria-hidden="true">${ind}</span> <span class="slot-league-comp">${comp}</span> <span class="slot-league-sep">—</span> <span class="slot-league-time">${time}</span></div>`;
}

/** Radar Day poster card: contexto competição (país · liga — hora), centrado. */
function slotRadarDayPosterContextHTML(item){
  const country = String(item && item.country || "").trim() || "—";
  const league = String(item && item.competition || "").trim() || "—";
  const time = escAttr(fmtTime(item.kickoff_utc));
  const leagueHref = navUrlFromRoutes(item && item.nav_routes, "league");
  const leagueEl = leagueHref
    ? `<a class="rt-surface-nav-link rd-poster-ctx-league-link" href="${escAttr(leagueHref)}">${escAttr(league)}</a>`
    : `<span class="rd-poster-ctx-league">${escAttr(league)}</span>`;
  return `<div class="rd-poster-ctx">
    <span class="rd-poster-ctx-country">${escAttr(country)}</span>
    ${leagueEl}
    <span class="rd-poster-ctx-sep" aria-hidden="true">—</span>
    <span class="rd-poster-ctx-time">${time}</span>
  </div>`;
}

/** home_page_ui top_pick row — kickoff string is pipeline-frozen per locale. */
function slotRadarDayPosterContextHTMLFromPick(pick, lang){
  const country = String(pick && pick.country || "").trim() || "—";
  const league = String(pick && pick.competition || "").trim() || "—";
  const kd =
    pick.kickoff_display_by_lang && (pick.kickoff_display_by_lang[lang] || pick.kickoff_display_by_lang.en);
  const time = escAttr(kd || "--:--");
  const leagueHref = navUrlFromRoutes(pick && pick.nav_routes, "league");
  const leagueEl = leagueHref
    ? `<a class="rt-surface-nav-link rd-poster-ctx-league-link" href="${escAttr(leagueHref)}">${escAttr(league)}</a>`
    : `<span class="rd-poster-ctx-league">${escAttr(league)}</span>`;
  return `<div class="rd-poster-ctx">
    <span class="rd-poster-ctx-country">${escAttr(country)}</span>
    ${leagueEl}
    <span class="rd-poster-ctx-sep" aria-hidden="true">—</span>
    <span class="rd-poster-ctx-time">${time}</span>
  </div>`;
}

async function applyShellHeader(lang, t, leagueCount){
  if(!qs(".rt-header")) return;
  const home = qs("#header_home_link");
  if(home) home.href = `/${lang}/radar/day/`;
  refreshHeaderLogo();
  const n = leagueCount == null ? 0 : Number(leagueCount);
  const valEl = qs("#header_value_line");
  if(valEl){
    const { html, plain } = formatHeaderValueLine(t, n);
    valEl.innerHTML = html;
    valEl.setAttribute("title", plain);
  }
}

function setNav(lang, t){
  const map = {
    day: `/${lang}/radar/day/`,
    calendar: `/${lang}/calendar/`
  };
  qsa("[data-nav]").forEach(a=>{
    const k=a.getAttribute("data-nav");
    const href = map[k];
    if(!href) return;
    a.href = href;
    a.textContent = k==="day" ? t.nav_day : t.nav_calendar;
    a.classList.toggle("active", location.pathname.startsWith(href));
    a.setAttribute("data-tip", a.textContent);
    a.title = a.textContent;
  });

  // Language pills get decorated later with flags
  qsa("[data-lang]").forEach(b=>{
    const L=b.getAttribute("data-lang");
    b.classList.toggle("active", L===lang);
  });
}

function matchKey(m){
  return encodeURIComponent(`${m.kickoff_utc}|${m.home}|${m.away}`);
}

function top3SlotSelector(){
  return ".rt-slot[data-slot]";
}

function fmtDateShortFromDate(date){
  try{
    return new Intl.DateTimeFormat(LANG || undefined, { day:"2-digit", month:"2-digit" }).format(date);
  }catch{ return ""; }
}

/** Top six: English alphabetical by country (Brazil, England, France, Germany, Italy, Spain). */
const NAV_TOP_LEAGUE_IDS = [71, 39, 61, 78, 135, 140];

function cmpTopLeagueIdsByNavOrder(aId, bId){
  const ia = NAV_TOP_LEAGUE_IDS.indexOf(Number(aId));
  const ib = NAV_TOP_LEAGUE_IDS.indexOf(Number(bId));
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
}

/** Fixed English A–Z by country order for the top-six sidebar/calendar rows. */
function cmpTopLeagueRowsByNavOrder(a, b){
  return cmpTopLeagueIdsByNavOrder(a.league_id, b.league_id);
}

/**
 * Country line for calendar top-league headers when API/allowlist omits country or uses placeholders.
 * Keeps UI aligned with real geography regardless of calendar_2d shape (meta-only allowlist, sparse matches).
 */
const TOP_LEAGUE_COUNTRY_BY_ID = {
  39: "England",
  140: "Spain",
  78: "Germany",
  135: "Italy",
  71: "Brazil",
  61: "France",
};

/** When a top league id is missing from the coverage model (should not happen if allowlist is aligned). */
function topLeagueSidebarFallbackRow(leagueId){
  const id = Number(leagueId);
  if(!NAV_TOP_LEAGUE_IDS.includes(id)) return null;
  const display = {
    71: "Brasileirão",
    39: "Premier League",
    61: "Ligue 1",
    78: "Bundesliga",
    135: "Serie A",
    140: "La Liga"
  };
  const country = TOP_LEAGUE_COUNTRY_BY_ID[id];
  if(!country || !display[id]) return null;
  return { league_id: id, country, display_name: display[id], region: null };
}
const NAV_CONTINENT_ORDER = ["America", "Europe", "Asia", "Africa", "Oceania"];
/** Calendar / Internationals: continent blocks under the International section (Europe first). */
const NAV_INTL_CONTINENT_ORDER = ["Europe", "America", "Asia", "Africa", "Oceania"];
const NAV_SECTION_EXPANDED = new Map();
const SIDEBAR_LEAGUE_MODE_KEY = "rt_sidebar_league_mode";
/** v2: clean group expand state (ignore legacy v1 blob). */
const RT_CAL_GROUP_STORAGE_KEY = "rt_cal_group_expanded_v2";

function calCountryStorageKey(sectionKey, continent, country){
  const c = String(country || "").trim();
  if(sectionKey === "others" && continent) return `o:${continent}:${c}`;
  if(sectionKey === "world") return `w:${c}`;
  if(sectionKey === "intl") return continent ? `i:${continent}:${c}` : `i::${c}`;
  return `x:${c}`;
}

function calGroupPanelId(storageKey){
  return "rt-cal-panel-" + String(storageKey || "x").replace(/[^a-zA-Z0-9_-]/g, "-");
}

/**
 * Default-expanded calendar group (one “tier” at a time): Top `t:` → else all `i:` → else all `w:` →
 * else only `o:{continent}:` for the first continent in NAV_CONTINENT_ORDER that has data (America, Europe, …).
 */
function buildCalExpandContext(hasTopCal, tree){
  const hasIntl = intlCalendarTreeHasAny(tree.intl);
  const hasWorld = tree.world.size > 0;
  let firstContinentWithData = null;
  if(!hasTopCal && !hasIntl && !hasWorld){
    for(const cont of NAV_CONTINENT_ORDER){
      const cMap = tree.others.get(cont);
      if(cMap && cMap.size){
        firstContinentWithData = cont;
        break;
      }
    }
  }
  return { hasTopCal, hasIntl, hasWorld, firstContinentWithData };
}

function calGroupDefaultExpanded(storageKey, ctx){
  const sk = String(storageKey || "");
  if(ctx.hasTopCal) return sk.startsWith("t:");
  if(ctx.hasIntl) return sk.startsWith("i:");
  if(ctx.hasWorld) return sk.startsWith("w:");
  if(ctx.firstContinentWithData) return sk.startsWith(`o:${ctx.firstContinentWithData}:`);
  return false;
}

function readCalGroupExpanded(storageKey, calExpandCtx){
  const ctx = calExpandCtx || {};
  const defaultExpanded = calGroupDefaultExpanded(String(storageKey || ""), ctx);
  try{
    const raw = sessionStorage.getItem(RT_CAL_GROUP_STORAGE_KEY);
    if(!raw) return defaultExpanded;
    const o = JSON.parse(raw);
    if(Object.prototype.hasOwnProperty.call(o, storageKey)) return !!o[storageKey];
  }catch(e){}
  return defaultExpanded;
}

function persistCalGroupExpanded(storageKey, expanded){
  try{
    const raw = sessionStorage.getItem(RT_CAL_GROUP_STORAGE_KEY) || "{}";
    const o = JSON.parse(raw);
    o[storageKey] = !!expanded;
    sessionStorage.setItem(RT_CAL_GROUP_STORAGE_KEY, JSON.stringify(o));
  }catch(e){}
}

function partitionTopLeagueMatches(matches){
  const top = new Set(NAV_TOP_LEAGUE_IDS);
  const topMatches = [];
  const restMatches = [];
  for(const m of matches){
    const id = matchCompetitionId(m);
    if(Number.isFinite(id) && top.has(id)) topMatches.push(m);
    else restMatches.push(m);
  }
  return { topMatches, restMatches };
}

function filteredHasTopLeagueMatches(filtered){
  const top = new Set(NAV_TOP_LEAGUE_IDS);
  for(const m of filtered){
    const id = matchCompetitionId(m);
    if(Number.isFinite(id) && top.has(id)) return true;
  }
  return false;
}

function intlCalendarTreeHasAny(intlByContinent){
  for(const countryMap of intlByContinent.values()){
    if(countryMap && countryMap.size) return true;
  }
  return false;
}

function isPlaceholderTopLeagueCountry(s){
  const c = String(s || "").trim();
  if(!c || c === "—") return true;
  if(/^world$/i.test(c)) return true;
  if(/^international$/i.test(c)) return true;
  return false;
}

/** Resolve country label for collapsible top-league calendar rows (matches + allowlist row + static fallback). */
function topLeagueHeaderCountryLabel(leagueId, allowlistRow, matches){
  const lid = Number(leagueId);
  for(const m of matches || []){
    const c = String(m && m.country || "").trim();
    if(c && !isPlaceholderTopLeagueCountry(c)) return c;
  }
  const rowCountry = allowlistRow ? String(allowlistRow.country || "").trim() : "";
  if(rowCountry && !isPlaceholderTopLeagueCountry(rowCountry)) return rowCountry;
  const fb = TOP_LEAGUE_COUNTRY_BY_ID[lid];
  if(fb) return fb;
  for(const m of matches || []){
    const c = String(m && m.country || "").trim();
    if(c) return c;
  }
  if(rowCountry) return rowCountry;
  return "—";
}

/** One delegation path: every GROUP uses the same toggle + hidden panel semantics. */
function ensureCalGroupToggleDelegation(){
  const cal = qs("#calendar");
  if(!cal || cal.dataset.rtCalGroupToggle === "1") return;
  cal.dataset.rtCalGroupToggle = "1";
  cal.addEventListener("click", (e)=>{
    const btn = e.target.closest(".rt-cal-group-toggle");
    if(!btn || !cal.contains(btn)) return;
    e.preventDefault();
    const wrap = btn.closest(".rt-cal-group");
    if(!wrap) return;
    const panel = wrap.querySelector(".rt-cal-group-body");
    const willCollapse = !wrap.classList.contains("rt-cal-group--collapsed");
    wrap.classList.toggle("rt-cal-group--collapsed", willCollapse);
    if(panel) panel.hidden = willCollapse;
    btn.setAttribute("aria-expanded", willCollapse ? "false" : "true");
    const key = wrap.getAttribute("data-rt-cal-group-key");
    if(key) persistCalGroupExpanded(key, !willCollapse);
  });
}

function loadSidebarLeagueMode(){
  try{
    const v = String(sessionStorage.getItem(SIDEBAR_LEAGUE_MODE_KEY) || "").trim();
    if(v === "with_matches" || v === "all") return v;
  }catch(e){}
  return "with_matches";
}

function saveSidebarLeagueMode(mode){
  try{
    sessionStorage.setItem(SIDEBAR_LEAGUE_MODE_KEY, mode);
  }catch(e){}
}

/**
 * Sidebar league list modes (see renderNavLeagueModeToggle):
 * - with_matches: only leagues that have ≥1 match for the active day/filter (and search).
 * - all: full coverage catalog for that surface — every league row, including (0) when no matches.
 *   (Product rule: "All leagues" is self-explanatory; do not hide zero-count rows in this mode.)
 */
function navShowLeagueInSidebar(matchCount, leagueListMode){
  if(leagueListMode === "with_matches") return matchCount > 0;
  return true;
}

function renderNavLeagueModeToggle(t, leagueListMode){
  const allOn = leagueListMode === "all";
  const group = t.nav_leagues_mode_group || "League list";
  const a = t.nav_leagues_list_all || "All leagues";
  const b = t.nav_leagues_with_matches || "Leagues with matches";
  return `<div class="rt-nav-league-mode" role="group" aria-label="${escAttr(group)}">
  <button type="button" class="rt-nav-mode-btn${!allOn ? " active" : ""}" data-rt-league-mode="with_matches" aria-pressed="${!allOn ? "true" : "false"}">${escAttr(b)}</button>
  <button type="button" class="rt-nav-mode-btn${allOn ? " active" : ""}" data-rt-league-mode="all" aria-pressed="${allOn ? "true" : "false"}">${escAttr(a)}</button>
</div>`;
}

function navSectionExpandedState(key){
  if(!NAV_SECTION_EXPANDED.has(key)) NAV_SECTION_EXPANDED.set(key, key === "topLeagues");
  return NAV_SECTION_EXPANDED.get(key);
}

/** After selecting a league/country/bucket in the sidebar, keep its section expanded on re-render. */
function ensureNavExpandedForSelection(selectedNav){
  const M = COVERAGE_NAV_MODEL;
  if(!M || !selectedNav) return;
  const t = selectedNav.type;
  if(t === "all") return;
  if(t === "bucket"){
    if(selectedNav.bucket === "world") NAV_SECTION_EXPANDED.set("world", true);
    if(selectedNav.bucket === "international") NAV_SECTION_EXPANDED.set("intl", true);
    return;
  }
  if(t === "continent"){
    NAV_SECTION_EXPANDED.set(`cont:${selectedNav.continent}`, true);
    return;
  }
  if(t === "country"){
    NAV_SECTION_EXPANDED.set(`cont:${selectedNav.continent}`, true);
    return;
  }
  if(t === "league" && Number.isFinite(selectedNav.id)){
    const id = selectedNav.id;
    if(NAV_TOP_LEAGUE_IDS.includes(id)){
      NAV_SECTION_EXPANDED.set("topLeagues", true);
      return;
    }
    if(M.intlIds.has(id)){
      NAV_SECTION_EXPANDED.set("intl", true);
      return;
    }
    if(M.worldIds.has(id)){
      NAV_SECTION_EXPANDED.set("world", true);
      return;
    }
    const row = M.leagueById.get(id);
    if(row) NAV_SECTION_EXPANDED.set(`cont:${domesticContinentKey(row)}`, true);
  }
}

function navCollapsibleSection(sectionKey, expanded, title, count, mainSpec, bodyHtml, selKey, headIconSlotHtml){
  const collapsed = !expanded;
  const mainActive = mainSpec && navMatches(mainSpec, selKey) ? " active" : "";
  const mainMiddle = mainSpec
    ? `<button type="button" class="rt-nav-section-main${mainActive}" ${navDataAttrs(mainSpec)}><span class="rt-nav-section-main-text">${escAttr(title)}</span></button>`
    : `<span class="rt-nav-section-label">${escAttr(title)}</span>`;
  const icon = headIconSlotHtml || "";
  const headMod = icon ? "" : " rt-nav-category-head--abstract";
  return `<div class="rt-nav-section rt-nav-section--collapsible${collapsed ? " rt-nav-section--collapsed" : ""}" data-section-key="${escAttr(sectionKey)}">
  <div class="rt-nav-section-head rt-nav-category-head${headMod}">
    <button type="button" class="rt-nav-section-toggle rt-nav-section-toggle--contract" data-rt-nav-toggle="1" aria-expanded="${expanded ? "true" : "false"}" aria-label="Expand or collapse section"></button>
    ${icon}
    ${mainMiddle}
    <span class="rt-country-count">(${count})</span>
  </div>
  <div class="rt-nav-section-body">${bodyHtml}</div>
</div>`;
}

function continentCategoryEmoji(cont){
  const map = { America:"🌎", Europe:"🇪🇺", Asia:"🌏", Africa:"🌍", Oceania:"🏝️" };
  return map[cont] || "🌍";
}

let COVERAGE_NAV_MODEL = null;

function matchCompetitionId(m){
  const raw = m && (m.competition_id != null ? m.competition_id : m.league_id);
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

const NAV_NT_CONFEDERATION_LEAGUE_IDS = new Set([4, 5, 9, 19, 22, 536, 806]);

function nationalTeamInternationalRow(row){
  const id = Number(row.league_id);
  if(!Number.isFinite(id)) return false;
  const nm = String(row.display_name || "").toLowerCase();
  if(NAV_NT_CONFEDERATION_LEAGUE_IDS.has(id)) return true;
  if(/\bnations league\b/i.test(nm) && !/champions|club/i.test(nm)) return true;
  if(/\bliga das na[cç][oõ]es\b/i.test(nm)) return true;
  if(/\beuro(pean)? championship\b/i.test(nm)) return true;
  if(/\bcopa america\b/i.test(nm)) return true;
  if(/\bafrica cup of nations\b|\bafcon\b/i.test(nm)) return true;
  if(/\bgold cup\b/i.test(nm)) return true;
  if(/\bofc nations cup\b/i.test(nm)) return true;
  if(/\bfifa world cup\b/i.test(nm) && !/club/i.test(nm)) return true;
  return false;
}

function coverageBucket(row){
  const country = String(row.country || "").trim();
  const id = Number(row.league_id);
  if(country.startsWith("World / FIFA")){
    if(id === 1) return "world";
    return "international";
  }
  if(country === "World") return "international";
  if(
    country === "Europe / UEFA" ||
    country.includes("CONMEBOL") ||
    country.includes("CONCACAF") ||
    country.includes("Africa / CAF") ||
    country.includes("Oceania / OFC")
  ){
    if(nationalTeamInternationalRow(row)) return "world";
    return "international";
  }
  return "domestic";
}

/** Continent bucket for international allowlist rows (calendar Internationals section). */
function internationalContinentKey(row){
  const c = String(row.country || "").trim();
  if(/Europe|UEFA/i.test(c)) return "Europe";
  if(/South America|CONMEBOL/i.test(c)) return "America";
  if(/North America|CONCACAF|Central America|Caribbean/i.test(c)) return "America";
  if(/Africa|CAF/i.test(c)) return "Africa";
  if(/Oceania|OFC/i.test(c)) return "Oceania";
  if(/Asia|AFC/i.test(c)) return "Asia";

  const r = String(row.region || "").trim();
  if(r === "South America" || r === "North America" || r === "Central America" || r === "Caribbean") return "America";
  if(r === "Europe" || r === "Asia" || r === "Africa" || r === "Oceania") return r;
  if(r === "Middle East") return "Asia";

  if(/^World\s*\/\s*FIFA/i.test(c) || c === "World") return "Europe";

  return domesticContinentKey(row);
}

function sidebarLeagueDisplayName(leagueId, displayName){
  const id = Number(leagueId);
  if(id === 71) return "Brasileirão";
  const s = String(displayName || "").trim();
  return s || `League ${id}`;
}

function normalizeDomesticCountryKey(country){
  const c = String(country || "").trim();
  if(!c) return "";
  const low = c.toLowerCase();
  if(low === "usa" || low === "u.s.a." || low === "u.s." || /^united states(\s+of\s+america)?$/i.test(low)) return "USA";
  return c;
}

/** Canonical continent for domestic allowlist rows when `region` is missing or ambiguous. Never default all unknowns to Europe. */
function domesticContinentKey(row){
  const region = String(row.region || "").trim();
  if(region === "South America" || region === "North America" || region === "Central America" || region === "Caribbean") return "America";
  if(region === "Europe" || region === "Asia" || region === "Africa" || region === "Oceania") return region;
  if(region === "Middle East") return "Asia";

  const rawCountry = String(row.country || "").trim();
  const country = normalizeDomesticCountryKey(rawCountry) || rawCountry;

  const COUNTRY_CONTINENT = {
    /* Americas */
    USA: "America",
    Canada: "America",
    Mexico: "America",
    Brazil: "America",
    Argentina: "America",
    Chile: "America",
    Colombia: "America",
    Uruguay: "America",
    Paraguay: "America",
    Peru: "America",
    Ecuador: "America",
    "Costa Rica": "America",
    /* Europe */
    England: "Europe",
    Scotland: "Europe",
    Wales: "Europe",
    "Northern Ireland": "Europe",
    Ireland: "Europe",
    France: "Europe",
    Germany: "Europe",
    Italy: "Europe",
    Spain: "Europe",
    Portugal: "Europe",
    Netherlands: "Europe",
    Belgium: "Europe",
    Austria: "Europe",
    Switzerland: "Europe",
    Poland: "Europe",
    Greece: "Europe",
    Turkey: "Europe",
    Ukraine: "Europe",
    Croatia: "Europe",
    Serbia: "Europe",
    Romania: "Europe",
    Czechia: "Europe",
    "Czech Republic": "Europe",
    Sweden: "Europe",
    Norway: "Europe",
    Denmark: "Europe",
    Finland: "Europe",
    Russia: "Europe",
    /* Asia */
    Japan: "Asia",
    "South Korea": "Asia",
    Korea: "Asia",
    China: "Asia",
    India: "Asia",
    "Saudi Arabia": "Asia",
    Qatar: "Asia",
    "United Arab Emirates": "Asia",
    UAE: "Asia",
    Iran: "Asia",
    Iraq: "Asia",
    Thailand: "Asia",
    Vietnam: "Asia",
    Indonesia: "Asia",
    /* Oceania */
    Australia: "Oceania",
    "New Zealand": "Oceania",
    /* Africa */
    Egypt: "Africa",
    Morocco: "Africa",
    Nigeria: "Africa",
    Ghana: "Africa",
    Senegal: "Africa",
    Cameroon: "Africa",
    "South Africa": "Africa",
    Angola: "Africa",
    Algeria: "Africa",
    Tunisia: "Africa",
    Kenya: "Africa",
    "Ivory Coast": "Africa",
  };

  if(COUNTRY_CONTINENT[country]) return COUNTRY_CONTINENT[country];
  if(COUNTRY_CONTINENT[rawCountry]) return COUNTRY_CONTINENT[rawCountry];

  if(typeof console !== "undefined" && console.warn){
    console.warn("[RadarTips] domesticContinentKey: unmapped country — add to COUNTRY_CONTINENT; using Europe fallback", rawCountry, row && row.league_id);
  }
  return "Europe";
}

function domesticCountryLabel(row){
  return String(row.country || "").trim() || "—";
}

function buildCoverageNavModel(allowlist){
  const rows = Array.isArray(allowlist && allowlist.leagues) ? allowlist.leagues : [];
  if(!rows.length) return null;

  const topSet = new Set(NAV_TOP_LEAGUE_IDS);
  const leagueById = new Map();
  const worldRows = [];
  const intlRows = [];
  const othersByContinent = new Map();
  const worldIds = new Set();
  const intlIds = new Set();
  const continentAllIds = new Map();
  const countryAllIds = new Map();

  function ensureCont(cont){
    if(!othersByContinent.has(cont)) othersByContinent.set(cont, new Map());
    return othersByContinent.get(cont);
  }
  function addCountryRow(cont, country, row){
    const m = ensureCont(cont);
    if(!m.has(country)) m.set(country, []);
    m.get(country).push(row);
  }
  function trackId(map, key, id){
    if(!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  }

  for(const row of rows){
    const id = Number(row.league_id);
    if(!Number.isFinite(id)) continue;
    leagueById.set(id, row);
    const bucket = coverageBucket(row);
    if(bucket === "world"){
      worldIds.add(id);
      worldRows.push(row);
      continue;
    }
    if(bucket === "international"){
      intlIds.add(id);
      intlRows.push(row);
      continue;
    }
    const cont = domesticContinentKey(row);
    const country = domesticCountryLabel(row);
    addCountryRow(cont, country, row);
    trackId(continentAllIds, cont, id);
    trackId(countryAllIds, `${cont}\0${country}`, id);
  }

  const cmpName = (a, b)=> String(a.display_name || "").localeCompare(String(b.display_name || ""), undefined, { sensitivity: "base" });
  worldRows.sort(cmpName);
  intlRows.sort(cmpName);
  for(const [, countryMap] of othersByContinent){
    for(const [, list] of countryMap){
      list.sort((a, b)=>{
        const ida = Number(a.league_id), idb = Number(b.league_id);
        const ta = topSet.has(ida) ? 0 : 1, tb = topSet.has(idb) ? 0 : 1;
        if(ta !== tb) return ta - tb;
        return cmpName(a, b);
      });
    }
  }

  return {
    worldIds, intlIds, worldRows, intlRows, othersByContinent, continentAllIds, countryAllIds, leagueById,
  };
}

function navKey(nav){
  if(!nav || nav.type === "all") return "all";
  if(nav.type === "bucket") return `bucket:${nav.bucket}`;
  if(nav.type === "league") return `league:${nav.id}`;
  if(nav.type === "continent") return `continent:${nav.continent}`;
  if(nav.type === "country") return `country:${nav.continent}|${nav.country}`;
  return "all";
}

function navMatches(spec, selKey){
  return navKey(spec) === selKey;
}

function resolveNavLeagueIds(navFilter){
  if(navFilter == null || navFilter.type === "all") return null;
  const M = COVERAGE_NAV_MODEL;
  if(!M) return null;
  if(navFilter.type === "league") return new Set([navFilter.id]);
  if(navFilter.type === "bucket"){
    if(navFilter.bucket === "world") return new Set(M.worldIds);
    if(navFilter.bucket === "international") return new Set(M.intlIds);
    return new Set();
  }
  if(navFilter.type === "continent"){
    const s = M.continentAllIds.get(navFilter.continent);
    return s ? new Set(s) : new Set();
  }
  if(navFilter.type === "country"){
    const s = M.countryAllIds.get(`${navFilter.continent}\0${navFilter.country}`);
    return s ? new Set(s) : new Set();
  }
  return null;
}

function matchIdsForNavCounting(x){
  const ids = new Set();
  const c = Number(x && x.competition_id);
  const lid = Number(x && x.league_id);
  if(Number.isFinite(c) && c > 0) ids.add(c);
  if(Number.isFinite(lid) && lid > 0) ids.add(lid);
  if(ids.size === 0){
    const fb = matchCompetitionId(x);
    if(Number.isFinite(fb) && fb > 0) ids.add(fb);
  }
  return ids;
}

function buildLeagueMatchCounts(matches, activeDateKey, query){
  const m = new Map();
  const base = filterMatches(matches, activeDateKey, query, undefined);
  for(const x of base){
    for(const id of matchIdsForNavCounting(x)){
      m.set(id, (m.get(id) || 0) + 1);
    }
  }
  return m;
}

/** Snapshot league counts (no fixture scan) when search is empty. */
function countsFromHomePageUiOrFallback(activeDateKey, query){
  const q = normalize(query);
  if(q) return buildLeagueMatchCounts(CAL_MATCHES, activeDateKey, query);
  const h = HOME_PAGE_UI;
  if(!h || h.schema !== "home_page_ui_v2" || !h.counts || !h.counts.by_league_id){
    return buildLeagueMatchCounts(CAL_MATCHES, activeDateKey, query);
  }
  const todayK = h.counts.today_key;
  const tomK = h.counts.tomorrow_key;
  const by = h.counts.by_league_id;
  const map = new Map();
  for(const idStr of Object.keys(by)){
    const id = Number(idStr);
    if(!Number.isFinite(id)) continue;
    const row = by[idStr];
    let n = 0;
    if(activeDateKey === "both") n = row.both ?? 0;
    else if(activeDateKey === todayK) n = row.today ?? 0;
    else if(activeDateKey === tomK) n = row.tomorrow ?? 0;
    map.set(id, n);
  }
  return map;
}

function baseTotalFromHomePageUi(activeDateKey, query){
  const q = normalize(query);
  if(q) return filterMatches(CAL_MATCHES, activeDateKey, query, undefined).length;
  const h = HOME_PAGE_UI;
  if(!h || h.schema !== "home_page_ui_v2" || !h.counts?.base_by_date){
    return filterMatches(CAL_MATCHES, activeDateKey, query, undefined).length;
  }
  const bb = h.counts.base_by_date;
  if(activeDateKey === "both") return bb.both ?? 0;
  if(bb[activeDateKey] != null) return bb[activeDateKey];
  return filterMatches(CAL_MATCHES, activeDateKey, query, undefined).length;
}

function sumCountsForIds(idSet, counts){
  let s = 0;
  for(const id of idSet) s += (counts.get(id) || 0);
  return s;
}

function continentNavLabel(t, continentKey){
  if(continentKey === "America") return t.nav_america || "America";
  if(continentKey === "Europe") return t.nav_europe || "Europe";
  if(continentKey === "Asia") return t.nav_asia || "Asia";
  if(continentKey === "Africa") return t.nav_africa || "Africa";
  if(continentKey === "Oceania") return t.nav_oceania || "Oceania";
  return continentKey;
}

function navDataAttrs(spec){
  if(spec.type === "all") return `data-nav-type="all"`;
  if(spec.type === "bucket") return `data-nav-type="bucket" data-bucket="${escAttr(spec.bucket)}"`;
  if(spec.type === "league") return `data-nav-type="league" data-league-id="${spec.id}"`;
  if(spec.type === "continent") return `data-nav-type="continent" data-continent="${escAttr(spec.continent)}"`;
  if(spec.type === "country") return `data-nav-type="country" data-continent="${escAttr(spec.continent)}" data-country="${escAttr(spec.country)}"`;
  return `data-nav-type="all"`;
}

function cmpLeagueRowsByDisplayName(a, b){
  return String(a.display_name || "").localeCompare(String(b.display_name || ""), undefined, { sensitivity: "base" });
}

function cmpLeagueRowsForOthersNav(a, b){
  const topSet = new Set(NAV_TOP_LEAGUE_IDS);
  const ida = Number(a.league_id), idb = Number(b.league_id);
  const ta = topSet.has(ida) ? 0 : 1, tb = topSet.has(idb) ? 0 : 1;
  if(ta !== tb) return ta - tb;
  return cmpLeagueRowsByDisplayName(a, b);
}

/** In "all" mode: leagues with matches first; preserve secondary order. No-op order in "with_matches" mode. */
function orderSidebarLeagueRows(rows, counts, listMode, secondaryCmp){
  const arr = [...rows];
  if(listMode !== "all") return arr;
  arr.sort((a, b)=>{
    const ida = Number(a.league_id), idb = Number(b.league_id);
    const ca = counts.get(ida) || 0, cb = counts.get(idb) || 0;
    const pa = ca > 0 ? 0 : 1, pb = cb > 0 ? 0 : 1;
    if(pa !== pb) return pa - pb;
    return secondaryCmp(a, b);
  });
  return arr;
}

function navRowButton(spec, selKey, label, count, classNames, opts){
  const active = navMatches(spec, selKey) ? " active" : "";
  const cls = classNames.join(" ");
  const o = opts || {};
  const cntAccent = !!o.leagueRowCountAccent && Number(count) > 0;
  const cntClass = cntAccent ? "rt-country-count rt-country-count--has-matches" : "rt-country-count";
  const cnt = ` <span class="${cntClass}">(${count})</span>`;
  const hideChev = !!o.hideChevron;
  const chev = hideChev ? "" : `<span class="rt-chevron" aria-hidden="true">›</span>`;
  let lead = "";
  if(o.countryFlagHtml && o.leagueLogoHtml){
    lead = `<span class="rt-nav-row-leads" aria-hidden="true"><span class="rt-nav-flag">${o.countryFlagHtml}</span>${o.leagueLogoHtml}</span>`;
  } else if(o.leagueLogoHtml) lead = o.leagueLogoHtml;
  else if(o.categoryFlagHtml) lead = `<span class="rt-nav-flag" aria-hidden="true">${o.categoryFlagHtml}</span>`;
  return `<button type="button" class="${cls}${active}" ${navDataAttrs(spec)}>${lead}<span class="rt-nav-label">${escAttr(label)}</span>${cnt}${chev}</button>`;
}

function sortedCountryNamesForNav(countryMap){
  const TOP = new Set(NAV_TOP_LEAGUE_IDS);
  const names = [...countryMap.keys()];
  names.sort((a, b)=>{
    const leaguesA = countryMap.get(a) || [];
    const leaguesB = countryMap.get(b) || [];
    const aHas = leaguesA.some((row)=> TOP.has(Number(row.league_id)));
    const bHas = leaguesB.some((row)=> TOP.has(Number(row.league_id)));
    if(aHas !== bHas) return aHas ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  return names;
}

/** True if any league that would appear under this country in the sidebar has match count > 0. */
function countryNavHasAnyMatch(leagues, counts, listMode, topLeagueIdSet){
  for(const row of leagues || []){
    const id = Number(row.league_id);
    if(topLeagueIdSet.has(id) && coverageBucket(row) === "domestic") continue;
    if(!navShowLeagueInSidebar(counts.get(id) || 0, listMode)) continue;
    if((counts.get(id) || 0) > 0) return true;
  }
  return false;
}

/**
 * Country order under a continent: in "all" mode, countries with any visible league with matches first;
 * then existing secondary (top-tier country hint, then name). "with_matches" mode unchanged.
 */
function sortedCountryNamesForOthersNav(countryMap, listMode, counts, topLeagueIdSet){
  const TOP = new Set(NAV_TOP_LEAGUE_IDS);
  const names = [...countryMap.keys()];
  names.sort((a, b)=>{
    if(listMode === "all"){
      const leaguesA = countryMap.get(a) || [];
      const leaguesB = countryMap.get(b) || [];
      const ma = countryNavHasAnyMatch(leaguesA, counts, listMode, topLeagueIdSet);
      const mb = countryNavHasAnyMatch(leaguesB, counts, listMode, topLeagueIdSet);
      if(ma !== mb) return ma ? -1 : 1;
    }
    const leaguesA = countryMap.get(a) || [];
    const leaguesB = countryMap.get(b) || [];
    const aHas = leaguesA.some((row)=> TOP.has(Number(row.league_id)));
    const bHas = leaguesB.some((row)=> TOP.has(Number(row.league_id)));
    if(aHas !== bHas) return aHas ? -1 : 1;
    return a.localeCompare(b, undefined, { sensitivity: "base" });
  });
  return names;
}

function renderCoverageNav(t, activeDateKey, query, selectedNav, leagueListMode){
  const el = qs("#country_list");
  if(!el) return;
  const listMode = leagueListMode === "with_matches" ? "with_matches" : "all";
  if(!COVERAGE_NAV_MODEL){
    el.innerHTML = `<div class="rt-nav-fallback">${escAttr(t.nav_coverage_unavailable || "Coverage unavailable.")}</div>`;
    return;
  }
  const M = COVERAGE_NAV_MODEL;
  const counts = countsFromHomePageUiOrFallback(activeDateKey, query);
  const filteredForNav = filterMatches(CAL_MATCHES, activeDateKey, query, undefined);
  const matchesByLeagueId = new Map();
  for(const m of filteredForNav){
    const mid = matchCompetitionId(m);
    if(!Number.isFinite(mid)) continue;
    if(!matchesByLeagueId.has(mid)) matchesByLeagueId.set(mid, []);
    matchesByLeagueId.get(mid).push(m);
  }
  const selK = navKey(selectedNav);
  const baseTotal = baseTotalFromHomePageUi(activeDateKey, query);

  let html = "";
  html += navRowButton({ type: "all" }, selK, t.nav_all_matches || "All matches", baseTotal, ["rt-nav-row", "rt-nav-row--root"]);
  html += renderNavLeagueModeToggle(t, listMode);
  html += `<div class="rt-country-list-scroll">`;

  const topLeagueIdSet = new Set(NAV_TOP_LEAGUE_IDS);
  const topRows = [];
  for(const id of NAV_TOP_LEAGUE_IDS){
    let row = M.leagueById.get(id);
    if(!row){
      const fb = topLeagueSidebarFallbackRow(id);
      if(fb) row = fb;
    }
    if(!row) continue;
    const wc = counts.get(id) || 0;
    if(!navShowLeagueInSidebar(wc, listMode)) continue;
    topRows.push(row);
  }
  if(listMode === "all"){
    topRows.sort((a, b)=>{
      const ida = Number(a.league_id), idb = Number(b.league_id);
      const ca = counts.get(ida) || 0, cb = counts.get(idb) || 0;
      const pa = ca > 0 ? 0 : 1, pb = cb > 0 ? 0 : 1;
      if(pa !== pb) return pa - pb;
      return cmpTopLeagueRowsByNavOrder(a, b);
    });
  }else{
    topRows.sort(cmpTopLeagueRowsByNavOrder);
  }
  let topBody = "";
  let topCount = 0;
  for(const row of topRows){
    const id = Number(row.league_id);
    const wc = counts.get(id) || 0;
    topCount += wc;
    const nm = sidebarLeagueDisplayName(id, row.display_name || `League ${id}`);
    const ms = matchesByLeagueId.get(id) || [];
    const ctry = topLeagueHeaderCountryLabel(id, row, ms);
    const logo = navLeagueLogoHTML(id, nm);
    const label = ctry && ctry !== "—" ? `${ctry} · ${nm}` : nm;
    const flagInner = ctry && ctry !== "—" ? countryFlagLeadHTML(ctry) : "";
    const topOpts = flagInner
      ? { countryFlagHtml: flagInner, leagueLogoHtml: logo, hideChevron: true, leagueRowCountAccent: listMode === "all" }
      : { leagueLogoHtml: logo, hideChevron: true, leagueRowCountAccent: listMode === "all" };
    topBody += navRowButton({ type: "league", id }, selK, label, wc, ["rt-nav-row", "rt-nav-row--league", "rt-nav-row--league-child"], topOpts);
  }
  const showTopLeaguesNav = listMode === "all" || topCount > 0;
  if(showTopLeaguesNav){
    html += navCollapsibleSection(
      "topLeagues",
      navSectionExpandedState("topLeagues"),
      t.nav_top_leagues || "Top leagues",
      topCount,
      null,
      topBody,
      selK,
      `<span class="rt-nav-category-icon">${icoSpan("trophy")}</span>`
    );
  }

  const intlVisible = M.intlRows.filter((row)=>{
    const id = Number(row.league_id);
    return navShowLeagueInSidebar(counts.get(id) || 0, listMode);
  });
  const intlOrdered = orderSidebarLeagueRows(intlVisible, counts, listMode, cmpLeagueRowsByDisplayName);
  let intlBody = "";
  for(const row of intlOrdered){
    const id = Number(row.league_id);
    const ic = counts.get(id) || 0;
    const nm = sidebarLeagueDisplayName(id, row.display_name || `League ${id}`);
    intlBody += navRowButton({ type: "league", id }, selK, nm, ic, ["rt-nav-row", "rt-nav-row--league", "rt-nav-row--league-child"], { leagueLogoHtml: navLeagueLogoHTML(id, nm), hideChevron: true, leagueRowCountAccent: listMode === "all" });
  }
  const intlCount = sumCountsForIds(M.intlIds, counts);
  if(listMode === "all" || intlCount > 0){
    html += navCollapsibleSection("intl", navSectionExpandedState("intl"), t.nav_internationals || "Internationals", intlCount, { type: "bucket", bucket: "international" }, intlBody, selK);
  }

  const worldVisible = M.worldRows.filter((row)=>{
    const id = Number(row.league_id);
    return navShowLeagueInSidebar(counts.get(id) || 0, listMode);
  });
  const worldOrdered = orderSidebarLeagueRows(worldVisible, counts, listMode, cmpLeagueRowsByDisplayName);
  let worldBody = "";
  for(const row of worldOrdered){
    const id = Number(row.league_id);
    const wc = counts.get(id) || 0;
    const nm = sidebarLeagueDisplayName(id, row.display_name || `League ${id}`);
    worldBody += navRowButton({ type: "league", id }, selK, nm, wc, ["rt-nav-row", "rt-nav-row--league", "rt-nav-row--league-child"], { leagueLogoHtml: navLeagueLogoHTML(id, nm), hideChevron: true, leagueRowCountAccent: listMode === "all" });
  }
  const worldCount = sumCountsForIds(M.worldIds, counts);
  if(listMode === "all" || worldCount > 0){
    html += navCollapsibleSection("world", navSectionExpandedState("world"), t.nav_world || "World", worldCount, { type: "bucket", bucket: "world" }, worldBody, selK, `<span class="rt-nav-category-icon">${icoSpan("globe")}</span>`);
  }

  let othersInner = "";
  for(const cont of NAV_CONTINENT_ORDER){
    const countryMap = M.othersByContinent.get(cont) || new Map();
    const contIds = M.continentAllIds.get(cont) || new Set();
    const contLabel = continentNavLabel(t, cont);
    const contCount = sumCountsForIds(contIds, counts);
    if(listMode === "with_matches" && contCount === 0) continue;
    let contBody = "";
    const countries = sortedCountryNamesForOthersNav(countryMap, listMode, counts, topLeagueIdSet);
    for(const country of countries){
      const leagues = countryMap.get(country) || [];
      const ckey = `${cont}\0${country}`;
      const cids = M.countryAllIds.get(ckey) || new Set();
      const visibleLeagues = leagues.filter((row)=>{
        const id = Number(row.league_id);
        if(topLeagueIdSet.has(id) && coverageBucket(row) === "domestic") return false;
        return navShowLeagueInSidebar(counts.get(id) || 0, listMode);
      });
      if(!visibleLeagues.length) continue;
      const leaguesOrdered = orderSidebarLeagueRows(visibleLeagues, counts, listMode, cmpLeagueRowsForOthersNav);
      contBody += `<div class="rt-nav-country-block">`;
      contBody += navRowButton({ type: "country", continent: cont, country }, selK, country, sumCountsForIds(cids, counts), ["rt-nav-row", "rt-nav-row--country", "rt-nav-row--subcategory"], { categoryFlagHtml: countryFlagLeadHTML(country) });
      for(const row of leaguesOrdered){
        const id = Number(row.league_id);
        const nm = sidebarLeagueDisplayName(id, row.display_name || `League ${id}`);
        const lc = counts.get(id) || 0;
        contBody += navRowButton({ type: "league", id }, selK, nm, lc, ["rt-nav-row", "rt-nav-row--league", "rt-nav-row--nested", "rt-nav-row--league-child"], { leagueLogoHtml: navLeagueLogoHTML(id, nm), hideChevron: true, leagueRowCountAccent: listMode === "all" });
      }
      contBody += `</div>`;
    }
    const sk = `cont:${cont}`;
    const contIcon = `<span class="rt-nav-category-icon rt-nav-category-icon--emoji" aria-hidden="true">${escAttr(continentCategoryEmoji(cont))}</span>`;
    othersInner += navCollapsibleSection(sk, navSectionExpandedState(sk), contLabel, contCount, { type: "continent", continent: cont }, contBody, selK, contIcon);
  }
  if(listMode === "all" || othersInner){
    html += othersInner;
  }

  html += `</div>`;
  el.innerHTML = html;
}

function filterMatches(matches, activeDateKey, query, navFilter){
  const q = normalize(query);
  const bounds = getFilterDateBounds();
  const leagueIds = resolveNavLeagueIds(navFilter);
  return matches.filter(m=>{
    const k = localDateKey(m.kickoff_utc);
    if(activeDateKey === "both"){
      if(k !== bounds.todayKey && k !== bounds.tomorrowKey) return false;
    } else if(activeDateKey){
      if(k !== activeDateKey) return false;
    }
    if(leagueIds){
      const mid = matchCompetitionId(m);
      if(!Number.isFinite(mid) || !leagueIds.has(mid)) return false;
    }
    if(!q) return true;
    const blob = `${m.country} ${m.competition} ${m.home} ${m.away}`.toLowerCase();
    return blob.includes(q);
  });
}

/** Pick line: `match_radar_ui.pick_display` only (pipeline); no client inference from suggestion_free. */
function pickDisplayFromMatch(m, t){
  const ui = m?.match_radar_ui;
  if(ui?.pick_display != null && String(ui.pick_display).trim())
    return String(ui.pick_display).trim();
  return "—";
}

function riskCssFromMatch(m){
  const ui = m?.match_radar_ui;
  if(ui?.risk_css_class) return String(ui.risk_css_class);
  return "med";
}

function riskDisplayFromMatch(m){
  const ui = m?.match_radar_ui;
  if(ui?.risk_display != null && String(ui.risk_display).trim()) return String(ui.risk_display).trim();
  return "—";
}

/** Prefer snapshot GF/GA strings when `match_radar_ui` is present. */
function goalPartsFromMatch(m, side){
  const ui = m?.match_radar_ui;
  const key = side === "home" ? "goals_home_display" : "goals_away_display";
  if(ui && ui[key]){
    const parts = String(ui[key]).split("/");
    if(parts.length === 2) return { gf: parts[0].trim(), ga: parts[1].trim() };
  }
  return { gf: "—", ga: "—" };
}

function matchRadarMarketCardsHtml(m){
  const ui = m?.match_radar_ui;
  const cards = ui?.market_cards;
  if(!Array.isArray(cards) || !cards.length) return "";
  return `<div style="margin-top:14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
    ${cards.map((c) => `<div style="padding:12px;border:1px solid rgba(215,227,246,.9);border-radius:16px;background:rgba(255,255,255,.65)">
      <div style="font-weight:950;margin-bottom:6px;color:#11244b">${escAttr(c.title || "")}</div>
      <div style="font-weight:800;color:#163261;line-height:1.35">${escAttr(c.body || "")}</div>
      ${c.footnote ? `<div style="margin-top:8px;font-size:12px;opacity:.82;font-weight:650;line-height:1.35">${escAttr(c.footnote)}</div>` : ""}
    </div>`).join("")}
  </div>`;
}

/** Confidence meter: only `match_radar_ui` (pipeline). No risk→percent or analysis fallback in browser. */
function confidenceFromItem(item, t){
  const ui = item?.match_radar_ui;
  if(ui && ui.confidence_percent != null && Number.isFinite(Number(ui.confidence_percent))){
    const note = ui.confidence_note != null ? String(ui.confidence_note).trim() : "";
    return { pct: Math.round(Number(ui.confidence_percent)), note };
  }
  return { pct: null, note: "" };
}

function renderDayTabs(t, activeDateKey, query){
  const el = qs("#dayboard_tabs");
  if(!el) return;
  const b = getFilterDateBounds();
  const selT = activeDateKey === b.todayKey;
  const selM = activeDateKey === b.tomorrowKey;
  if(!normalize(query) && HOME_PAGE_UI && HOME_PAGE_UI.schema === "home_page_ui_v2" && HOME_PAGE_UI.kpi_strip?.tab_labels_by_lang){
    const lb = HOME_PAGE_UI.kpi_strip.tab_labels_by_lang[LANG] || HOME_PAGE_UI.kpi_strip.tab_labels_by_lang.en;
    if(lb && lb.today_tab && lb.tomorrow_tab){
      el.innerHTML = `
    <button type="button" role="tab" class="rt-day-tab${selT ? " active" : ""}" aria-selected="${selT}" data-date="${escAttr(b.todayKey)}" ${tipAttr(lb.date_tip_today || "")}>${escAttr(lb.today_tab)}</button>
    <button type="button" role="tab" class="rt-day-tab${selM ? " active" : ""}" aria-selected="${selM}" data-date="${escAttr(b.tomorrowKey)}" ${tipAttr(lb.date_tip_tomorrow || "")}>${escAttr(lb.tomorrow_tab)}</button>
  `;
      return;
    }
  }
  const cToday = filterMatches(CAL_MATCHES, b.todayKey, query, undefined).length;
  const cTom = filterMatches(CAL_MATCHES, b.tomorrowKey, query, undefined).length;
  const d0 = fmtDateShortFromDate(b.today);
  const d1 = fmtDateShortFromDate(b.tomorrow);
  el.innerHTML = `
    <button type="button" role="tab" class="rt-day-tab${selT ? " active" : ""}" aria-selected="${selT}" data-date="${escAttr(b.todayKey)}">${escAttr(t.date_label_today || "Today")} ${escAttr(d0)} (${cToday})</button>
    <button type="button" role="tab" class="rt-day-tab${selM ? " active" : ""}" aria-selected="${selM}" data-date="${escAttr(b.tomorrowKey)}">${escAttr(t.date_label_tomorrow || "Tomorrow")} ${escAttr(d1)} (${cTom})</button>
  `;
}

function bindLangSwitch(){
  qsa("[data-lang]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const target = btn.getAttribute("data-lang");
      const parts = location.pathname.split("/").filter(Boolean);
      const rest = parts.slice(1).join("/");
      const next = (rest ? `/${target}/${rest}` : `/${target}/`).replace(/\/+/g, "/");
      const search = location.search || "";
      const hash = location.hash || "";
      location.href = next + search + hash;
    });
  });
}

function renderTop3FromHomePageUi(t, hpu){
  const lang = LANG;
  const copy = (hpu.copy_blocks && hpu.copy_blocks[lang]) || hpu.copy_blocks?.en || {};
  const picks = hpu.top_picks || [];
  const cards = qsa(top3SlotSelector());
  const prod = !!document.querySelector(".rt-slot-topbar");

  if(qs("#top3_sub") && rtSurface() === "radar-day"){
    setText("top3_sub", picks.length ? "" : (copy.radar_day_empty || ""));
  }

  cards.forEach((card)=>{
    card.removeAttribute("data-open");
    card.removeAttribute("data-key");
    card.removeAttribute("role");
    card.removeAttribute("tabindex");
    card.removeAttribute("aria-label");
    card.querySelectorAll(".badge.top, .badge.rank").forEach((el)=> el.remove());
    card.querySelectorAll(".badge.risk").forEach((el)=> el.remove());
    const topbar = card.querySelector(".rt-slot-topbar");
    const sug = card.querySelector(".suggestion-highlight");
    if(sug) sug.innerHTML = "";
    if(topbar) topbar.innerHTML = "";
  });

  cards.forEach((card, idx)=>{
    const topbar = card.querySelector(".rt-slot-topbar");
    const h3 = card.querySelector("h3");
    const meta = card.querySelector(".meta");
    const lock = card.querySelector(".lock");
    if(!h3 || !meta || !lock) return;
    const pick = picks[idx];
    if(!pick){
      h3.textContent = "—";
      meta.innerHTML = "";
      lock.innerHTML = "";
      return;
    }
    card.setAttribute("data-open","match");
    card.setAttribute("data-key", pick.match_key);
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-label", `${pick.home} vs ${pick.away}`);

    const suggestion = pick.pick_display || "—";
    const rankTip = copy.rank_tooltip || t.rank_tooltip || "";
    const pct = Number.isFinite(Number(pick.confidence_percent)) ? Number(pick.confidence_percent) : 0;
    const note = pick.confidence_note || "";

    if(prod && topbar){
      const nHome = navUrlFromRoutes(pick.nav_routes, "home");
      const nAway = navUrlFromRoutes(pick.nav_routes, "away");
      h3.innerHTML = `
<div class="rd-poster">
  <div class="rd-poster-stack">
    ${rdPosterTeamNavHTML(pick.home, rdPosterCrestHTML(pick.home, pick.home_id), nHome)}
    <div class="rd-poster-vs">vs</div>
    ${rdPosterTeamNavHTML(pick.away, rdPosterCrestHTML(pick.away, pick.away_id), nAway)}
  </div>
</div>`;
      meta.innerHTML = slotRadarDayPosterContextHTMLFromPick(pick, lang);
      const pickPref = copy.pick_prefix || t.pick_prefix || "PICK:";
      const confLab = escAttr(copy.confidence_label || t.confidence_label || "");
      lock.innerHTML = `
<div class="rd-poster-pick">
  <span class="rd-poster-pick-line">${escAttr(pickPref)} <strong>${escAttr(suggestion)}</strong></span>
</div>
<div class="rd-poster-confidence">
  <div class="rd-poster-confidence-label">${confLab}</div>
  <div class="rd-poster-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${confLab}">
    <span class="rd-poster-meter-fill" style="width:${pct}%"></span>
  </div>
  <p class="rd-poster-insight">${escAttr(note)}</p>
</div>`;
      return;
    }

    const nh0 = navUrlFromRoutes(pick.nav_routes, "home");
    const na0 = navUrlFromRoutes(pick.nav_routes, "away");
    h3.innerHTML = `
      <div class="match-title">
        <div class="teamline">${teamLineNavInnerHTML(pick.home, crestHTML(pick.home, pick.home_id), nh0)}</div>
        <div class="vs">vs</div>
        <div class="teamline">${teamLineNavInnerHTML(pick.away, crestHTML(pick.away, pick.away_id), na0)}</div>
      </div>
    `;
    const row = document.createElement("div");
    row.className = "row";
    const top = document.createElement("span");
    top.className = "badge top rank";
    top.textContent = `#${pick.rank || idx + 1}`;
    top.setAttribute("title", rankTip);
    top.setAttribute("data-tip", rankTip);
    row.appendChild(top);
    card.insertBefore(row, h3);

    const leaguePickHref = navUrlFromRoutes(pick.nav_routes, "league");
    const leagueChipBody = leaguePickHref
      ? `<a class="rt-surface-nav-link meta-chip-link" href="${escAttr(leaguePickHref)}">${icoSpan("trophy")}<span>${escAttr(pick.competition)}</span></a>`
      : `${icoSpan("trophy")}<span>${escAttr(pick.competition)}</span>`;
    meta.innerHTML = `
      <div class="meta-chips">
        <span class="meta-chip" ${tipAttr(copy.kickoff_tooltip || t.kickoff_tooltip || "")}>${icoSpan("clock")}<span>${escAttr((pick.kickoff_display_by_lang && (pick.kickoff_display_by_lang[lang] || pick.kickoff_display_by_lang.en)) || "--:--")}</span></span>
        <span class="meta-chip" ${tipAttr(copy.competition_tooltip || t.competition_tooltip || "")}>${leagueChipBody}</span>
        <span class="meta-chip" ${tipAttr(copy.country_tooltip || t.country_tooltip || "")}>${icoSpan("globe")}<span>${escAttr(pick.country)}</span></span>
      </div>
      <div class="meta-actions">
        <button class="meta-link" type="button" data-open="competition" data-value="${escAttr(pick.competition)}" ${tipAttr(copy.competition_radar_tip || t.competition_radar_tip || "")}>${icoSpan("trophy")}<span>${escAttr(copy.competition_radar || t.competition_radar)}</span></button>
      </div>
    `;

    lock.innerHTML = `
      <div class="callout">
        <div class="callout-top">
          <span class="callout-label">${icoSpan("spark")}<span>${escAttr(copy.suggestion_label || t.suggestion_label || "Sugestão")}</span></span>
          <span class="callout-value" ${tipAttr(copy.suggestion_tooltip || t.suggestion_tooltip || "")}>${escAttr(suggestion)}</span>
        </div>
        <div class="callout-sub">
          <span class="mini-chip mini-chip--free" ${tipAttr(copy.free_tooltip || copy.free_includes || t.free_tooltip || t.free_includes || "")}>${escAttr(copy.free_badge || t.free_badge || "FREE")}</span>
        </div>
        <div class="callout-actions">
          <button class="btn primary" type="button" data-open="match" data-key="${escAttr(pick.match_key)}" ${tipAttr(copy.match_radar_tip || t.match_radar_tip || "")}><span>${escAttr(copy.match_radar || t.match_radar || "Radar")}</span>${icoSpan("arrow")}</button>
        </div>
      </div>
    `;
  });
}

function renderTop3(t, data){
  if(rtSurface() === "radar-day" && HOME_PAGE_UI && HOME_PAGE_UI.schema === "home_page_ui_v2" && Array.isArray(HOME_PAGE_UI.top_picks) && HOME_PAGE_UI.top_picks.length){
    renderTop3FromHomePageUi(t, HOME_PAGE_UI);
    return;
  }
  const slots = (data && data.highlights) || [];
  const cards = qsa(top3SlotSelector());
  const prod = !!document.querySelector(".rt-slot-topbar");

  if(qs("#top3_sub") && rtSurface() === "radar-day"){
    setText("top3_sub", slots.length ? "" : (t.radar_day_empty || ""));
  }

  cards.forEach((card, idx)=>{
    const item = slots[idx];
    card.removeAttribute("data-open");
    card.removeAttribute("data-key");
    card.removeAttribute("role");
    card.removeAttribute("tabindex");
    card.removeAttribute("aria-label");
    card.querySelectorAll(".badge.top, .badge.rank").forEach((el)=> el.remove());
    card.querySelectorAll(".badge.risk").forEach((el)=> el.remove());

    const topbar = card.querySelector(".rt-slot-topbar");
    const h3 = card.querySelector("h3");
    const meta = card.querySelector(".meta");
    const lock = card.querySelector(".lock");
    const sug = card.querySelector(".suggestion-highlight");
    if(sug) sug.innerHTML = "";
    if(topbar) topbar.innerHTML = "";

    if(!h3 || !meta || !lock) return;

    if(!item){
      h3.textContent = "—";
      meta.innerHTML = "";
      lock.innerHTML = "";
      return;
    }

    const key = matchKey(item);
    card.setAttribute("data-open","match");
    card.setAttribute("data-key", key);
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-label", `${item.home} vs ${item.away}`);

    const suggestion = pickDisplayFromMatch(item, t);
    const rankTip = t.rank_tooltip || "";

    if(prod && topbar){
      const lh = navUrlFromRoutes(item.nav_routes, "home");
      const la = navUrlFromRoutes(item.nav_routes, "away");
      h3.innerHTML = `
<div class="rd-poster">
  <div class="rd-poster-stack">
    ${rdPosterTeamNavHTML(item.home, rdPosterCrestHTML(item.home, item.home_id), lh)}
    <div class="rd-poster-vs">vs</div>
    ${rdPosterTeamNavHTML(item.away, rdPosterCrestHTML(item.away, item.away_id), la)}
  </div>
</div>`;

      meta.innerHTML = slotRadarDayPosterContextHTML(item);

      const pickPref = t.pick_prefix || "PICK:";
      const { pct, note } = confidenceFromItem(item, t);
      const confLab = escAttr(t.confidence_label || "");
      const confBody =
        pct != null
          ? `<div class="rd-poster-confidence">
  <div class="rd-poster-confidence-label">${confLab}</div>
  <div class="rd-poster-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${confLab}">
    <span class="rd-poster-meter-fill" style="width:${pct}%"></span>
  </div>
  <p class="rd-poster-insight">${escAttr(note)}</p>
</div>`
          : "";
      lock.innerHTML = `
<div class="rd-poster-pick">
  <span class="rd-poster-pick-line">${escAttr(pickPref)} <strong>${escAttr(suggestion)}</strong></span>
</div>
${confBody}`;
      return;
    }

    const ih0 = navUrlFromRoutes(item.nav_routes, "home");
    const ia0 = navUrlFromRoutes(item.nav_routes, "away");
    h3.innerHTML = `
      <div class="match-title">
        <div class="teamline">${teamLineNavInnerHTML(item.home, crestHTML(item.home, item.home_id), ih0)}</div>
        <div class="vs">vs</div>
        <div class="teamline">${teamLineNavInnerHTML(item.away, crestHTML(item.away, item.away_id), ia0)}</div>
      </div>
    `;

    const row = document.createElement("div");
    row.className = "row";
    const top = document.createElement("span");
    top.className = "badge top rank";
    top.textContent = `#${idx+1}`;
    top.setAttribute("title", rankTip);
    top.setAttribute("data-tip", rankTip);
    row.appendChild(top);
    card.insertBefore(row, h3);

    const leagueItemHref = navUrlFromRoutes(item.nav_routes, "league");
    const leagueItemChip = leagueItemHref
      ? `<a class="rt-surface-nav-link meta-chip-link" href="${escAttr(leagueItemHref)}">${icoSpan("trophy")}<span>${escAttr(item.competition)}</span></a>`
      : `${icoSpan("trophy")}<span>${escAttr(item.competition)}</span>`;
    meta.innerHTML = `
      <div class="meta-chips">
        <span class="meta-chip" ${tipAttr(t.kickoff_tooltip || "")}>${icoSpan("clock")}<span>${fmtTime(item.kickoff_utc)}</span></span>
        <span class="meta-chip" ${tipAttr(t.competition_tooltip || "")}>${leagueItemChip}</span>
        <span class="meta-chip" ${tipAttr(t.country_tooltip || "")}>${icoSpan("globe")}<span>${escAttr(item.country)}</span></span>
      </div>
      <div class="meta-actions">
        <button class="meta-link" type="button" data-open="competition" data-value="${escAttr(item.competition)}" ${tipAttr(t.competition_radar_tip || "")}>${icoSpan("trophy")}<span>${escAttr(t.competition_radar)}</span></button>
      </div>
    `;

    lock.innerHTML = `
      <div class="callout">
        <div class="callout-top">
          <span class="callout-label">${icoSpan("spark")}<span>${escAttr(t.suggestion_label || "Sugestão")}</span></span>
          <span class="callout-value" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(suggestion)}</span>
        </div>
        <div class="callout-sub">
          <span class="mini-chip mini-chip--free" ${tipAttr(t.free_tooltip || (t.free_includes || ""))}>${escAttr(t.free_badge || "FREE")}</span>
        </div>
        <div class="callout-actions">
          <button class="btn primary" type="button" data-open="match" data-key="${key}" ${tipAttr(t.match_radar_tip || "")}><span>${escAttr(t.match_radar || "Radar")}</span>${icoSpan("arrow")}</button>
        </div>
      </div>
    `;
  });
}


function normalize(s){ return (s||"").toLowerCase().trim(); }

function groupByTime(matches){
  const sorted = [...matches].sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
  const map = new Map();
  for(const m of sorted){
    const key = m.competition;
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.entries()].map(([name, ms])=>({name, matches: ms}));
}

function leagueMapHasAnyMatches(leagueMap){
  for(const ms of leagueMap.values()){
    if(ms && ms.length > 0) return true;
  }
  return false;
}

/** In "all" mode: countries with any league that has matches first; then top-tier hint; then name A–Z. */
function sortCalendarCountryLeagueEntries(countryMap, listMode){
  const lm = listMode === "with_matches" ? "with_matches" : "all";
  const TOP = new Set(NAV_TOP_LEAGUE_IDS);
  const arr = [...countryMap.entries()];
  arr.sort((a, b)=>{
    if(lm === "all"){
      const ma = leagueMapHasAnyMatches(a[1]), mb = leagueMapHasAnyMatches(b[1]);
      if(ma !== mb) return ma ? -1 : 1;
    }
    const aHas = [...a[1].keys()].some((lid)=> TOP.has(lid));
    const bHas = [...b[1].keys()].some((lid)=> TOP.has(lid));
    if(aHas !== bHas) return aHas ? -1 : 1;
    return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
  });
  return arr;
}

/** In "all" mode: leagues with matches in this group first; then top-six hint; then display name A–Z. */
function sortCalendarLeagueIdEntries(leagueMap, M, listMode){
  const lm = listMode === "with_matches" ? "with_matches" : "all";
  const TOP = new Set(NAV_TOP_LEAGUE_IDS);
  const arr = [...leagueMap.entries()];
  arr.sort((a, b)=>{
    if(lm === "all"){
      const pa = a[1] && a[1].length > 0 ? 0 : 1;
      const pb = b[1] && b[1].length > 0 ? 0 : 1;
      if(pa !== pb) return pa - pb;
    }
    const at = TOP.has(a[0]) ? 0 : 1, bt = TOP.has(b[0]) ? 0 : 1;
    if(at !== bt) return at - bt;
    const la = sidebarLeagueDisplayName(a[0], M.leagueById.get(a[0])?.display_name);
    const lb = sidebarLeagueDisplayName(b[0], M.leagueById.get(b[0])?.display_name);
    return la.localeCompare(lb, undefined, { sensitivity: "base" });
  });
  return arr;
}

function buildRadarDayCalendarTree(filtered, M){
  const world = new Map();
  /** Map continent -> Map country -> Map leagueId -> matches[] */
  const intl = new Map();
  const others = new Map();
  if(!M) return { world, intl, others };

  function pushLeague(countryMap, country, leagueId, m){
    if(!countryMap.has(country)) countryMap.set(country, new Map());
    const lm = countryMap.get(country);
    if(!lm.has(leagueId)) lm.set(leagueId, []);
    lm.get(leagueId).push(m);
  }

  function ensureIntlContinent(cont){
    if(!intl.has(cont)) intl.set(cont, new Map());
    return intl.get(cont);
  }

  for(const m of filtered){
    const lid = matchCompetitionId(m);
    if(!Number.isFinite(lid)) continue;
    const row = M.leagueById.get(lid);
    if(!row){
      const cont = domesticContinentKey({ country: m.country, region: m.region || "" });
      const country = String(m.country || "—").trim() || "—";
      if(!others.has(cont)) others.set(cont, new Map());
      pushLeague(others.get(cont), country, lid, m);
      continue;
    }
    const bucket = coverageBucket(row);
    if(bucket === "world"){
      const country = String(row.country || m.country || "World").trim() || "World";
      pushLeague(world, country, lid, m);
    } else if(bucket === "international"){
      const cont = internationalContinentKey(row);
      const country = String(row.country || m.country || "—").trim() || "—";
      pushLeague(ensureIntlContinent(cont), country, lid, m);
    } else {
      const cont = domesticContinentKey(row);
      const country = domesticCountryLabel(row);
      if(!others.has(cont)) others.set(cont, new Map());
      pushLeague(others.get(cont), country, lid, m);
    }
  }
  return { world, intl, others };
}

function emitRadarDayMatchRow(t, m){
  const key = escAttr(matchKey(m));
  const lab = escAttr(t.match_radar || "Match radar");
  const dh = navUrlFromRoutes(m.nav_routes, "home");
  const da = navUrlFromRoutes(m.nav_routes, "away");
  const homeEl = dh
    ? `<a class="rt-surface-nav-link rt-day-cal-team-link" href="${escAttr(dh)}">${escAttr(m.home)}</a>`
    : `<span>${escAttr(m.home)}</span>`;
  const awayEl = da
    ? `<a class="rt-surface-nav-link rt-day-cal-team-link" href="${escAttr(da)}">${escAttr(m.away)}</a>`
    : `<span>${escAttr(m.away)}</span>`;
  return `<div class="rt-day-cal-match">
  <div class="rt-day-cal-match-time">${escAttr(fmtTime(m.kickoff_utc))}</div>
  <div class="rt-day-cal-match-teams">${homeEl} <span class="rt-day-cal-vs">vs</span> ${awayEl}</div>
  <button type="button" class="rt-day-cal-radar-btn chip" data-open="match" data-key="${key}">${lab}</button>
</div>`;
}

/** Full-width calendar row (forms, goals) for standalone calendar page hierarchy. */
function calendarMatchRowHTML(t, m){
  const ui = m?.match_radar_ui;
  const formHome = ui?.form_home_tokens?.length
    ? formSquaresFromRadarUiTokens(t, ui.form_home_tokens, CAL_META.form_window)
    : buildFormSquares(t, m.form_home_details, CAL_META.form_window);
  const formAway = ui?.form_away_tokens?.length
    ? formSquaresFromRadarUiTokens(t, ui.form_away_tokens, CAL_META.form_window)
    : buildFormSquares(t, m.form_away_details, CAL_META.form_window);
  const goalsTip = t.goals_tooltip || "Goals for/goals against (last 5 matches).";
  const hp = goalPartsFromMatch(m, "home");
  const ap = goalPartsFromMatch(m, "away");
  const goalsHTML = `
        <div class="goals" ${tipAttr(goalsTip)}>
          <span class="goal-pill" ${tipAttr(`${goalsTip} • ${t.home_label || "CASA"}`)}>
            <span class="tag">${t.goals_label} ${t.home_label || "CASA"}</span>
            <span class="gf">${escAttr(hp.gf)}</span>/<span class="ga">${escAttr(hp.ga)}</span>
          </span>
          <span class="goal-pill" ${tipAttr(`${goalsTip} • ${t.away_label || "FORA"}`)}>
            <span class="tag">${t.goals_label} ${t.away_label || "FORA"}</span>
            <span class="gf">${escAttr(ap.gf)}</span>/<span class="ga">${escAttr(ap.ga)}</span>
          </span>
        </div>
      `;
  const formTip = t.form_tooltip || (t.form_label || "Últimos 5");
  const key = escAttr(matchKey(m));
  const ch = navUrlFromRoutes(m.nav_routes, "home");
  const ca = navUrlFromRoutes(m.nav_routes, "away");
  return `<div class="match" data-open="match" data-key="${key}" role="button" tabindex="0" aria-label="${escAttr(`${t.match_radar}: ${m.home} vs ${m.away}`)}" title="${escAttr(`${t.match_radar}: ${m.home} vs ${m.away}`)}" data-tip="${escAttr(`${t.match_radar}: ${m.home} vs ${m.away}`)}">
        <div class="time" ${tipAttr(t.kickoff_tooltip || "")}>${escAttr(fmtTime(m.kickoff_utc))}</div>
        <div class="match-main">
          <div class="teams">
            <div class="teamline">${teamLineNavInnerHTML(m.home, crestHTML(m.home, m.home_id), ch)}</div>
            <div class="teamline">${teamLineNavInnerHTML(m.away, crestHTML(m.away, m.away_id), ca)}</div>
          </div>
          <div class="subline">
            <div>
              <div class="form" ${tipAttr(formTip)}>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <span style="font-weight:950;opacity:.8">${escAttr(t.home_short || "C")}</span>
                  ${formHome}
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
                  <span style="font-weight:950;opacity:.8">${escAttr(t.away_short || "F")}</span>
                  ${formAway}
                </div>
              </div>
            </div>
            <div>${goalsHTML}</div>
          </div>
          <div class="match-pick" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(pickDisplayFromMatch(m, t))}</div>
        </div>
      </div>`;
}

/**
 * One GROUP in the universal tree: toggle → panel → LEAGUE (always) → MATCHES.
 * Top leagues and countries differ only in spec.headerLeadHtml / storageKey.
 */
function emitCalGroupBlock(t, M, rowFn, spec){
  const expanded = readCalGroupExpanded(spec.storageKey, spec.calExpandCtx);
  const collapsedCls = expanded ? "" : " rt-cal-group--collapsed";
  const panelHidden = expanded ? "" : " hidden";
  const panelId = calGroupPanelId(spec.storageKey);
  const tipOpen = t.cal_country_expand_tip || "Show leagues and matches";
  const tipClose = t.cal_country_collapse_tip || "Hide leagues and matches";
  let h = `<div class="rt-cal-group rt-cal-group--collapsible${collapsedCls}" data-rt-cal-group-key="${escAttr(spec.storageKey)}">`;
  const aside = spec.headerAsideHtml ? `<div class="rt-cal-group-aside" aria-hidden="false">${spec.headerAsideHtml}</div>` : "";
  h += `<div class="rt-cal-group-head-row">`;
  h += `<button type="button" class="rt-cal-group-toggle" aria-expanded="${expanded ? "true" : "false"}" aria-controls="${escAttr(panelId)}" ${tipAttr(expanded ? tipClose : tipOpen)}>`;
  h += `<span class="rt-cal-group-chevron" aria-hidden="true"></span>`;
  h += spec.headerLeadHtml;
  h += `<span class="rt-cal-group-title rt-cal-header-text">${escAttr(spec.headerTitle)}</span>`;
  h += `</button>`;
  h += aside;
  h += `</div>`;
  h += `<div class="rt-cal-group-body" id="${escAttr(panelId)}"${panelHidden}>`;
  const calLm = spec.listMode === "with_matches" ? "with_matches" : "all";
  const entries = sortCalendarLeagueIdEntries(spec.leagueMap, M, calLm);
  const hideInnerLeagueHead = !!spec.hideInnerLeagueHead;
  for(const [leagueId, ms] of entries){
    ms.sort((a, b)=> (Date.parse(a.kickoff_utc) || 0) - (Date.parse(b.kickoff_utc) || 0));
    const lname = sidebarLeagueDisplayName(leagueId, M.leagueById.get(leagueId)?.display_name);
    const leagueWrapCls = hideInnerLeagueHead ? "rt-cal-league rt-cal-league--no-subhead" : "rt-cal-league";
    h += `<div class="${leagueWrapCls}">`;
    if(!hideInnerLeagueHead){
      const leagueNavHref = ms[0] ? navUrlFromRoutes(ms[0].nav_routes, "league") : "";
      const logoPart = `<span class="rt-cal-league-ico" aria-hidden="true">${navLeagueLogoHTML(leagueId, lname)}</span>`;
      const namePart = `<span class="rt-cal-lname rt-cal-header-text">${escAttr(lname)}</span>`;
      const headInner = leagueNavHref
        ? `<a class="rt-surface-nav-link rt-cal-league-head-link" href="${escAttr(leagueNavHref)}">${logoPart}${namePart}</a>`
        : `${logoPart}${namePart}`;
      h += `<div class="rt-cal-league-head">${headInner}</div>`;
    }
    h += `<div class="rt-cal-matches rt-cal-matches--stack">`;
    for(const mm of ms) h += rowFn(t, mm);
    h += `</div></div>`;
  }
  h += `</div></div>`;
  return h;
}

/** SECTION wrapper: same markup for every macro block (featured = CSS only). */
function emitCalSectionHTML(sectionId, kickerText, featured, bodyInner){
  const feat = featured ? " rt-cal-section--featured" : "";
  const sid = escAttr(sectionId);
  const kid = `rt-cal-kicker-${sectionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return `<section class="rt-cal-section${feat}" data-rt-cal-section="${sid}" aria-labelledby="${escAttr(kid)}"><div class="rt-cal-section-kicker" id="${escAttr(kid)}">${escAttr(kickerText)}</div><div class="rt-cal-section-body">${bodyInner}</div></section>`;
}

/** Render order for top-league calendar blocks: in "all" mode, leagues with matches first, then NAV A–Z. */
function topLeagueIdsCalendarOrder(filtered, listMode){
  const topSet = new Set(NAV_TOP_LEAGUE_IDS);
  const n = new Map();
  for(const id of NAV_TOP_LEAGUE_IDS) n.set(id, 0);
  for(const m of filtered){
    const id = matchCompetitionId(m);
    if(!Number.isFinite(id) || !topSet.has(id)) continue;
    n.set(id, (n.get(id) || 0) + 1);
  }
  const ids = [...NAV_TOP_LEAGUE_IDS];
  if(listMode === "all"){
    ids.sort((a, b)=>{
      const na = n.get(a) || 0, nb = n.get(b) || 0;
      const pa = na > 0 ? 0 : 1, pb = nb > 0 ? 0 : 1;
      if(pa !== pb) return pa - pb;
      return NAV_TOP_LEAGUE_IDS.indexOf(a) - NAV_TOP_LEAGUE_IDS.indexOf(b);
    });
  }
  return ids;
}

/** Top-league calendar blocks only for leagues with ≥1 match in `filtered`. Empty string if none. */
function buildTopLeagueGroupsHTML(t, M, filtered, rowFn, listMode, calExpandCtx){
  if(!M) return "";
  const lm = listMode === "with_matches" ? "with_matches" : "all";
  const topSet = new Set(NAV_TOP_LEAGUE_IDS);
  const byLeague = new Map();
  for(const id of NAV_TOP_LEAGUE_IDS) byLeague.set(id, []);
  for(const m of filtered){
    const id = matchCompetitionId(m);
    if(!Number.isFinite(id) || !topSet.has(id)) continue;
    const arr = byLeague.get(id);
    if(arr) arr.push(m);
  }
  const lidOrder = topLeagueIdsCalendarOrder(filtered, lm);
  for(const id of lidOrder){
    const ms = byLeague.get(id);
    if(ms && ms.length) ms.sort((a, b)=> (Date.parse(a.kickoff_utc) || 0) - (Date.parse(b.kickoff_utc) || 0));
  }
  let inner = "";
  for(const lid of lidOrder){
    const ms = byLeague.get(lid) || [];
    if(!ms.length) continue;
    const row = M.leagueById.get(lid);
    const lname = sidebarLeagueDisplayName(lid, row?.display_name);
    const country = topLeagueHeaderCountryLabel(lid, row, ms);
    const flag = countryFlagLeadHTML(country);
    const singleLeagueMap = new Map([[lid, ms]]);
    const titleBoth = country && country !== "—" ? `${country} · ${lname}` : lname;
    const topLeagueHref = ms[0] ? navUrlFromRoutes(ms[0].nav_routes, "league") : "";
    const topLeagueLogo = navLeagueLogoHTML(lid, lname);
    const topAside = topLeagueHref
      ? `<a class="rt-surface-nav-link rt-cal-group-league-aside" href="${escAttr(topLeagueHref)}" title="${escAttr(lname)}">${topLeagueLogo}</a>`
      : "";
    const topLeads = topLeagueHref
      ? `<span class="rt-cal-group-leads" aria-hidden="true"><span class="rt-cal-group-lead rt-cal-group-lead--flag">${flag}</span></span>`
      : `<span class="rt-cal-group-leads" aria-hidden="true"><span class="rt-cal-group-lead rt-cal-group-lead--flag">${flag}</span><span class="rt-cal-group-lead rt-cal-group-lead--league">${topLeagueLogo}</span></span>`;
    inner += emitCalGroupBlock(t, M, rowFn, {
      storageKey: `t:${lid}`,
      headerLeadHtml: topLeads,
      headerAsideHtml: topAside,
      headerTitle: titleBoth,
      leagueMap: singleLeagueMap,
      hideInnerLeagueHead: true,
      listMode: lm,
      calExpandCtx
    });
  }
  return inner;
}

function emitCountryCalGroup(t, M, country, leagueMap, sectionKey, continentOpt, rowFn, listMode, calExpandCtx){
  const sk = calCountryStorageKey(sectionKey, continentOpt, country);
  const flag = countryFlagLeadHTML(country);
  return emitCalGroupBlock(t, M, rowFn, {
    storageKey: sk,
    headerLeadHtml: `<span class="rt-cal-group-lead rt-cal-group-lead--flag" aria-hidden="true">${flag}</span>`,
    headerTitle: country,
    leagueMap,
    listMode,
    calExpandCtx
  });
}

function buildHierarchicalCalendarHTML(t, filtered, rowFn, listMode){
  const lm = listMode === "with_matches" ? "with_matches" : "all";
  if(!filtered.length){
    return `<div class="cal-empty" role="status">${escAttr(t.empty_calendar || "No matches for this filter or day.")}</div>`;
  }
  const M = COVERAGE_NAV_MODEL;
  if(!M){
    return `<div class="cal-empty" role="status">${escAttr(t.empty_calendar || "No matches for this filter or day.")}</div>`;
  }
  const hasTopCal = filteredHasTopLeagueMatches(filtered);
  const { restMatches } = partitionTopLeagueMatches(filtered);
  const tree = buildRadarDayCalendarTree(restMatches, M);
  const calExpandCtx = buildCalExpandContext(hasTopCal, tree);
  const othersAny = [...tree.others.values()].some((cm)=> cm && cm.size > 0);
  const topLeagueInner = hasTopCal ? buildTopLeagueGroupsHTML(t, M, filtered, rowFn, lm, calExpandCtx) : "";
  const hasRest = tree.world.size || intlCalendarTreeHasAny(tree.intl) || othersAny;
  if(!topLeagueInner && !hasRest){
    return `<div class="cal-empty" role="status">${escAttr(t.empty_calendar || "No matches for this filter or day.")}</div>`;
  }

  const parts = [];
  if(topLeagueInner){
    parts.push(emitCalSectionHTML("top-leagues", t.nav_top_leagues || "Top leagues", true, topLeagueInner));
  }

  /* Fixed macro order: Top (if any) → Internationals (by continent, Europe first) → World → America…Oceania. */
  if(intlCalendarTreeHasAny(tree.intl)){
    let intlInner = "";
    for(const cont of NAV_INTL_CONTINENT_ORDER){
      const cMap = tree.intl.get(cont);
      if(!cMap || !cMap.size) continue;
      intlInner += `<div class="rt-cal-continent">`;
      intlInner += `<div class="rt-cal-continent-label rt-cal-header-text rt-cal-header-text--continent">${escAttr(continentNavLabel(t, cont))}</div>`;
      intlInner += `<div class="rt-cal-continent-body">`;
      for(const [country, leagueMap] of sortCalendarCountryLeagueEntries(cMap, lm)){
        intlInner += emitCountryCalGroup(t, M, country, leagueMap, "intl", cont, rowFn, lm, calExpandCtx);
      }
      intlInner += `</div></div>`;
    }
    parts.push(emitCalSectionHTML("internationals", t.nav_internationals || "Internationals", false, intlInner));
  }
  if(tree.world.size){
    let inner = "";
    for(const [country, leagueMap] of sortCalendarCountryLeagueEntries(tree.world, lm)){
      inner += emitCountryCalGroup(t, M, country, leagueMap, "world", null, rowFn, lm, calExpandCtx);
    }
    parts.push(emitCalSectionHTML("world", t.nav_world || "World", false, inner));
  }

  let othersInner = "";
  for(const cont of NAV_CONTINENT_ORDER){
    const cMap = tree.others.get(cont);
    if(!cMap || !cMap.size) continue;
    othersInner += `<div class="rt-cal-continent">`;
    othersInner += `<div class="rt-cal-continent-label rt-cal-header-text rt-cal-header-text--continent">${escAttr(continentNavLabel(t, cont))}</div>`;
    othersInner += `<div class="rt-cal-continent-body">`;
    for(const [country, leagueMap] of sortCalendarCountryLeagueEntries(cMap, lm)){
      othersInner += emitCountryCalGroup(t, M, country, leagueMap, "others", cont, rowFn, lm, calExpandCtx);
    }
    othersInner += `</div></div>`;
  }
  /* No "Others" macro heading: continents + country groups only, same flow as rest. */
  if(othersInner) parts.push(othersInner);

  return `<div class="rt-cal-root rt-day-cal rt-cal" data-rt-cal-build="v2">${parts.join("")}</div>`;
}

function renderRadarDayCalendar(t, filtered, root, listMode){
  const lm = listMode === "with_matches" ? "with_matches" : "all";
  root.innerHTML = buildHierarchicalCalendarHTML(t, filtered, emitRadarDayMatchRow, lm);
}

function resultLabel(ch, t){
  if(ch==="W") return t.result_green || "Vitória";
  if(ch==="D") return t.result_pending || "Empate";
  return t.result_red || "Derrota";
}

function venueLabel(v, t){
  const vv = String(v||"").toLowerCase();
  if(vv==="casa" || vv==="home" || vv==="h") return t.home_label || "CASA";
  if(vv==="fora" || vv==="away" || vv==="a") return t.away_label || "FORA";
  return "";
}

function fmtDDMM(isoUtc){
  try{
    const d = new Date(isoUtc);
    return new Intl.DateTimeFormat("pt-BR", {day:"2-digit", month:"2-digit"}).format(d);
  }catch{ return ""; }
}

function buildFormSquares(t, details, windowN){
  const n = Number(windowN || 5);

  // Strict: details must provide opponent + score + date per square.
  if(Array.isArray(details) && details.length){
    return details.slice(0, n).map(d=>{
      const r = String(d.result || "D").toUpperCase();
      const v = venueLabel(d.venue, t);
      const opp = d.opp || "—";
      const score = d.score || "—";
      const dateIso = d.date_utc || d.kickoff_utc || d.date || "";
      const ddmm = dateIso ? fmtDDMM(dateIso) : "";
      const tip = `${v ? (v + " ") : ""}vs ${opp} • ${score}${ddmm ? (" • " + ddmm) : ""}`;
      return `<span class="dot ${squareFor(r)}" ${tipAttr(tip)}></span>`;
    }).join("");
  }

  const missing = t.form_missing_tip || "Historical match details not provided yet.";
  return Array.from({length:n}).map(()=> `<span class="dot n" ${tipAttr(missing)}></span>`).join("");
}

function renderCalendar(t, matches, query, activeDateKey, navFilter, leagueListMode){
  const root = qs("#calendar");
  if(!root) return;
  root.innerHTML = "";

  const filtered = filterMatches(matches, activeDateKey, query, navFilter);
  const lm = leagueListMode === "with_matches" ? "with_matches" : "all";

  if(rtSurface() === "radar-day"){
    renderRadarDayCalendar(t, filtered, root, lm);
    return;
  }

  if(rtSurface() === "calendar" && COVERAGE_NAV_MODEL){
    root.innerHTML = buildHierarchicalCalendarHTML(t, filtered, calendarMatchRowHTML, lm);
    return;
  }

  const groups = groupByTime(filtered);

  for(const g of groups){
    const box = document.createElement("div");
    box.className = "group";

    const first = g.matches[0] || {};
    const competitionValue = first.competition || g.name;

    box.innerHTML = `
      <div class="group-head">
        <div class="group-title"><span class="flag"></span><span>${escAttr(g.name)}</span></div>
        <div class="group-actions">
          <span class="chip" data-open="competition" data-value="${escAttr(competitionValue)}" ${tipAttr(t.competition_radar_tip || "")}>${t.competition_radar}</span>
        </div>
      </div>
      <div class="matches"></div>
    `;

    const list = box.querySelector(".matches");

    for(const m of g.matches){
      const row = document.createElement("div");
      row.className = "match";
      row.setAttribute("data-open","match");
      row.setAttribute("data-key", matchKey(m));
      row.setAttribute("role","button");
      row.setAttribute("tabindex","0");
      row.setAttribute("aria-label", `${t.match_radar}: ${m.home} vs ${m.away}`);
      row.setAttribute("title", `${t.match_radar}: ${m.home} vs ${m.away}`);
      row.setAttribute("data-tip", `${t.match_radar}: ${m.home} vs ${m.away}`);

      const uiRow = m?.match_radar_ui;
      const formHome = uiRow?.form_home_tokens?.length
        ? formSquaresFromRadarUiTokens(t, uiRow.form_home_tokens, CAL_META.form_window)
        : buildFormSquares(t, m.form_home_details, CAL_META.form_window);
      const formAway = uiRow?.form_away_tokens?.length
        ? formSquaresFromRadarUiTokens(t, uiRow.form_away_tokens, CAL_META.form_window)
        : buildFormSquares(t, m.form_away_details, CAL_META.form_window);

      const goalsTip = t.goals_tooltip || "Goals for/goals against (last 5 matches).";
      const hp = goalPartsFromMatch(m, "home");
      const ap = goalPartsFromMatch(m, "away");

      const goalsHTML = `
        <div class="goals" ${tipAttr(goalsTip)}>
          <span class="goal-pill" ${tipAttr(`${goalsTip} • ${t.home_label || "CASA"}`)}>
            <span class="tag">${t.goals_label} ${t.home_label || "CASA"}</span>
            <span class="gf">${escAttr(hp.gf)}</span>/<span class="ga">${escAttr(hp.ga)}</span>
          </span>
          <span class="goal-pill" ${tipAttr(`${goalsTip} • ${t.away_label || "FORA"}`)}>
            <span class="tag">${t.goals_label} ${t.away_label || "FORA"}</span>
            <span class="gf">${escAttr(ap.gf)}</span>/<span class="ga">${escAttr(ap.ga)}</span>
          </span>
        </div>
      `;

      const formTip = t.form_tooltip || (t.form_label || "Últimos 5");

      row.innerHTML = `
        <div class="time" ${tipAttr(t.kickoff_tooltip || "")}>${fmtTime(m.kickoff_utc)}</div>
        <div class="match-main">
          <div class="teams">
            <div class="teamline">${crestHTML(m.home, m.home_id)}<span>${escAttr(m.home)}</span></div>
            <div class="teamline">${crestHTML(m.away, m.away_id)}<span>${escAttr(m.away)}</span></div>
          </div>
          <div class="subline">
            <div>
              <div class="form" ${tipAttr(formTip)}>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <span style="font-weight:950;opacity:.8">${t.home_short || "C"}</span>
                  ${formHome}
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px">
                  <span style="font-weight:950;opacity:.8">${t.away_short || "F"}</span>
                  ${formAway}
                </div>
              </div>
            </div>
            <div>
              ${goalsHTML}
            </div>
          </div>
          <div class="match-pick" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(pickDisplayFromMatch(m, t))}</div>
        </div>
      `;

      list.appendChild(row);
    }

    root.appendChild(box);
  }

  if(!root.childElementCount){
    const msg = t.empty_calendar || "No matches for this filter or day.";
    root.innerHTML = `<div class="cal-empty" role="status">${escAttr(msg)}</div>`;
  }
}

let T = null;
let LANG = null;
let CAL_MATCHES = [];
/** Set from calendar_2d.meta.home_page_ui (v2) — radar-day snapshot chrome. */
let HOME_PAGE_UI = null;
let CAL_META = { form_window: 5, goals_window: 5 };

function openModal(type, value){
  const back = qs("#modal_backdrop");
  const title = qs("#modal_title");
  const body = qs("#modal_body");
  if(!back || !title || !body) return;

  // ABOUT / HOW IT WORKS
  if(type === "about"){
    title.textContent = T.about_title || "About";
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <div style="color:#11244b;font-weight:850;line-height:1.35">${escAttr(T.about_intro || "")}</div>

        <div style="padding:12px 12px;border:1px solid rgba(43,111,242,.20);border-radius:16px;background:rgba(43,111,242,.06)">
          <div style="font-weight:950;margin-bottom:8px">${escAttr(T.about_steps_title || "")}</div>
          <div style="display:flex;flex-direction:column;gap:6px;color:#163261;font-weight:800">
            <div>• ${escAttr(T.about_step1 || "")}</div>
            <div>• ${escAttr(T.about_step2 || "")}</div>
            <div>• ${escAttr(T.about_step3 || "")}</div>
          </div>
        </div>

        <div style="color:rgba(11,18,32,.75);font-weight:800">${escAttr(T.about_note || "")}</div>
      </div>
    `;
    back.style.display = "flex";
    bindModalClicks();
    return;
  }


  // MATCH RADAR
  if(type === "match"){
    const key = value || "";
    const decoded = decodeURIComponent(key);
    const parts = decoded.split("|");
    const kUtc = parts[0];
    const home = parts[1] || "";
    const away = parts[2] || "";

    const m =
      (HOME_PAGE_UI && HOME_PAGE_UI.match_refs && HOME_PAGE_UI.match_refs[decoded]) ||
      CAL_MATCHES.find(x => (`${x.kickoff_utc}|${x.home}|${x.away}`) === decoded) ||
      null;

    const mCountry = m?.country || "—";
    const mComp = m?.competition || "—";
    const uiRisk = m?.match_radar_ui;
    const riskText = m ? riskDisplayFromMatch(m) : "—";
    const riskCls = m ? riskCssFromMatch(m) : "med";
    const hideRiskBadge =
      !m ||
      !uiRisk ||
      !String(uiRisk.risk_display || "").trim() ||
      String(uiRisk.risk_css_class || "") === "low";
    const riskBadgeHtml = hideRiskBadge
      ? ""
      : `<span class="badge risk ${riskCls}" ${tipAttr(T.risk_tooltip || "")}>${escAttr(riskText)}</span>`;
    const kickoff = m ? fmtTime(m.kickoff_utc) : "--:--";
    const suggestion = pickDisplayFromMatch(m, T);

    title.textContent = `${home} vs ${away}`;

    const goalsTip = T.goals_tooltip || "Goals for/goals against (last 5 matches).";

    const uiM = m?.match_radar_ui;
    const formHome = uiM?.form_home_tokens?.length
      ? formSquaresFromRadarUiTokens(T, uiM.form_home_tokens, CAL_META.form_window)
      : buildFormSquares(T, m?.form_home_details, CAL_META.form_window);
    const formAway = uiM?.form_away_tokens?.length
      ? formSquaresFromRadarUiTokens(T, uiM.form_away_tokens, CAL_META.form_window)
      : buildFormSquares(T, m?.form_away_details, CAL_META.form_window);

    const hpM = goalPartsFromMatch(m, "home");
    const apM = goalPartsFromMatch(m, "away");
    const marketCardsBlock = matchRadarMarketCardsHtml(m);

    body.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-weight:950;color:#11244b">${escAttr(mComp)} • ${escAttr(mCountry)} • <span ${tipAttr(T.kickoff_tooltip || "")}>${kickoff}</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
              ${riskBadgeHtml}
            <span class="badge" ${tipAttr(T.suggestion_tooltip || "")}>${T.suggestion_label || "Sugestão"}: <b>${escAttr(suggestion)}</b></span>
          </div>
        </div>
        <button class="btn primary" type="button" ${tipAttr(T.pro_includes || "")}>${T.cta_pro}</button>
      </div>

      ${marketCardsBlock}

      <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div style="padding:12px;border:1px solid rgba(215,227,246,.9);border-radius:16px;background:rgba(255,255,255,.65)">
          <div style="font-weight:950;margin-bottom:8px" ${tipAttr(T.form_tooltip || "")}>${T.form_label || "Forma"}</div>
          <div class="form">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span style="font-weight:950;opacity:.8">${T.home_label || "CASA"}</span>
              ${formHome}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
              <span style="font-weight:950;opacity:.8">${T.away_label || "FORA"}</span>
              ${formAway}
            </div>
          </div>
        </div>

        <div style="padding:12px;border:1px solid rgba(215,227,246,.9);border-radius:16px;background:rgba(255,255,255,.65)">
          <div style="font-weight:950;margin-bottom:8px" ${tipAttr(goalsTip)}>${T.goals_title || "Gols"}</div>
          <div class="goals">
            <span class="goal-pill" ${tipAttr(`${goalsTip} • ${T.home_label || "CASA"}`)}>
              <span class="tag">${T.goals_label} ${T.home_label || "CASA"}</span>
              <span class="gf">${escAttr(hpM.gf)}</span>/<span class="ga">${escAttr(hpM.ga)}</span>
            </span>
            <span class="goal-pill" ${tipAttr(`${goalsTip} • ${T.away_label || "FORA"}`)}>
              <span class="tag">${T.goals_label} ${T.away_label || "FORA"}</span>
              <span class="gf">${escAttr(apM.gf)}</span>/<span class="ga">${escAttr(apM.ga)}</span>
            </span>
          </div>
        </div>
      </div>

      ${rtSurface() === "radar-day" ? "" : `<div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="chip" data-open="competition" data-value="${escAttr(mComp)}" ${tipAttr(T.competition_radar_tip || "")}>${T.competition_radar}</span>
      </div>`}

      <div style="margin-top:14px;padding:12px;border:1px dashed rgba(43,111,242,.35);border-radius:16px;background:rgba(43,111,242,.06);font-weight:800;color:#163261">
        ${T.free_includes || "FREE: sugestão + risco + forma + gols."}<br/>
        <span style="opacity:.85">${T.pro_includes || "PRO: probabilidades, EV, odds e estatísticas avançadas."}</span>
      </div>
    `;

    back.style.display = "flex";
    bindModalClicks();
    return;
  }

  if(type !== "competition") return;

  const label = T.competition_radar;
  title.textContent = value ? `${label}: ${value}` : label;

  const list = CAL_MATCHES.filter(m => normalize(m.competition) === normalize(value));

  const rows = list
    .sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc))
    .map(m=>{
      const key = matchKey(m);
      const riskLine = riskDisplayFromMatch(m);
      const mh = navUrlFromRoutes(m.nav_routes, "home");
      const ma = navUrlFromRoutes(m.nav_routes, "away");
      const homeL = mh ? `<a class="rt-surface-nav-link" href="${escAttr(mh)}">${escAttr(m.home)}</a>` : escAttr(m.home);
      const awayL = ma ? `<a class="rt-surface-nav-link" href="${escAttr(ma)}">${escAttr(m.away)}</a>` : escAttr(m.away);
      return `
        <div class="match" data-open="match" data-key="${key}" role="button" tabindex="0" ${tipAttr(`${T.match_radar}: ${m.home} vs ${m.away}`)}>
          <div class="time">${fmtTime(m.kickoff_utc)}</div>
          <div>
            <div class="teams">${homeL}<br/>${awayL}</div>
            <div class="smallnote" style="margin-top:6px" ${tipAttr(T.suggestion_tooltip || "")}>${T.suggestion_label || "Sugestão"}: <b>${escAttr(pickDisplayFromMatch(m, T))}</b> • ${escAttr(riskLine)}</div>
          </div>
        </div>
      `;
    }).join("");

  body.innerHTML = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="font-weight:900">${T.upcoming_matches || "Próximos jogos"}</div>
      <button class="btn primary" type="button" ${tipAttr(T.pro_includes || "")}>${T.cta_pro}</button>
    </div>

    <div style="margin-top:12px;color:rgba(74,88,110,.95);font-weight:650">
      ${T.free_includes || "FREE: sugestão + risco + forma + gols."}
    </div>

    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      ${rows || `<div class="smallnote">${T.empty_list || "Sem jogos encontrados."}</div>`}
    </div>

    <div style="margin-top:14px;padding:12px;border:1px dashed rgba(43,111,242,.35);border-radius:16px;background:rgba(43,111,242,.06);font-weight:800;color:#163261">
      <span style="opacity:.85">${T.pro_includes || "PRO: probabilidades, EV, odds e estatísticas avançadas."}</span>
    </div>
  `;

  back.style.display = "flex";
  bindModalClicks();
}

function bindModalClicks(){
  // re-bind modal internal links (chips/buttons)
  qsa("#modal_body [data-open]").forEach(el=>{
    el.addEventListener("click", (e)=>{
      if(e.target.closest && e.target.closest("a.rt-surface-nav-link")) return;
      const type = el.getAttribute("data-open");
      const val = el.getAttribute("data-value") || el.getAttribute("data-key") || "";
      openModal(type, val);
    });
  });

  // match rows inside modal support keyboard
  qsa("#modal_body .match[role='button']").forEach(el=>{
    el.addEventListener("keydown", (e)=>{
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        el.click();
      }
    });
  });
}

function closeModal(){
  const back = qs("#modal_backdrop");
  if(back) back.style.display = "none";
}

function decorateLangPills(lang){
  const assets = {
    en: {type:"split", left:"/assets/flags/us.svg", right:"/assets/flags/gb.svg", code:"EN"},
    pt: {type:"split", left:"/assets/flags/br.svg", right:"/assets/flags/pt.svg", code:"PT"},
    es: {type:"one",  src:"/assets/flags/es.svg", code:"ES"},
    fr: {type:"one",  src:"/assets/flags/fr.svg", code:"FR"},
    de: {type:"one",  src:"/assets/flags/de.svg", code:"DE"}
  };

  qsa("[data-lang]").forEach(el=>{
    const L = el.getAttribute("data-lang");
    const cfg = assets[L];
    if(!cfg) return;

    el.setAttribute("role","button");
    el.setAttribute("tabindex","0");
    el.setAttribute("aria-label", L.toUpperCase());

    if(cfg.type === "split"){
      el.innerHTML = `
        <span class="flag-split" aria-hidden="true">
          <img src="${cfg.left}" alt="" />
          <img src="${cfg.right}" alt="" />
        </span>
        <span class="lang-code">${cfg.code}</span>
      `;
    }else{
      el.innerHTML = `
        <span class="flag-one" aria-hidden="true"><img src="${cfg.src}" alt="" /></span>
        <span class="lang-code">${cfg.code}</span>
      `;
    }

    el.title = (L === lang) ? (T.lang_current_tip || "Idioma atual") : (T.lang_switch_tip || "Trocar idioma");
    el.setAttribute("data-tip", el.title);

    el.addEventListener("keydown", (e)=>{
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        el.click();
      }
    });
  });
}

function ensureDateStrip(t){
  const section = qs("#calendar_section");
  if(!section) return null;
  if(qs("#dateStrip")) return qs("#dateStrip");

  const controls = qs(".controls");
  const strip = document.createElement("div");
  strip.className = "date-strip";
  strip.id = "dateStrip";

  if(controls) section.insertBefore(strip, controls);
  else section.appendChild(strip);

  strip.setAttribute("aria-label", t.date_filter_label || "Filtro de data");
  strip.setAttribute("data-tip", t.date_filter_tip || "Filtrar por data");
  strip.title = t.date_filter_tip || "Filtrar por data";

  return strip;
}

function localTodayTomorrowKeys(){
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const f = (d)=> new Intl.DateTimeFormat("en-CA", { year:"numeric", month:"2-digit", day:"2-digit" }).format(d);
  return { today, tomorrow, todayKey: f(today), tomorrowKey: f(tomorrow) };
}

/** Parse YYYY-MM-DD to local Date (noon) for stable labels. */
function parseISODateLocalYMD(s){
  if(!s || typeof s !== "string") return null;
  const m = s.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * "Hoje/Amanhã" keys for filtering: prefer API calendar meta.today/tomorrow so the UI follows
 * the pipeline snapshot window even when the PC clock differs.
 */
function getFilterDateBounds(){
  const m = CAL_META || {};
  if(m.anchorToday && m.anchorTomorrow){
    const t0 = parseISODateLocalYMD(m.anchorToday);
    const t1 = parseISODateLocalYMD(m.anchorTomorrow);
    if(t0 && t1){
      return {
        today: t0,
        tomorrow: t1,
        todayKey: m.anchorToday,
        tomorrowKey: m.anchorTomorrow,
      };
    }
  }
  return localTodayTomorrowKeys();
}

const THEME_KEY = "rt_theme";

function getSavedTheme(){
  try{
    const v = localStorage.getItem(THEME_KEY);
    if(v==="dark" || v==="light") return v;
  }catch(e){}
  return null;
}

function applyTheme(theme){
  document.body.dataset.theme = theme;
}

function pickDefaultTheme(){
  return "light";
}

function setTheme(theme, t){
  applyTheme(theme);
  refreshHeaderLogo();
  const btn = qs("#theme_toggle");
  if(!btn) return;

  const isDark = theme === "dark";
  const label = isDark ? ((t && t.theme_light_short) || "Light") : ((t && t.theme_dark_short) || "Dark");
  btn.textContent = label;

  const tip = isDark ? ((t && t.theme_light_tip) || "Switch to light theme") : ((t && t.theme_dark_tip) || "Switch to dark theme");
  btn.setAttribute("data-tip", tip);
  btn.title = tip;
}

function initThemeToggle(t){
  const saved = getSavedTheme();
  const theme = saved || pickDefaultTheme();
  setTheme(theme, t);

  const btn = qs("#theme_toggle");
  if(btn && !btn.dataset.bound){
    btn.dataset.bound = "1";
    btn.addEventListener("click", ()=>{
      const cur = document.body.dataset.theme || "light";
      const next = (cur === "dark") ? "light" : "dark";
      try{ localStorage.setItem(THEME_KEY, next); }catch(e){}
      setTheme(next, t);
    });
    btn.addEventListener("keydown", (e)=>{
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        btn.click();
      }
    });
  }
}

async function init(){
  LANG = pathLang() || detectLang();
  const dict = await fetchJsonStrict("/i18n/strings.json", "i18n");
  T = dict[LANG] || dict.en;

  initThemeToggle(T);
  initTooltips();

  const p = pageType();
  if(!p || p === "team"){
    if(qs(".rt-header")){
      setText("brand", T.brand);
      setText("disclaimer", T.disclaimer);
      setText("subtitle", T.subtitle || "");
      setNav(LANG, T);
      decorateLangPills(LANG);
      let leagueCount = null;
      if(p === "team"){
        try{
          const calRaw = await fetchCalendar2dJson();
          leagueCount = headerLeagueCountFromCalendar2d(calRaw);
        }catch{
          /* tagline only */
        }
      }
      await applyShellHeader(LANG, T, leagueCount);
      syncLangPillsActive(LANG);
      bindLangSwitch();
    }
    renderComplianceFooter(LANG);
    setText("year", String(new Date().getFullYear()));
    return;
  }

  setText("brand", T.brand);
  setText("disclaimer", T.disclaimer);
  setText("subtitle", T.subtitle || "");

  setNav(LANG, T);
  decorateLangPills(LANG);

  const calRaw = await fetchCalendar2dJson();
  const calMeta0 = calRaw.meta && typeof calRaw.meta === "object" ? calRaw.meta : {};
  const hasAllowlistEmbed =
    Array.isArray(calMeta0.allowlist_leagues) && calMeta0.allowlist_leagues.length > 0;
  const allowlistGeoByLeagueId = hasAllowlistEmbed ? new Map() : await fetchCoverageAllowlistGeoByLeagueId();
  HOME_PAGE_UI =
    calMeta0.home_page_ui && calMeta0.home_page_ui.schema === "home_page_ui_v2" ? calMeta0.home_page_ui : null;
  const leagueCount = headerLeagueCountFromCalendar2d(calRaw);
  await applyShellHeader(LANG, T, leagueCount);
  syncLangPillsActive(LANG);

  warnRtDomContract(p);

  const isDayboard = !!qs("#dayboard_tabs");

  const data = calendarRawToMerged(calRaw);

  if(p==="day"){
    const hl =
      HOME_PAGE_UI && HOME_PAGE_UI.headlines_by_lang
        ? HOME_PAGE_UI.headlines_by_lang[LANG] || HOME_PAGE_UI.headlines_by_lang.en
        : null;
    if(qs("#top3_heading")){
      if(rtSurface() === "radar-day"){
        setText("top3_heading", hl ? hl.radar_day_title : (T.radar_day_title || "Radar Day"));
        setText("top3_sub", "");
      } else {
        setText("top3_heading", hl ? hl.top3_title : (T.top3_title || ""));
        setText("top3_sub", hl ? hl.top3_sub : (T.top3_sub || ""));
      }
    } else {
      setText("hero_title", hl ? hl.hero_title_day : T.hero_title_day);
      setText("hero_sub", hl ? hl.hero_sub_day : T.hero_sub_day);
    }
    assertRadarDayFromCalendar2d(calRaw);
    const rd = calRaw.radar_day;
    const meta = calRaw.meta && typeof calRaw.meta === "object" ? calRaw.meta : {};
    const highlights = rd && typeof rd === "object" && Array.isArray(rd.highlights) ? rd.highlights : [];
    const ga = rd && typeof rd.generated_at_utc === "string" ? rd.generated_at_utc : (typeof meta.generated_at_utc === "string" ? meta.generated_at_utc : undefined);
    renderTop3(T, { highlights, generated_at_utc: ga });
  } else {
    setText("hero_title", T.hero_title_cal);
    setText("hero_sub", T.hero_sub_cal);
    renderTop3(T, { highlights: [] });
  }

  if(!isDayboard){
    const hl =
      HOME_PAGE_UI && HOME_PAGE_UI.headlines_by_lang
        ? HOME_PAGE_UI.headlines_by_lang[LANG] || HOME_PAGE_UI.headlines_by_lang.en
        : null;
    setText("calendar_title", hl ? hl.calendar_title : T.calendar_title);
    setText("calendar_sub", hl ? hl.calendar_sub : T.calendar_sub);
  }

  const searchEl = qs("#search");
  if(searchEl){
    const hl =
      HOME_PAGE_UI && HOME_PAGE_UI.headlines_by_lang
        ? HOME_PAGE_UI.headlines_by_lang[LANG] || HOME_PAGE_UI.headlines_by_lang.en
        : null;
    searchEl.setAttribute("placeholder", hl && hl.search_placeholder ? hl.search_placeholder : T.search_placeholder);
  }

  let q = "";
  CAL_MATCHES = data.matches || [];
  CAL_META = {
    form_window: Number(data.form_window || 5),
    goals_window: Number(data.goals_window || 5),
    anchorToday: data.anchorToday || null,
    anchorTomorrow: data.anchorTomorrow || null,
  };
  COVERAGE_NAV_MODEL = buildCoverageNavModel(allowlistRowsFromCalendar2d(calRaw, allowlistGeoByLeagueId));

  ensureCalGroupToggleDelegation();

  const strip = isDayboard ? null : ensureDateStrip(T);
  const boundsInit = getFilterDateBounds();
  let activeDate = isDayboard ? boundsInit.todayKey : "both";
  let selectedNav = { type: "all" };
  let sidebarLeagueListMode = isDayboard ? loadSidebarLeagueMode() : "all";

  function renderStrip(){
    if(!strip) return;
    const b = getFilterDateBounds();
    const chips = [
      { key: "both", label: (T.date_filter_both || ""), tip: (T.date_filter_both_tip || "") },
      { key: b.todayKey, label: (T.date_label_today || ""), tip: fmtDateLong(b.today, LANG) },
      { key: b.tomorrowKey, label: (T.date_label_tomorrow || ""), tip: fmtDateLong(b.tomorrow, LANG) },
    ];
    strip.innerHTML = chips.map(c=>{
      const cls = (c.key === activeDate) ? "date-chip active" : "date-chip";
      return `<button class="${cls}" type="button" data-date="${c.key}" ${tipAttr(c.tip)}>${escAttr(c.label)}</button>`;
    }).join("");
  }

  function bindOpenHandlers(){
    qsa("[data-open]").forEach(el=>{
      el.addEventListener("click", (e)=>{
        if(e.target.closest && e.target.closest("a.rt-surface-nav-link")) return;
        e.stopPropagation();
        const type = el.getAttribute("data-open");
        const val = el.getAttribute("data-value") || el.getAttribute("data-key") || "";
        openModal(type, val);
      }, {once:true});
    });
    qsa(".match[role='button']").forEach(el=>{
      el.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          el.click();
        }
      }, {once:true});
    });
    qsa(".rt-slot[data-open='match'], .card[data-open='match']").forEach(el=>{
      el.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          el.click();
        }
      }, {once:true});
    });
  }

  function rerender(){
    if(isDayboard){
      renderDayTabs(T, activeDate, q);
      renderCoverageNav(T, activeDate, q, selectedNav, sidebarLeagueListMode);
      renderCalendar(T, CAL_MATCHES, q, activeDate, selectedNav, sidebarLeagueListMode);
    } else {
      if(strip) renderStrip();
      renderCalendar(T, CAL_MATCHES, q, activeDate, undefined, "all");
    }
    bindOpenHandlers();
  }

  if(searchEl) searchEl.addEventListener("input", (e)=>{ q=e.target.value; rerender(); });

  if(isDayboard){
    const tabs = qs("#dayboard_tabs");
    if(tabs && !tabs.dataset.rtBound){
      tabs.dataset.rtBound = "1";
      tabs.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-date]");
        if(!btn) return;
        activeDate = btn.getAttribute("data-date");
        selectedNav = { type: "all" };
        rerender();
      });
    }
    const cl = qs("#country_list");
    if(cl && !cl.dataset.rtBound){
      cl.dataset.rtBound = "1";
      cl.addEventListener("click", (e)=>{
        const modeBtn = e.target && e.target.closest && e.target.closest("[data-rt-league-mode]");
        if(modeBtn){
          e.preventDefault();
          e.stopPropagation();
          const m = String(modeBtn.getAttribute("data-rt-league-mode") || "").trim();
          if(m === "all" || m === "with_matches"){
            sidebarLeagueListMode = m;
            saveSidebarLeagueMode(m);
            rerender();
          }
          return;
        }
        const tgl = e.target.closest("[data-rt-nav-toggle]");
        if(tgl){
          e.preventDefault();
          e.stopPropagation();
          const sec = tgl.closest(".rt-nav-section[data-section-key]");
          if(!sec) return;
          const key = sec.getAttribute("data-section-key") || "";
          sec.classList.toggle("rt-nav-section--collapsed");
          const collapsed = sec.classList.contains("rt-nav-section--collapsed");
          NAV_SECTION_EXPANDED.set(key, !collapsed);
          tgl.setAttribute("aria-expanded", collapsed ? "false" : "true");
          return;
        }
        const btn = e.target.closest("button[data-nav-type]");
        if(!btn) return;
        const nt = btn.getAttribute("data-nav-type");
        if(nt === "all") selectedNav = { type: "all" };
        else if(nt === "bucket") selectedNav = { type: "bucket", bucket: btn.getAttribute("data-bucket") || "" };
        else if(nt === "league") selectedNav = { type: "league", id: Number(btn.getAttribute("data-league-id")) };
        else if(nt === "continent") selectedNav = { type: "continent", continent: btn.getAttribute("data-continent") || "" };
        else if(nt === "country") selectedNav = { type: "country", continent: btn.getAttribute("data-continent") || "", country: btn.getAttribute("data-country") || "" };
        else selectedNav = { type: "all" };
        ensureNavExpandedForSelection(selectedNav);
        rerender();
      }, true);
    }
  }

  if(strip){
    strip.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-date]");
      if(!btn) return;
      activeDate = btn.getAttribute("data-date");
      renderStrip();
      rerender();
    });
  }

  const modalClose = qs("#modal_close");
  const modalBackdrop = qs("#modal_backdrop");
  if(modalClose) modalClose.addEventListener("click", closeModal);
  if(modalBackdrop){
    modalBackdrop.addEventListener("click", (e)=>{ if(e.target.id==="modal_backdrop") closeModal(); });
  }

  bindLangSwitch();

  renderComplianceFooter(LANG);
  setText("year", String(new Date().getFullYear()));

  if(isDayboard){
    rerender();
  } else {
    renderStrip();
    rerender();
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  init().catch((err)=>{
    const msg = err && err.message ? String(err.message) : String(err);
    if(document.body){
      showFatalProductError("[FATAL] " + msg);
    }
    console.error(err);
  });
});
