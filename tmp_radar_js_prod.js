const DATA_BASE = "/data"; // depois você troca para "/api/v1" (via Worker) sem mexer na UI

const LOCALE = (window.RT_LOCALE || "en");
const LOCALE_TAG = ({
  en: "en-US",
  pt: "pt-BR",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
})[LOCALE] || "en-US";

const $ = (id) => document.getElementById(id);

function userTZ() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function fmtTime(isoUtc) {
  const dt = new Date(isoUtc);
  return new Intl.DateTimeFormat(LOCALE_TAG, {
    timeZone: userTZ(),
    hour: "2-digit",
    minute: "2-digit",
  }).format(dt);
}

function fmtDate(isoUtc) {
  const dt = new Date(isoUtc);
  return new Intl.DateTimeFormat(LOCALE_TAG, {
    timeZone: userTZ(),
    weekday: "short",
    month: "short",
    day: "2-digit",
  }).format(dt);
}

function parseRoute() {
  // esperado: /en/radar/<type>/...  (rewritten para /en/radar/index.html)
  const parts = location.pathname.split("/").filter(Boolean);
  // ["en","radar","league","EPL"]
  const radarIdx = parts.indexOf("radar");
  const seg = parts.slice(radarIdx + 1);

  const type = seg[0] || "day";
  const id = seg[1] || null;
  const id2 = seg[2] || null; // reservado (se precisar no futuro)

  return { type, id, id2 };
}

async function loadI18n() {
  const res = await fetch(`/i18n/${LOCALE}.json`, { cache: "force-cache" });
  return res.json();
}

function riskClass(risk) {
  return (risk || "medium").toLowerCase();
}

function formSquares(form5, t) {
  // form5: [1,0,-1,...]
  const map = (v) => (v === 1 ? "w" : v === 0 ? "d" : "l");
  const labels = (v) => (v === 1 ? t.status.won : v === 0 ? "Draw" : t.status.lost);
  return `
    <div class="form5" aria-label="Last 5 form">
      ${(form5 || []).slice(0, 5).map(v => `<span class="sq ${map(v)}" title="${labels(v)}"></span>`).join("")}
    </div>
  `;
}

function gLine(gf, ga, t) {
  return `<div class="gline">${t.g} <span class="gf">${gf ?? "-"}</span><span class="muted">-</span><span class="ga">${ga ?? "-"}</span></div>`;
}

function statusBadge(status, t) {
  const s = (status || "pending").toLowerCase();
  const text = t.status[s] || t.status.pending;
  return `<span class="status ${s}">${text}</span>`;
}

function cardX(t) {
  return `<div class="slot-x" title="${t.no_slot}">✕</div>`;
}

function top3Card(m, t) {
  const time = m.kickoff_utc ? `${fmtDate(m.kickoff_utc)} • ${fmtTime(m.kickoff_utc)}` : "";
  // Determine crests (logos) for home and away teams. If the snapshot includes
  // `home_logo`/`away_logo` fields, prefer those. Otherwise, fall back to
  // API-Football CDN based on team IDs (`home_id`/`away_id`) when available.
  const homeCrest = m.home_logo || (m.home_id ? `https://media.api-sports.io/football/teams/${m.home_id}.png` : "");
  const awayCrest = m.away_logo || (m.away_id ? `https://media.api-sports.io/football/teams/${m.away_id}.png` : "");
  // Determine scoreboard values. If not provided, default to "0" for each side.
  const scoreHome = (m.score_home !== undefined && m.score_home !== null) ? m.score_home : 0;
  const scoreAway = (m.score_away !== undefined && m.score_away !== null) ? m.score_away : 0;
  const minute = m.minute ? `${m.minute}'` : "";
  return `
    <div class="card">
      <div class="card-title teams-line">
        ${homeCrest ? `<img src="${homeCrest}" alt="${m.home} logo" class="crest">` : ""}
        <span class="team-name">${m.home}</span>
        <span class="muted">x</span>
        <span class="team-name">${m.away}</span>
        ${awayCrest ? `<img src="${awayCrest}" alt="${m.away} logo" class="crest">` : ""}
      </div>
      <div class="card-sub">${time}${m.league ? ` • ${m.league}` : ""}</div>
      <div class="card-sub"><strong>${m.pick}</strong></div>
      <div class="scoreline">
        <span class="score">${scoreHome}</span>
        <span class="muted">-</span>
        <span class="score">${scoreAway}</span>
        ${minute ? `<span class="minute">${minute}</span>` : ""}
      </div>
      <div class="row2">
        <div class="risk ${riskClass(m.risk)}">${t.risk[riskClass(m.risk)] || m.risk}</div>
        <div class="lock">🔒 ${t.locked}</div>
      </div>
    </div>
  `;
}

function listItem(m, t) {
  const time = m.kickoff_utc ? fmtTime(m.kickoff_utc) : "--:--";
  const stats = m.stats || {};
  const hs = stats.home || {};
  const as = stats.away || {};
  // Determine crests (logos) for home and away teams. If the snapshot includes
  // `home_logo`/`away_logo` fields, prefer those. Otherwise, fall back to
  // API-Football CDN based on team IDs when available.
  const homeCrest = m.home_logo || (m.home_id ? `https://media.api-sports.io/football/teams/${m.home_id}.png` : "");
  const awayCrest = m.away_logo || (m.away_id ? `https://media.api-sports.io/football/teams/${m.away_id}.png` : "");
  // Score and minute for each item. Default to 0-0 if not available.
  const scoreHome = (m.score_home !== undefined && m.score_home !== null) ? m.score_home : 0;
  const scoreAway = (m.score_away !== undefined && m.score_away !== null) ? m.score_away : 0;
  const minute = m.minute ? `${m.minute}'` : "";
  return `
    <div class="item">
      <div class="time-col">
        <div class="time">${time}</div>
        ${statusBadge(m.status, t)}
      </div>
      <div class="main-col">
        <div class="teams-line">
          ${homeCrest ? `<img src="${homeCrest}" alt="${m.home} logo" class="crest">` : ""}
          <span class="team-name">${m.home}</span>
          <span class="muted">x</span>
          <span class="team-name">${m.away}</span>
          ${awayCrest ? `<img src="${awayCrest}" alt="${m.away} logo" class="crest">` : ""}
        </div>
        <div class="scoreline">
          <span class="score">${scoreHome}</span>
          <span class="muted">-</span>
          <span class="score">${scoreAway}</span>
          ${minute ? `<span class="minute">${minute}</span>` : ""}
        </div>
        <div class="small"><strong>${m.pick}</strong> • <span class="risk ${riskClass(m.risk)}">${t.risk[riskClass(m.risk)] || m.risk}</span></div>
        <div class="badges">
          ${formSquares(hs.form5, t)}
          ${gLine(hs.g5?.gf, hs.g5?.ga, t)}
          <span class="muted">|</span>
          ${formSquares(as.form5, t)}
          ${gLine(as.g5?.gf, as.g5?.ga, t)}
        </div>
      </div>
      <div class="small side-col">
        ${m.league ? `<div><strong>${m.league}</strong></div>` : ""}
        <div class="lock">🔒 ${t.locked}</div>
      </div>
    </div>
  `;
}

async function loadRadarData(route) {
  // mock paths:
  // day -> /data/radar/day.json
  // week -> /data/radar/week.json
  // country/BR -> /data/radar/country/BR.json
  // league/EPL -> /data/radar/league/EPL.json
  // match/EPL_12345 -> /data/radar/match/EPL_12345.json
  let url = "";
  if (route.type === "day") url = `${DATA_BASE}/radar/day.json`;
  else if (route.type === "week") url = `${DATA_BASE}/radar/week.json`;
  else if (["country","league","match"].includes(route.type) && route.id) {
    url = `${DATA_BASE}/radar/${route.type}/${route.id}.json`;
  } else {
    url = `${DATA_BASE}/radar/day.json`;
  }

  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

function setCrumb(route, t, data) {
  const base = `/<span class="muted">${LOCALE.toUpperCase()}</span>`;
  let text = "";
  if (route.type === "day") text = `${t.radar_day}`;
  else if (route.type === "week") text = `${t.radar_week}`;
  else if (route.type === "country") text = `${t.radar_country}: ${data.title || route.id}`;
  else if (route.type === "league") text = `${t.radar_league}: ${data.title || route.id}`;
  else if (route.type === "match") text = `${t.radar_match}: ${data.title || route.id}`;
  $("crumb").innerHTML = `${base} <span class="muted">›</span> ${text}`;
}

function setTitles(route, t, data) {
  if (route.type === "day") $("title").textContent = t.radar_day;
  else if (route.type === "week") $("title").textContent = t.radar_week;
  else if (route.type === "country") $("title").textContent = data.title || `${t.radar_country}`;
  else if (route.type === "league") $("title").textContent = data.title || `${t.radar_league}`;
  else if (route.type === "match") $("title").textContent = data.title || `${t.radar_match}`;
  $("panelTitle").textContent = $("title").textContent;
}

function setMeta(t, data) {
  const round = data.round ? `${t.round}: ${data.round}` : "";
  $("meta").textContent = [round, data.subtitle].filter(Boolean).join(" • ");
  $("tzPill").textContent = `${t.timezone}: ${userTZ()}`;
  if (data.edition?.generated_at_utc) {
    $("edition").textContent = `${t.updated}: ${fmtDate(data.edition.generated_at_utc)} ${fmtTime(data.edition.generated_at_utc)} • ${t.fixed_today}`;
  } else {
    $("edition").textContent = "";
  }
}

function renderTop3(data, t) {
  const top = $("top3");
  const arr = data.top3 || [];
  // garantir 3 slots com X se faltar
  const html = [];
  for (let i = 0; i < 3; i++) {
    if (arr[i]) html.push(top3Card(arr[i], t));
    else html.push(cardX(t));
  }
  top.innerHTML = html.join("");
}

function renderList(data, t) {
  const list = $("list");
  const items = data.items || [];
  list.innerHTML = items.map(m => listItem(m, t)).join("");
}

async function init() {
  const route = parseRoute();
  const t = await loadI18n();
  const data = await loadRadarData(route);

  setCrumb(route, t, data);
  setTitles(route, t, data);
  setMeta(t, data);

  renderTop3(data, t);
  renderList(data, t);
}

init().catch(err => {
  console.error(err);
  $("title").textContent = "Radar";
  $("list").innerHTML = `<div class="muted" style="padding:14px">Error loading radar data.</div>`;
});
