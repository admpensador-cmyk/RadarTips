const LANGS = ["en","pt","es","fr","de"];

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

function setNav(lang, t){
  const map = {
    day: `/${lang}/radar/day/`,
    week: `/${lang}/radar/week/`,
    calendar: `/${lang}/calendar/`
  };
  qsa("[data-nav]").forEach(a=>{
    const k=a.getAttribute("data-nav");
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

    top.textContent = `${t.top_slot} ${idx+1}`;

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

    // Title
    h3.textContent = `${item.home} vs ${item.away}`;

    // Meta
    meta.innerHTML = `
      <span ${tipAttr(t.kickoff_tooltip || "")}>${fmtTime(item.kickoff_utc)}</span>
      <span>•</span>
      <span ${tipAttr(t.competition_tooltip || "")}>${item.competition}</span>
      <span>•</span>
      <a href="javascript:void(0)" data-open="competition" data-value="${escAttr(item.competition)}" ${tipAttr(t.competition_radar_tip || "")}>${t.competition_radar}</a>
      <span>•</span>
      <a href="javascript:void(0)" data-open="country" data-value="${escAttr(item.country)}" ${tipAttr(t.country_radar_tip || "")}>${t.country_radar}</a>
    `;

    // FREE callout
    const key = matchKey(item);
    card.setAttribute("data-open","match");
    card.setAttribute("data-key", key);
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-label", `${t.match_radar}: ${item.home} vs ${item.away}`);

    const suggestion = item.suggestion_free || "—";
    lock.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap">
        <div>
          <span style="font-weight:950">${t.suggestion_label || "Sugestão do Radar"}:</span>
          <span ${tipAttr(t.suggestion_tooltip || "")}><b>${escAttr(suggestion)}</b></span>
        </div>
        <button class="btn" type="button" data-open="match" data-key="${key}" ${tipAttr(t.match_radar_tip || "")}>${t.match_radar || "Radar do Jogo"}</button>
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

function buildFormSquares(t, formStr, details){
  // details: [{opp, score, date, venue, result}] length 5
  if(Array.isArray(details) && details.length){
    return details.slice(0,5).map(d=>{
      const r = (d.result || "D").toUpperCase();
      const tip = `${d.venue||""} vs ${d.opp||""} • ${d.score||""} • ${d.date||""}`.trim();
      return `<span class="dot ${squareFor(r)}" ${tipAttr(tip)}></span>`;
    }).join("");
  }
  const s = (formStr || "WDLWD").slice(0,5).split("");
  return s.map(ch=>{
    const tip = `${t.form_tooltip_square || "Resultado"}: ${resultLabel(ch, t)}`;
    return `<span class="dot ${squareFor(ch)}" ${tipAttr(tip)}></span>`;
  }).join("");
}

function renderCalendar(t, matches, viewMode, query, activeDateKey){
  const root = qs("#calendar");
  root.innerHTML = "";

  const q = normalize(query);

  const filtered = matches.filter(m=>{
    // Date filter (local timezone)
    if(activeDateKey && activeDateKey !== "7d"){
      if(localDateKey(m.kickoff_utc) !== activeDateKey) return false;
    }

    if(!q) return true;
    const blob = `${m.country} ${m.competition} ${m.home} ${m.away}`.toLowerCase();
    return blob.includes(q);
  });

  const groups = (viewMode==="country") ? groupByCountry(filtered) : groupByTime(filtered);

  for(const g of groups){
    const box = document.createElement("div");
    box.className = "group";

    // derive values for group actions
    const first = g.matches[0] || {};
    const competitionValue = (viewMode==="country") ? (first.competition||"") : g.name;
    const countryValue = (viewMode==="country") ? g.name : (first.country||"");

    box.innerHTML = `
      <div class="group-head">
        <div class="group-title"><span class="flag"></span><span>${escAttr(g.name)}</span></div>
        <div class="group-actions">
          <span class="chip" data-open="competition" data-value="${escAttr(competitionValue)}" ${tipAttr(t.competition_radar_tip || "")}>${t.competition_radar}</span>
          <span class="chip" data-open="country" data-value="${escAttr(countryValue)}" ${tipAttr(t.country_radar_tip || "")}>${t.country_radar}</span>
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

      const formHome = buildFormSquares(t, m.form_home, m.form_home_details);
      const formAway = buildFormSquares(t, m.form_away, m.form_away_details);

      const goalsTip = t.goals_tooltip || "Gols feitos / gols sofridos (últimos 5 jogos)";
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
        <div>
          <div class="teams">${escAttr(m.home)}<br/>${escAttr(m.away)}</div>
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
        <div class="suggestion" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(m.suggestion_free || "—")} • ${ (m.risk==="low")?t.risk_low:(m.risk==="high")?t.risk_high:t.risk_med }</div>
      `;

      list.appendChild(row);
    }

    root.appendChild(box);
  }
}

let T = null;
let LANG = null;
let CAL_MATCHES = [];

function openModal(type, value){
  const back = qs("#modal_backdrop");
  const title = qs("#modal_title");
  const body = qs("#modal_body");

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
    const kickoff = m ? fmtTime(m.kickoff_utc) : "--:--";
    const suggestion = m?.suggestion_free || "—";

    title.textContent = `${home} vs ${away}`;

    const goalsTip = T.goals_tooltip || "Gols feitos / gols sofridos (últimos 5 jogos)";

    const formHome = buildFormSquares(T, m?.form_home, m?.form_home_details);
    const formAway = buildFormSquares(T, m?.form_away, m?.form_away_details);

    body.innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between">
        <div style="display:flex;flex-direction:column;gap:6px">
          <div style="font-weight:950;color:#11244b">${escAttr(mComp)} • ${escAttr(mCountry)} • <span ${tipAttr(T.kickoff_tooltip || "")}>${kickoff}</span></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <span class="badge risk ${riskCls}" ${tipAttr(T.risk_tooltip || "")}>${riskText}</span>
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
        <span class="chip" data-open="country" data-value="${escAttr(mCountry)}" ${tipAttr(T.country_radar_tip || "")}>${T.country_radar}</span>
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

  // COUNTRY / COMPETITION RADAR (FREE)
  const label = (type==="country") ? T.country_radar : T.competition_radar;
  title.textContent = value ? `${label}: ${value}` : label;

  const list = (type==="country")
    ? CAL_MATCHES.filter(m => normalize(m.country) === normalize(value))
    : CAL_MATCHES.filter(m => normalize(m.competition) === normalize(value));

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
            <div class="smallnote" style="margin-top:6px" ${tipAttr(T.suggestion_tooltip || "")}>${T.suggestion_label || "Sugestão"}: <b>${escAttr(m.suggestion_free || "—")}</b> • ${riskText}</div>
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
  const section = qs(".section");
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

async function init(){
  LANG = pathLang() || detectLang();
  const dict = await loadJSON("/i18n/strings.json", {});
  T = dict[LANG] || dict.en;

  setText("brand", T.brand);
  setText("disclaimer", T.disclaimer);

  setNav(LANG, T);
  decorateLangPills(LANG);

  const p = pageType();
  if(p==="day"){
    setText("hero_title", T.hero_title_day);
    setText("hero_sub", T.hero_sub_day);
    const radar = await loadJSON("/data/v1/radar_day.json", {highlights:[]});
    renderTop3(T, radar);
  } else if(p==="week"){
    setText("hero_title", T.hero_title_week);
    setText("hero_sub", T.hero_sub_week);
    renderTop3(T, {highlights:[]});
  } else {
    setText("hero_title", T.hero_title_cal);
    setText("hero_sub", T.hero_sub_cal);
    renderTop3(T, {highlights:[]});
  }

  // Calendar controls always available
  setText("calendar_title", T.calendar_title);
  setText("calendar_sub", T.calendar_sub);
  qs("#search").setAttribute("placeholder", T.search_placeholder);
  qs("#btn_time").textContent = T.view_by_time;
  qs("#btn_country").textContent = T.view_by_country;

  let viewMode = "time";
  let q = "";
  const data = await loadJSON("/data/v1/calendar_7d.json", {matches:[]});
  CAL_MATCHES = data.matches || [];

  // Date strip
  const strip = ensureDateStrip(T);
  const days = build7Days();
  let activeDate = "7d"; // default: next 7 days

  function renderStrip(){
    if(!strip) return;

    const chips = [];

    // 7d chip (range)
    chips.push({key:"7d", label:(T.next7_label || "7D"), tip:(T.next7_tooltip || "Próximos 7 dias")});

    for(const d of days){
      const key = new Intl.DateTimeFormat("en-CA", {year:"numeric", month:"2-digit", day:"2-digit"}).format(d);
      chips.push({
        key,
        label: fmtDateShortDDMM(d),
        tip: fmtDateLong(d, LANG)
      });
    }

    strip.innerHTML = chips.map(c=>{
      const cls = (c.key === activeDate) ? "date-chip active" : "date-chip";
      return `<button class="${cls}" type="button" data-date="${c.key}" ${tipAttr(c.tip)}>${escAttr(c.label)}</button>`;
    }).join("");
  }

  function rerender(){
    qs("#btn_time").classList.toggle("active", viewMode==="time");
    qs("#btn_country").classList.toggle("active", viewMode==="country");
    renderCalendar(T, CAL_MATCHES, viewMode, q, activeDate);

    // bind open handlers after each render
    bindOpenHandlers();
  }

  function bindOpenHandlers(){
    // any [data-open] outside modal (cards, chips, matches)
    qsa("[data-open]").forEach(el=>{
      el.addEventListener("click", (e)=>{
        const type = el.getAttribute("data-open");
        const val = el.getAttribute("data-value") || el.getAttribute("data-key") || "";
        openModal(type, val);
      }, {once:true});
    });

    // keyboard on match rows
    qsa(".match[role='button']").forEach(el=>{
      el.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          el.click();
        }
      }, {once:true});
    });

    // cards as buttons
    qsa(".card[data-open='match']").forEach(el=>{
      el.addEventListener("keydown", (e)=>{
        if(e.key === "Enter" || e.key === " "){
          e.preventDefault();
          el.click();
        }
      }, {once:true});
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

  // year
  setText("year", String(new Date().getFullYear()));

  renderStrip();
  rerender();
  bindOpenHandlers();
}

document.addEventListener("DOMContentLoaded", init);
