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
function riskClass(r){
  const v=(r||"").toLowerCase();
  if(v==="low") return "low";
  if(v==="high") return "high";
  return "med";
}
function squareFor(ch){
  if(ch==="W") return "g";
  if(ch==="D") return "y";
  return "r";
}
async function loadJSON(url, fallback){
  try{
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok) throw 0;
    return await r.json();
  }catch{ return fallback; }
}

/** Merge calendar_2d.json `today` + `tomorrow` into a flat matches list for CAL_MATCHES. */
async function loadCalendar2dMerged(){
  const raw = await loadJSON("/data/v1/calendar_2d.json", null);
  if(!raw || typeof raw !== "object"){
    return { matches:[], form_window:5, goals_window:5 };
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

async function loadCoverageLeagueCount(){
  const j = await loadJSON("/data/coverage_allowlist.json", null);
  const n = j && Array.isArray(j.leagues) ? j.leagues.length : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function headerLogoSrcForTheme(){
  const light = document.body && document.body.dataset.theme === "light";
  return light ? "/assets/logo-radartips.svg" : "/assets/logo-radartips-dark.svg";
}

function refreshHeaderLogo(){
  const img = qs("#header_logo");
  if(!img) return;
  img.src = headerLogoSrcForTheme();
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

function countryFlagFromValue(v){
  const s = String(v || "").trim().replace(/-/g, " ");
  if(!s) return "🏳️";
  const up = s.toUpperCase();
  if(/^[A-Z]{2}$/.test(up)){
    const A = 0x1F1E6;
    const c1 = up.charCodeAt(0) - 65;
    const c2 = up.charCodeAt(1) - 65;
    if(c1 >= 0 && c1 < 26 && c2 >= 0 && c2 < 26){
      return String.fromCodePoint(A + c1, A + c2);
    }
  }
  const map = {
    australia:"AU", austria:"AT", belgium:"BE", brazil:"BR", canada:"CA", chile:"CL",
    colombia:"CO", croatia:"HR", czechia:"CZ", denmark:"DK", ecuador:"EC", england:"GB",
    europe:"EU", finland:"FI", france:"FR", germany:"DE", greece:"GR", ireland:"IE",
    italy:"IT", japan:"JP", mexico:"MX", netherlands:"NL", norway:"NO", paraguay:"PY",
    peru:"PE", poland:"PL", portugal:"PT", romania:"RO", scotland:"GB", serbia:"RS",
    slovakia:"SK", slovenia:"SI", "south africa":"ZA", spain:"ES", sweden:"SE",
    switzerland:"CH", turkey:"TR", ukraine:"UA", uruguay:"UY", usa:"US", "united states":"US"
  };
  const cc = map[s.toLowerCase()];
  return cc ? countryFlagFromValue(cc) : "🏳️";
}

function competitionMetaIndicator(item){
  const raw = String(item && item.country || "").trim();
  const comp = String(item && item.competition || "").trim();
  const compU = comp.toUpperCase();
  const worldish = !raw || /^world$/i.test(raw) || /^international$/i.test(raw);
  if(worldish){
    if(/UEFA|CHAMPIONS LEAGUE|EUROPA LEAGUE|CONFERENCE LEAGUE|EUROPA CONFERENCE|SUPER CUP|EUROPEAN/.test(compU)) return countryFlagFromValue("EU");
    if(/CONMEBOL|LIBERTADORES|SUDAMERICANA|RECOPA/.test(compU)) return "🌎";
    if(/CONCACAF|LEAGUES CUP|GOLD CUP/.test(compU)) return "🌎";
    if(/AFC|ASIAN CHAMPIONS|ACL\b/.test(compU)) return "🌏";
    if(/CAF|AFCON|AFRICAN/.test(compU)) return "🌍";
    return "🌍";
  }
  let f = countryFlagFromValue(raw);
  if(f === "🏳️") f = countryFlagFromValue(raw.replace(/-/g, " "));
  if(f === "🏳️") return "🌍";
  return f;
}

function slotLeagueLineHTML(item){
  const ind = competitionMetaIndicator(item);
  const comp = escAttr(item.competition || "—");
  const time = escAttr(fmtTime(item.kickoff_utc));
  return `<div class="slot-league-line"><span class="slot-league-flag" aria-hidden="true">${escAttr(ind)}</span> <span class="slot-league-comp">${comp}</span> <span class="slot-league-sep">—</span> <span class="slot-league-time">${time}</span></div>`;
}

/** Radar Day poster card: contexto competição (país · liga — hora), centrado. */
function slotRadarDayPosterContextHTML(item){
  const country = String(item && item.country || "").trim() || "—";
  const league = String(item && item.competition || "").trim() || "—";
  const time = escAttr(fmtTime(item.kickoff_utc));
  return `<div class="rd-poster-ctx">
    <span class="rd-poster-ctx-country">${escAttr(country)}</span>
    <span class="rd-poster-ctx-league">${escAttr(league)}</span>
    <span class="rd-poster-ctx-sep" aria-hidden="true">—</span>
    <span class="rd-poster-ctx-time">${time}</span>
  </div>`;
}

async function applyShellHeader(lang, t){
  if(!qs(".rt-header")) return;
  const home = qs("#header_home_link");
  if(home) home.href = `/${lang}/radar/day/`;
  refreshHeaderLogo();
  const leagueCount = await loadCoverageLeagueCount();
  const valEl = qs("#header_value_line");
  if(valEl){
    const { html, plain } = formatHeaderValueLine(t, leagueCount);
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

const COVERAGE_ALLOWLIST_URL = "/data/coverage_allowlist.json";
const NAV_TOP_LEAGUE_IDS = [39, 140, 78, 135, 71, 61];
const NAV_CONTINENT_ORDER = ["America", "Europe", "Asia", "Africa", "Oceania"];
const NAV_SECTION_EXPANDED = new Map();
const SIDEBAR_LEAGUE_MODE_KEY = "rt_sidebar_league_mode";

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
  if(!NAV_SECTION_EXPANDED.has(key)) NAV_SECTION_EXPANDED.set(key, true);
  return NAV_SECTION_EXPANDED.get(key);
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

function countryFlagForCategory(countryLabel){
  const raw = String(countryLabel || "").trim();
  let f = countryFlagFromValue(raw);
  if(f === "🏳️") f = countryFlagFromValue(raw.replace(/-/g, " "));
  if(f === "🏳️") return "🌍";
  return f;
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

function cmpTopLeagueNavOrder(a, b){
  const ia = NAV_TOP_LEAGUE_IDS.indexOf(Number(a.league_id));
  const ib = NAV_TOP_LEAGUE_IDS.indexOf(Number(b.league_id));
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
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
  if(o.leagueLogoHtml) lead = o.leagueLogoHtml;
  else if(o.categoryFlagEmoji) lead = `<span class="rt-nav-flag" aria-hidden="true">${escAttr(o.categoryFlagEmoji)}</span>`;
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
  const counts = buildLeagueMatchCounts(CAL_MATCHES, activeDateKey, query);
  const selK = navKey(selectedNav);
  const baseTotal = filterMatches(CAL_MATCHES, activeDateKey, query, undefined).length;

  let html = "";
  html += navRowButton({ type: "all" }, selK, t.nav_all_matches || "All matches", baseTotal, ["rt-nav-row", "rt-nav-row--root"]);
  html += renderNavLeagueModeToggle(t, listMode);
  html += `<div class="rt-country-list-scroll">`;

  const topLeagueIdSet = new Set(NAV_TOP_LEAGUE_IDS);
  const topRows = [];
  for(const id of NAV_TOP_LEAGUE_IDS){
    const row = M.leagueById.get(id);
    if(!row) continue;
    if(coverageBucket(row) !== "domestic") continue;
    const wc = counts.get(id) || 0;
    if(!navShowLeagueInSidebar(wc, listMode)) continue;
    topRows.push(row);
  }
  const topOrdered = orderSidebarLeagueRows(topRows, counts, listMode, cmpTopLeagueNavOrder);
  let topBody = "";
  let topCount = 0;
  for(const row of topOrdered){
    const id = Number(row.league_id);
    const wc = counts.get(id) || 0;
    topCount += wc;
    const nm = sidebarLeagueDisplayName(id, row.display_name || `League ${id}`);
    topBody += navRowButton({ type: "league", id }, selK, nm, wc, ["rt-nav-row", "rt-nav-row--league", "rt-nav-row--league-child"], { leagueLogoHtml: navLeagueLogoHTML(id, nm), hideChevron: true, leagueRowCountAccent: listMode === "all" });
  }
  if(listMode === "all" || topBody){
    html += navCollapsibleSection(
      "topLeagues",
      navSectionExpandedState("topLeagues"),
      t.nav_top_leagues || "Top leagues",
      topCount,
      null,
      topBody,
      selK,
      `<span class="rt-nav-category-icon">${icoSpan("trophy")}</span>`,
    );
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
      contBody += navRowButton({ type: "country", continent: cont, country }, selK, country, sumCountsForIds(cids, counts), ["rt-nav-row", "rt-nav-row--country", "rt-nav-row--subcategory"], { categoryFlagEmoji: countryFlagForCategory(country) });
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
    html += `<div class="rt-nav-section rt-nav-section--others">`;
    html += `<div class="rt-nav-section-title rt-nav-others-heading">${escAttr(t.nav_others || "Others")}</div>`;
    html += othersInner;
    html += `</div>`;
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

function confidenceFromItem(item, t){
  const raw = item.analysis;
  const analysis = raw != null && String(raw).trim() ? String(raw).trim() : "";
  const r = String(item.risk || "").toLowerCase();
  let pct = 55;
  if(r === "low") pct = 78;
  else if(r === "high") pct = 38;
  else if(r === "med" || r === "medium") pct = 52;
  if(analysis) return { pct, note: analysis };
  let note = t.confidence_note_med || "";
  if(r === "low") note = t.confidence_note_low || note;
  else if(r === "high") note = t.confidence_note_high || note;
  return { pct, note };
}

function renderDayTabs(t, activeDateKey, query){
  const el = qs("#dayboard_tabs");
  if(!el) return;
  const b = getFilterDateBounds();
  const cToday = filterMatches(CAL_MATCHES, b.todayKey, query, undefined).length;
  const cTom = filterMatches(CAL_MATCHES, b.tomorrowKey, query, undefined).length;
  const d0 = fmtDateShortFromDate(b.today);
  const d1 = fmtDateShortFromDate(b.tomorrow);
  const selT = activeDateKey === b.todayKey;
  const selM = activeDateKey === b.tomorrowKey;
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
      location.href = next;
    });
  });
}

function renderTop3(t, data){
  const slots = data.highlights || [];
  const cards = qsa(top3SlotSelector());
  const prod = !!document.querySelector(".rt-slot-topbar");

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

    const suggestion = localizeMarket(item.suggestion_free, t) || "—";
    const rankTip = t.rank_tooltip || "";

    if(prod && topbar){
      h3.innerHTML = `
<div class="rd-poster">
  <div class="rd-poster-stack">
    <div class="rd-poster-team">
      <div class="rd-poster-crest">${rdPosterCrestHTML(item.home, item.home_id)}</div>
      <span class="rd-poster-name">${escAttr(item.home)}</span>
    </div>
    <div class="rd-poster-vs">vs</div>
    <div class="rd-poster-team">
      <div class="rd-poster-crest">${rdPosterCrestHTML(item.away, item.away_id)}</div>
      <span class="rd-poster-name">${escAttr(item.away)}</span>
    </div>
  </div>
</div>`;

      meta.innerHTML = slotRadarDayPosterContextHTML(item);

      const pickPref = t.pick_prefix || "PICK:";
      const { pct, note } = confidenceFromItem(item, t);
      const confLab = escAttr(t.confidence_label || "");
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

    h3.innerHTML = `
      <div class="match-title">
        <div class="teamline">${crestHTML(item.home, item.home_id)}<span>${escAttr(item.home)}</span></div>
        <div class="vs">vs</div>
        <div class="teamline">${crestHTML(item.away, item.away_id)}<span>${escAttr(item.away)}</span></div>
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

    meta.innerHTML = `
      <div class="meta-chips">
        <span class="meta-chip" ${tipAttr(t.kickoff_tooltip || "")}>${icoSpan("clock")}<span>${fmtTime(item.kickoff_utc)}</span></span>
        <span class="meta-chip" ${tipAttr(t.competition_tooltip || "")}>${icoSpan("trophy")}<span>${escAttr(item.competition)}</span></span>
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

function sortCalendarCountryLeagueEntries(countryMap){
  const TOP = new Set(NAV_TOP_LEAGUE_IDS);
  const arr = [...countryMap.entries()];
  arr.sort((a, b)=>{
    const aHas = [...a[1].keys()].some((lid)=> TOP.has(lid));
    const bHas = [...b[1].keys()].some((lid)=> TOP.has(lid));
    if(aHas !== bHas) return aHas ? -1 : 1;
    return a[0].localeCompare(b[0], undefined, { sensitivity: "base" });
  });
  return arr;
}

function sortCalendarLeagueIdEntries(leagueMap, M){
  const TOP = new Set(NAV_TOP_LEAGUE_IDS);
  const arr = [...leagueMap.entries()];
  arr.sort((a, b)=>{
    const at = TOP.has(a[0]) ? 0 : 1, bt = TOP.has(b[0]) ? 0 : 1;
    if(at !== bt) return at - bt;
    const na = sidebarLeagueDisplayName(a[0], M.leagueById.get(a[0])?.display_name);
    const nb = sidebarLeagueDisplayName(b[0], M.leagueById.get(b[0])?.display_name);
    return na.localeCompare(nb, undefined, { sensitivity: "base" });
  });
  return arr;
}

function buildRadarDayCalendarTree(filtered, M){
  const world = new Map();
  const intl = new Map();
  const others = new Map();
  if(!M) return { world, intl, others };

  function pushLeague(countryMap, country, leagueId, m){
    if(!countryMap.has(country)) countryMap.set(country, new Map());
    const lm = countryMap.get(country);
    if(!lm.has(leagueId)) lm.set(leagueId, []);
    lm.get(leagueId).push(m);
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
      const country = String(row.country || m.country || "World").trim() || "World";
      pushLeague(intl, country, lid, m);
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
  return `<div class="rt-day-cal-match">
  <div class="rt-day-cal-match-time">${escAttr(fmtTime(m.kickoff_utc))}</div>
  <div class="rt-day-cal-match-teams"><span>${escAttr(m.home)}</span> <span class="rt-day-cal-vs">vs</span> <span>${escAttr(m.away)}</span></div>
  <button type="button" class="rt-day-cal-radar-btn chip" data-open="match" data-key="${key}">${lab}</button>
</div>`;
}

function emitRadarDayCountryBlock(t, M, country, leagueMap){
  const flag = countryFlagForCategory(country);
  let h = `<div class="rt-day-cal-country">`;
  h += `<div class="rt-day-cal-country-head"><span class="rt-day-cal-cflag" aria-hidden="true">${escAttr(flag)}</span><span class="rt-day-cal-cname">${escAttr(country)}</span></div>`;
  for(const [leagueId, ms] of sortCalendarLeagueIdEntries(leagueMap, M)){
    ms.sort((a, b)=> (Date.parse(a.kickoff_utc) || 0) - (Date.parse(b.kickoff_utc) || 0));
    const lname = sidebarLeagueDisplayName(leagueId, M.leagueById.get(leagueId)?.display_name);
    h += `<div class="rt-day-cal-league">`;
    h += `<div class="rt-day-cal-league-head">${navLeagueLogoHTML(leagueId, lname)}<span class="rt-day-cal-lname">${escAttr(lname)}</span></div>`;
    h += `<div class="rt-day-cal-matches">`;
    for(const mm of ms) h += emitRadarDayMatchRow(t, mm);
    h += `</div></div>`;
  }
  h += `</div>`;
  return h;
}

function renderRadarDayCalendar(t, filtered, root){
  if(!filtered.length){
    root.innerHTML = `<div class="cal-empty" role="status">${escAttr(t.empty_calendar || "No matches for this filter or day.")}</div>`;
    return;
  }
  const M = COVERAGE_NAV_MODEL;
  if(!M){
    root.innerHTML = `<div class="cal-empty" role="status">${escAttr(t.empty_calendar || "No matches for this filter or day.")}</div>`;
    return;
  }
  const tree = buildRadarDayCalendarTree(filtered, M);
  const othersAny = [...tree.others.values()].some((cm)=> cm && cm.size > 0);
  if(!tree.world.size && !tree.intl.size && !othersAny){
    root.innerHTML = `<div class="cal-empty" role="status">${escAttr(t.empty_calendar || "No matches for this filter or day.")}</div>`;
    return;
  }

  let html = `<div class="rt-day-cal rt-cal">`;

  if(tree.world.size){
    html += `<section class="rt-day-cal-group" data-rt-cal-group="world">`;
    html += `<div class="rt-day-cal-group-head">${escAttr(t.nav_world || "World")}</div>`;
    for(const [country, leagueMap] of sortCalendarCountryLeagueEntries(tree.world)){
      html += emitRadarDayCountryBlock(t, M, country, leagueMap);
    }
    html += `</section>`;
  }

  if(tree.intl.size){
    html += `<section class="rt-day-cal-group" data-rt-cal-group="internationals">`;
    html += `<div class="rt-day-cal-group-head">${escAttr(t.nav_internationals || "Internationals")}</div>`;
    for(const [country, leagueMap] of sortCalendarCountryLeagueEntries(tree.intl)){
      html += emitRadarDayCountryBlock(t, M, country, leagueMap);
    }
    html += `</section>`;
  }

  let othersOpen = false;
  for(const cont of NAV_CONTINENT_ORDER){
    const cMap = tree.others.get(cont);
    if(!cMap || !cMap.size) continue;
    if(!othersOpen){
      html += `<section class="rt-day-cal-group" data-rt-cal-group="others">`;
      html += `<div class="rt-day-cal-group-head">${escAttr(t.nav_others || "Others")}</div>`;
      othersOpen = true;
    }
    html += `<div class="rt-day-cal-continent">`;
    html += `<div class="rt-day-cal-continent-head">${escAttr(continentNavLabel(t, cont))}</div>`;
    for(const [country, leagueMap] of sortCalendarCountryLeagueEntries(cMap)){
      html += emitRadarDayCountryBlock(t, M, country, leagueMap);
    }
    html += `</div>`;
  }
  if(othersOpen) html += `</section>`;

  html += `</div>`;
  root.innerHTML = html;
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

function renderCalendar(t, matches, query, activeDateKey, navFilter){
  const root = qs("#calendar");
  if(!root) return;
  root.innerHTML = "";

  const filtered = filterMatches(matches, activeDateKey, query, navFilter);

  if(rtSurface() === "radar-day"){
    renderRadarDayCalendar(t, filtered, root);
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

      const formHome = buildFormSquares(t, m.form_home_details, CAL_META.form_window);
      const formAway = buildFormSquares(t, m.form_away_details, CAL_META.form_window);

      const goalsTip = t.goals_tooltip || "Goals for/goals against (last 5 matches).";
      const ghf = (m.gf_home ?? 0), gha = (m.ga_home ?? 0);
      const gaf = (m.gf_away ?? 0), gaa = (m.ga_away ?? 0);

      const goalsHTML = `
        <div class="goals" ${tipAttr(goalsTip)}>
          <span class="goal-pill" ${tipAttr(`${goalsTip} • ${t.home_label || "CASA"}`)}>
            <span class="tag">${t.goals_label} ${t.home_label || "CASA"}</span>
            <span class="gf">${escAttr(ghf)}</span>/<span class="ga">${escAttr(gha)}</span>
          </span>
          <span class="goal-pill" ${tipAttr(`${goalsTip} • ${t.away_label || "FORA"}`)}>
            <span class="tag">${t.goals_label} ${t.away_label || "FORA"}</span>
            <span class="gf">${escAttr(gaf)}</span>/<span class="ga">${escAttr(gaa)}</span>
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
          <div class="match-pick" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(localizeMarket(m.suggestion_free, t) || "—")}</div>
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

    const m = CAL_MATCHES.find(x => (`${x.kickoff_utc}|${x.home}|${x.away}`) === decoded) || null;

    const mCountry = m?.country || "—";
    const mComp = m?.competition || "—";
    const riskText = m ? ((m.risk==="low")?T.risk_low:(m.risk==="high")?T.risk_high:T.risk_med) : "—";
    const riskCls = m ? riskClass(m.risk) : "med";
    const riskBadgeHtml = (m && m.risk === "low") ? "" : `<span class="badge risk ${riskCls}" ${tipAttr(T.risk_tooltip || "")}>${riskText}</span>`;
    const kickoff = m ? fmtTime(m.kickoff_utc) : "--:--";
    const suggestion = localizeMarket(m?.suggestion_free, T) || "—";

    title.textContent = `${home} vs ${away}`;

    const goalsTip = T.goals_tooltip || "Goals for/goals against (last 5 matches).";

    const formHome = buildFormSquares(T, m?.form_home_details, CAL_META.form_window);
    const formAway = buildFormSquares(T, m?.form_away_details, CAL_META.form_window);

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
              <span class="gf">${escAttr(m?.gf_home ?? 0)}</span>/<span class="ga">${escAttr(m?.ga_home ?? 0)}</span>
            </span>
            <span class="goal-pill" ${tipAttr(`${goalsTip} • ${T.away_label || "FORA"}`)}>
              <span class="tag">${T.goals_label} ${T.away_label || "FORA"}</span>
              <span class="gf">${escAttr(m?.gf_away ?? 0)}</span>/<span class="ga">${escAttr(m?.ga_away ?? 0)}</span>
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
      const riskText = (m.risk==="low")?T.risk_low:(m.risk==="high")?T.risk_high:T.risk_med;
      return `
        <div class="match" data-open="match" data-key="${key}" role="button" tabindex="0" ${tipAttr(`${T.match_radar}: ${m.home} vs ${m.away}`)}>
          <div class="time">${fmtTime(m.kickoff_utc)}</div>
          <div>
            <div class="teams">${escAttr(m.home)}<br/>${escAttr(m.away)}</div>
            <div class="smallnote" style="margin-top:6px" ${tipAttr(T.suggestion_tooltip || "")}>${T.suggestion_label || "Sugestão"}: <b>${escAttr(localizeMarket(m.suggestion_free, T) || "—")}</b> • ${riskText}</div>
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
    el.addEventListener("click", ()=>{
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
 * "Hoje/Amanhã" keys for filtering: prefer calendar_2d.json meta.today/tomorrow so local dev
 * matches bundled snapshot data even when the PC clock is ahead of the JSON window.
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

function localizeMarket(raw, t){
  const s = String(raw || "").trim();
  if(!s) return s;

  const home = (t && t.word_home) || "Home";
  const away = (t && t.word_away) || "Away";
  const draw = (t && t.word_draw) || "Draw";

  // Double chance shortcuts
  if(/^1x\b/i.test(s)){
    const desc = (t && t.market_desc_home_draw) || "Home or Draw";
    return `1X (${desc})`;
  }
  if(/^x2\b/i.test(s)){
    const desc = (t && t.market_desc_draw_away) || "Draw or Away";
    return `X2 (${desc})`;
  }
  if(/^12\b/i.test(s)){
    const desc = (t && t.market_desc_home_away) || "Home or Away";
    return `12 (${desc})`;
  }

  // Draw No Bet
  let m = s.match(/^dnb\s*(home|away)\b/i);
  if(m){
    const side = (m[1].toLowerCase()==="home") ? home : away;
    const fmt = (t && t.market_dnb_fmt) || "DNB {side}";
    return fmt.replace("{side}", side);
  }

  // Totals
  m = s.match(/^(under|over)\s*([0-9]+(?:\.[0-9])?)\b/i);
  if(m){
    const n = m[2];
    const prefix = (m[1].toLowerCase()==="under") ? ((t && t.market_under_prefix) || "Under") : ((t && t.market_over_prefix) || "Over");
    return `${prefix} ${n}`;
  }

  // Handicap basics
  m = s.match(/^(handicap|ah)\s*([+-]?[0-9]+(?:\.[0-9])?)\b/i);
  if(m){
    const n = m[2];
    const word = (t && t.word_handicap) || "Handicap";
    return `${word} ${n}`;
  }

  // Fallback: translate common words/phrases inside the string
  let out = s;
  const phraseMap = [
    [/Home or Draw/gi, (t && t.market_desc_home_draw)],
    [/Draw or Away/gi, (t && t.market_desc_draw_away)],
    [/Home or Away/gi, (t && t.market_desc_home_away)],
  ];
  phraseMap.forEach(([rx, val])=>{ if(val) out = out.replace(rx, val); });

  out = out
    .replace(/\bHome\b/gi, home)
    .replace(/\bAway\b/gi, away)
    .replace(/\bDraw\b/gi, draw);

  return out;
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
  // RadarTips: dark by default (more "tips & odds" vibe)
  return "dark";
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
  const dict = await loadJSON("/i18n/strings.json", {});
  T = dict[LANG] || dict.en;

  initThemeToggle(T);
  initTooltips();

  const p = pageType();
  if(!p){
    if(qs(".rt-header")){
      setText("brand", T.brand);
      setText("disclaimer", T.disclaimer);
      setText("subtitle", T.subtitle || "");
      setNav(LANG, T);
      decorateLangPills(LANG);
      await applyShellHeader(LANG, T);
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
  await applyShellHeader(LANG, T);
  syncLangPillsActive(LANG);

  warnRtDomContract(p);

  const isDayboard = !!qs("#dayboard_tabs");

  if(p==="day"){
    if(qs("#top3_heading")){
      if(rtSurface() === "radar-day"){
        setText("top3_heading", T.radar_day_title || "Radar Day");
        setText("top3_sub", "");
      } else {
        setText("top3_heading", T.top3_title || "");
        setText("top3_sub", T.top3_sub || "");
      }
    } else {
      setText("hero_title", T.hero_title_day);
      setText("hero_sub", T.hero_sub_day);
    }
    const radar = await loadJSON("/data/v1/radar_day.json", {highlights:[]});
    renderTop3(T, radar);
  } else {
    setText("hero_title", T.hero_title_cal);
    setText("hero_sub", T.hero_sub_cal);
    renderTop3(T, {highlights:[]});
  }

  if(!isDayboard){
    setText("calendar_title", T.calendar_title);
    setText("calendar_sub", T.calendar_sub);
  }

  const searchEl = qs("#search");
  if(searchEl) searchEl.setAttribute("placeholder", T.search_placeholder);

  let q = "";
  const [data, covRaw] = await Promise.all([
    loadCalendar2dMerged(),
    loadJSON(COVERAGE_ALLOWLIST_URL, null),
  ]);
  CAL_MATCHES = data.matches || [];
  CAL_META = {
    form_window: Number(data.form_window || 5),
    goals_window: Number(data.goals_window || 5),
    anchorToday: data.anchorToday || null,
    anchorTomorrow: data.anchorTomorrow || null,
  };
  COVERAGE_NAV_MODEL = buildCoverageNavModel(covRaw);

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
      renderCalendar(T, CAL_MATCHES, q, activeDate, selectedNav);
    } else {
      if(strip) renderStrip();
      renderCalendar(T, CAL_MATCHES, q, activeDate, undefined);
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

document.addEventListener("DOMContentLoaded", init);
