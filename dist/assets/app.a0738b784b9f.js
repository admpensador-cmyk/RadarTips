// ========================================
// Match Radar V2 (inlined from match-radar-v2.js)
// ========================================
// Match Radar V2 (isolated module)
(function(){
  // Minimal, self-contained Match Radar V2 with professional odds/risk calculations
  const CSS_ID = 'mr-v2-style-loaded';

  // Simple i18n helper (fallback to English if t() not available)
  function t(key, defaultValue){
    try{
      if(typeof window !== 'undefined' && window.t && typeof window.t === 'function') {
        return window.t(key, defaultValue) || defaultValue || key;
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
      if(found) return normalizeMatch(found, window.CAL_SNAPSHOT_META);
    }catch(e){/*ignore*/}

    // 2) fetch calendar snapshot
    const data = await fetchWithFallback('/api/v1/calendar_7d.json','/data/v1/calendar_7d.json');
    if(!data || !Array.isArray(data.matches)) return null;
    const snapshotMeta = { goals_window: data.goals_window, form_window: data.form_window };
    const found = data.matches.find(m => String(m.fixture_id||m.id||m.fixture||m.fixtureId) === String(fixtureId));
    return found ? normalizeMatch(found, snapshotMeta) : null;
  }

  function normalizeMatch(m, snapshotMeta){
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
          const line = entry.line || entry.lineValue || entry.threshold || entry.stake || entry.odds || entry.value || entry.betValue || entry.amount || entry.entry || pick || '—';
          
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
            line,
            p,
            risk,
            odd_fair,
            reason 
          };
        });
      }
    }catch(e){ markets = []; }
    
    // If no markets from analysis, create dummy market from suggestion_free
    if(markets.length === 0 && m.suggestion_free) {
      markets = [{
        market: 'Sugestão Livre',
        pick: m.suggestion_free,
        line: String(m.suggestion_free || '').trim(),  // Ensure it's a trimmed string
        p: null,
        risk: null,
        odd_fair: null,
        reason: ''
      }];
    }

    const stats = m.stats || m.statistics || m.analysis?.stats || null;
    
    // Stats-related fields from snapshot
    const gf_home = m.gf_home;
    const ga_home = m.ga_home;
    const gf_away = m.gf_away;
    const ga_away = m.ga_away;
    const form_home_details = m.form_home_details;
    const form_away_details = m.form_away_details;
    const goals_window = m.goals_window || snapshotMeta?.goals_window || 5;
    const form_window = m.form_window || snapshotMeta?.form_window || 5;
    const analysis = m.analysis || {};

    return { 
      fixtureId, home, away, league, season, datetimeUtc, markets, stats,
      gf_home, ga_home, gf_away, ga_away, 
      form_home_details, form_away_details,
      goals_window, form_window,
      analysis,
      // Flat IDs for logo picking compatibility (from normalized home/away)
      home_id: m.home_id ?? home.id,
      away_id: m.away_id ?? away.id
    };
  }

  // Simple DOM helpers
  function el(tag, cls, html){ const d = document.createElement(tag); if(cls) d.className = cls; if(html!==undefined) d.innerHTML = html; return d; }

  function openMatchRadarV2(fixtureId){
    ensureStyles();
    renderLoadingModal();
    
    // Se houver contexto da nova arquitetura, usar match direto
    if(window.__MATCH_CTX__ && window.__MATCH_CTX__.match) {
      const ctx = window.__MATCH_CTX__;
      const data = normalizeMatch(ctx.match, window.CAL_SNAPSHOT_META);
      data.radarMeta = ctx.meta;
      window.__MATCH_CTX__ = null;
      renderModal(data);
      return;
    }
    
    // Fallback para legacy behavior
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
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.empty', 'Sem dados disponíveis')}</div>`; 
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
      const line = escapeHtml(m.line || '—');
      const reasonText = resolveReasonText(m.reason, m) || '—';
      const reason = escapeHtml(reasonText);
      
      return `<tr><td class="mr-market">${market}</td><td class="mr-line">${line}</td><td class="mr-risk">${riskStr}</td><td class="mr-odd">${oddStr}</td><td class="mr-reason">${reason}</td></tr>`;
    }).join('');
    
    const headerHtml = `
      <thead>
        <tr>
          <th>${t('match_radar.columns.market', 'Mercado')}</th>
          <th>${t('match_radar.columns.line', 'Linha')}</th>
          <th>${t('match_radar.columns.risk', 'Risco')}</th>
          <th>${t('match_radar.columns.odd_fair', 'Odd Justa')}</th>
          <th>${t('match_radar.columns.reason', 'Justificativa')}</th>
        </tr>
      </thead>
    `;
    
    panel.innerHTML = `<div class="mr-table-wrap"><table class="mr-table">${headerHtml}<tbody>${rows}</tbody></table></div>`;
  }

  function renderStatsTab(ov, data){
    const panel = ov.querySelector('[data-panel="stats"]');
    if(!panel) return;
    
    // Extract fields from match data
    const goalsWindow = data.goals_window || 5;
    const gfHome = data.gf_home;
    const gaHome = data.ga_home;
    const gfAway = data.gf_away;
    const gaAway = data.ga_away;
    const formHomeDetails = Array.isArray(data.form_home_details) ? data.form_home_details : [];
    const formAwayDetails = Array.isArray(data.form_away_details) ? data.form_away_details : [];
    
    // Check if we have essential data
    const hasGoalsData = (gfHome != null && gaHome != null && gfAway != null && gaAway != null);
    const hasFormData = (formHomeDetails.length > 0 || formAwayDetails.length > 0);
    
    if(!hasGoalsData && !hasFormData) {
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.no_stats', 'Estatísticas indisponíveis')}</div>`;
      return;
    }
    
    const homeName = data.home?.name || data.home || '—';
    const awayName = data.away?.name || data.away || '—';
    
    let html = `<div class="mr-stats-container" style="padding:20px;">`;
    
    // Info header - "Last X matches"
    html += `<div style="font-size:0.9em;color:#888;margin-bottom:15px;">`;
    const lastMatches = `${t('match_radar.form_window', `Últimos ${goalsWindow} jogos`).replace('{n}', goalsWindow)}`;
    html += lastMatches !== 'match_radar.form_window' ? lastMatches : `Últimos ${goalsWindow} jogos`;
    html += `</div>`;
    
    // Home team card (continued as before)
    html += `<div style="background:#1a1a2e;border:1px solid #444;border-radius:8px;padding:15px;margin-bottom:15px;">`;
    html += `<div style="font-weight:bold;font-size:1.1em;margin-bottom:12px;color:#fff;">${escapeHtml(homeName)}</div>`;
    if(hasGoalsData) {
      const avgGF = (gfHome / goalsWindow).toFixed(2);
      const avgGA = (gaHome / goalsWindow).toFixed(2);
      const avgTotal = ((gfHome + gaHome) / goalsWindow).toFixed(2);
      
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.95em;">`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.games', 'Jogos')}:</span> <span style="color:#fff;font-weight:500;">${goalsWindow}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.gf', 'GF')}:</span> <span style="color:#fff;font-weight:500;">${gfHome}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.ga', 'GA')}:</span> <span style="color:#fff;font-weight:500;">${gaHome}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.avg_gf', 'Média GF')}:</span> <span style="color:#fff;font-weight:500;">${avgGF}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.avg_ga', 'Média GA')}:</span> <span style="color:#fff;font-weight:500;">${avgGA}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.avg_total', 'Total médio')}:</span> <span style="color:#fff;font-weight:500;">${avgTotal}</span></div>`;
      html += `</div>`;
    }
    if(formHomeDetails.length > 0) {
      const wins = formHomeDetails.filter(f => f.result === 'W').length;
      const draws = formHomeDetails.filter(f => f.result === 'D').length;
      const losses = formHomeDetails.filter(f => f.result === 'L').length;
      html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #444;font-size:0.95em;">`;
      html += `<span style="color:#999;">${t('match_radar.stats.form', 'Forma')}:</span> `;
      html += `<div style="display:inline-flex;gap:3px;margin-left:6px;">`;
      // Add Win boxes
      for(let i = 0; i < wins; i++) {
        html += `<div style="width:16px;height:16px;background:#22c55e;border-radius:2px;"></div>`;
      }
      // Add Loss boxes
      for(let i = 0; i < losses; i++) {
        html += `<div style="width:16px;height:16px;background:#ef4444;border-radius:2px;"></div>`;
      }
      // Add Draw boxes
      for(let i = 0; i < draws; i++) {
        html += `<div style="width:16px;height:16px;background:#eab308;border-radius:2px;"></div>`;
      }
      html += `</div>`;
      html += `</div>`;
    }
    html += `</div>`;
    
    // Away team card
    html += `<div style="background:#1a1a2e;border:1px solid #444;border-radius:8px;padding:15px;">`;
    html += `<div style="font-weight:bold;font-size:1.1em;margin-bottom:12px;color:#fff;">${escapeHtml(awayName)}</div>`;
    if(hasGoalsData) {
      const avgGF = (gfAway / goalsWindow).toFixed(2);
      const avgGA = (gaAway / goalsWindow).toFixed(2);
      const avgTotal = ((gfAway + gaAway) / goalsWindow).toFixed(2);
      
      html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.95em;">`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.games', 'Jogos')}:</span> <span style="color:#fff;font-weight:500;">${goalsWindow}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.gf', 'GF')}:</span> <span style="color:#fff;font-weight:500;">${gfAway}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.ga', 'GA')}:</span> <span style="color:#fff;font-weight:500;">${gaAway}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.avg_gf', 'Média GF')}:</span> <span style="color:#fff;font-weight:500;">${avgGF}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.avg_ga', 'Média GA')}:</span> <span style="color:#fff;font-weight:500;">${avgGA}</span></div>`;
      html += `<div><span style="color:#999;">${t('match_radar.stats.avg_total', 'Total médio')}:</span> <span style="color:#fff;font-weight:500;">${avgTotal}</span></div>`;
      html += `</div>`;
    }
    if(formAwayDetails.length > 0) {
      const wins = formAwayDetails.filter(f => f.result === 'W').length;
      const draws = formAwayDetails.filter(f => f.result === 'D').length;
      const losses = formAwayDetails.filter(f => f.result === 'L').length;
      html += `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #444;font-size:0.95em;">`;
      html += `<span style="color:#999;">${t('match_radar.stats.form', 'Forma')}:</span> `;
      html += `<div style="display:inline-flex;gap:3px;margin-left:6px;">`;
      // Add Win boxes
      for(let i = 0; i < wins; i++) {
        html += `<div style="width:16px;height:16px;background:#22c55e;border-radius:2px;"></div>`;
      }
      // Add Loss boxes
      for(let i = 0; i < losses; i++) {
        html += `<div style="width:16px;height:16px;background:#ef4444;border-radius:2px;"></div>`;
      }
      // Add Draw boxes
      for(let i = 0; i < draws; i++) {
        html += `<div style="width:16px;height:16px;background:#eab308;border-radius:2px;"></div>`;
      }
      html += `</div>`;
      html += `</div>`;
    }
    html += `</div>`;
    
    html += `</div>`;
    panel.innerHTML = html;
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
// ========================================
// End Match Radar V2
// ========================================

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

function marketRiskClass(r){
  const v=(r||"").toLowerCase();
  if(v==="low") return "low";
  if(v==="med" || v==="medium") return "med";
  if(v==="volatile") return "high"; // reuse high styling
  if(v==="high") return "high";
  return "med";
}

function marketRiskLabel(r){
  const v=(r||"").toLowerCase();
  if(v==="low") return (T.risk_low || "Baixo");
  if(v==="high") return (T.risk_high || "Alto");
  if(v==="volatile") return (T.risk_volatile || "Volátil");
  return (T.risk_med || "Médio");
}

function fmtPct(x){
  const n = Number(x);
  if(!Number.isFinite(n)) return "—";
  return `${Math.round(n*100)}%`;
}

// renderMarketsTable is defined later in the file (kept the single implementation there)
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

// Snapshots (calendar + radar) must come from the R2 data worker.
// IMPORTANT: do NOT prefer /api/v1 for these files.
// Debug flag for calendar data loading (set to false in production)
const DEBUG_CAL = false;
const RADAR_DEBUG = false;
window.RADAR_DEBUG = window.RADAR_DEBUG ?? false; // Global guard for inline scripts

// If /api/v1 responds with an older JSON, it will "win" and the UI stays stuck.
const V1_DATA_BASE = "https://radartips-data.m2otta-music.workers.dev/v1";
const SNAPSHOT_FILES = new Set(["calendar_7d.json","radar_day.json","radar_week.json"]);

// Normalize calendar payload to handle multiple API formats
function normalizeCalendarPayload(data) {
  if (!data || typeof data !== 'object') {
    if (DEBUG_CAL) console.warn('[CAL] Invalid data received:', typeof data);
    return { matches: [], meta: {} };
  }

  let matches = [];
  let meta = {};

  // Format 1: Standard format with matches array
  if (Array.isArray(data.matches)) {
    matches = data.matches;
    meta = {
      form_window: data.form_window || 5,
      goals_window: data.goals_window || 5,
      generated_at_utc: data.generated_at_utc
    };
  }
  // Format 2: Alternative array fields
  else if (Array.isArray(data.items)) {
    matches = data.items;
  }
  else if (Array.isArray(data.fixtures)) {
    matches = data.fixtures;
  }
  else if (Array.isArray(data.games)) {
    matches = data.games;
  }
  // Format 3: Nested data.matches (some APIs wrap in data)
  else if (data.data && Array.isArray(data.data.matches)) {
    matches = data.data.matches;
    meta = data.data.meta || {};
  }
  // Format 4: API-sports style response array
  else if (Array.isArray(data.response)) {
    matches = data.response.map(item => {
      // Map API-sports format to internal format
      const fixture = item.fixture || {};
      const teams = item.teams || {};
      const league = item.league || {};
      
      return {
        fixture_id: fixture.id,
        kickoff_utc: fixture.date,
        home: teams.home?.name || '',
        away: teams.away?.name || '',
        country: league.country || '',
        competition: league.name || '',
        league_id: league.id
      };
    });
  }
  // Format 5: Direct array (legacy)
  else if (Array.isArray(data)) {
    matches = data;
  }

  if (DEBUG_CAL) {
    console.warn('[CAL] Normalized payload:', {
      input_keys: Object.keys(data),
      matches_count: matches.length,
      meta
    });
  }

  return { matches, meta };
}

async function loadV1JSON(file, fallback){
  // For snapshots, prefer R2 data worker first.
  if(SNAPSHOT_FILES.has(file)){
    if (DEBUG_CAL && file === 'calendar_7d.json') {
      console.warn('[CAL] Attempting R2 worker:', `${V1_DATA_BASE}/${file}`);
    }
    const data = await loadJSON(`${V1_DATA_BASE}/${file}`, null);
    if(data) {
      if (DEBUG_CAL && file === 'calendar_7d.json') {
        console.warn('[CAL] R2 worker responded:', {
          keys: Object.keys(data),
          has_matches: Array.isArray(data.matches),
          matches_count: Array.isArray(data.matches) ? data.matches.length : 'N/A',
          generated_at: data.generated_at_utc || data.timestamp || 'unknown'
        });
      }
      return data;
    }
    if (DEBUG_CAL && file === 'calendar_7d.json') {
      console.warn('[CAL] R2 worker failed, trying static fallback:', `${V1_STATIC_BASE}/${file}`);
    }
    return await loadJSON(`${V1_STATIC_BASE}/${file}`, fallback);
  }

  // Default: API first (used for live, etc.), then static fallback.
  const api = await loadJSON(`${V1_API_BASE}/${file}`, null);
  if(api) return api;
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

      // Score: always show a score. If live goals are undefined, show a dash.
      if(scoreEl){
        if(gh !== null && gh !== undefined && ga !== null && ga !== undefined){
          scoreEl.textContent = `${gh} - ${ga}`;
        }else{
          // fallback placeholder for games without live data
          scoreEl.textContent = "0 - 0";
        }
        scoreEl.hidden = false;
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
      const found = t2.logo || t2.crest || t2.badge || null;
      if(found) return found;
    }
  }catch(e){}

  // 4) Fallback: derive from team id if available (API-Sports pattern)
  try{
    const fallbackId = (side === "home")
      ? (obj && (obj.home_id || obj.homeId || obj.homeID || (obj.home && obj.home.id)))
      : (obj && (obj.away_id || obj.awayId || obj.awayID || (obj.away && obj.away.id)));
    if(fallbackId !== undefined && fallbackId !== null && String(fallbackId).trim() !== ""){
      const url = `https://media.api-sports.io/football/teams/${String(fallbackId).trim()}.png`;
      return url;
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
  return `<img class="${escAttr(cls||"")}" src="${escAttr(src)}" alt="${escAttr(alt||"")}" loading="lazy" />`;
}

function crestHTML(teamName, logoUrl){
  const logo = logoUrl || null;
  if(logo){
    const src = escAttr(logo);
    const alt = escAttr(teamName);
    return `<span class="crest crest--img" aria-hidden="true"><img src="${src}" alt="${alt}" loading="lazy" /></span>`;
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

// DEBUG MR: Helper to determine if a click target is on an interactive element (not "empty space")
function isClickableElement(el) {
  if (!el) return false;
  // Check tag names
  if (['IMG', 'BUTTON', 'A', 'INPUT', 'LABEL', 'SVG', 'PATH'].includes(el.tagName)) return true;
  // Check data attributes
  if (el.getAttribute('role') === 'button' || el.getAttribute('data-open')) return true;
  // Check classes/patterns
  const classStr = el.className || '';
  if (classStr.includes('meta-actions') || classStr.includes('meta-link') || classStr.includes('btn') || classStr.includes('chip') || classStr.includes('crest') || classStr.includes('score') || classStr.includes('team') || classStr.includes('logo')) {
    return true;
  }
  return false;
}

// DEBUG MR: Check if click is on "empty card area" (not on interactive content)
function isEmptyCardClick(event) {
  let current = event.target;
  while (current && current.closest && !current.classList.contains('card')) {
    if (isClickableElement(current)) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
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
        <span class="score" data-score>0 - 0</span>
        <span class="outcome-pill pending" data-outcome-pill hidden>${escAttr(t.outcome_pending || "PENDING")}</span>
      </div>
      <div class="meta-actions">
        <button class="meta-link" type="button" data-open="competition" data-value="${escAttr(competitionKey(item) || item.competition)}" ${tipAttr(t.competition_radar_tip || "")}>${icoSpan("trophy")}<span>${escAttr(t.competition_radar)}</span></button>
        <button class="meta-link" type="button" data-open="country" data-value="${escAttr(item.country)}" ${tipAttr(t.country_radar_tip || "")}>${icoSpan("globe")}<span>${escAttr(t.country_radar)}</span></button>
      </div>
    `;

    // FREE callout
    const key = matchKey(item);
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

// Build a competition key to open the competition modal.
// Prefer `leagueId|season` when possible, otherwise return leagueName.
function competitionKey(m){
  const id = m && (m.competition_id || m.league_id || m.leagueId);
  const compName = String(m?.competition || "").trim();
  let season = m?.season || m?.season_id || m?.seasonId;
  if(!season){
    try{
      const d = new Date(m?.kickoff_utc);
      if(!isNaN(d.getTime())) season = String(d.getUTCFullYear());
    }catch(e){ /* ignore */ }
  }

  if(id !== undefined && id !== null && String(id).trim() !== ""){
    const key = season ? `${String(id)}|${String(season)}` : `${String(id)}`;
    return encodeURIComponent(key);
  }

  // fallback to name
  return encodeURIComponent(compName || "");
}

// Parse a decoded radar key into structured object
function parseRadarKey(k){
  if(!k || String(k).trim()==="") return {mode: "competition", leagueName: ""};
  const str = String(k).trim();

  // Try fixture: kickoffISO|home|away (allow extra '|' in team names by joining remainder)
  const parts = str.split("|");
  if(parts.length >= 3){
    const kickoff = parts[0];
    const home = parts[1];
    const away = parts.slice(2).join("|");
    const d = new Date(kickoff);
    if(!isNaN(d.getTime())){
      return {mode: "fixture", kickoffISO: kickoff, homeName: home, awayName: away};
    }
  }

  // Try key:value pairs like league:123|season:2025
  if(str.includes(":") && str.includes("|")){
    const obj = {};
    str.split("|").forEach(p=>{
      const idx = p.indexOf(":");
      if(idx>0){
        const k2 = p.slice(0,idx).trim().toLowerCase();
        const v2 = p.slice(idx+1).trim();
        obj[k2]=v2;
      }
    });
    if(obj.league || obj.leagueid || obj.league_id){
      return {mode: "competition", leagueId: obj.league || obj.leagueid || obj.league_id, season: obj.season};
    }
  }

  // Try numericId|season or id|year
  if(parts.length === 2 && /^[0-9]+$/.test(parts[0].trim())){
    return {mode: "competition", leagueId: parts[0].trim(), season: parts[1].trim()};
  }

  // Fallback: treat entire string as league name
  return {mode: "competition", leagueName: str};
}

// Find a fixture in CAL_MATCHES tolerant to small time differences and normalized names
function findMatchByFixture(kickoffISO, homeName, awayName){
  const tol = 5 * 60 * 1000; // 5 minutes
  const hk = normalize(homeName);
  const ak = normalize(awayName);
  const t0 = new Date(kickoffISO).getTime();
  return CAL_MATCHES.find(m=>{
    try{
      const mk = normalize(m.home);
      const akm = normalize(m.away);
      const dt = Math.abs(new Date(m.kickoff_utc).getTime() - t0);
      return mk === hk && akm === ak && dt <= tol;
    }catch(e){ return false; }
  }) || null;
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


function renderMarketsTable(markets){
  const arr = Array.isArray(markets) ? markets : [];
  if(!arr.length){
    return `<div class="smallnote">${escAttr(T.no_markets || "Sem mercados suficientes para esta partida.")}</div>`;
  }

  const headMarket = escAttr(T.market_col || "Mercado");
  const headEntry = escAttr(T.entry_col || "Entrada sugerida");
  const headRisk = escAttr(T.risk_col || "Risco");
  const headJust = escAttr(T.just_col || "Justificativa");

  const rows = arr.map(m=>{
    const risk = String(m?.risk || "med");
    const riskCls = marketRiskClass(risk);
    const riskLabel = (risk==="volatile") ? (T.risk_volatile || "Volátil")
      : (risk==="low") ? (T.risk_low || "Baixo")
      : (risk==="high") ? (T.risk_high || "Alto")
      : (T.risk_med || "Médio");

    const confPct = Math.round((Number(m?.confidence || 0) * 100));
    const confTxt = `${escAttr(T.confidence_label || "Confiança")}: <b>${confPct}%</b>`;

    return `
      <tr>
        <td>
          <div class="mt-market">${escAttr(m?.market || "-")}</div>
          <div class="mt-sub">${escAttr(m?.key || "")}</div>
        </td>
        <td>
          <div><b>${escAttr(localizeMarket(m?.entry, T) || m?.entry || "-")}</b></div>
          <div class="mt-sub">${confTxt}</div>
        </td>
        <td><span class="badge risk ${riskCls}">${escAttr(riskLabel)}</span></td>
        <td class="mt-why">${escAttr(m?.rationale || "-")}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="mt-wrap">
      <table class="mt">
        <thead>
          <tr>
            <th>${headMarket}</th>
            <th>${headEntry}</th>
            <th>${headRisk}</th>
            <th>${headJust}</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// Render suggestions panel for a single match (FREE markets)
function renderSuggestions(match){
  const markets = match?.analysis?.markets || match?.markets || match?.suggestions || [];
  if(!Array.isArray(markets) || markets.length===0){
    return `<div class="smallnote">${escAttr(T.no_markets || "Sem sugestões disponíveis.")}</div>`;
  }

  const rows = markets.map(m=>{
    const conf = Math.round((Number(m?.confidence || m?.probability || 0) * 100));
    const evNum = (m?.ev !== undefined) ? Number(m.ev) : (m?.expected_value !== undefined ? Number(m.expected_value) : NaN);
    const evTxt = Number.isFinite(evNum) ? (evNum>0? `+${evNum.toFixed(2)}` : `${evNum.toFixed(2)}`) : `${conf}%`;
    const evCls = Number.isFinite(evNum) ? (evNum>0? 'ev-positive' : 'ev-negative') : (conf>=50? 'ev-positive':'ev-negative');
    const riskLbl = marketRiskLabel(m?.risk);
    const riskCls = marketRiskClass(m?.risk);
    const rationale = m?.rationale || m?.why || m?.justification || "";

    return `
      <div class="suggestion-row">
        <div class="suggestion-left">
          <div style="font-weight:900">${escAttr(m?.market || "-")}</div>
          <div class="mt-sub">${escAttr(localizeMarket(m?.entry, T) || m?.entry || "-")}</div>
        </div>
        <div class="suggestion-right">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <span class="ev-badge ${evCls}">${escAttr(evTxt)}</span>
            <span class="badge risk ${riskCls}">${escAttr(riskLbl)}</span>
            <span style="opacity:.85;font-size:13px;margin-left:auto">${escAttr(T.confidence_label || 'Confiança')}: <b>${conf}%</b></span>
          </div>
          <div style="opacity:.9">${escAttr(rationale || '')}</div>
        </div>
      </div>
    `;
  }).join("");

  return `<div class="suggestions-grid">${rows}</div>`;
}

// Render comparative statistics panel for a match
function renderStats(match){
  const stats = match?.stats || {};
  const hs = stats.home || {};
  const as = stats.away || {};

  const choose = (obj, names)=>{
    for(const n of names){
      if(obj && (obj[n] !== undefined) && obj[n] !== null) return Number(obj[n]);
    }
    return null;
  };

  const metrics = [
    {id:'possession', label: T.possession_label || 'Possession', names:['possession','possession_pct','possession_home']},
    {id:'xg', label: T.xg_label || 'xG', names:['xg','xg_for','xg_home']},
    {id:'shots', label: T.shots_label || 'Shots', names:['shots','shots_for','shots_home']},
    {id:'shots_on_target', label: T.shots_on_target_label || 'Shots on target', names:['shots_on_target','sot','shots_target']},
    {id:'corners', label: T.corners_label || 'Corners', names:['corners','corners_for']},
    {id:'cards', label: T.cards_label || 'Cards', names:['cards','yellow_cards','red_cards','cards_total']},
    {id:'passes', label: T.passes_label || 'Passes', names:['passes','passes_total','pass_accuracy']}
  ];

  const rows = metrics.map(met=>{
    const L = choose(hs, met.names);
    const R = choose(as, met.names);
    if(L === null && R === null) return '';

    const lnum = (L===null||isNaN(L)) ? '—' : (Number.isFinite(L) ? (Math.round(L*100)/100) : '—');
    const rnum = (R===null||isNaN(R)) ? '—' : (Number.isFinite(R) ? (Math.round(R*100)/100) : '—');

    const lval = Number.isFinite(Number(L)) ? Number(L) : 0;
    const rval = Number.isFinite(Number(R)) ? Number(R) : 0;
    const total = (lval + rval) || 0;
    const lPct = total>0 ? Math.round((lval/total)*100) : 50;
    const rPct = total>0 ? Math.round((rval/total)*100) : 50;

    return `
      <div class="stat-row">
        <div class="stat-label">${escAttr(met.label)}</div>
        <div class="stat-bar-wrap">
          <div class="stat-bar-left" style="width:${lPct}%;"></div>
          <div class="stat-bar-right" style="width:${rPct}%;"></div>
        </div>
        <div class="stat-values">${escAttr(String(lnum))} • ${escAttr(String(rnum))}</div>
      </div>
    `;
  }).filter(Boolean).join("");

  if(!rows) return `<div class="smallnote">${escAttr(T.no_stats || 'Estatísticas indisponíveis.')}</div>`;
  return `<div class="stats-panel">${rows}</div>`;
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
    // Distinguish between "no data at all" vs "filtered to zero"
    const hasAnyMatches = (matches || []).length > 0;
    const isFiltered = (activeDateKey && activeDateKey !== "7d") || q;
    
    let title, subtitle;
    if (!hasAnyMatches) {
      // No matches loaded at all - data issue
      title = t.calendar_no_data || "Calendar data unavailable";
      subtitle = t.calendar_no_data_hint || "calendar_7d.json is empty or invalid. Check data source.";
    } else if (isFiltered) {
      // Matches exist but filter returned zero
      title = t.empty_list || "Sem jogos encontrados.";
      subtitle = t.calendar_empty_hint || "Tente outro dia ou ajuste a busca.";
    } else {
      // Edge case: shouldn't happen
      title = t.empty_list || "Sem jogos encontrados.";
      subtitle = t.calendar_empty_hint || "Tente outro dia ou ajuste a busca.";
    }
    
    root.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">${escAttr(title)}</div>
        <div class="empty-sub">${escAttr(subtitle)}</div>
      </div>
    `;
    return;
  }

  function renderMatchRow(m, showMeta){
    const row = document.createElement("div");
    row.className = "match";
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

    // ensure row has positioning context for absolute overlay
    if(!row.style.position || row.style.position === "static") row.style.position = "relative";

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
        <span class="score" data-score>0 - 0</span>
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
        const compValRaw = competitionValue(ms[0] || {competition:compRaw});
        const compKey = competitionKey(ms[0] || {competition:compRaw});
        const compLogoUrl = pickCompetitionLogo(ms[0] || null);
        const compIcon = compLogoUrl ? tinyImgHTML(compLogoUrl, compDisp, "comp-logo") : icoSpan("trophy");

        const sub = document.createElement("div");
        sub.className = "subgroup";
        sub.innerHTML = `
          <div class="subhead collapsible" data-collapse="competition" data-country="${escAttr(countryName)}" data-key="${escAttr(compValRaw || compRaw)}" role="button" tabindex="0" aria-expanded="true">
            <div class="subtitle"><span class="chev" aria-hidden="true"></span>${compIcon}<span>${escAttr(compDisp)}</span></div>
            <div class="group-actions">
              <span class="chip" data-open="competition" data-value="${escAttr(compKey || compValRaw || compRaw)}" ${tipAttr(t.competition_radar_tip || "")}>${t.competition_radar}</span>
            </div>
          </div>
          <div class="matches"></div>
        `;


        // Apply persisted collapse state (competition)
        const _compKeyVal = String(compValRaw || compRaw);
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
let RADAR_DAY_DATA = null;
let RADAR_WEEK_DATA = null;

// Caches para single-source-of-truth architecture
window.__CAL7D_CACHE = { data: null, loadedAt: 0 };
window.__RADAR_DAY_CACHE = { data: null, loadedAt: 0 };
window.__RADAR_WEEK_CACHE = { data: null, loadedAt: 0 };

// Funções fetch com fallback URLs
async function getCalendar7d() {
  const cache = window.__CAL7D_CACHE;
  const now = Date.now();
  if (cache.data && (now - cache.loadedAt) < 300000) {
    console.log('[getCalendar7d] Using cached data');
    return cache.data;
  }
  
  const urls = ["/data/v1/calendar_7d.json", "/calendar_7d.json", "../data/v1/calendar_7d.json", "../../data/v1/calendar_7d.json"];
  for (const url of urls) {
    try {
      console.log('[getCalendar7d] Trying URL:', url);
      const r = await fetch(url, { cache: "no-store" });
      console.log('[getCalendar7d]', url, 'status:', r.status);
      
      if (!r.ok) continue;
      
      const ct = r.headers.get("content-type") || "";
      if (!ct.includes("json")) {
        console.warn('[getCalendar7d]', url, 'has wrong content-type:', ct);
        continue;
      }
      
      const data = await r.json();
      if (data && Array.isArray(data.matches)) {
        console.log('[getCalendar7d] SUCCESS from', url, '- loaded', data.matches.length, 'matches');
        cache.data = data;
        cache.loadedAt = now;
        return data;
      } else {
        console.warn('[getCalendar7d]', url, 'missing matches array or invalid structure');
      }
    } catch (e) {
      console.warn('[getCalendar7d]', url, 'error:', e.message);
    }
  }
  
  console.warn('[getCalendar7d] No valid URL found, returning stale cache or null');
  return cache.data;
}

async function getRadarDay() {
  const cache = window.__RADAR_DAY_CACHE;
  const now = Date.now();
  if (cache.data && (now - cache.loadedAt) < 300000) return cache.data;
  
  const urls = ["/data/radar/day.json", "../data/radar/day.json"];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok && r.headers.get("content-type").includes("json")) {
        const data = await r.json();
        cache.data = data;
        cache.loadedAt = now;
        return data;
      }
    } catch (e) {}
  }
  return cache.data;
}

async function getRadarWeek() {
  const cache = window.__RADAR_WEEK_CACHE;
  const now = Date.now();
  if (cache.data && (now - cache.loadedAt) < 300000) return cache.data;
  
  const urls = ["/data/v1/radar_week.json", "../data/v1/radar_week.json"];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok && r.headers.get("content-type").includes("json")) {
        const data = await r.json();
        cache.data = data;
        cache.loadedAt = now;
        return data;
      }
    } catch (e) {}
  }
  return cache.data;
}

// Resolver match APENAS do calendar_7d
async function resolveMatchByFixtureId(fixtureId) {
  if (!fixtureId) return null;
  const fid = Number(fixtureId);
  if (isNaN(fid)) return null;
  
  console.log('[FixtureResolve] Looking for fixture:', fid);
  
  // 1) Try cache first
  if (Array.isArray(CAL_MATCHES) && CAL_MATCHES.length > 0) {
    const found = CAL_MATCHES.find(m => {
      const candidates = [m?.fixture_id, m?.fixtureId, m?.id, m?.fixture?.id];
      return candidates.some(c => c != null && Number(c) === fid);
    });
    if (found) {
      console.log('[FixtureResolve] Found in CAL_MATCHES cache');
      return found;
    }
  }
  
  // 2) Fetch calendar_7d if not found in cache
  console.log('[FixtureResolve] Not in cache, fetching calendar_7d...');
  const cal = await getCalendar7d();
  
  if (!cal) {
    console.warn('[FixtureResolve] calendar_7d returned null');
    return null;
  }
  
  if (!Array.isArray(cal.matches)) {
    console.warn('[FixtureResolve] calendar_7d has no matches array');
    return null;
  }
  
  console.log('[FixtureResolve] calendar_7d loaded with', cal.matches.length, 'matches');
  
  // Update CAL_MATCHES with fetched data
  CAL_MATCHES = cal.matches;
  window.CAL_MATCHES = CAL_MATCHES;
  window.CAL_SNAPSHOT_META = { goals_window: cal.goals_window, form_window: cal.form_window };
  
  const found = cal.matches.find(m => {
    const candidates = [m?.fixture_id, m?.fixtureId, m?.id, m?.fixture?.id];
    return candidates.some(c => c != null && Number(c) === fid);
  });
  
  if (found) {
    console.log('[FixtureResolve] Found in fetched calendar_7d');
    return found;
  }
  
  console.warn('[FixtureResolve] Fixture', fid, 'not found in calendar_7d');
  return null;
}

// Extrair metadata do radar (overlay apenas)
function findRadarMetaByFixtureId(radar, fixtureId) {
  if (!radar || !fixtureId) return null;
  const fid = Number(fixtureId);
  if (isNaN(fid)) return null;
  
  const matchesId = (item) => {
    const candidates = [item?.fixture_id, item?.fixtureId, item?.id];
    return candidates.some(c => c != null && Number(c) === fid);
  };
  
  const sets = [radar.highlights, radar.matches, radar.items];
  for (const arr of sets) {
    if (Array.isArray(arr)) {
      const item = arr.find(matchesId);
      if (item) return { risk: item.risk, ev: item.ev, note: item.note, market: item.market, rank: item.rank };
    }
  }
  return null;
}

// Find match by fixtureId across all available datasets
function findMatchByFixtureId(fixtureId){
  if(!fixtureId) return null;
  const fid = Number(fixtureId);
  if(isNaN(fid)) return null;
  
  const matchesId = (m) => {
    const candidates = [
      m?.fixture_id,
      m?.fixtureId,
      m?.fixture?.id,
      m?.id
    ];
    return candidates.some(c => c != null && Number(c) === fid);
  };
  
  // 1) Search in Calendar data (CAL_MATCHES)
  if(Array.isArray(window.CAL_MATCHES)){
    const found = window.CAL_MATCHES.find(matchesId);
    if(found) return found;
  }
  
  // 2) Search in Radar Day highlights
  if(RADAR_DAY_DATA && Array.isArray(RADAR_DAY_DATA.highlights)){
    const found = RADAR_DAY_DATA.highlights.find(matchesId);
    if(found) return found;
  }
  
  // 3) Search in Radar Day matches (if present)
  if(RADAR_DAY_DATA && Array.isArray(RADAR_DAY_DATA.matches)){
    const found = RADAR_DAY_DATA.matches.find(matchesId);
    if(found) return found;
  }
  
  // 4) Search in Radar Week items
  if(RADAR_WEEK_DATA && Array.isArray(RADAR_WEEK_DATA.items)){
    const found = RADAR_WEEK_DATA.items.find(matchesId);
    if(found) return found;
  }
  
  return null;
}

// Smart fetch with multiple sources for fixture resolution
async function fetchDatasetSmart(source) {
  const paths = {
    radar_day: ["/data/v1/radar_day.json", "../data/v1/radar_day.json", "../../data/v1/radar_day.json"],
    radar_week: ["/data/v1/radar_week.json", "../data/v1/radar_week.json", "../../data/v1/radar_week.json"],
    calendar_7d: ["/data/v1/calendar_7d.json", "/calendar_7d.json", "../data/v1/calendar_7d.json", "../../data/v1/calendar_7d.json", "../../../data/v1/calendar_7d.json"]
  };
  
  const candidates = paths[source] || [];
  
  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("json") && !ct.includes("application/")) continue;
      
      const data = await r.json();
      console.info(`[${source}] loaded from:`, url);
      return data;
    } catch (e) {}
  }
  
  console.warn(`[${source}] not found in any candidate URL`);
  return null;
}

async function openModal(type, value){
  console.log("openModal called:", type, value);
  
  const back = qs("#modal_backdrop");
  const title = qs("#modal_title");
  const body = qs("#modal_body");

  // Always try to decode incoming values from query/hash before using/displaying.
  // If decodeURIComponent fails, fall back to original value.
  let rawValue = value;
  let decodedValue = value;
  if(typeof value === "string" && value.length){
    try{
      decodedValue = decodeURIComponent(value);
    }catch(e){
      decodedValue = value;
    }
  }

  // Parse incoming key and decide mode (fixture vs competition)
  const parsed = parseRadarKey(decodedValue);
  if(RADAR_DEBUG) console.log("RADAR DEBUG: raw=", rawValue, "decoded=", decodedValue, "parsed=", parsed);

  // If user explicitly opened a competition but the parsed key looks like a fixture, redirect to match mode
  if(type === "competition" && parsed && parsed.mode === "fixture"){
    if(RADAR_DEBUG) console.log("RADAR DEBUG: redirecting competition->match");
    openModal("match", decodedValue);
    return;
  }

  // ABOUT / HOW IT WORKS
  if(type === "about"){
    title.textContent = T.about_title || "About";
    body.innerHTML = `
      <div class="panel">
          <div class="panel-title" ${tipAttr(T.markets_tooltip || "")}>${escAttr(T.markets_title || "Mercados analisados")}</div>
          ${renderMarketsTable(m?.analysis?.markets || [])}
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
        <span class="chip" data-open="competition" data-value="${escAttr(competitionKey(m || {competition:mCompRaw}) || mCompRaw)}" ${tipAttr(T.competition_radar_tip || "")}>${escAttr(T.competition_radar || "Radar da Competição")}</span>
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

  // COUNTRY / COMPETITION / FIXTURE RADAR
  let list = [];
  let displayValue = decodedValue || rawValue;

  if(type === "match" || parsed.mode === "fixture"){
    // Fixture mode: show loading shell immediately, then populate
    const kickoffISO = parsed.kickoffISO || decodedValue;
    const homeName = parsed.homeName || "";
    const awayName = parsed.awayName || "";
    
    // Show loading while searching
    displayValue = homeName && awayName ? `${kickoffISO} | ${homeName} vs ${awayName}` : decodedValue;
    title.textContent = `Match Radar (${T.loading || "loading"}...)`;
    body.innerHTML = `<div class="loading" style="padding:20px;text-align:center;opacity:.7;">${escAttr(T.loading || "Carregando...")}</div>`;
    back.style.display = "flex";
    
    // Check if value is in format "fixture:XXXXX" (fallback mode with on-demand fetch)
    let found = null;
    if(String(decodedValue).startsWith('fixture:')){
      const fixtureId = String(decodedValue).replace('fixture:', '');
      // Use resolveMatchByFixtureId with no specific context (will try all sources)
      found = await resolveMatchByFixtureId(fixtureId, null);
      if(window.RADAR_DEBUG) console.log("RADAR DEBUG: searching by fixtureId (async):", fixtureId, "found:", !!found);
    } else {
      found = findMatchByFixture(kickoffISO, homeName, awayName);
      if(window.RADAR_DEBUG) console.log("RADAR DEBUG: searching by kickoff/teams:", {kickoffISO, homeName, awayName}, "found:", !!found);
    }
    
    if(found) list = [found];

    if(!list.length){
      // Fallback: show "data unavailable" message only after async fetch attempt
      title.textContent = `Match Radar`;
      body.innerHTML = `
        <div class="smallnote" style="padding:20px;text-align:center;">
          <div style="font-size:1.1em;margin-bottom:10px;">${escAttr(T.match_not_found_title || "Dados do jogo ainda não disponíveis")}</div>
          <div style="opacity:0.7;">${escAttr(T.match_not_found_subtitle || "Tente novamente em alguns segundos.")}</div>
          ${String(decodedValue).startsWith('fixture:') ? `<div style="margin-top:10px;font-size:0.9em;opacity:0.5;">Fixture ID: ${escAttr(String(decodedValue).replace('fixture:', ''))}</div>` : ''}
        </div>
      `;
      bindModalClicks();
      return;
    }
    
    // Update title now that we have data
    title.textContent = `Match Radar`;

    const m = list[0];
    const key = matchKey(m);
    const homeLogo = pickTeamLogo(m, "home");
    const awayLogo = pickTeamLogo(m, "away");
    const compDisp = competitionDisplay(m.competition, m.country, LANG);

    // Tabbed modal: Suggestions + Stats
    body.innerHTML = `
      <div class="mhead">
        <div class="mmeta">
          <div class="mcomp">${escAttr(compDisp)}</div>
          <div class="smallnote">${escAttr(T.free_includes || "FREE: sugestão + risco + forma + gols.")}</div>
        </div>
        <div class="mbadges">
          <div class="mteams"><div class="team">${crestHTML(m.home, homeLogo)}<span>${escAttr(m.home)}</span></div><div class="team">${crestHTML(m.away, awayLogo)}<span>${escAttr(m.away)}</span></div></div>
        </div>
      </div>

      <div class="tab-buttons">
        <button class="tab-btn active" data-tab="suggestions">${escAttr(T.suggestions_tab || "Sugestões")}</button>
        <button class="tab-btn" data-tab="stats">${escAttr(T.stats_tab || "Estatísticas")}</button>
      </div>

      <div class="tab-panels">
        <div class="tab-panel" id="suggestions-panel">${renderSuggestions(m)}</div>
        <div class="tab-panel" id="stats-panel" style="display:none">${renderStats(m)}</div>
      </div>

      <div class="mnote">
        <span style="opacity:.85">${escAttr(T.pro_includes || "PRO: probabilidades, EV, odds e estatísticas avançadas.")}</span>
      </div>
    `;

    // Bind internal tab toggles
    const btns = qsa("#modal_body .tab-btn");
    btns.forEach(b=>{
      b.addEventListener("click", ()=>{
        btns.forEach(x=>x.classList.remove("active"));
        b.classList.add("active");
        const tab = b.getAttribute("data-tab");
        qs("#suggestions-panel").style.display = (tab==="suggestions") ? "block" : "none";
        qs("#stats-panel").style.display = (tab==="stats") ? "block" : "none";
      });
      b.addEventListener("keydown", (e)=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); b.click(); } });
    });

    back.style.display = "flex";
    bindModalClicks();
    return;
  }

  if(type==="country"){
    list = CAL_MATCHES.filter(m => normalize(m.country) === normalize(decodedValue));
    const sample = list[0];
    if(sample) displayValue = competitionDisplay(sample.competition, sample.country, LANG);
    title.textContent = displayValue ? `${T.country_radar || "Radar do País"}: ${displayValue}` : (T.country_radar || "Radar do País");
  }else{
    // competition mode: use parsed fields (leagueId+season preferred)
    if(parsed.leagueId){
      list = CAL_MATCHES.filter(m => String(competitionValue(m)) === String(parsed.leagueId));
      if(parsed.season){
        list = list.filter(m => String(m?.season || new Date(m.kickoff_utc).getUTCFullYear()) === String(parsed.season));
      }
      const sample = list[0];
      displayValue = sample ? competitionDisplay(sample.competition, sample.country, LANG) : parsed.leagueId;
    }else if(parsed.leagueName){
      list = CAL_MATCHES.filter(m => normalize(m.competition) === normalize(parsed.leagueName));
      const sample = list[0];
      displayValue = sample ? competitionDisplay(sample.competition, sample.country, LANG) : parsed.leagueName;
    }

    title.textContent = displayValue ? `${T.competition_radar || "Radar da Competição"}: ${displayValue}` : (T.competition_radar || "Radar da Competição");
  }

    if(RADAR_DEBUG) console.log("RADAR DEBUG: mode=", parsed.mode || type, "display=", displayValue, "foundCount=", list.length);

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
      // Strict routing: only "match" reads data-key (matchKey). Others must use data-value.
      let val = "";
      if(type === "match"){
        val = el.getAttribute("data-key") || el.getAttribute("data-value") || "";
      }else{
        val = el.getAttribute("data-value") || "";
      }
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

function build7Days(availableDateKeys){
  // If calendar data provides specific dates, use those instead of "today+7"
  if (availableDateKeys && availableDateKeys.length > 0) {
    const dates = availableDateKeys
      .slice(0, 7) // Max 7 days
      .map(key => {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d);
      });
    
    if (DEBUG_CAL) {
      console.warn('[CAL] Using dates from calendar data:', availableDateKeys.slice(0, 7));
    }
    
    return dates;
  }
  
  // Fallback: traditional "today + 7" behavior
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

  .modal .mt-wrap{ overflow:auto; }
  .modal table.mt{ width:100%; border-collapse:collapse; }
  .modal table.mt th, .modal table.mt td{ padding:10px 10px; vertical-align:top; }
  .modal table.mt thead th{ opacity:.85; font-weight:900; text-align:left; }
  .modal table.mt tbody tr{ border-top:1px solid rgba(255,255,255,.08); }
  .modal .mt-sub{ font-size:12px; opacity:.75; margin-top:2px; }
  .modal .mt-why{ line-height:1.25rem; opacity:.9; }
  .modal .mt-market{ font-weight:800; }
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

  /* Modal tabs: Suggestions / Stats */
  .modal .tab-buttons{ display:flex; gap:8px; margin-top:12px; }
  .modal .tab-btn{ background:transparent; border:1px solid rgba(255,255,255,.06); padding:8px 12px; border-radius:10px; cursor:pointer; color:inherit; }
  .modal .tab-btn.active{ background:rgba(255,255,255,.06); border-color:rgba(255,255,255,.12); font-weight:900; }
  .modal .tab-panel{ margin-top:12px; }

  .suggestions-grid{ display:grid; grid-template-columns: 1fr; gap:8px; }
  .suggestion-row{ display:flex; gap:10px; align-items:flex-start; padding:10px; border-radius:10px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.03); }
  .suggestion-left{ min-width:220px; max-width:320px; }
  .suggestion-right{ flex:1; }
  .ev-badge{ font-weight:900; padding:6px 10px; border-radius:999px; }
  .ev-positive{ background:rgba(46,170,86,.12); color:#2eaA56; }
  .ev-negative{ background:rgba(220,60,60,.08); color:#dc3c3c; }

  .stat-row{ display:flex; align-items:center; gap:12px; padding:8px 0; }
  .stat-label{ width:140px; font-weight:800; opacity:.92; }
  .stat-bar-wrap{ flex:1; background:rgba(255,255,255,.03); height:14px; border-radius:8px; overflow:hidden; display:flex; align-items:center; }
  .stat-bar-left{ height:100%; background:linear-gradient(90deg,#2eaA56,#2eaA56); }
  .stat-bar-right{ height:100%; background:linear-gradient(90deg,#ffb443,#ffb443); margin-left:auto; }
  .stat-values{ width:88px; text-align:right; font-weight:800; }

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

  // Global translation helper for Match Radar V2 and other modules
  window.t = function(key, defaultValue) {
    if(!T) return defaultValue || key;
    if(Object.prototype.hasOwnProperty.call(T, key)) {
      return T[key] || defaultValue || key;
    }
    const keys = String(key).split('.');
    let val = T;
    for(const k of keys) {
      val = val && val[k];
      if(!val) return defaultValue || key;
    }
    return val || defaultValue || key;
  };

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
    RADAR_DAY_DATA = radar; // Store globally for Match Radar lookup
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
    RADAR_WEEK_DATA = week; // Store globally for Match Radar lookup
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
  const rawData = await loadV1JSON("calendar_7d.json", {matches:[], form_window:5, goals_window:5});
  
  if (DEBUG_CAL) {
    console.warn('[CAL] Raw data received:', {
      exists: !!rawData,
      type: typeof rawData,
      keys: rawData ? Object.keys(rawData) : [],
      is_array: Array.isArray(rawData),
      has_matches_key: rawData ? 'matches' in rawData : false
    });
  }
  
  // Normalize the payload to handle multiple formats
  const normalized = normalizeCalendarPayload(rawData);
  const data = {
    matches: normalized.matches,
    form_window: normalized.meta.form_window || rawData?.form_window || 5,
    goals_window: normalized.meta.goals_window || rawData?.goals_window || 5
  };
  
  if (DEBUG_CAL) {
    console.warn('[CAL] After normalization:', {
      matches_count: data.matches.length,
      first_match: data.matches[0] ? {
        home: data.matches[0].home,
        away: data.matches[0].away,
        kickoff_utc: data.matches[0].kickoff_utc,
        country: data.matches[0].country
      } : null,
      second_match: data.matches[1] ? {
        home: data.matches[1].home,
        away: data.matches[1].away,
        kickoff_utc: data.matches[1].kickoff_utc,
        country: data.matches[1].country
      } : null
    });
  }
  
  if (!data || isMockDataset(data) || (Array.isArray(data.matches) && data.matches.length===0)) {
    // Calendar can stay empty; UI will show no matches.
  }

  CAL_MATCHES = data.matches || [];
  CAL_META = { form_window: Number(data.form_window||5), goals_window: Number(data.goals_window||5) };
  
  // Extract available dates from calendar data
  let availableDateKeys = [];
  if(CAL_MATCHES.length){
    availableDateKeys = [...new Set(CAL_MATCHES.map(m=> localDateKey(m.kickoff_utc)).filter(Boolean))].sort();
    
    if (DEBUG_CAL) {
      console.warn('[CAL] Available dates in data:', availableDateKeys);
    }
  }
  
  // Date strip - generate days from calendar data if available
  const strip = ensureDateStrip(T);
  const days = build7Days(availableDateKeys.length > 0 ? availableDateKeys : null);
  let activeDate = new Intl.DateTimeFormat("en-CA", {year:"numeric", month:"2-digit", day:"2-digit"}).format(days[0]); // default: first available day
  
  if (DEBUG_CAL) {
    console.warn('[CAL] Date strip initialized:', {
      days_count: days.length,
      first_day: days[0].toISOString().substring(0, 10),
      activeDate
    });
  }

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
    // Bind the match-card click handler ONCE (rerender() calls bindOpenHandlers repeatedly)
    if(!window.__MR_CARD_CLICK_BOUND__){
      window.__MR_CARD_CLICK_BOUND__ = true;

      document.addEventListener('click', async (e) => {
        const card = e.target.closest('[data-fixture-id]');
        if(!card) return;

        const interactive = e.target.closest('a,button,input,select,textarea,label,[role="button"],[role="link"]');
        if(interactive && interactive !== card) return;

        const fixtureId = card.getAttribute('data-fixture-id');
        if(!fixtureId) return;

        e.preventDefault();
        e.stopPropagation();

        // 1) Sempre resolve do calendar_7d (single source of truth)
        const match = await resolveMatchByFixtureId(fixtureId);
        if(!match) {
          console.error('[MatchRadar] fixture not found in calendar_7d:', fixtureId);
          openModal('match', `fixture:${fixtureId}`);
          return;
        }

        // 2) Se em página radar, fetch metadata overlay
        const path = (window.location.pathname || '');
        let meta = null;
        if (path.includes('/radar/day')) {
          const rd = await getRadarDay();
          meta = rd ? findRadarMetaByFixtureId(rd, fixtureId) : null;
        } else if (path.includes('/radar/week')) {
          const rw = await getRadarWeek();
          meta = rw ? findRadarMetaByFixtureId(rw, fixtureId) : null;
        }

        // 3) Abre modal com match + meta
        window.__MATCH_CTX__ = { match, meta, fixtureId };
        openMatchRadarV2(fixtureId);
      }, true);
    }

    // Handle all other [data-open] elements (competition, country radars, etc.)
    qsa("[data-open]:not([data-fixture-id])").forEach(el=>{
      if(el.dataset.boundOpen === "1") return;
      el.dataset.boundOpen = "1";
      el.addEventListener("click", (e)=>{
        // Prevent nested [data-open] from triggering multiple modals
        if(e && e.target && e.target.closest && e.target.closest("[data-open]") && e.target.closest("[data-open]") !== el) return;

        e.stopPropagation();
        const type = el.getAttribute("data-open");
        // Strict routing: only "match" reads data-key (matchKey). Others must use data-value.
        let val = "";
        if(type === "match"){
          val = el.getAttribute("data-key") || el.getAttribute("data-value") || "";
        }else{
          val = el.getAttribute("data-value") || "";
        }
        openModal(type, val);
      });
    });

    // keyboard on match rows
    qsa(".match[role='button']").forEach(el=>{
      if(el.dataset.boundKey === "1") return;
      el.dataset.boundKey = "1";
      el.addEventListener("keydown", (e)=>{
        if(e.key==="Enter" || e.key===" "){ e.preventDefault(); el.click(); }
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
