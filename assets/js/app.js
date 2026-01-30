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
  });
  qsa("[data-lang]").forEach(b=>{
    const L=b.getAttribute("data-lang");
    b.classList.toggle("active", L===lang);
  });
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
      h3.textContent = t.empty_slot;
      meta.innerHTML = "";
      lock.innerHTML = `<span class="pro">${t.pro_badge}</span> · ${t.pro_locked_text} <button class="btn primary" type="button">${t.cta_pro}</button>`;
      return;
    }

    badge.className = `badge risk ${riskClass(item.risk)}`;
    badge.textContent = (item.risk==="low")?t.risk_low:(item.risk==="high")?t.risk_high:t.risk_med;

    h3.textContent = `${item.home} vs ${item.away}`;
    meta.innerHTML = `
      <span>${item.competition}</span>
      <span>•</span>
      <a href="javascript:void(0)" data-open="competition" data-value="${item.competition}">${t.competition_radar}</a>
      <span>•</span>
      <a href="javascript:void(0)" data-open="country" data-value="${item.country}">${t.country_radar}</a>
      <span>•</span>
      <span>${fmtTime(item.kickoff_utc)}</span>
    `;
    lock.innerHTML = `<span class="pro">${t.pro_badge}</span> · ${t.pro_locked_text} <button class="btn primary" type="button">${t.cta_pro}</button>`;
  });
}

function normalize(s){ return (s||"").toLowerCase().trim(); }

function groupByTime(matches){
  // groups by competition, sorted by kickoff
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

function renderCalendar(t, matches, viewMode, query){
  const root = qs("#calendar");
  root.innerHTML = "";

  const q = normalize(query);
  const filtered = matches.filter(m=>{
    if(!q) return true;
    const blob = `${m.country} ${m.competition} ${m.home} ${m.away}`.toLowerCase();
    return blob.includes(q);
  });

  const groups = (viewMode==="country") ? groupByCountry(filtered) : groupByTime(filtered);

  for(const g of groups){
    const box = document.createElement("div");
    box.className = "group";
    box.innerHTML = `
      <div class="group-head">
        <div class="group-title"><span class="flag"></span><span>${g.name}</span></div>
        <div class="group-actions">
          <span class="chip" data-open="competition" data-value="${viewMode==="country" ? "" : g.name}">${t.competition_radar}</span>
          <span class="chip" data-open="country" data-value="${viewMode==="country" ? g.name : ""}">${t.country_radar}</span>
        </div>
      </div>
      <div class="matches"></div>
    `;
    const list = box.querySelector(".matches");

    for(const m of g.matches){
      const row = document.createElement("div");
      row.className = "match";

      const form = (m.form_home || "WDLWD").slice(0,5).split("").map(ch=>`<span class="dot ${squareFor(ch)}"></span>`).join("");

      row.innerHTML = `
        <div class="time">${fmtTime(m.kickoff_utc)}</div>
        <div>
          <div class="teams">${m.home}<br/>${m.away}</div>
          <div class="subline">
            <div class="form" title="${t.form_label}">${form}</div>
            <div class="gfga"><span>${t.goals_label}</span> <span class="gf">${m.gf_home ?? 0}</span>/<span class="ga">${m.ga_home ?? 0}</span></div>
          </div>
          <div class="proline">
            <span class="lockicon">🔒</span>
            <span><span class="pro">${t.pro_badge}</span> · ${t.pro_locked_title}: Prob • EV • Odds</span>
          </div>
        </div>
        <div class="suggestion">${m.suggestion_free} • ${ (m.risk==="low")?t.risk_low:(m.risk==="high")?t.risk_high:t.risk_med }</div>
      `;
      list.appendChild(row);
    }

    root.appendChild(box);
  }

  // bind chips
  qsa("[data-open]").forEach(el=>{
    el.addEventListener("click", ()=>{
      const type = el.getAttribute("data-open");
      const val = el.getAttribute("data-value") || "";
      openModal(type, val);
    });
  });
}

let T = null;
let LANG = null;

function openModal(type, value){
  const back = qs("#modal_backdrop");
  const title = qs("#modal_title");
  const body = qs("#modal_body");

  const label = (type==="country") ? T.country_radar : T.competition_radar;
  title.textContent = value ? `${label}: ${value}` : label;

  body.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="font-weight:900">Radar</div>
      <button class="btn primary" type="button">${T.cta_pro}</button>
    </div>
    <div style="margin-top:12px;color:rgba(74,88,110,.95);font-weight:650">
      ${T.pro_locked_text}
    </div>
    <div style="margin-top:14px;padding:12px;border:1px dashed rgba(43,111,242,.35);border-radius:16px;background:rgba(43,111,242,.06);font-weight:800;color:#163261">
      🔒 ${T.pro_badge}: Probabilidades • EV • Odds • Estatísticas avançadas
    </div>
  `;

  back.style.display = "flex";
}

function closeModal(){
  const back = qs("#modal_backdrop");
  back.style.display = "none";
}

async function init(){
  LANG = pathLang() || detectLang();
  const dict = await loadJSON("/i18n/strings.json", {});
  T = dict[LANG] || dict.en;

  setText("brand", T.brand);
  setText("disclaimer", T.disclaimer);

  setNav(LANG, T);

  const p = pageType();
  if(p==="day"){
    setText("hero_title", T.hero_title_day);
    setText("hero_sub", T.hero_sub_day);
    const radar = await loadJSON("/data/v1/radar_day.json", {highlights:[]});
    renderTop3(T, radar);
  } else if(p==="week"){
    setText("hero_title", T.hero_title_week);
    setText("hero_sub", T.hero_sub_week);
    // reaproveita top3 com highlights vazios; week terá card area como “status”
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

  function rerender(){
    qs("#btn_time").classList.toggle("active", viewMode==="time");
    qs("#btn_country").classList.toggle("active", viewMode==="country");
    renderCalendar(T, data.matches, viewMode, q);
  }

  qs("#btn_time").addEventListener("click", ()=>{ viewMode="time"; rerender(); });
  qs("#btn_country").addEventListener("click", ()=>{ viewMode="country"; rerender(); });
  qs("#search").addEventListener("input", (e)=>{ q=e.target.value; rerender(); });

  qs("#modal_close").addEventListener("click", closeModal);
  qs("#modal_backdrop").addEventListener("click", (e)=>{ if(e.target.id==="modal_backdrop") closeModal(); });

  // language switch (preserve page)
  qsa("[data-lang]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const target = btn.getAttribute("data-lang");
      const rest = location.pathname.split("/").slice(2).join("/");
      location.href = `/${target}/${rest}`.replace(/\/+/g,"/"); // keep trailing slash
    });
  });

  // year
  setText("year", String(new Date().getFullYear()));

  rerender();
}

document.addEventListener("DOMContentLoaded", init);
