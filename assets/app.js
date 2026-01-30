const $ = (s) => document.querySelector(s);
const top3El = $("#top3");
const calEl = $("#calendar");
const qEl = $("#q");
const tabs = [...document.querySelectorAll(".tab")];

let DATA = null;
let activeFilter = "today"; // hoje por padrão

function fmtDateBR(iso){
  // iso: YYYY-MM-DD
  const [y,m,d] = iso.split("-").map(Number);
  return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`;
}

function todayISO(){
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth()+1).padStart(2,"0");
  const d = String(now.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function dayPlusISO(days){
  const dt = new Date();
  dt.setDate(dt.getDate()+days);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const d = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

function isWeekend(iso){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  const wd = dt.getDay(); // 0 dom, 6 sab
  return wd === 0 || wd === 6;
}

function renderTop3(items){
  top3El.innerHTML = items.map(p => {
    const evClass = String(p.ev).trim().startsWith("-") ? "ev neg" : "ev";
    return `
      <div class="pick">
        <div class="pick-top">
          <div class="pick-title">${p.title}</div>
          <div class="chip">${p.tag}</div>
        </div>
        <div class="pick-sub"><strong>${p.market}</strong></div>
        <div class="pick-meta">
          <span>Odd <strong>${p.odd}</strong></span>
          <span>Prob <strong>${p.prob}%</strong></span>
          <span class="${evClass}">EV ${p.ev}</span>
          <span>Risco <strong>${p.risk}</strong></span>
        </div>
      </div>
    `;
  }).join("");
}

function filterCalendar(calendar){
  const t = todayISO();
  const tmr = dayPlusISO(1);

  return calendar.filter(block => {
    if (activeFilter === "all") return true;
    if (activeFilter === "today") return block.date === t;
    if (activeFilter === "tomorrow") return block.date === tmr;
    if (activeFilter === "weekend") return isWeekend(block.date);
    return true;
  });
}

function matchesSearch(block, query){
  if (!query) return true;
  const q = query.toLowerCase();
  if (block.league.toLowerCase().includes(q)) return true;

  return block.matches.some(m => {
    const s = `${m.home} ${m.away} ${m.suggestion}`.toLowerCase();
    return s.includes(q);
  });
}

function renderCalendar(calendar){
  const query = (qEl.value || "").trim().toLowerCase();
  const filtered = filterCalendar(calendar).filter(b => matchesSearch(b, query));

  calEl.innerHTML = filtered.map(block => `
    <div class="league">
      <div class="league-head">
        <div class="league-name">${block.league}</div>
        <div class="league-date">${fmtDateBR(block.date)}</div>
      </div>

      ${block.matches.map(m => `
        <div class="match">
          <div class="time">${m.time}</div>
          <div class="teams">${m.home} <span class="muted">x</span> ${m.away}</div>
          <div class="suggestion"><strong>Sugestão:</strong> ${m.suggestion}</div>
        </div>
      `).join("")}
    </div>
  `).join("");

  if (!filtered.length){
    calEl.innerHTML = `<div class="muted">Nenhum jogo encontrado com os filtros atuais.</div>`;
  }
}

async function init(){
  const res = await fetch("/data/agenda.json", { cache: "no-store" });
  DATA = await res.json();

  renderTop3(DATA.top3 || []);
  renderCalendar(DATA.calendar || []);

  qEl.addEventListener("input", () => renderCalendar(DATA.calendar || []));

  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      activeFilter = btn.dataset.filter;
      renderCalendar(DATA.calendar || []);
    });
  });
}

init();
