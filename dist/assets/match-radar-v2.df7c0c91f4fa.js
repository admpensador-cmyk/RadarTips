// Match Radar V2 (isolated module)
(function(){
  // Minimal, self-contained Match Radar V2
  const CSS_ID = 'mr-v2-style-loaded';

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

  function mapRisk(r){
    if(!r) return '—';
    const s = String(r).toLowerCase();
    if(s.includes('low')) return 20;
    if(s.includes('med') || s.includes('medium')) return 35;
    if(s.includes('high')) return 55;
    if(s.includes('volatile')) return 65;
    const n = Number(r);
    return isNaN(n) ? '—' : n;
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
    const home = { name: m.home?.name||m.home_team||m.home_team_name||m.home||'', score: m.home?.score ?? m.goals_home ?? null };
    const away = { name: m.away?.name||m.away_team||m.away_team_name||m.away||'', score: m.away?.score ?? m.goals_away ?? null };
    const league = { country: m.country||m.league_country||'', competition: m.competition||m.league||m.league_name||'' };
    const datetimeUtc = m.datetimeUtc || m.utc || m.date || m.time || null;

    // markets from analysis.markets
    let markets = [];
    try{
      const arr = m.analysis?.markets || m.markets || [];
      if(Array.isArray(arr)){
        markets = arr.map(entry => {
          const marketLabel = entry.market || entry.marketLabel || entry.label || '';
          const line = parseLine(entry.line || entry.selection || marketLabel);
          const confidence = Number(entry.confidence ?? entry.ev ?? entry.confidence_pct ?? NaN);
          const evPct = isNaN(confidence) ? (entry.confidence ? Number(entry.confidence) : null) : (confidence * 100);
          const riskPct = mapRisk(entry.risk || entry.risk_level || entry.riskPct || entry.riskPctText || '');
          const note = entry.note || entry.rationale || entry.reason || entry.text || '';
          return { marketLabel, line, riskPct, evPct: evPct===null?null:Math.round(evPct*100)/100, note };
        });
      }
    }catch(e){ markets = []; }

    const stats = m.stats || m.statistics || m.analysis?.stats || null;

    return { fixtureId, home, away, league, datetimeUtc, markets, stats };
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

  function renderModal(data){
    removeModal();
    const ov = el('div','mr-v2-overlay'); ov.id = 'mr-v2-overlay';
    const box = el('div','mr-v2-box');

    const header = `<div class="mr-v2-head"><div class="mr-v2-title">${escapeHtml(data.home.name)} vs ${escapeHtml(data.away.name)} ${formatScore(data)}</div><button class="mr-v2-close">×</button></div>`;
    const tabs = `<div class="mr-v2-tabs"><button class="mr-v2-tab mr-v2-tab-active" data-tab="markets">Mercados</button><button class="mr-v2-tab" data-tab="stats">Estatísticas</button></div>`;
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
    if(!arr || arr.length===0){ panel.innerHTML = '<div class="mr-v2-empty">Sem dados disponíveis</div>'; return; }
    const rows = arr.slice().sort((a,b)=>((b.evPct||0)-(a.evPct||0))).map(m=>{
      const ev = (m.evPct==null||m.evPct==='')? '—' : `${m.evPct}%`;
      const risk = (typeof m.riskPct === 'number')? `${m.riskPct}%` : m.riskPct || '—';
      return `<tr><td class="mr-market">${escapeHtml(m.marketLabel||'—')}</td><td class="mr-line">${escapeHtml(m.line||'—')}</td><td class="mr-risk">${escapeHtml(risk)}</td><td class="mr-ev">${escapeHtml(ev)}</td><td class="mr-note">${escapeHtml(m.note||'—')}</td></tr>`;
    }).join('');
    panel.innerHTML = `<div class="mr-table-wrap"><table class="mr-table"><thead><tr><th>Mercado</th><th>Linha</th><th>Risco</th><th>EV%</th><th>Justificativa</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderStatsTab(ov, data){
    const panel = ov.querySelector('[data-panel="stats"]');
    if(!panel) return;
    const s = data.stats || {};
    if(Object.keys(s).length===0){ panel.innerHTML = '<div class="mr-v2-empty">Sem dados disponíveis</div>'; return; }

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

    if(rows.length===0){ panel.innerHTML = '<div class="mr-v2-empty">Sem dados disponíveis</div>'; return; }

    const html = rows.map(r=>{
      const l = Number(String(r.left).replace('%','')) || 0;
      const rt = Number(String(r.right).replace('%','')) || 0;
      const total = Math.max(l, rt) || 1;
      const lw = Math.round((l/(l+rt||1))*100);
      const rw = 100 - lw;
      return `<div class="mr-stat-row"><div class="mr-left">${escapeHtml(r.left)}</div><div class="mr-label">${escapeHtml(r.label)}</div><div class="mr-right">${escapeHtml(r.right)}</div><div class="mr-bar"><div class="mr-bar-left" style="width:${lw}%;"></div><div class="mr-bar-right" style="width:${rw}%;"></div></div></div>`;
    }).join('');

    panel.innerHTML = `<div class="mr-stats-wrap">${html}</div>`;
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
