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

function has(id){
  return !!document.getElementById(id);
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

    // Title
    h3.textContent = `${item.home} vs ${item.away}`;

    // Meta (chips + icons; avoids awkward wraps)
    meta.innerHTML = `
      <div class="meta-chips">
        <span class="meta-chip" ${tipAttr(t.kickoff_tooltip || "")}>${icoSpan("clock")}<span>${fmtTime(item.kickoff_utc)}</span></span>
        <span class="meta-chip" ${tipAttr(t.competition_tooltip || "")}>${icoSpan("trophy")}<span>${escAttr(item.competition)}</span></span>
        <span class="meta-chip" ${tipAttr(t.country_tooltip || "")}>${icoSpan("globe")}<span>${escAttr(item.country)}</span></span>
      </div>
      <div class="meta-actions">
        <button class="meta-link" type="button" data-open="competition" data-value="${escAttr(item.competition)}" ${tipAttr(t.competition_radar_tip || "")}>${icoSpan("trophy")}<span>${escAttr(t.competition_radar)}</span></button>
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
        <div class="suggestion" ${tipAttr(t.suggestion_tooltip || "")}>${escAttr(localizeMarket(m.suggestion_free, t) || "—")} • ${ (m.risk==="low")?t.risk_low:(m.risk==="high")?t.risk_high:t.risk_med }</div>
      `;

      list.appendChild(row);
    }

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
            <div class="smallnote" style="margin-top:6px" ${tipAttr(T.suggestion_tooltip || "")}>${T.suggestion_label || "Sugestão"}: <b>${escAttr(localizeMarket(m.suggestion_free, t) || "—")}</b> • ${riskText}</div>
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

function initFooter(lang, t){
  const el = document.getElementById("site_footer");
  if(!el) return;

  const y = String(new Date().getFullYear());
  const base = `/${lang}`;
  const howSlug = ({en:"how-it-works",pt:"como-funciona",es:"como-funciona",fr:"comment-ca-marche",de:"so-funktioniert-es"}[lang] || "how-it-works");

  const links = [
    {href: `${base}/sobre/`, label: t.footer_about || "About"},
    {href: `${base}/${howSlug}/`, label: t.footer_how || "How it works"},
    {href: `${base}/contato/`, label: t.footer_contact || "Contact"},
    {href: `${base}/termos/`, label: t.footer_terms || "Terms"},
    {href: `${base}/privacidade/`, label: t.footer_privacy || "Privacy"},
    {href: `${base}/afiliados/`, label: t.footer_affiliates || "Affiliates"},
    {href: `${base}/jogo-responsavel/`, label: t.footer_responsible || "Responsible"}
  ];

  el.innerHTML = `
    <div class="footer-inner">
      <div class="footer-left">
        <div class="footer-brand">${escAttr(t.brand || "RadarTips")}</div>
        <div class="footer-note">${escAttr(t.footer_note || (t.disclaimer || "Informational content • Not a bookmaker • 18+"))}</div>
        <div class="footer-note small">${escAttr(t.footer_aff_note || "Links may be affiliate links. We may earn commission at no extra cost.")}</div>
      </div>
      <nav class="footer-links" aria-label="Footer">
        ${links.map(a=>`<a href="${a.href}">${escAttr(a.label)}</a>`).join("")}
      </nav>
    </div>
    <div class="footer-bottom">
      <span>© ${y} ${escAttr(t.brand || "RadarTips")}</span>
      <span class="sep">•</span>
      <span class="age">${escAttr(t.footer_18 || "18+")}</span>
    </div>
  `;
}

async function init(){
  LANG = pathLang() || detectLang();
  const dict = await loadJSON("/i18n/strings.json", {});
  T = dict[LANG] || dict.en;

  initThemeToggle(T);

  setText("brand", T.brand);
  setText("disclaimer", T.disclaimer);

  setText("subtitle", T.subtitle || "");

  // Compliance/affiliate note (visible, user-facing)
  if(has("legal_note")) setText("legal_note", T.legal_note || "");

  setNav(LANG, T);
  decorateLangPills(LANG);
  initTooltips();

  initFooter(LANG, T);

  const p = pageType();
  if(p==="day"){
    setText("hero_title", T.hero_title_day);
    setText("hero_sub", T.hero_sub_day);
    renderPitch();
    const radar = await loadJSON("/data/v1/radar_day.json", {highlights:[]});
    renderTop3(T, radar);
  } else if(p==="week"){
    setText("hero_title", T.hero_title_week);
    setText("hero_sub", T.hero_sub_week);
    renderPitch();
    // Use week radar file if present (falls back gracefully)
    const week = await loadJSON("/data/v1/radar_week.json", {items:[], highlights:[]});
    const highlights = (week.highlights && Array.isArray(week.highlights) && week.highlights.length)
      ? week.highlights
      : (week.items || []);
    renderTop3(T, {highlights});
  } else {
    setText("hero_title", T.hero_title_cal);
    setText("hero_sub", T.hero_sub_cal);
    renderPitch();
    renderTop3(T, {highlights:[]});
  }

  const hasCalendar = !!(qs("#calendar") && qs("#search") && qs("#btn_time") && qs("#btn_country"));
  if(hasCalendar){
    setText("calendar_title", T.calendar_title);
    setText("calendar_sub", T.calendar_sub);
    qs("#search").setAttribute("placeholder", T.search_placeholder);
    qs("#btn_time").textContent = T.view_by_time;
    qs("#btn_country").textContent = T.view_by_country;

  let viewMode = "time";
  let q = "";
  const data = await loadJSON("/data/v1/calendar_7d.json", {matches:[], form_window:5, goals_window:5});
  CAL_MATCHES = data.matches || [];
  CAL_META = { form_window: Number(data.form_window||5), goals_window: Number(data.goals_window||5) };

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
        // Prevent nested [data-open] (e.g., inside a match card) from triggering multiple modals
        e.stopPropagation();
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

    const mc = qs("#modal_close");
    if(mc) mc.addEventListener("click", closeModal);
    const mb = qs("#modal_backdrop");
    if(mb) mb.addEventListener("click", (e)=>{ if(e.target.id==="modal_backdrop") closeModal(); });

    renderStrip();
    rerender();
    bindOpenHandlers();
  }

  // language switch (preserve page)
  qsa("[data-lang]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const target = btn.getAttribute("data-lang");
      const rest = location.pathname.split("/").slice(2).join("/");
      location.href = `/${target}/${rest}`.replace(/\/+$/g, "/").replace(/\/+/g,"/");
    });
  });

  // year (legacy span)
  setText("year", String(new Date().getFullYear()));
}

document.addEventListener("DOMContentLoaded", init);
