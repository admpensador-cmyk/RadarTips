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

function crestHTML(teamName){
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

function filterMatches(matches, activeDateKey, query, countryFilter){
  const q = normalize(query);
  const bounds = getFilterDateBounds();
  const useCountry = countryFilter !== undefined && countryFilter !== null && String(countryFilter).trim() !== "";
  const cf = useCountry ? String(countryFilter).trim() : "";
  return matches.filter(m=>{
    const k = localDateKey(m.kickoff_utc);
    if(activeDateKey === "both"){
      if(k !== bounds.todayKey && k !== bounds.tomorrowKey) return false;
    } else if(activeDateKey){
      if(k !== activeDateKey) return false;
    }
    if(useCountry && normalize(m.country || "") !== normalize(cf)) return false;
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

function renderCountryList(t, activeDateKey, query, selectedCountry){
  const el = qs("#country_list");
  if(!el) return;
  const base = filterMatches(CAL_MATCHES, activeDateKey, query, undefined);
  const agg = new Map();
  for(const m of base){
    const c = (m.country || "—").trim() || "—";
    agg.set(c, (agg.get(c) || 0) + 1);
  }
  const rows = [...agg.entries()].sort((a, b)=> a[0].localeCompare(b[0]));
  const total = base.length;
  const allOn = selectedCountry == null || String(selectedCountry).trim() === "";
  let html = `<button type="button" class="rt-country-row${allOn ? " active" : ""}" data-country="">${escAttr(t.country_filter_all || "All")} <span class="rt-country-count">(${total})</span><span class="rt-chevron" aria-hidden="true">›</span></button>`;
  for(const [name, cnt] of rows){
    const on = selectedCountry != null && normalize(selectedCountry) === normalize(name);
    html += `<button type="button" class="rt-country-row${on ? " active" : ""}" data-country="${escAttr(name)}"><span class="rt-country-name">${escAttr(name)}</span> <span class="rt-country-count">(${cnt})</span><span class="rt-chevron" aria-hidden="true">›</span></button>`;
  }
  el.innerHTML = html;
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
    card.setAttribute("aria-label", `${t.match_radar || "Match"}: ${item.home} vs ${item.away}`);

    h3.innerHTML = `
      <div class="match-title">
        <div class="teamline">${crestHTML(item.home)}<span>${escAttr(item.home)}</span></div>
        <div class="vs">vs</div>
        <div class="teamline">${crestHTML(item.away)}<span>${escAttr(item.away)}</span></div>
      </div>
    `;

    const suggestion = localizeMarket(item.suggestion_free, t) || "—";
    const rankTip = t.rank_tooltip || "";

    if(prod && topbar){
      const top = document.createElement("span");
      top.className = "badge top rank";
      top.textContent = `#${idx+1}`;
      top.setAttribute("title", rankTip);
      top.setAttribute("data-tip", rankTip);
      topbar.appendChild(top);

      meta.innerHTML = `<div class="slot-league-line">${escAttr(item.competition)} — ${escAttr(fmtTime(item.kickoff_utc))}</div>`;

      const pickPref = t.pick_prefix || "PICK:";
      const { pct, note } = confidenceFromItem(item, t);
      lock.innerHTML = `
        <div class="slot-pick">${escAttr(pickPref)} <strong>${escAttr(suggestion)}</strong></div>
        <div class="slot-confidence">
          <div class="slot-confidence-head">${escAttr(t.confidence_label || "")}</div>
          <div class="conf-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${escAttr(t.confidence_label || "")}">
            <span class="conf-fill" style="width:${pct}%"></span>
          </div>
          <p class="slot-confidence-note">${escAttr(note)}</p>
        </div>
        <div class="callout-sub">
          <span class="mini-chip mini-chip--free" ${tipAttr(t.free_tooltip || (t.free_includes || ""))}>${escAttr(t.free_badge || "FREE")}</span>
        </div>
        <div class="callout-actions">
          <button class="btn primary" type="button" data-open="match" data-key="${key}" ${tipAttr(t.match_radar_tip || "")}><span>${escAttr(t.match_radar || "Radar")}</span>${icoSpan("arrow")}</button>
        </div>
      `;
      return;
    }

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

function renderCalendar(t, matches, query, activeDateKey, countryFilter){
  const root = qs("#calendar");
  if(!root) return;
  root.innerHTML = "";

  const filtered = filterMatches(matches, activeDateKey, query, countryFilter);

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
            <div class="teamline">${crestHTML(m.home)}<span>${escAttr(m.home)}</span></div>
            <div class="teamline">${crestHTML(m.away)}<span>${escAttr(m.away)}</span></div>
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

      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="chip" data-open="competition" data-value="${escAttr(mComp)}" ${tipAttr(T.competition_radar_tip || "")}>${T.competition_radar}</span>
      </div>

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

  warnRtDomContract(p);

  const isDayboard = !!qs("#dayboard_tabs");

  if(p==="day"){
    if(qs("#top3_heading")){
      setText("top3_heading", T.top3_title || "");
      setText("top3_sub", T.top3_sub || "");
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
  const data = await loadCalendar2dMerged();
  CAL_MATCHES = data.matches || [];
  CAL_META = {
    form_window: Number(data.form_window || 5),
    goals_window: Number(data.goals_window || 5),
    anchorToday: data.anchorToday || null,
    anchorTomorrow: data.anchorTomorrow || null,
  };

  const strip = isDayboard ? null : ensureDateStrip(T);
  const boundsInit = getFilterDateBounds();
  let activeDate = isDayboard ? boundsInit.todayKey : "both";
  let selectedCountry = null;

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
      renderCountryList(T, activeDate, q, selectedCountry);
      renderCalendar(T, CAL_MATCHES, q, activeDate, selectedCountry);
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
        selectedCountry = null;
        rerender();
      });
    }
    const cl = qs("#country_list");
    if(cl && !cl.dataset.rtBound){
      cl.dataset.rtBound = "1";
      cl.addEventListener("click", (e)=>{
        const btn = e.target.closest("button[data-country]");
        if(!btn) return;
        const v = btn.getAttribute("data-country");
        selectedCountry = (v == null || v === "") ? null : v;
        rerender();
      });
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
