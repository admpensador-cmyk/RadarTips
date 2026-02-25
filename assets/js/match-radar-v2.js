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

  // In-memory cache for match stats (fixture_id → stats payload)
  const statsCache = new Map();

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

  async function getMatchRadarV2Data(fixtureId){
    // 1) try find in CAL_MATCHES
    try{
      const CAL = window.CAL_MATCHES || [];
      const found = CAL.find(m => String(m.fixture_id||m.id||m.fixture||m.fixtureId) === String(fixtureId));
      if(found) return normalizeMatch(found);
    }catch(e){/*ignore*/}

    // Do not fetch calendar here (single-request rule)
    return null;
  }

  function buildBaseFromMatchStats(fixtureId, matchStats){
    const homeName = matchStats?.home?.name || '';
    const awayName = matchStats?.away?.name || '';
    const homeId = matchStats?.home?.id ?? null;
    const awayId = matchStats?.away?.id ?? null;
    return {
      fixtureId: String(fixtureId || ''),
      home: { name: homeName || '—', score: null, id: homeId },
      away: { name: awayName || '—', score: null, id: awayId },
      league: { id: matchStats?.meta?.league_id ?? null, country: '', name: '' },
      season: matchStats?.meta?.season ?? null,
      datetimeUtc: null,
      markets: [],
      stats: null
    };
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
    Promise.all([
      getMatchRadarV2Data(fixtureId),
      fetchMatchStats(fixtureId)
    ]).then(([baseData, matchStats]) => {
      if(!matchStats) return renderEmpty();
      const data = baseData || buildBaseFromMatchStats(fixtureId, matchStats);
      renderModal(data, matchStats);
    }).catch(()=>renderEmpty());
  }

  // modal management
  function renderLoadingModal(){
    removeModal();
    const ov = el('div','mr-v2-root mr-v2-overlay'); ov.id = 'mr-v2-overlay';
    const box = el('div','mr-v2-box');
    box.innerHTML = `<div class="mr-v2-head"><div class="mr-v2-title">${t('match_radar.loading', 'Loading...')}</div><button class="mr-v2-close">×</button></div><div class="mr-v2-body">${t('match_radar.loading', 'Carregando...')}</div>`;
    ov.appendChild(box);
    document.body.appendChild(ov);
    bindModalClose(ov);
  }

  function renderEmpty(){
    const body = qsBody();
    if(!body) return; // nothing
    const modal = document.querySelector('#mr-v2-overlay .mr-v2-body');
    if(modal) modal.innerHTML = `<div class="mr-v2-empty">${t('match_radar.empty', 'Dados indisponíveis')}</div>`;
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

  function renderModal(data, matchStats){
    removeModal();
    const ov = el('div','mr-v2-root mr-v2-overlay'); ov.id = 'mr-v2-overlay';
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
    renderStatsTab(ov, data, matchStats);
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

  const REASON_KEY_MAP = {
    "Perfil mais controlado de gols, mas risco alto por oscilações e contexto.": "match_radar.reason.controlled_goals_high_risk",
    "Força relativa e forma favorecem proteção, mas risco alto por imprevisibilidade do resultado.": "match_radar.reason.relative_strength_protection",
    "Se houver gol cedo, a linha tende a ficar viva (risco médio).": "match_radar.reason.early_goal_live_line",
    "Favoritismo leve com proteção do empate, mas risco alto por margem curta.": "match_radar.reason.slight_favorite_dnb",
    "Um lado tende a segurar ou o outro cria pouco, mas risco alto por detalhes de jogo.": "match_radar.reason.one_side_low_creation"
  };

  function resolveReasonText(reason, entry){
    const lang = (document.documentElement && document.documentElement.lang) ? document.documentElement.lang.toLowerCase() : "";
    if(reason && typeof reason === "object"){
      return reason[lang] || reason.en || reason.pt || reason.es || reason.fr || reason.de || "";
    }
    if(entry){
      const byLang = entry[`reason_${lang}`] || entry[`rationale_${lang}`] || entry[`note_${lang}`];
      if(byLang) return byLang;
      const i18nObj = entry.reason_i18n || entry.rationale_i18n || entry.note_i18n;
      if(i18nObj && typeof i18nObj === "object"){
        return i18nObj[lang] || i18nObj.en || i18nObj.pt || i18nObj.es || i18nObj.fr || i18nObj.de || "";
      }
    }
    if(typeof reason === "string"){
      const trimmed = reason.trim();
      const key = REASON_KEY_MAP[trimmed];
      if(key) return t(key, trimmed);
      return trimmed;
    }
    return "";
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
      const reasonText = resolveReasonText(m.reason, m) || '—';
      const reason = escapeHtml(reasonText);
      
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

  // Utility functions for stats rendering
  function displayValue(val) {
    if (val === null || val === undefined) return '—';
    return String(val);
  }

  function formatNumber(val, decimals = 2) {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (isNaN(num)) return '—';
    return decimals > 0 ? num.toFixed(decimals) : Math.round(num).toString();
  }

  function formatPct(val) {
    if (val === null || val === undefined) return '—';
    const num = Number(val);
    if (isNaN(num)) return '—';
    return num.toFixed(1) + '%';
  }

  // Render stats from new team-window-5 endpoint
  async function fetchMatchStats(fixtureId) {
    // Check in-memory cache first
    if (statsCache.has(fixtureId)) {
      return statsCache.get(fixtureId);
    }
    
    try {
      const url = `/api/match-stats?fixture=${fixtureId}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        // Store in cache
        statsCache.set(fixtureId, data);
        return data;
      }
    } catch (e) {}
    return null;
  }

  async function renderStatsTab(ov, data, matchStatsInput) {
    const panel = ov.querySelector('[data-panel="stats"]');
    if (!panel) return;

    // Use provided stats (single request) or fallback to fetch if missing
    const matchStats = matchStatsInput || await fetchMatchStats(data.fixtureId);
    
    if (!matchStats || !matchStats.home || !matchStats.away) {
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.no_stats', 'Sem dados disponíveis')}</div>`;
      return;
    }

    // Render accordion-based stats layout
    renderStatsAccordion(panel, matchStats);
  }

  function renderStatsAccordion(panel, matchStats) {
    // State for accordion: which block is open
    let openBlock = null;

    const homeStats = matchStats.home || {};
    const awayStats = matchStats.away || {};
    const homeGames = homeStats.games_used || {};
    const awayGames = awayStats.games_used || {};

    // Anti-Mentira check: if no real data, show "Sem dados ainda"
    const homeHasData = (homeGames.games_used_total || 0) > 0;
    const awayHasData = (awayGames.games_used_total || 0) > 0;
    
    if (!homeHasData && !awayHasData) {
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.no_stats', 'Sem dados ainda — aguarde próximas partidas')}</div>`;
      return;
    }

    // Helper: render a line comparing home vs away
    function renderComparisonRow(label, homeVal, awayVal) {
      const hVal = displayValue(homeVal);
      const aVal = displayValue(awayVal);
      return `<div class="mr-stat-comp-row">
        <div class="mr-comp-home">${escapeHtml(hVal)}</div>
        <div class="mr-comp-label">${escapeHtml(label)}</div>
        <div class="mr-comp-away">${escapeHtml(aVal)}</div>
      </div>`;
    }

    function formatBase(meta){
      if(!meta) return '—/—/—';
      const total = displayValue(meta.games_used_total ?? '—');
      const home = displayValue(meta.games_used_home ?? '—');
      const away = displayValue(meta.games_used_away ?? '—');
      return `${total}/${home}/${away}`;
    }

    // Build accordion blocks
    const blocks = [
      {
        id: 'goals',
        title: t('match_radar.stats.block_goals', 'Gols'),
        content: (windowKey) => {
          const homeW = homeStats.stats || {};
          const awayW = awayStats.stats || {};
          const homeData = homeW[windowKey] || {};
          const awayData = awayW[windowKey] || {};

          return `
            <div class="mr-stat-block-content">
              <div class="mr-stat-metric">
                <div class="mr-metric-label">${t('match_radar.stats.goals_for', 'Gols marcados')}</div>
                ${renderComparisonRow('', homeData.gols_marcados, awayData.gols_marcados)}
              </div>
              <div class="mr-stat-metric">
                <div class="mr-metric-label">${t('match_radar.stats.goals_against', 'Gols sofridos')}</div>
                ${renderComparisonRow('', homeData.gols_sofridos, awayData.gols_sofridos)}
              </div>
              <div class="mr-stat-metric">
                <div class="mr-metric-label">${t('match_radar.stats.clean_sheets', 'Clean Sheets')}</div>
                ${renderComparisonRow('', homeData.clean_sheets, awayData.clean_sheets)}
              </div>
              <div class="mr-stat-metric">
                <div class="mr-metric-label">${t('match_radar.stats.failed_to_score', 'Falha em marcar')}</div>
                ${renderComparisonRow('', homeData.falha_marcar, awayData.falha_marcar)}
              </div>
            </div>
          `;
        }
      },
      {
        id: 'cards',
        title: t('match_radar.stats.block_cards', 'Cartões'),
        content: (windowKey) => {
          const homeW = homeStats.stats || {};
          const awayW = awayStats.stats || {};
          const homeData = homeW[windowKey] || {};
          const awayData = awayW[windowKey] || {};

          return `
            <div class="mr-stat-block-content">
              <div class="mr-stat-metric">
                <div class="mr-metric-label">${t('match_radar.stats.yellow_cards', 'Cartões amarelos')}</div>
                ${renderComparisonRow('', homeData.cartoes_amarelos, awayData.cartoes_amarelos)}
              </div>
            </div>
          `;
        }
      },
      {
        id: 'corners',
        title: t('match_radar.stats.block_corners', 'Escanteios'),
        content: (windowKey) => {
          const homeW = homeStats.stats || {};
          const awayW = awayStats.stats || {};
          const homeData = homeW[windowKey] || {};
          const awayData = awayW[windowKey] || {};

          return `
            <div class="mr-stat-block-content">
              <div class="mr-stat-metric">
                <div class="mr-metric-label">${t('match_radar.stats.corners', 'Cantos')}</div>
                ${renderComparisonRow('', homeData.cantos, awayData.cantos)}
              </div>
            </div>
          `;
        }
      },
      {
        id: 'style',
        title: t('match_radar.stats.block_style', 'Estilo de jogo'),
        content: (windowKey) => {
          const homeW = homeStats.stats || {};
          const awayW = awayStats.stats || {};
          const homeData = homeW[windowKey] || {};
          const awayData = awayW[windowKey] || {};

          return `
            <div class="mr-stat-block-content">
              <div class="mr-stat-metric">
                <div class="mr-metric-label">${t('match_radar.stats.possession', 'Posse (%)')}</div>
                ${renderComparisonRow('', formatPct(homeData.posse_pct), formatPct(awayData.posse_pct))}
              </div>
            </div>
          `;
        }
      }
    ];

    // Window selector
    const windowSelector = `
      <div class="mr-window-selector">
        <div class="mr-window-label">${t('match_radar.stats.window', 'Janela')}:</div>
        <button class="mr-window-btn mr-window-btn-active" data-window="total_last5">${t('match_radar.stats.window_total', 'Total')}</button>
        <button class="mr-window-btn" data-window="home_last5">${t('match_radar.stats.window_home', 'Casa')}</button>
        <button class="mr-window-btn" data-window="away_last5">${t('match_radar.stats.window_away', 'Fora')}</button>
      </div>
    `;

    // Teams base disclosure
    const baseDisclosure = `
      <div class="mr-base-disclosure">
        <span class="mr-base-home">${t('match_radar.stats.base', 'Base')} (T/C/F): ${homeHasData ? formatBase(homeGames) : '—/—/—'}</span>
        <span class="mr-base-away">${t('match_radar.stats.base', 'Base')} (T/C/F): ${awayHasData ? formatBase(awayGames) : '—/—/—'}</span>
      </div>
    `;

    // Build accordion HTML
    const currentWindow = { value: 'total_last5' };

    let accordionHtml = windowSelector + baseDisclosure;
    accordionHtml += '<div class="mr-stats-accordion">';

    blocks.forEach((block, idx) => {
      accordionHtml += `
        <div class="mr-accordion-block">
          <div class="mr-accordion-header" data-block-id="${block.id}" role="button" tabindex="0" aria-expanded="false" aria-controls="block-${block.id}">
            <span class="mr-accordion-title">${escapeHtml(block.title)}</span>
            <span class="mr-accordion-arrow">›</span>
          </div>
          <div class="mr-accordion-content" id="block-${block.id}" aria-hidden="true">
            ${block.content(currentWindow.value)}
          </div>
        </div>
      `;
    });

    accordionHtml += '</div>';
    panel.innerHTML = accordionHtml;

    // Bind accordion logic
    const headers = panel.querySelectorAll('.mr-accordion-header');
    function updateAccordionForWindow(windowKey){
      blocks.forEach(block => {
        const content = panel.querySelector(`#block-${block.id}`);
        if(content) content.innerHTML = block.content(windowKey);
      });
    }

    headers.forEach(header => {
      header.addEventListener('click', () => {
        const blockId = header.getAttribute('data-block-id');
        
        // Toggle: if same block is open, close it; else open new one
        if (openBlock === blockId) {
          openBlock = null;
          header.classList.remove('mr-accordion-header-open');
          header.setAttribute('aria-expanded', 'false');
          const content = header.nextElementSibling;
          if (content) {
            content.classList.remove('mr-accordion-content-open');
            content.setAttribute('aria-hidden', 'true');
          }
        } else {
          // Close previous open block
          if (openBlock) {
            const prevHeader = panel.querySelector(`[data-block-id="${openBlock}"]`);
            if (prevHeader) {
              prevHeader.classList.remove('mr-accordion-header-open');
              prevHeader.setAttribute('aria-expanded', 'false');
              const prevContent = prevHeader.nextElementSibling;
              if (prevContent) {
                prevContent.classList.remove('mr-accordion-content-open');
                prevContent.setAttribute('aria-hidden', 'true');
              }
            }
          }
          
          // Open new block
          openBlock = blockId;
          header.classList.add('mr-accordion-header-open');
          header.setAttribute('aria-expanded', 'true');
          const content = header.nextElementSibling;
          if (content) {
            content.classList.add('mr-accordion-content-open');
            content.setAttribute('aria-hidden', 'false');
          }
        }
      });

      // Keyboard support
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          header.click();
        }
      });
    });

    // Window selector buttons
    const windowBtns = panel.querySelectorAll('.mr-window-btn');
    windowBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        windowBtns.forEach(b => b.classList.remove('mr-window-btn-active'));
        btn.classList.add('mr-window-btn-active');
        currentWindow.value = btn.getAttribute('data-window');
        updateAccordionForWindow(currentWindow.value);
      });
    });
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
