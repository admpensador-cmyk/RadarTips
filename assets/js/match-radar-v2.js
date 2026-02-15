// Match Radar V2 (isolated module)
(function(){
  // Minimal, self-contained Match Radar V2 with professional odds/risk calculations
  const CSS_ID = 'mr-v2-style-loaded';

  // Simple i18n helper (fallback to English if t() not available)
  function t(key, defaultValue){
    try{
      if(typeof window !== 'undefined' && window.t && typeof window.t === 'function') {
        return window.t(key) || defaultValue || key;
      }
    }catch(e){}
    return defaultValue || key;
  }

  function ensureStyles(){
    if(document.getElementById(CSS_ID)) return;
    // Prefer an existing stylesheet reference (possibly hasheado) injected into HTML
    try{
      const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(l => (l.href||'').includes('match-radar-v2'));
      if(existing){
        existing.id = existing.id || CSS_ID;
        return;
      }
    }catch(e){/* ignore DOM errors when run in non-browser env */}

    // Fallback: inject non-hashed path (will be rewritten in build process if needed)
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/match-radar-v2.css';
    link.id = CSS_ID;
    document.head.appendChild(link);
  }

  function parseLine(text){
    if(!text) return '—';
    const m = String(text).match(/(-?\d+(?:\.\d+)?)/);
    return m ? m[1] : '—';
  }

  // Clamp probability to (0, 1)
  function clampProb(p){
    const num = Number(p);
    if(isNaN(num)) return 0.5;
    return Math.max(0.001, Math.min(0.999, num));
  }

  // Calculate risk as 1 - p
  function calcRisk(p){
    return 1 - clampProb(p);
  }

  // Calculate fair odds as 1 / p
  function calcOddsFair(p){
    const prob = clampProb(p);
    return 1 / prob;
  }

  async function fetchWithFallback(path1, path2){
    // Only log when page URL or the requested URL explicitly includes ?debug=1
    const pageDebug = (typeof window !== 'undefined') && (window.location && window.location.search && window.location.search.indexOf('debug=1') !== -1);

    async function tryFetch(url){
      try{
        const r = await fetch(url, { cache: 'no-store' });
        const debugThis = pageDebug || String(url).indexOf('?debug=1') !== -1;
        if(debugThis) try{ console.log('MRV2 fetch', url, '=>', r.status); }catch(e){}
        if(r.ok) return await r.json();
      }catch(e){
        // swallow network errors; we'll try the fallback
      }
      return null;
    }

    const res1 = await tryFetch(path1);
    if(res1) return res1;
    const res2 = await tryFetch(path2);
    return res2;
  }

  async function getMatchRadarV2Data(fixtureId){
    // 1) try find in CAL_MATCHES
    try{
      const CAL = window.CAL_MATCHES || [];
      const found = CAL.find(m => String(m.fixture_id||m.id||m.fixture||m.fixtureId) === String(fixtureId));
      if(found) return normalizeMatch(found);
    }catch(e){/*ignore*/}

    // 2) fetch calendar snapshot
    const data = await fetchWithFallback('/api/v1/calendar_7d.json','/data/v1/calendar_7d.json');
    if(!data || !Array.isArray(data.matches)) return null;
    const found = data.matches.find(m => String(m.fixture_id||m.id||m.fixture||m.fixtureId) === String(fixtureId));
    return found ? normalizeMatch(found) : null;
  }

  function normalizeMatch(m){
    const fixtureId = String(m.fixture_id||m.id||m.fixture||m.fixtureId||'');
    const home = { name: m.home?.name||m.home_team||m.home_team_name||m.home||'', score: m.home?.score ?? m.goals_home ?? null, id: m.home?.id || m.home_id };
    const away = { name: m.away?.name||m.away_team||m.away_team_name||m.away||'', score: m.away?.score ?? m.goals_away ?? null, id: m.away?.id || m.away_id };
    const league = { 
      id: m.league?.id || m.league_id,
      country: m.country||m.league_country||'', 
      name: m.competition||m.league||m.league_name||'' 
    };
    const season = m.season;
    const datetimeUtc = m.datetimeUtc || m.utc || m.date || m.time || null;

    // markets from analysis.markets
    let markets = [];
    try{
      const arr = m.analysis?.markets || m.markets || [];
      if(Array.isArray(arr)){
        markets = arr.map(entry => {
          // Extract market and pick data
          const market = entry.market || entry.marketLabel || entry.label || '';
          const pick = entry.pick || entry.selection || '';
          
          // Probability should be a number 0-1
          let p = Number(entry.p || entry.probability || entry.confidence || entry.prob || NaN);
          if(isNaN(p) && entry.confidence && typeof entry.confidence === 'number'){
            // If confidence is already 0-1, use it; if > 1, assume percentage
            p = entry.confidence > 1 ? entry.confidence / 100 : entry.confidence;
          }
          p = isNaN(p) ? null : clampProb(p);
          
          // Calculate risk = 1 - p
          const risk = p !== null ? calcRisk(p) : null;
          
          // Calculate fair odds = 1 / p
          const odd_fair = p !== null ? calcOddsFair(p) : null;
          
          const reason = entry.note || entry.rationale || entry.reason || entry.text || '';
          
          return { 
            market, 
            pick: pick || '—',
            p,
            risk,
            odd_fair,
            reason 
          };
        });
      }
    }catch(e){ markets = []; }

    const stats = m.stats || m.statistics || m.analysis?.stats || null;

    return { fixtureId, home, away, league, season, datetimeUtc, markets, stats };
  }

  // Simple DOM helpers
  function el(tag, cls, html){ const d = document.createElement(tag); if(cls) d.className = cls; if(html!==undefined) d.innerHTML = html; return d; }

  function openMatchRadarV2(fixtureId){
    ensureStyles();
    renderLoadingModal();
    getMatchRadarV2Data(fixtureId).then(data => {
      if(!data) return renderEmpty();
      renderModal(data);
    }).catch(()=>renderEmpty());
  }

  // modal management
  function renderLoadingModal(){
    removeModal();
    const ov = el('div','mr-v2-overlay'); ov.id = 'mr-v2-overlay';
    const box = el('div','mr-v2-box');
    box.innerHTML = `<div class="mr-v2-head"><div class="mr-v2-title">Loading...</div><button class="mr-v2-close">×</button></div><div class="mr-v2-body">Carregando...</div>`;
    ov.appendChild(box);
    document.body.appendChild(ov);
    bindModalClose(ov);
  }

  function renderEmpty(){
    const body = qsBody();
    if(!body) return; // nothing
    const modal = document.querySelector('#mr-v2-overlay .mr-v2-body');
    if(modal) modal.innerHTML = '<div class="mr-v2-empty">Sem dados disponíveis</div>';
  }

  function removeModal(){
    const prev = document.getElementById('mr-v2-overlay'); if(prev) prev.remove();
  }

  function bindModalClose(ov){
    ov.addEventListener('click', (e)=>{ if(e.target === ov) removeModal(); });
    document.addEventListener('keydown', function onEsc(e){ if(e.key==='Escape'){ removeModal(); document.removeEventListener('keydown', onEsc); } });
    const btn = ov.querySelector('.mr-v2-close'); if(btn) btn.addEventListener('click', ()=>removeModal());
  }

  function qsBody(){ return document.querySelector('#mr-v2-overlay'); }

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
    // 1) API-Football / API-Sports common shape: teams.home.logo / teams.away.logo
    try{
      const t = obj && obj.teams && obj.teams[side];
      if(t && typeof t === "object"){
        if(t.logo) return t.logo;
        if(t.crest) return t.crest;
        if(t.badge) return t.badge;
      }
    }catch(e){}

    // 2) Flat keys (snapshots / transforms)
    const cand = (side==="home")
      ? ["home_logo","homeLogo","home_crest","home_badge","logo_home","team_home_logo","home_team_logo","home_logo_url"]
      : ["away_logo","awayLogo","away_crest","away_badge","logo_away","team_away_logo","away_team_logo","away_logo_url"];
    for(const k of cand){
      if(obj && obj[k]) return obj[k];
    }

    // 3) Optional nested shapes: { home: {logo}, away:{logo} }
    try{
      const t2 = obj && obj[side];
      if(t2 && typeof t2 === "object"){
        return t2.logo || t2.crest || t2.badge || null;
      }
    }catch(e){}

    // 4) Fallback: derive from team id if available (API-Sports pattern)
    try{
      const fallbackId = (side === "home")
        ? (obj && (obj.home_id || obj.homeId || obj.homeID || (obj.home && obj.home.id)))
        : (obj && (obj.away_id || obj.awayId || obj.awayID || (obj.away && obj.away.id)));
      if(fallbackId !== undefined && fallbackId !== null && String(fallbackId).trim() !== ""){
        return `https://media.api-sports.io/football/teams/${String(fallbackId).trim()}.png`;
      }
    }catch(e){}

    return null;
  }

  function crestHTML(teamName, logoUrl){
    const logo = logoUrl || null;
    if(logo){
      const src = escapeHtml(logo);
      const alt = escapeHtml(teamName);
      return `<span class="crest crest--img" aria-hidden="true"><img src="${src}" alt="${alt}" loading="lazy" style="width:100%;height:100%;object-fit:contain;" /></span>`;
    }
    const hue = _hashHue(teamName);
    const ini = _initials(teamName);
    return `<span class="crest" style="--h:${hue}" aria-hidden="true">${escapeHtml(ini)}</span>`;
  }

  function renderModal(data){
    removeModal();
    const ov = el('div','mr-v2-overlay'); ov.id = 'mr-v2-overlay';
    const box = el('div','mr-v2-box');

    const homeLogo = pickTeamLogo(data, 'home');
    const awayLogo = pickTeamLogo(data, 'away');
    const homeShield = `<div style="min-width:56px;width:56px;height:56px;">${crestHTML(data.home.name, homeLogo)}</div>`;
    const awayShield = `<div style="min-width:56px;width:56px;height:56px;">${crestHTML(data.away.name, awayLogo)}</div>`;
    const header = `<div class="mr-v2-head"><div style="display:flex;align-items:center;gap:12px;flex:1;">${homeShield}${awayShield}<div class="mr-v2-title">${escapeHtml(data.home.name)} vs ${escapeHtml(data.away.name)} ${formatScore(data)}</div></div><button class="mr-v2-close">×</button></div>`;
    const tabs = `<div class="mr-v2-tabs"><button class="mr-v2-tab mr-v2-tab-active" data-tab="markets">${t('match_radar.tabs.markets', 'Mercados')}</button><button class="mr-v2-tab" data-tab="stats">${t('match_radar.tabs.stats', 'Estatísticas')}</button></div>`;
    const body = `<div class="mr-v2-body"><div class="mr-v2-tabpanel" data-panel="markets"></div><div class="mr-v2-tabpanel" data-panel="stats" style="display:none"></div></div>`;

    box.innerHTML = header + tabs + body;
    ov.appendChild(box);
    document.body.appendChild(ov);
    bindModalClose(ov);
    bindTabs(ov);
    renderMarketsTab(ov, data);
    renderStatsTab(ov, data);
  }

  function bindTabs(ov){
    ov.querySelectorAll('.mr-v2-tab').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        ov.querySelectorAll('.mr-v2-tab').forEach(b=>b.classList.remove('mr-v2-tab-active'));
        btn.classList.add('mr-v2-tab-active');
        const t = btn.getAttribute('data-tab');
        ov.querySelectorAll('.mr-v2-tabpanel').forEach(p=>{ p.style.display = (p.getAttribute('data-panel')===t)?'block':'none'; });
      });
    });
  }

  function renderMarketsTab(ov, data){
    const panel = ov.querySelector('[data-panel="markets"]');
    if(!panel) return;
    const arr = Array.isArray(data.markets)?data.markets:[];
    if(!arr || arr.length===0){ 
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.no_markets', 'Sem dados disponíveis')}</div>`; 
      return; 
    }
    
    const rows = arr.slice().map(m=>{
      // Fallback calculations if risk/odd_fair not provided
      const p = m.p !== null ? m.p : null;
      const risk = m.risk !== null ? m.risk : (p !== null ? calcRisk(p) : null);
      const odd_fair = m.odd_fair !== null ? m.odd_fair : (p !== null ? calcOddsFair(p) : null);
      
      // Format risk as percentage
      const riskStr = risk !== null ? `${Math.round(risk * 100)}%` : '—';
      
      // Format odd_fair with 2 decimals
      const oddStr = odd_fair !== null ? Number(odd_fair).toFixed(2) : '—';
      
      const market = escapeHtml(m.market || '—');
      const pick = escapeHtml(m.pick || '—');
      const reason = escapeHtml(m.reason || '—');
      
      return `<tr><td class="mr-market">${market}</td><td class="mr-pick">${pick}</td><td class="mr-risk">${riskStr}</td><td class="mr-odd">${oddStr}</td><td class="mr-reason">${reason}</td></tr>`;
    }).join('');
    
    const headerHtml = `
      <thead>
        <tr>
          <th>${t('match_radar.columns.market', 'Mercado')}</th>
          <th>${t('match_radar.columns.pick', 'Entrada')}</th>
          <th>${t('match_radar.columns.risk', 'Risco')}</th>
          <th>${t('match_radar.columns.fair_odds', 'Odd Justa')}</th>
          <th>${t('match_radar.columns.reason', 'Justificativa')}</th>
        </tr>
      </thead>
    `;
    
    panel.innerHTML = `<div class="mr-table-wrap"><table class="mr-table">${headerHtml}<tbody>${rows}</tbody></table></div>`;
  }

  async function renderStatsTab(ov, data){
    const panel = ov.querySelector('[data-panel="stats"]');
    if(!panel) return;
    
    // If stats are empty, try to fetch from API
    if(!data.stats || Object.keys(data.stats).length === 0) {
      if(data.league?.id && data.season && data.home?.id && data.away?.id) {
        try{
          const homeStats = await fetchTeamStats(data.home.id, data.league.id, data.season);
          const awayStats = await fetchTeamStats(data.away.id, data.league.id, data.season);
          
          if(homeStats || awayStats) {
            renderStatsCards(panel, data, homeStats, awayStats);
            return;
          }
        }catch(e){/* ignore API errors */}
      }
    }
    
    // Fallback to inline stats if available
    const s = data.stats || {};
    if(s && typeof s === 'object' && Object.keys(s).length > 0) {
      // simple rows
      const rows = [];
      const pushStat = (label, left, right) => rows.push({label, left: left==null?'—':String(left), right: right==null?'—':String(right)});

      if(s.xg) pushStat('xG', s.xg.home, s.xg.away);
      if(s.possession) pushStat('Posse', s.possession.homePct ?? s.possession.home, s.possession.awayPct ?? s.possession.away);
      if(s.shotsTotal) pushStat('Remates', s.shotsTotal.home, s.shotsTotal.away);
      if(s.shotsOn) pushStat('Remates no alvo', s.shotsOn.home, s.shotsOn.away);
      if(s.bigChances) pushStat('Grandes oportunidades', s.bigChances.home, s.bigChances.away);
      if(s.corners) pushStat('Cantos', s.corners.home, s.corners.away);
      if(s.passes) pushStat('Passe (%)', s.passes.home?.pct ?? s.passes.home?.pct, s.passes.away?.pct ?? s.passes.away?.pct);
      if(s.yellows) pushStat('Amarelos', s.yellows.home, s.yellows.away);

      if(rows.length > 0) {
        const html = rows.map(r=>{
          const l = Number(String(r.left).replace('%','')) || 0;
          const rt = Number(String(r.right).replace('%','')) || 0;
          const total = Math.max(l, rt) || 1;
          const lw = Math.round((l/(l+rt||1))*100);
          const rw = 100 - lw;
          return `<div class="mr-stat-row"><div class="mr-left">${escapeHtml(r.left)}</div><div class="mr-label">${escapeHtml(r.label)}</div><div class="mr-right">${escapeHtml(r.right)}</div><div class="mr-bar"><div class="mr-bar-left" style="width:${lw}%;"></div><div class="mr-bar-right" style="width:${rw}%;"></div></div></div>`;
        }).join('');
        panel.innerHTML = `<div class="mr-stats-wrap">${html}</div>`;
        return;
      }
    }
    
    panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.no_stats', 'Sem dados disponíveis')}</div>`;
  }

  async function fetchTeamStats(teamId, leagueId, season) {
    try {
      const url = `/api/team-stats?team=${teamId}&league=${leagueId}&season=${season}`;
      const res = await fetch(url, { cache: 'no-store' });
      if(res.ok) return await res.json();
    } catch(e) {}
    return null;
  }

  function renderStatsCards(panel, data, homeStats, awayStats) {
    if(!homeStats && !awayStats) {
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.no_stats', 'Sem dados disponíveis')}</div>`;
      return;
    }

    const leagueName = data.league?.name || '—';
    const season = data.season || '—';

    let html = `<div class="mr-stats-header">`;
    html += `<div class="mr-stat-info">${t('match_radar.stats.competition', 'Competição')}: ${escapeHtml(leagueName)}</div>`;
    html += `<div class="mr-stat-info">${t('match_radar.stats.season', 'Temporada')}: ${season}</div>`;
    html += `</div>`;

    if(homeStats) {
      html += renderStatCard(data.home.name, homeStats);
    }
    if(awayStats) {
      html += renderStatCard(data.away.name, awayStats);
    }

    panel.innerHTML = `<div class="mr-stats-cards">${html}</div>`;
  }

  function renderStatCard(teamName, stats) {
    let cardHtml = `<div class="mr-stat-card"><div class="mr-stat-card-title">${escapeHtml(teamName)}</div>`;
    
    const rows = [];
    if(stats.games !== undefined) rows.push({ label: t('match_radar.stats.games', 'Jogos'), value: stats.games });
    if(stats.goals_for_total !== undefined) rows.push({ label: t('match_radar.stats.goals_for_total', 'Gols marcados'), value: stats.goals_for_total });
    if(stats.goals_for_avg !== undefined) rows.push({ label: t('match_radar.stats.goals_for_avg', 'Gols marcados (média)'), value: Number(stats.goals_for_avg).toFixed(2) });
    if(stats.goals_against_total !== undefined) rows.push({ label: t('match_radar.stats.goals_against_total', 'Gols sofridos'), value: stats.goals_against_total });
    if(stats.goals_against_avg !== undefined) rows.push({ label: t('match_radar.stats.goals_against_avg', 'Gols sofridos (média)'), value: Number(stats.goals_against_avg).toFixed(2) });
    if(stats.corners_total !== undefined) rows.push({ label: 'Escanteios', value: stats.corners_total });
    if(stats.corners_avg !== undefined) rows.push({ label: 'Escanteios (média)', value: Number(stats.corners_avg).toFixed(2) });
    if(stats.cards_total !== undefined) rows.push({ label: 'Cartões', value: stats.cards_total });
    if(stats.cards_avg !== undefined) rows.push({ label: 'Cartões (média)', value: Number(stats.cards_avg).toFixed(2) });

    if(rows.length === 0) {
      cardHtml += `<div class="mr-stat-row-empty">${t('match_radar.no_stats', 'Sem dados')}</div>`;
    } else {
      rows.forEach(r => {
        cardHtml += `<div class="mr-stat-row-item"><span class="mr-stat-label">${escapeHtml(r.label)}:</span><span class="mr-stat-value">${escapeHtml(r.value)}</span></div>`;
      });
    }
    
    cardHtml += `</div>`;
    return cardHtml;
  }

  function formatScore(data){
    const h = data.home?.score; const a = data.away?.score;
    if(h==null && a==null) return '';
    return ` — ${h ?? ''} : ${a ?? ''}`;
  }

  function escapeHtml(s){ if(s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // expose globally
  window.openMatchRadarV2 = openMatchRadarV2;
  window.getMatchRadarV2Data = getMatchRadarV2Data;

})();
