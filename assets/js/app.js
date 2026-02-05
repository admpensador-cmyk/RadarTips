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
  // /{lang}/radar/day/ | /{lang}/radar/week/ | /{lang}/calendar/
  const parts = location.pathname.split("/").filter(Boolean);
  const p = parts.slice(1).join("/");
  if(p.startsWith("radar/day")) return "day";
  if(p.startsWith("radar/week")) return "week";
  if(p.startsWith("calendar")) return "calendar";
  return "day";
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

// Prefer Worker API (/api/v1) with automatic fallback to static files (/data/v1).
// This enables real-time live updates without triggering Cloudflare Pages builds.
const V1_API_BASE = "/api/v1";
const V1_STATIC_BASE = "/data/v1";
const V1_DATA_BASE = "https://radartips-data.m2otta-music.workers.dev/v1";

async function loadV1JSON(file, fallback){
  // Snapshots (calendar/radar) come from R2 Data Worker (no Pages rebuild needed)
  if(file === "calendar_7d.json" || file === "radar_day.json" || file === "radar_week.json"){
    const r2 = await loadJSON(`${V1_DATA_BASE}/${file}`, null);
    if(r2) return r2;
  }

  // Live and any API-backed endpoints: API first
  const api = await loadJSON(`${V1_API_BASE}/${file}`, null);
  if(api) return api;

  // Static fallback (repo snapshots)
  return await loadJSON(`${V1_STATIC_BASE}/${file}`, fallback);
}

function _norm(str){ return String(str||"").trim().toLowerCase(); }

function computeOutcomeFromSuggestion(sugg, gh, ga, statusShort){
  const st = String(statusShort||"").toUpperCase();
  const finalStatuses = new Set(["FT","AET","PEN"]);
  const voidStatuses = new Set(["CANC","PST","ABD","SUSP"]);
  if(voidStatuses.has(st)) return "void";
  if(!finalStatuses.has(st)) return "pending";
  const H = Number(gh); const A = Number(ga);
  if(!Number.isFinite(H) || !Number.isFinite(A)) return "pending";

  const s = _norm(sugg);
  const total = H + A;

  // Over/Under
  let m = s.match(/(under|menos de)\s*([0-9]+(?:[\.,][0-9]+)?)/i);
  if(m){
    const line = Number(String(m[2]).replace(",","."));
    if(Number.isFinite(line)) return total < line ? "green" : "red";
  }
  m = s.match(/(over|mais de)\s*([0-9]+(?:[\.,][0-9]+)?)/i);
  if(m){
    const line = Number(String(m[2]).replace(",","."));
    if(Number.isFinite(line)) return total > line ? "green" : "red";
  }

  // Double chance / 1X / X2 / 12
  if(s.includes("1x")) return (H >= A) ? "green" : "red";
  if(s.includes("x2")) return (A >= H) ? "green" : "red";
  if(s.includes("12")) return (H !== A) ? "green" : "red";

  // Draw No Bet (best-effort)
  if(s.includes("dnb") || s.includes("draw no bet")){
    // If suggestion tells side, check it; otherwise treat as pending
    if(s.includes("home") || s.includes("casa") || s.includes("mandante")){
      if(H === A) return "void";
      return (H > A) ? "green" : "red";
    }
    if(s.includes("away") || s.includes("fora") || s.includes("visitante")){
      if(H === A) return "void";
      return (A > H) ? "green" : "red";
    }
    // Unknown side
    return "pending";
  }

  return "pending";
}

let _liveTimer = null;
let _lastLiveAt = 0;

async function tickLive(t){
  const live = await loadJSON(`${V1_API_BASE}/live.json`, null);
  if(!live || !Array.isArray(live.states)) return;
  _lastLiveAt = Date.now();
  applyLiveStates(live.states, t);
}

function startLivePolling(t){
  // only once
  if(_liveTimer) return;
  tickLive(t);
  _liveTimer = setInterval(()=> tickLive(t), 60_000);
  document.addEventListener("visibilitychange", ()=>{
    if(!document.hidden) tickLive(t);
  });
}

function applyLiveStates(states, t){
  for(const s of states){
    if(!s) continue;
    const id = String(s.fixture_id ?? s.id ?? "");
    if(!id) continue;
    const els = document.querySelectorAll(`[data-fixture-id="${id}"]`);
    if(!els || els.length===0) continue;
    for(const el of els){
      const pill = el.querySelector("[data-live-pill]");
      const scoreEl = el.querySelector("[data-score]");
      const outcomeEl = el.querySelector("[data-outcome-pill]");
      const sugg = el.getAttribute("data-sugg") || "";

      const st = String(s.status_short||"").toUpperCase();
      const elapsed = (s.elapsed ?? null);
      const gh = s.goals_home;
      const ga = s.goals_away;

      // Score
      if(scoreEl){
        if(gh !== null && gh !== undefined && ga !== null && ga !== undefined){
          scoreEl.textContent = `${gh} - ${ga}`;
          scoreEl.hidden = false;
        }else{
          scoreEl.hidden = true;
        }
      }

      // Live pill
      if(pill){
        pill.hidden = false;
        pill.classList.remove("live","final","pending");
        const isFinal = ["FT","AET","PEN"].includes(st);
        const isLive = ["1H","2H","HT","ET","BT","P"].includes(st);
        if(isFinal){
          pill.classList.add("final");
          pill.querySelector(".txt").textContent = (t.ft_label || "FT");
        }else if(isLive){
          pill.classList.add("live");
          const liveTxt = (t.live_label || "LIVE");
          pill.querySelector(".txt").textContent = (elapsed !== null && elapsed !== undefined)
            ? `${liveTxt} ${elapsed}'`
            : liveTxt;
        }else{
          pill.classList.add("pending");
          pill.querySelector(".txt").textContent = t.pending_label || "—";
        }
      }

      // Outcome
      if(outcomeEl){
        const out = computeOutcomeFromSuggestion(sugg, gh, ga, st);
        outcomeEl.classList.remove("green","red","void","pending");
        outcomeEl.classList.add(out);
        if(out === "green") outcomeEl.textContent = (t.outcome_green || "GREEN");
        else if(out === "red") outcomeEl.textContent = (t.outcome_red || "RED");
        else if(out === "void") outcomeEl.textContent = (t.outcome_void || "VOID");
        else outcomeEl.textContent = (t.outcome_pending || "PENDING");
        outcomeEl.hidden = (out === "pending");
      }
    }
  }
}

function isMockDataset(obj){
  try{
    return !!(obj && obj.meta && obj.meta.is_mock === true);
  }catch(e){
    return false;
  }
}


function showUpdatingMessage(container){
  if(!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-title">Updating match data…</div>
      <div class="empty-sub">We’re generating today’s radar. Please refresh in a few minutes.</div>
    </div>`;
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

function ensureTopSearch(t){
  const nav = qs(".topbar .nav");
  if(!nav) return;
  if(qs("#topSearch")) return;

  const wrap = document.createElement("div");
  wrap.className = "top-search";
  wrap.innerHTML = `
    <span class="top-search-ico" aria-hidden="true">🔎</span>
    <input id="topSearch" type="search" inputmode="search" placeholder="${escAttr(t.search_placeholder || "Search team or league")}" />
  `;

  const themeBtn = qs("#theme_toggle");
  if(themeBtn && themeBtn.parentElement === nav){
    nav.insertBefore(wrap, themeBtn);
  }else{
    nav.appendChild(wrap);
  }

  const topInput = wrap.querySelector("#topSearch");
  const mainInput = qs("#search");
  if(!topInput || !mainInput) return;

  topInput.addEventListener("input", ()=>{
    mainInput.value = topInput.value;
    mainInput.dispatchEvent(new Event("input", {bubbles:true}));
  });
  mainInput.addEventListener("input", ()=>{
    if(topInput.value !== mainInput.value) topInput.value = mainInput.value;
  });
}

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


// --- Collapse state helpers (country / competition) ---
const COLLAPSE_KEY = "rt_collapse_v1";
let _collapseCache = null;

function _loadCollapse(){
  if(_collapseCache) return _collapseCache;
  let st = {country:[], competition:[]};
  try{
    const raw = localStorage.getItem(COLLAPSE_KEY);
    if(raw){
      const obj = JSON.parse(raw);
      if(obj && typeof obj === "object"){
        st.country = Array.isArray(obj.country) ? obj.country : [];
        st.competition = Array.isArray(obj.competition) ? obj.competition : [];
      }
    }
  }catch(e){}
  _collapseCache = st;
  return st;
}

function _saveCollapse(st){
  _collapseCache = st;
  try{ localStorage.setItem(COLLAPSE_KEY, JSON.stringify(st)); }catch(e){}
}

function _compKey(country, comp){
  return `${String(country||"")}||${String(comp||"")}`;
}

function isCountryCollapsed(country){
  const st = _loadCollapse();
  return st.country.includes(String(country||""));
}

function setCountryCollapsed(country, collapsed){
  const st = _loadCollapse();
  const key = String(country||"");
  const has = st.country.includes(key);
  if(collapsed && !has) st.country.push(key);
  if(!collapsed && has) st.country = st.country.filter(x=>x!==key);
  _saveCollapse(st);
}

function isCompetitionCollapsed(country, comp){
  const st = _loadCollapse();
  const key = _compKey(country, comp);
  return st.competition.includes(key);
}

function setCompetitionCollapsed(country, comp, collapsed){
  const st = _loadCollapse();
  const key = _compKey(country, comp);
  const has = st.competition.includes(key);
  if(collapsed && !has) st.competition.push(key);
  if(!collapsed && has) st.competition = st.competition.filter(x=>x!==key);
  _saveCollapse(st);
}


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

function pickTeamLogo(obj, side){
  const cand = (side==="home")
    ? ["home_logo","homeLogo","home_crest","home_badge","logo_home","team_home_logo","home_team_logo","home_logo_url"]
    : ["away_logo","awayLogo","away_crest","away_badge","logo_away","team_away_logo","away_team_logo","away_logo_url"];
  for(const k of cand){
    if(obj && obj[k]) return obj[k];
  }
  // Optional nested shapes: { home: {logo}, away:{logo} }
  try{
    const t = obj && obj[side];
    if(t && typeof t === "object"){
      return t.logo || t.crest || t.badge || null;
    }
  }catch(e){}
  return null;
}

function pickCompetitionLogo(obj){
  const cand = ["competition_logo","competitionLogo","league_logo","leagueLogo","logo_league","competition_logo_url"];
  for(const k of cand){
    if(obj && obj[k]) return obj[k];
  }
  // Fallback by id (API-Sports)
  const id = obj && (obj.competition_id || obj.league_id || obj.leagueId);
  if(id !== undefined && id !== null && String(id).trim() !== ""){
    return `https://media.api-sports.io/football/leagues/${String(id).trim()}.png`;
  }
  return null;
}

function pickCountryFlag(obj){
  const cand = ["country_flag","countryFlag","flag","country_flag_url"];
  for(const k of cand){
    if(obj && obj[k]) return obj[k];
  }
  // Optional fallback if an ISO2 code is present
  const code = obj && (obj.country_code || obj.countryCode || obj.country_iso2 || obj.iso2);
  if(code && /^[A-Za-z]{2}$/.test(String(code))){
    return `https://media.api-sports.io/flags/${String(code).toLowerCase()}.svg`;
  }

  // Name-to-ISO2 best-effort for our target coverage
  const name = String(obj?.country || obj?.country_name || obj?.countryName || "").trim().toLowerCase();
  const MAP = {
    "italy":"it",
    "england":"gb",
    "scotland":"gb",
    "wales":"gb",
    "spain":"es",
    "france":"fr",
    "germany":"de",
    "brazil":"br",
    "argentina":"ar",
    "mexico":"mx",
    "colombia":"co",
    "chile":"cl",
    "uruguay":"uy",
    "paraguay":"py",
    "saudi arabia":"sa",
    "egypt":"eg",
    "south africa":"za",
    "australia":"au",
  };
  const iso = MAP[name];
  if(iso){
    return `https://media.api-sports.io/flags/${iso}.svg`;
  }
  return null;
}

function tinyImgHTML(src, alt, cls){
  if(!src) return "";
  return `<img class="${escAttr(cls||"")}" src="${escAttr(src)}" alt="${escAttr(alt||"")}" loading="lazy" referrerpolicy="no-referrer" />`;
}

function crestHTML(teamName, logoUrl){
  const logo = logoUrl || null;
  if(logo){
    const src = escAttr(logo);
    const alt = escAttr(teamName);
    return `<span class="crest crest--img" aria-hidden="true"><img src="${src}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" /></span>`;
  }
  const hue = _hashHue(teamName);
  const ini = _initials(teamName);
  return `<span class="crest" style="--h:${hue}" aria-hidden="true">${escAttr(ini)}</span>`;
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

function setNav(lang, t){
  const map = {
    day: `/${lang}/radar/day/`,
    week: `/${lang}/radar/week/`,
    calendar: `/${lang}/calendar/`
  };
  qsa("[data-nav]").forEach(a=>{
    const k=a.getAttribute("data-nav");

    // Calendar is a fixed section on Day/Week pages, so we don't need a separate Calendar tab in the topbar.
    if(k==="calendar" && pageType()!=="calendar"){
      a.style.display = "none";
      return;
    }

    a.href = map[k];
    a.textContent = (k==="day") ? t.nav_day : (k==="week") ? t.nav_week : t.nav_calendar;
    a.classList.toggle("active", location.pathname.startsWith(map[k]));
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

function renderTop3(t, data){
  const slots = data.highlights || [];
  const cards = qsa(".card[data-slot]");

  cards.forEach((card, idx)=>{
    const item = slots[idx];
    const badge = card.querySelector(".badge.risk");
    const top = card.querySelector(".badge.top");
    const h3 = card.querySelector("h3");
    const meta = card.querySelector(".meta");
    const lock = card.querySelector(".lock");

    top.className = "badge top rank";
    top.textContent = `#${idx+1}`;
    top.setAttribute("title", t.rank_tooltip || "Ranking do Radar (ordem de destaque).");
    top.setAttribute("data-tip", t.rank_tooltip || "Ranking do Radar (ordem de destaque).");

    if(!item){
      badge.className = "badge risk high";
      badge.textContent = t.risk_high;
      badge.setAttribute("title", t.risk_tooltip || "");
      badge.setAttribute("data-tip", t.risk_tooltip || "");

      h3.textContent = t.empty_slot;
      meta.innerHTML = "";
      lock.innerHTML = "";
      return;
    }

    // Risk chip
    badge.className = `badge risk ${riskClass(item.risk)}`;
    badge.textContent = (item.risk==="low")?t.risk_low:(item.risk==="high")?t.risk_high:t.risk_med;
    badge.setAttribute("title", t.risk_tooltip || "");
    badge.setAttribute("data-tip", t.risk_tooltip || "");

    // Title (football-first: crest + team name)
    const homeLogo = pickTeamLogo(item, "home");
    const awayLogo = pickTeamLogo(item, "away");
    h3.innerHTML = `
      <div class="match-title">
        <div class="teamline">${crestHTML(item.home, homeLogo)}<span>${escAttr(item.home)}</span></div>
        <div class="vs">vs</div>
        <div class="teamline">${crestHTML(item.away, awayLogo)}<span>${escAttr(item.away)}</span></div>
      </div>
    `;

    // Meta (chips + icons; avoids awkward wraps)
    meta.innerHTML = `
      <div class="meta-chips">
        <span class="meta-chip" ${tipAttr(t.kickoff_tooltip || "")}>${icoSpan("clock")}<span>${fmtTime(item.kickoff_utc)}</span></span>
        <span class="meta-chip" ${tipAttr(t.competition_tooltip || "")}>${icoSpan("trophy")}<span>${escAttr(competitionDisplay(item.competition, item.country, LANG))}</span></span>
        <span class="meta-chip" ${tipAttr(t.country_tooltip || "")}>${icoSpan("globe")}<span>${escAttr(item.country)}</span></span>
      </div>
      <div class="scoreline">
        <span class="live-pill pending" data-live-pill hidden><span class="dot"></span><span class="txt">—</span></span>
        <span class="score" data-score hidden>0 - 0</span>
        <span class="outcome-pill pending" data-outcome-pill hidden>${escAttr(t.outcome_pending || "PENDING")}</span>
      </div>
      <div class="meta-actions">
        <button class="meta-link" type="button" data-open="competition" data-value="${escAttr(competitionValue(item) || item.competition)}" ${tipAttr(t.competition_radar_tip || "")}>${icoSpan("trophy")}<span>${escAttr(t.competition_radar)}</span></button>
        <button class="meta-link" type="button" data-open="country" data-value="${escAttr(item.country)}" ${tipAttr(t.country_radar_tip || "")}>${icoSpan("globe")}<span>${escAttr(t.country_radar)}</span></button>
      </div>
    `;

    // FREE callout
    const key = matchKey(item);
    card.setAttribute("data-open","match");
    card.setAttribute("data-key", key);
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-label", `${t.match_radar}: ${item.home} vs ${item.away}`);

    // Live bindings
    const _fxId = item.fixture_id ?? item.fixtureId ?? item.id ?? item.fixture ?? null;
    if(_fxId !== null && _fxId !== undefined && String(_fxId).trim() !== ""){
      card.setAttribute("data-fixture-id", String(_fxId));
    }
    card.setAttribute("data-sugg", String(item.suggestion_free || ""));

    const suggestion = localizeMarket(item.suggestion_free, t) || "—";
    lock.innerHTML = `
      <div class="callout">
        <div class="callout-top">
          <span class="callout-label">${icoSpan("spark")}<span>${escAttr(t.suggestion_label || "Sugestão do Radar")}</span></span>
          <span class="callout-value" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(suggestion)}</span>
        </div>
        <div class="callout-sub">
          <span class="mini-chip" ${tipAttr(t.risk_tooltip || "")}>${escAttr(t.risk_short_label || "Risco")}: <b>${ (item.risk==="low")?t.risk_low:(item.risk==="high")?t.risk_high:t.risk_med }</b></span>
          <span class="mini-chip" ${tipAttr(t.free_tooltip || (t.free_includes || ""))}>${escAttr(t.free_badge || "FREE")}</span>
        </div>
        <div class="callout-actions">
          <button class="btn primary" type="button" data-open="match" data-key="${key}" ${tipAttr(t.match_radar_tip || "")}><span>${escAttr(t.match_radar || "Radar do Jogo")}</span>${icoSpan("arrow")}</button>
        </div>
      </div>
    `;
  });
}


function renderPitch(){
  const bar = qs("#pitchbar");
  if(bar) bar.hidden = false;
  const kicker = qs("#pitch_kicker");
  const freepro = qs("#pitch_free_pro");
  const markets = qs("#pitch_markets");
  const aboutBtn = qs("#btn_about");
  const browseBtn = qs("#btn_browse");

  if(kicker) kicker.textContent = T.pitch_kicker || "";
  if(freepro) freepro.textContent = T.pitch_free_pro || "";
  if(aboutBtn) aboutBtn.textContent = T.about_cta || "About";
  if(browseBtn){
    browseBtn.textContent = T.browse_cta || "Calendar";
    const calSection = qs("#calendar_section");
    browseBtn.setAttribute("href", calSection ? "#calendar_section" : `/${LANG}/calendar/`);
  }
  if(markets){
    const chips = [
      {k:"market_1x", tip:"market_1x_tip"},
      {k:"market_under", tip:"market_under_tip"},
      {k:"market_dnb", tip:"market_dnb_tip"},
      {k:"market_handicap", tip:"market_handicap_tip"},
    ];
    markets.innerHTML = `
      <div class="markets-label">${escAttr(T.markets_label || "")}</div>
      <div class="markets-row">
        ${chips.map(c=>{
          const label = T[c.k] || "";
          const tip = T[c.tip] || "";
          return `<span class="mini-chip market" ${tipAttr(tip)}>${escAttr(label)}</span>`;
        }).join("")}
      </div>
    `;
  }
}


function normalize(s){ return (s||"").toLowerCase().trim(); }


function competitionDisplay(rawComp, country, lang){
  const comp = String(rawComp || "").trim();
  const c = normalize(country);
  const n = normalize(comp);

  // Disambiguate common league names (so Brazil doesn't look like Italy, etc.)
  const isPt = (lang === "pt");
  const isEs = (lang === "es");
  const isFr = (lang === "fr");
  const isDe = (lang === "de");

  function pick(pt,en,es,fr,de){
    if(isPt) return pt;
    if(isEs) return es || en;
    if(isFr) return fr || en;
    if(isDe) return de || en;
    return en;
  }

  if(n === "serie a"){
    if(c === "brazil") return pick("Brasileirão Série A","Brazil Serie A","Serie A (Brasil)","Série A (Brésil)","Serie A (Brasilien)");
    if(c === "italy")  return pick("Serie A (Itália)","Serie A (Italy)","Serie A (Italia)","Serie A (Italie)","Serie A (Italien)");
  }
  if(n === "serie b"){
    if(c === "brazil") return pick("Brasileirão Série B","Brazil Serie B","Serie B (Brasil)","Série B (Brésil)","Serie B (Brasilien)");
    if(c === "italy")  return pick("Serie B (Itália)","Serie B (Italy)","Serie B (Italia)","Serie B (Italie)","Serie B (Italien)");
  }
  if(n === "serie c"){
    if(c === "brazil") return pick("Brasileirão Série C","Brazil Serie C","Serie C (Brasil)","Série C (Brésil)","Serie C (Brasilien)");
  }

  return comp || "—";
}

function competitionValue(m){
  // Prefer numeric id if available, fallback to name.
  const id = m && (m.competition_id || m.league_id || m.leagueId);
  if(id !== undefined && id !== null && String(id).trim() !== "") return String(id);
  return String(m?.competition || "");
}


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

function groupByCountry(matches){
  const sorted = [...matches].sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
  const map = new Map();
  for(const m of sorted){
    const key = m.country;
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.entries()].map(([name, ms])=>({name, matches: ms}));
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

function renderCalendar(t, matches, viewMode, query, activeDateKey){
  const root = qs("#calendar");
  if(!root) return;
  root.innerHTML = "";

  const q = normalize(query);

  const filtered = (matches || []).filter(m=>{
    // Date filter (local timezone)
    if(activeDateKey && activeDateKey !== "7d"){
      if(localDateKey(m.kickoff_utc) !== activeDateKey) return false;
    }

    if(!q) return true;
    const blob = `${m.country} ${m.competition} ${m.home} ${m.away}`.toLowerCase();
    return blob.includes(q);
  });

  if(!filtered.length){
    root.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">${escAttr(t.empty_list || "Sem jogos encontrados.")}</div>
        <div class="empty-sub">${escAttr(t.calendar_empty_hint || "Tente outro dia ou ajuste a busca.")}</div>
      </div>
    `;
    return;
  }

  function renderMatchRow(m, showMeta){
    const row = document.createElement("div");
    row.className = "match";
    row.setAttribute("data-open","match");
    row.setAttribute("data-key", matchKey(m));
    row.setAttribute("role","button");
    row.setAttribute("tabindex","0");
    row.setAttribute("aria-label", `${t.match_radar}: ${m.home} vs ${m.away}`);
    row.setAttribute("title", `${t.match_radar}: ${m.home} vs ${m.away}`);
    row.setAttribute("data-tip", `${t.match_radar}: ${m.home} vs ${m.away}`);

    // Live bindings
    const _fxId = m.fixture_id ?? m.fixtureId ?? m.id ?? m.fixture ?? null;
    if(_fxId !== null && _fxId !== undefined && String(_fxId).trim() !== ""){
      row.setAttribute("data-fixture-id", String(_fxId));
    }
    row.setAttribute("data-sugg", String(m.suggestion_free || ""));

    const formHome = buildFormSquares(t, m.form_home_details || m.form_home_last || m.home_last || null, CAL_META.form_window);
    const formAway = buildFormSquares(t, m.form_away_details || m.form_away_last || m.away_last || null, CAL_META.form_window);

    const goalsTip = t.goals_tooltip || "Goals for/goals against (last 5 matches).";
    const ghf = (m.gf_home ?? m.goals_for_home ?? 0), gha = (m.ga_home ?? m.goals_against_home ?? 0);
    const gaf = (m.gf_away ?? m.goals_for_away ?? 0), gaa = (m.ga_away ?? m.goals_against_away ?? 0);

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

    const homeLogo = pickTeamLogo(m, "home");
    const awayLogo = pickTeamLogo(m, "away");

    const compDisp = competitionDisplay(m.competition, m.country, LANG);
    const compVal  = competitionValue(m);

    const metaChips = showMeta ? `
      <div class="meta-chips" style="margin-top:8px">
        <span class="meta-chip" ${tipAttr(t.competition_tooltip || "")}>${icoSpan("trophy")}<span>${escAttr(compDisp)}</span></span>
        <span class="meta-chip" ${tipAttr(t.country_tooltip || "")}>${icoSpan("globe")}<span>${escAttr(m.country || "—")}</span></span>
      </div>
    ` : "";

    row.innerHTML = `
      <div class="time" ${tipAttr(t.kickoff_tooltip || "")}>${fmtTime(m.kickoff_utc)}</div>
      <div>
        <div class="teams">
          <div class="teamline">${crestHTML(m.home, homeLogo)}<span>${escAttr(m.home)}</span></div>
          <div class="teamline">${crestHTML(m.away, awayLogo)}<span>${escAttr(m.away)}</span></div>
        </div>
        ${metaChips}
        <div class="scoreline">
          <span class="live-pill pending" data-live-pill hidden><span class="dot"></span><span class="txt">—</span></span>
          <span class="score" data-score hidden>0 - 0</span>
          <span class="outcome-pill pending" data-outcome-pill hidden>${escAttr(t.outcome_pending || "PENDING")}</span>
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
      </div>
      <div class="suggestion" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(localizeMarket(m.suggestion_free, t) || "—")} • ${ (m.risk==="low")?t.risk_low:(m.risk==="high")?t.risk_high:t.risk_med }</div>
    `;

    return row;
  }

  if(viewMode === "country"){
    // Country -> Competition (the expected "Por país - competição")
    const countries = groupByCountry(filtered);

    for(const cg of countries){
      const countryName = cg.name || "—";
      const cFirst = (cg.matches && cg.matches[0]) ? cg.matches[0] : null;
      const flagUrl = pickCountryFlag(cFirst);
      const flagHTML = flagUrl ? tinyImgHTML(flagUrl, countryName, "flag-img") : icoSpan("globe");
      const box = document.createElement("div");
      box.className = "group";

      box.innerHTML = `
        <div class="group-head collapsible" data-collapse="country" data-key="${escAttr(countryName)}" role="button" tabindex="0" aria-expanded="true">
          <div class="group-title"><span class="chev" aria-hidden="true"></span>${flagHTML}<span>${escAttr(countryName)}</span></div>
          <div class="group-actions">
            <span class="chip" data-open="country" data-value="${escAttr(countryName)}" ${tipAttr(t.country_radar_tip || "")}>${t.country_radar}</span>
          </div>
        </div>
        <div class="subgroups"></div>
      `;


      // Apply persisted collapse state (country)
      const _cCollapsed = isCountryCollapsed(countryName);
      box.classList.toggle("collapsed", _cCollapsed);
      const _cHead = box.querySelector(".group-head");
      if(_cHead) _cHead.setAttribute("aria-expanded", _cCollapsed ? "false" : "true");

      const host = box.querySelector(".subgroups");

      // Competition subgroups inside the country
      const map = new Map();
      const sorted = [...cg.matches].sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
      for(const m of sorted){
        const key = String(m.competition || "—");
        if(!map.has(key)) map.set(key, []);
        map.get(key).push(m);
      }

      for(const [compRaw, ms] of map.entries()){
        const compDisp = competitionDisplay(compRaw, countryName, LANG);
        const compVal = competitionValue(ms[0] || {competition:compRaw});
        const compLogoUrl = pickCompetitionLogo(ms[0] || null);
        const compIcon = compLogoUrl ? tinyImgHTML(compLogoUrl, compDisp, "comp-logo") : icoSpan("trophy");

        const sub = document.createElement("div");
        sub.className = "subgroup";
        sub.innerHTML = `
          <div class="subhead collapsible" data-collapse="competition" data-country="${escAttr(countryName)}" data-key="${escAttr(compVal || compRaw)}" role="button" tabindex="0" aria-expanded="true">
            <div class="subtitle"><span class="chev" aria-hidden="true"></span>${compIcon}<span>${escAttr(compDisp)}</span></div>
            <div class="group-actions">
              <span class="chip" data-open="competition" data-value="${escAttr(compVal || compRaw)}" ${tipAttr(t.competition_radar_tip || "")}>${t.competition_radar}</span>
            </div>
          </div>
          <div class="matches"></div>
        `;


        // Apply persisted collapse state (competition)
        const _compKeyVal = String(compVal || compRaw);
        const _sCollapsed = isCompetitionCollapsed(countryName, _compKeyVal);
        sub.classList.toggle("collapsed", _sCollapsed);
        const _sHead = sub.querySelector(".subhead");
        if(_sHead) _sHead.setAttribute("aria-expanded", _sCollapsed ? "false" : "true");

        const list = sub.querySelector(".matches");
        ms.forEach(m => list.appendChild(renderMatchRow(m, false)));

        host.appendChild(sub);
      }

      root.appendChild(box);
    }

    return;
  }

  // Time view (always within the selected day)
  const groups = groupByTime(filtered);
  for(const g of groups){
    const box = document.createElement("div");
    box.className = "group";

    box.innerHTML = `
      <div class="group-head">
        <div class="group-title">${icoSpan("clock")}<span>${escAttr(g.name)}</span></div>
      </div>
      <div class="matches"></div>
    `;

    const list = box.querySelector(".matches");
    g.matches.forEach(m => list.appendChild(renderMatchRow(m, true)));

    root.appendChild(box);
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

  // ABOUT / HOW IT WORKS
  if(type === "about"){
    title.textContent = T.about_title || "About";
    body.innerHTML = `
      <div class="panel">
        <div class="panel-title">${escAttr(T.about_intro_title || T.about_title || "About")}</div>
        <div class="smallnote">${escAttr(T.about_intro || "")}</div>
      </div>

      <div class="panel" style="margin-top:12px">
        <div class="panel-title">${escAttr(T.about_steps_title || "How it works")}</div>
        <div class="smallnote" style="display:flex;flex-direction:column;gap:6px">
          <div>• ${escAttr(T.about_step1 || "")}</div>
          <div>• ${escAttr(T.about_step2 || "")}</div>
          <div>• ${escAttr(T.about_step3 || "")}</div>
        </div>
      </div>

      <div class="mnote">
        <div>${escAttr(T.disclaimer || "")}</div>
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
    const home = parts[1] || "";
    const away = parts[2] || "";

    const m = CAL_MATCHES.find(x => (`${x.kickoff_utc}|${x.home}|${x.away}`) === decoded) || null;

    const mCountry = m?.country || "—";
    const compDisp = competitionDisplay(m?.competition, mCountry, LANG);
    const mCompRaw = m?.competition || "—";
    const compVal = competitionValue(m || {competition:mCompRaw});

    const riskText = m ? ((m.risk==="low")?T.risk_low:(m.risk==="high")?T.risk_high:T.risk_med) : "—";
    const riskCls = m ? riskClass(m.risk) : "med";
    const kickoff = m ? fmtTime(m.kickoff_utc) : "--:--";
    const suggestion = localizeMarket(m?.suggestion_free, T) || "—";

    title.textContent = `${home} vs ${away}`;

    const goalsTip = T.goals_tooltip || "Goals for/goals against (last 5 matches).";
    const formHome = buildFormSquares(T, m?.form_home_details || m?.form_home_last || m?.home_last || null, CAL_META.form_window);
    const formAway = buildFormSquares(T, m?.form_away_details || m?.form_away_last || m?.away_last || null, CAL_META.form_window);

    const homeLogo = pickTeamLogo(m, "home");
    const awayLogo = pickTeamLogo(m, "away");

    body.innerHTML = `
      <div class="mhead">
        <div class="mmeta">
          <div class="mteams">
            <div class="team">${crestHTML(home, homeLogo)}<span>${escAttr(home)}</span></div>
            <div class="vs" style="opacity:.7;font-weight:900">vs</div>
            <div class="team">${crestHTML(away, awayLogo)}<span>${escAttr(away)}</span></div>
          </div>

          <div class="mcomp">
            ${escAttr(compDisp)} • ${escAttr(mCountry)} • <span ${tipAttr(T.kickoff_tooltip || "")}>${kickoff}</span>
          </div>

          <div class="mbadges">
            <span class="badge risk ${riskCls}" ${tipAttr(T.risk_tooltip || "")}>${riskText}</span>
            <span class="badge" ${tipAttr(T.suggestion_tooltip || "")}>${escAttr(T.suggestion_label || "Sugestão")}: <b>${escAttr(suggestion)}</b></span>
          </div>
        </div>

        <button class="btn primary" type="button" ${tipAttr(T.pro_includes || "")}>${escAttr(T.cta_pro || "Assinar PRO")}</button>
      </div>

      <div class="mgrid">
        <div class="panel">
          <div class="panel-title" ${tipAttr(T.form_tooltip || "")}>${escAttr(T.form_label || "Últimos 5")}</div>
          <div class="form">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span style="font-weight:950;opacity:.85">${escAttr(T.home_label || "CASA")}</span>
              ${formHome}
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
              <span style="font-weight:950;opacity:.85">${escAttr(T.away_label || "FORA")}</span>
              ${formAway}
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-title" ${tipAttr(goalsTip)}>${escAttr(T.goals_title || "Gols (últimos 5)")}</div>
          <div class="goals">
            <span class="goal-pill" ${tipAttr(`${goalsTip} • ${T.home_label || "CASA"}`)}>
              <span class="tag">${escAttr(T.goals_label || "Gols")} ${escAttr(T.home_label || "CASA")}</span>
              <span class="gf">${escAttr(m?.gf_home ?? 0)}</span>/<span class="ga">${escAttr(m?.ga_home ?? 0)}</span>
            </span>
            <span class="goal-pill" ${tipAttr(`${goalsTip} • ${T.away_label || "FORA"}`)}>
              <span class="tag">${escAttr(T.goals_label || "Gols")} ${escAttr(T.away_label || "FORA")}</span>
              <span class="gf">${escAttr(m?.gf_away ?? 0)}</span>/<span class="ga">${escAttr(m?.ga_away ?? 0)}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="mfooter">
        <span class="chip" data-open="competition" data-value="${escAttr(compVal || mCompRaw)}" ${tipAttr(T.competition_radar_tip || "")}>${escAttr(T.competition_radar || "Radar da Competição")}</span>
        <span class="chip" data-open="country" data-value="${escAttr(mCountry)}" ${tipAttr(T.country_radar_tip || "")}>${escAttr(T.country_radar || "Radar do País")}</span>
      </div>

      <div class="mnote">
        ${escAttr(T.free_includes || "FREE: sugestão + risco + forma + gols.")}<br/>
        <span style="opacity:.85">${escAttr(T.pro_includes || "PRO: probabilidades, EV, odds e estatísticas avançadas.")}</span>
      </div>
    `;

    back.style.display = "flex";
    bindModalClicks();
    return;
  }

  // COUNTRY / COMPETITION RADAR (FREE)
  const isId = /^[0-9]+$/.test(String(value || "").trim());
  const label = (type==="country") ? (T.country_radar || "Radar do País") : (T.competition_radar || "Radar da Competição");

  let list = [];
  let displayValue = value;

  if(type==="country"){
    list = CAL_MATCHES.filter(m => normalize(m.country) === normalize(value));
  }else{
    if(isId){
      list = CAL_MATCHES.filter(m => String(competitionValue(m)) === String(value));
      const sample = list[0];
      if(sample) displayValue = competitionDisplay(sample.competition, sample.country, LANG);
    }else{
      list = CAL_MATCHES.filter(m => normalize(m.competition) === normalize(value));
      const sample = list[0];
      if(sample) displayValue = competitionDisplay(sample.competition, sample.country, LANG);
    }
  }

  title.textContent = displayValue ? `${label}: ${displayValue}` : label;

  const rows = list
    .sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc))
    .map(m=>{
      const key = matchKey(m);
      const riskText = (m.risk==="low")?T.risk_low:(m.risk==="high")?T.risk_high:T.risk_med;

      const homeLogo = pickTeamLogo(m, "home");
      const awayLogo = pickTeamLogo(m, "away");

      const compDisp = competitionDisplay(m.competition, m.country, LANG);

      return `
        <div class="match" data-open="match" data-key="${key}" role="button" tabindex="0" ${tipAttr(`${T.match_radar}: ${m.home} vs ${m.away}`)}>
          <div class="time">${fmtTime(m.kickoff_utc)}</div>
          <div>
            <div class="teams">
              <div class="teamline">${crestHTML(m.home, homeLogo)}<span>${escAttr(m.home)}</span></div>
              <div class="teamline">${crestHTML(m.away, awayLogo)}<span>${escAttr(m.away)}</span></div>
            </div>
            <div class="meta-chips" style="margin-top:8px">
              <span class="meta-chip">${icoSpan("trophy")}<span>${escAttr(compDisp)}</span></span>
              <span class="meta-chip">${icoSpan("globe")}<span>${escAttr(m.country || "—")}</span></span>
            </div>
            <div class="smallnote" style="margin-top:6px" ${tipAttr(T.suggestion_tooltip || "")}>
              ${escAttr(T.suggestion_label || "Sugestão")}: <b>${escAttr(localizeMarket(m.suggestion_free, T) || "—")}</b> • ${escAttr(riskText)}
            </div>
          </div>
        </div>
      `;
    }).join("");

  body.innerHTML = `
    <div class="mhead">
      <div class="mmeta">
        <div class="mcomp">${escAttr(T.upcoming_matches || "Próximos jogos")}</div>
        <div class="smallnote">${escAttr(T.free_includes || "FREE: sugestão + risco + forma + gols.")}</div>
      </div>
      <button class="btn primary" type="button" ${tipAttr(T.pro_includes || "")}>${escAttr(T.cta_pro || "Assinar PRO")}</button>
    </div>

    <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px">
      ${rows || `<div class="smallnote">${escAttr(T.empty_list || "Sem jogos encontrados.")}</div>`}
    </div>

    <div class="mnote">
      <span style="opacity:.85">${escAttr(T.pro_includes || "PRO: probabilidades, EV, odds e estatísticas avançadas.")}</span>
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
  back.style.display = "none";
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
  // Always mount the strip inside the calendar section (below Radar), never inside the topbar.
  if(qs("#dateStrip")) return qs("#dateStrip");

  const strip = document.createElement("div");
  strip.className = "date-strip";
  strip.id = "dateStrip";

  const section = qs(".section");
  const controls = qs(".section .controls");
  const calendar = qs("#calendar");

  if(controls && controls.parentElement){
    controls.parentElement.insertBefore(strip, controls);
  }else if(calendar && calendar.parentElement){
    calendar.parentElement.insertBefore(strip, calendar);
  }else if(section){
    section.appendChild(strip);
  }else{
    return null;
  }

  strip.setAttribute("aria-label", (t && t.date_filter_label) ? t.date_filter_label : "Filtro de data");
  return strip;
}

function ensureSidebar(t, lang){
  if(qs(".app-shell")) return;

  const container = qs(".container");
  if(!container) return;

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const aside = document.createElement("aside");
  aside.className = "sidebar";

  const main = document.createElement("main");
  main.className = "main";

  // Move container into main
  container.parentNode.insertBefore(shell, container);
  main.appendChild(container);
  shell.appendChild(aside);
  shell.appendChild(main);

  const p = LEGAL_PATHS[lang] || LEGAL_PATHS.en;
  const nav = {
    day: `/${lang}/radar/day/`,
    week: `/${lang}/radar/week/`,
    calendar: `/${lang}/calendar/`
  };

  const here = pageType();

  aside.innerHTML = `
    <div class="side-brand" role="banner">
      <div class="side-logo">
        <span class="ball">⚽</span>
        <div>
          <div class="side-title">RadarTips</div>
          <div class="side-sub">${escAttr(t.sidebar_tagline || "Football radar")}</div>
        </div>
      </div>
    </div>

    <nav class="side-nav" aria-label="Navigation">
      <a class="side-item ${here==="day"?"active":""}" href="${nav.day}"><span class="i">⚡</span><span>${escAttr(t.nav_day || "Daily Radar")}</span></a>
      <a class="side-item ${here==="week"?"active":""}" href="${nav.week}"><span class="i">📅</span><span>${escAttr(t.nav_week || "Weekly Radar")}</span></a>
      <a class="side-item ${here==="calendar"?"active":""}" href="${nav.calendar}"><span class="i">🗓️</span><span>${escAttr(t.nav_calendar || "Calendar")}</span></a>
    </nav>

    <div class="side-divider"></div>

    <nav class="side-nav" aria-label="Info">
      <a class="side-item" href="${p.how}"><span class="i">🧭</span><span>${escAttr(t.how_link || "How it works")}</span></a>
      <a class="side-item" href="${p.about}"><span class="i">ℹ️</span><span>${escAttr(t.about_link || "About")}</span></a>
      <a class="side-item" href="${p.contact}"><span class="i">✉️</span><span>${escAttr(t.contact_link || "Contact")}</span></a>
    </nav>

    <div class="side-divider"></div>

    <div class="side-mini">
      <div class="side-note">${escAttr((t.disclaimer || "Informational content") + " • 18+")}</div>
    </div>
  `;
}

function build7Days(){
  const today = new Date();
  today.setHours(0,0,0,0);
  const days = [];
  for(let i=0;i<7;i++){
    const d = new Date(today);
    d.setDate(today.getDate()+i);
    days.push(d);
  }
  return days;
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


function injectPatchStyles(){
  if(document.getElementById("rtPatchStyles")) return;
  const style = document.createElement("style");
  style.id = "rtPatchStyles";
  style.textContent = `
  /* --- RadarTips patch: modal readability + nested calendar + crest images --- */
  .crest.crest--img{
    background: transparent !important;
    border: 1px solid rgba(255,255,255,.12);
    overflow: hidden;
  }
  .crest.crest--img img{
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 3px;
    display: block;
  }

  .modal-backdrop{
    background: rgba(0,0,0,.62) !important;
    backdrop-filter: blur(6px);
  }
  .modal{
    background: rgba(10,14,24,.98) !important;
    border: 1px solid rgba(255,255,255,.10) !important;
    color: rgba(255,255,255,.92) !important;
  }
  .modal .modal-title{
    color: rgba(255,255,255,.95) !important;
  }
  .modal .panel{
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.10);
    border-radius: 16px;
    padding: 12px;
  }
  .modal .panel-title{
    font-weight: 950;
    margin-bottom: 8px;
    opacity: .92;
  }
  .modal .mhead{
    display:flex;
    gap:12px;
    flex-wrap:wrap;
    align-items:flex-start;
    justify-content:space-between;
  }
  .modal .mmeta{
    display:flex;
    flex-direction:column;
    gap:8px;
    min-width: 240px;
  }
  .modal .mteams{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    align-items:center;
    font-weight: 950;
  }
  .modal .mteams .team{
    display:flex;
    gap:8px;
    align-items:center;
  }
  .modal .mcomp{
    font-weight: 900;
    opacity: .92;
  }
  .modal .mbadges{
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    align-items:center;
  }
  .modal .mgrid{
    margin-top:14px;
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap:12px;
  }
  @media (max-width: 920px){
    .modal .mgrid{ grid-template-columns: 1fr; }
  }
  .modal .mfooter{
    margin-top:14px;
    display:flex;
    gap:10px;
    flex-wrap:wrap;
    align-items:center;
  }
  .modal .mnote{
    margin-top:14px;
    padding:12px;
    border:1px dashed rgba(43,111,242,.35);
    border-radius:16px;
    background: rgba(43,111,242,.10);
    font-weight: 800;
  }

  /* Nested calendar (country -> competition) */
  .group .subgroup{
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid rgba(255,255,255,.06);
  }
  .group .subhead{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:10px;
    padding: 6px 2px;
  }
  .group .subtitle{
    font-weight: 950;
    opacity: .88;
  }

  /* Date chips: make Today/Tomorrow pop a bit */
  .date-strip .date-chip.today,
  .date-strip .date-chip.tomorrow{
    font-weight: 950;
  }

  /* Country + competition logos (flags / league crests) */
  .flag-img,
  .comp-logo{
    width: 18px;
    height: 18px;
    object-fit: contain;
    border-radius: 4px;
  }
  .group-title,
  .subtitle{
    display:flex;
    align-items:center;
    gap:10px;
  }

  /* Collapsible groups (country + competition) */
  .collapsible{
    cursor: pointer;
    user-select: none;
  }
  .chev{
    width: 14px;
    height: 14px;
    display:inline-flex;
    align-items:center;
    justify-content:center;
    opacity:.65;
    transform: rotate(0deg);
    transition: transform .16s ease;
  }
  .chev::before{ content: '▾'; line-height: 1; font-size: 14px; }
  .group.collapsed .chev,
  .subgroup.collapsed .chev{ transform: rotate(-90deg); }
  .group.collapsed .subgroups{ display:none; }
  .subgroup.collapsed .matches{ display:none; }
  `;
  document.head.appendChild(style);
}


async function init(){
  LANG = pathLang() || detectLang();
  const dict = await loadJSON("/i18n/strings.json", {});
  T = dict[LANG] || dict.en;

  initThemeToggle(T);

  setText("brand", T.brand);
  setText("disclaimer", T.disclaimer);

  setText("subtitle", T.subtitle || "");

  setNav(LANG, T);
  decorateLangPills(LANG);
  initTooltips();
  injectPatchStyles();

  // Dashboard layout helpers (sidebar + top search + top date strip)
  ensureSidebar(T, LANG);
  ensureTopSearch(T);

  const p = pageType();
  if(p==="day"){
    setText("hero_title", T.hero_title_day);
    setText("hero_sub", T.hero_sub_day);
    renderPitch();
    const radar = await loadV1JSON("radar_day.json", {highlights:[]});
  if (!radar || isMockDataset(radar) || (Array.isArray(radar.highlights) && radar.highlights.length===0 && Array.isArray(radar.matches) && radar.matches.length===0)) {
    const top = document.querySelector("#top3") || document.querySelector(".top3") || document.querySelector(".top-picks") || document.querySelector("main");
    showUpdatingMessage(top);
    return;
  }

    renderTop3(T, radar);
  } else if(p==="week"){
    setText("hero_title", T.hero_title_week);
    setText("hero_sub", T.hero_sub_week);
    renderPitch();
    const week = await loadV1JSON("radar_week.json", {items:[]});
    const items = Array.isArray(week?.items) ? week.items : [];
    if(!week || isMockDataset(week) || items.length===0){
      renderTop3(T, {highlights:[]});
    } else {
      // Weekly data uses "items"; map first 3 into the existing Top3 renderer.
      const highlights = items.slice(0,3).map(x => ({
        ...x,
        pro_locked: true
      }));
      renderTop3(T, {highlights});
    }
  } else {
    setText("hero_title", T.hero_title_cal);
    setText("hero_sub", T.hero_sub_cal);
    renderPitch();
    renderTop3(T, {highlights:[]});
  }

  // Calendar controls always available
  setText("calendar_title", T.calendar_title);
  setText("calendar_sub", T.calendar_sub);
  qs("#search").setAttribute("placeholder", T.search_placeholder);
  qs("#btn_time").textContent = T.view_by_time;
  qs("#btn_country").textContent = T.view_by_country;

  // UI preference: keep calendar grouped "por país / competição" (no need for extra buttons)
  const _tog = qs(".controls .toggle");
  if(_tog) _tog.style.display = "none";


  let viewMode = "country";
  let q = "";
  const data = await loadV1JSON("calendar_7d.json", {matches:[], form_window:5, goals_window:5});
  if (!data || isMockDataset(data) || (Array.isArray(data.matches) && data.matches.length===0)) {
    // Calendar can stay empty; UI will show no matches.
  }

  CAL_MATCHES = data.matches || [];
  CAL_META = { form_window: Number(data.form_window||5), goals_window: Number(data.goals_window||5) };

  // Date strip
  const strip = ensureDateStrip(T);
  const days = build7Days();
  let activeDate = new Intl.DateTimeFormat("en-CA", {year:"numeric", month:"2-digit", day:"2-digit"}).format(days[0]); // default: Hoje

  function renderStrip(){
    if(!strip) return;

    const chips = days.map((d, idx)=>{
      const key = new Intl.DateTimeFormat("en-CA", {year:"numeric", month:"2-digit", day:"2-digit"}).format(d);

      // Labels: Hoje / Amanhã / dd-mm
      let label = fmtDateShortDDMM(d);
      let extra = "";

      if(idx === 0){
        label = (LANG === "pt") ? "Hoje" : (LANG === "es") ? "Hoy" : (LANG === "fr") ? "Aujourd'hui" : (LANG === "de") ? "Heute" : "Today";
        extra = "today";
      }else if(idx === 1){
        label = (LANG === "pt") ? "Amanhã" : (LANG === "es") ? "Mañana" : (LANG === "fr") ? "Demain" : (LANG === "de") ? "Morgen" : "Tomorrow";
        extra = "tomorrow";
      }

      return { key, label, tip: fmtDateLong(d, LANG), extra };
    });

    strip.innerHTML = chips.map(c=>{
      const cls = (c.key === activeDate) ? `date-chip active ${c.extra}` : `date-chip ${c.extra}`;
      return `<button class="${cls}" type="button" data-date="${c.key}" ${tipAttr(c.tip)}>${escAttr(c.label)}</button>`;
    }).join("");
  }

  function rerender(){
    qs("#btn_time").classList.toggle("active", viewMode==="time");
    qs("#btn_country").classList.toggle("active", viewMode==="country");
    renderCalendar(T, CAL_MATCHES, viewMode, q, activeDate);

    // bind handlers after each render
    bindOpenHandlers();
  }

  function bindOpenHandlers(){
    // any [data-open] outside modal (cards, chips, matches)
    qsa("[data-open]").forEach(el=>{
      if(el.dataset.boundOpen === "1") return;
      el.dataset.boundOpen = "1";
      el.addEventListener("click", (e)=>{
        // Prevent nested [data-open] (e.g., inside a match card) from triggering multiple modals
        e.stopPropagation();
        const type = el.getAttribute("data-open");
        const val = el.getAttribute("data-value") || el.getAttribute("data-key") || "";
        openModal(type, val);
      });
    });

    // keyboard on match rows
    qsa(".match[role='button']").forEach(el=>{
      if(el.dataset.boundKey === "1") return;
      el.dataset.boundKey = "1";
      el.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          el.click();
        }
      });
    });

    // cards as buttons
    qsa(".card[data-open='match']").forEach(el=>{
      if(el.dataset.boundCardKey === "1") return;
      el.dataset.boundCardKey = "1";
      el.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          el.click();
        }
      });
    });

    // collapsible headers (country groups + competition subgroups)
    qsa(".collapsible[data-collapse]").forEach(el=>{
      if(el.dataset.boundCollapse === "1") return;
      el.dataset.boundCollapse = "1";
      const handle = (e)=>{
        // If the click is for a modal action, do nothing (those handlers stop propagation anyway)
        if(e && e.target && e.target.closest && e.target.closest("[data-open]")) return;

        const kind = el.getAttribute("data-collapse") || "";
        const parent = (kind === "competition") ? el.closest(".subgroup") : el.closest(".group");
        if(!parent) return;

        parent.classList.toggle("collapsed");
        const expanded = !parent.classList.contains("collapsed");
        el.setAttribute("aria-expanded", expanded ? "true" : "false");

        // Persist collapse choice
        try{
          if(kind === "competition"){
            const c = el.getAttribute("data-country") || "";
            const k = el.getAttribute("data-key") || "";
            setCompetitionCollapsed(c, k, !expanded);
          }else{
            const k = el.getAttribute("data-key") || "";
            setCountryCollapsed(k, !expanded);
          }
        }catch(e){}
      };

      el.addEventListener("click", handle);
      el.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          handle(e);
        }
      });
    });
  }

  qs("#btn_time").addEventListener("click", ()=>{ viewMode="time"; rerender(); });
  qs("#btn_country").addEventListener("click", ()=>{ viewMode="country"; rerender(); });
  qs("#search").addEventListener("input", (e)=>{ q=e.target.value; rerender(); });

  if(strip){
    strip.addEventListener("click", (e)=>{
      const btn = e.target.closest("button[data-date]");
      if(!btn) return;
      activeDate = btn.getAttribute("data-date");
      renderStrip();
      rerender();
    });
  }

  qs("#modal_close").addEventListener("click", closeModal);
  qs("#modal_backdrop").addEventListener("click", (e)=>{ if(e.target.id==="modal_backdrop") closeModal(); });

  // language switch (preserve page)
  qsa("[data-lang]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const target = btn.getAttribute("data-lang");
      const rest = location.pathname.split("/").slice(2).join("/");
      location.href = `/${target}/${rest}`.replace(/\/+$/g, "/").replace(/\/+/g,"/");
    });
  });

  // compliance footer
  renderComplianceFooter(LANG);

  // year
  setText("year", String(new Date().getFullYear()));

  renderStrip();
  rerender();
  bindOpenHandlers();
  startLivePolling(T);
}

document.addEventListener("DOMContentLoaded", init);
