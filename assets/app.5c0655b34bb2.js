/* =========================================================
   RadarTips – App JS (snapshots via R2 Worker)
   ========================================================= */

/**
 * API local (LIVE – vamos tratar depois)
 */
const V1_API_BASE = "/api/v1";

/**
 * DATA snapshots (calendar / radar) – R2 via Worker
 */
const V1_DATA_BASE = "https://radartips-data.m2otta-music.workers.dev/v1";

/* ---------------------------------------------------------
   Utils
--------------------------------------------------------- */

async function loadJSON(url, fallbackUrl = null) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (!fallbackUrl) throw e;
    const res2 = await fetch(fallbackUrl, { cache: "no-store" });
    if (!res2.ok) throw new Error(`Fallback HTTP ${res2.status}`);
    return await res2.json();
  }
}

/* ---------------------------------------------------------
   SNAPSHOTS (R2 → fallback local)
--------------------------------------------------------- */

async function loadCalendar7d() {
  return loadJSON(
    `${V1_DATA_BASE}/calendar_7d.json`,
    `/data/v1/calendar_7d.json`
  );
}

async function loadRadarDay() {
  return loadJSON(
    `${V1_DATA_BASE}/radar_day.json`,
    `/data/v1/radar_day.json`
  );
}

async function loadRadarWeek() {
  return loadJSON(
    `${V1_DATA_BASE}/radar_week.json`,
    `/data/v1/radar_week.json`
  );
}

/* ---------------------------------------------------------
   LIVE (não mexido – fica local por enquanto)
--------------------------------------------------------- */

async function loadLive() {
  return loadJSON(`${V1_API_BASE}/live.json`, null);
}

/* ---------------------------------------------------------
   EXPORTS (usado pelo restante do app)
--------------------------------------------------------- */

window.RadarTipsAPI = {
  loadCalendar7d,
  loadRadarDay,
  loadRadarWeek,
  loadLive
};