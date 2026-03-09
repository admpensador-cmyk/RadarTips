// ========================================
// Match Radar V2 (inlined from match-radar-v2.js)
// ========================================
// Match Radar V2 (isolated module)
(function(){
  // Minimal, self-contained Match Radar V2 with professional odds/risk calculations
  const CSS_ID = 'mr-v2-style-loaded';
  const matchCache = new Map();
  const statsPayloadCache = new Map();
  const marketsCache = new Map();
  const statsPayloadInflight = new Map();
  const prefetchInflight = new Map();
  const STATS_ENHANCER = { loader: null, fn: null };
  const MAX_PREFETCH = 24;
  let MATCH_RADAR_BOOT = null;
  let MATCH_RADAR_BOOT_LOADING = null;

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

  function ensureStatsV2Css(){
    const version = '20260226-2';
    const href = `/assets/css/stats-v2.css?v=${version}`;
    try{
      const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).find(l => (l.href||'').includes('stats-v2'));
      if(existing){
        if(!(existing.href || '').includes(`v=${version}`)) existing.href = href;
        return;
      }
    }catch(e){}
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureStatsTableCss() {
    const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .find(l => (l.href||'').includes('stats-table'));
    if (existing) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/assets/css/stats-table.css';
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
    const key = String(fixtureId || '');
    if(matchCache.has(key)) return matchCache.get(key);

    // 1) try find in CAL_MATCHES
    try{
      const CAL = window.CAL_MATCHES || [];
      const found = CAL.find(m => String(getFixtureId(m) || '') === String(fixtureId));
      if(found) {
        const normalized = normalizeMatch(found, window.CAL_SNAPSHOT_META);
        matchCache.set(key, normalized);
        return normalized;
      }
    }catch(e){/*ignore*/}

    return null;
  }

  function getFixtureId(m){
    const candidate = m?.fixture_id ?? m?.fixture?.id ?? m?.fixtureId ?? m?.id;
    const id = Number(candidate);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function getCompetitionId(m){
    const candidate = m?.competition_id ?? m?.league?.id ?? m?.league_id ?? m?.competition?.id;
    const id = Number(candidate);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  const STATS_SUPPORTED_STATE = {
    loaded: false,
    loading: null,
    competitions: {}
  };

  async function loadStatsSupportedMap(){
    if(STATS_SUPPORTED_STATE.loaded) return STATS_SUPPORTED_STATE.competitions;
    if(STATS_SUPPORTED_STATE.loading) return STATS_SUPPORTED_STATE.loading;

    STATS_SUPPORTED_STATE.loading = fetch('/api/v1/stats_supported', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(payload => {
        const competitions = payload && payload.competitions && typeof payload.competitions === 'object'
          ? payload.competitions
          : {};
        STATS_SUPPORTED_STATE.competitions = competitions;
        STATS_SUPPORTED_STATE.loaded = true;
        return competitions;
      })
      .catch(() => {
        STATS_SUPPORTED_STATE.competitions = {};
        STATS_SUPPORTED_STATE.loaded = true;
        return {};
      })
      .finally(() => {
        STATS_SUPPORTED_STATE.loading = null;
      });

    return STATS_SUPPORTED_STATE.loading;
  }

  async function isStatsSupportedForMatch(data){
    const competitionId = getCompetitionId(data);
    if(!competitionId) return true;

    const competitions = await loadStatsSupportedMap();
    if(!Object.prototype.hasOwnProperty.call(competitions, String(competitionId))) return true;

    return competitions[String(competitionId)] === true;
  }

  function hasStructuredStatsData(value){
    if(value === null || value === undefined) return false;
    if(Array.isArray(value)) {
      return value.some(item => hasStructuredStatsData(item));
    }
    if(typeof value === 'object') {
      const entries = Object.values(value);
      if(entries.length === 0) return false;
      return entries.some(item => hasStructuredStatsData(item));
    }
    if(typeof value === 'string') return value.trim().length > 0;
    return true;
  }

  function hasAnyTeamWindowData(payload){
    const teams = [payload?.home, payload?.away];
    return teams.some(team => {
      if(!team || typeof team !== 'object') return false;
      const stats = team?.stats || {};
      const gamesUsed = team?.games_used || {};
      const hasWindowData =
        hasStructuredStatsData(stats?.total_last5) ||
        hasStructuredStatsData(stats?.home_last5) ||
        hasStructuredStatsData(stats?.away_last5);
      const hasGamesUsedData =
        Number(gamesUsed?.games_used_total || 0) > 0 ||
        Number(gamesUsed?.games_used_home || 0) > 0 ||
        Number(gamesUsed?.games_used_away || 0) > 0;
      return hasWindowData || hasGamesUsedData;
    });
  }

  function isValidStatsPayload(payload){
    if(!payload || typeof payload !== 'object') return false;
    if(payload.error || payload.ok === false) return false;

    const hasLegacyStatsFlag = payload.hasStats === true;
    const hasCurrentStatsShape =
      hasStructuredStatsData(payload?.home?.stats) ||
      hasStructuredStatsData(payload?.away?.stats) ||
      hasStructuredStatsData(payload?.stats);

    const hasSchemaWithStatusData =
      payload?.status === 'ok' && hasStructuredStatsData(payload?.data);

    if(payload.hasStats === false) return false;

    return hasLegacyStatsFlag || hasCurrentStatsShape || hasSchemaWithStatusData || hasAnyTeamWindowData(payload);
  }

  function hasStatsPayload(data){
    return isValidStatsPayload(data) === true;
  }

  async function fetchMatchStatsPayload(fixtureId){
    const key = String(fixtureId || '');
    if(!key) return null;
    if(statsPayloadCache.has(key)) return statsPayloadCache.get(key);
    if(statsPayloadInflight.has(key)) return statsPayloadInflight.get(key);

    const apiUrl = `/api/match-stats?fixture=${encodeURIComponent(fixtureId)}&ts=${Date.now()}`;
    const inflight = (async () => {
      const response = await fetch(apiUrl, { cache: 'no-store' });
      if(!response.ok) throw new Error(`http_${response.status}`);
      const payload = await response.json();
      if(isValidStatsPayload(payload)) {
        statsPayloadCache.set(key, payload);
      }
      return payload;
    })();

    statsPayloadInflight.set(key, inflight);
    try {
      return await inflight;
    } finally {
      statsPayloadInflight.delete(key);
    }
  }

  async function prefetchMatchRadarV2(fixtureId, opts = {}){
    const key = String(fixtureId || '');
    if(!key) return;

    ensureMatchRadarMicroBootstrap()
      .then((mod) => mod.prefetchMatchRadarMicroApp(getMatchRadarMicroHost(), key))
      .catch(() => null);

    if(prefetchInflight.has(key)) return prefetchInflight.get(key);

    // Keep cache bounded to avoid unbounded memory growth.
    if(matchCache.size > MAX_PREFETCH) {
      const first = matchCache.keys().next().value;
      if(first) matchCache.delete(first);
    }
    if(statsPayloadCache.size > MAX_PREFETCH) {
      const first = statsPayloadCache.keys().next().value;
      if(first) statsPayloadCache.delete(first);
    }

    const includeStats = opts.includeStats !== false;
    const run = Promise.allSettled([
      getMatchRadarV2Data(key),
      includeStats ? fetchMatchStatsPayload(key) : Promise.resolve(null)
    ]).finally(() => {
      prefetchInflight.delete(key);
    });

    prefetchInflight.set(key, run);
    return run;
  }

  async function loadStatsEnhancer(){
    if(STATS_ENHANCER.fn) return STATS_ENHANCER.fn;
    if(STATS_ENHANCER.loader) return STATS_ENHANCER.loader;

    STATS_ENHANCER.loader = import('/assets/js/radar-stats-enhancer.js')
      .then((mod) => {
        STATS_ENHANCER.fn = typeof mod.enhanceRadarStats === 'function' ? mod.enhanceRadarStats : null;
        return STATS_ENHANCER.fn;
      })
      .catch(() => null)
      .finally(() => {
        STATS_ENHANCER.loader = null;
      });

    return STATS_ENHANCER.loader;
  }

  function getMatchRadarMicroHost(){
    return {
      t,
      snapshotMeta: window.CAL_SNAPSHOT_META || null,
      getDedicatedMatchUrl,
      normalizeMatch,
      getMatchRadarV2Data,
      resolveMatchByFixtureId,
      fetchMatchStatsPayload,
      hasStatsPayload,
      renderStatsV2,
      pickTeamLogo,
      crestHTML,
      formatScore,
      loadStatsEnhancer
    };
  }

  async function ensureMatchRadarMicroBootstrap(){
    if(MATCH_RADAR_BOOT) return MATCH_RADAR_BOOT;
    if(MATCH_RADAR_BOOT_LOADING) return MATCH_RADAR_BOOT_LOADING;

    MATCH_RADAR_BOOT_LOADING = import('/assets/js/match-radar/bootstrap.js')
      .then((mod) => {
        const host = getMatchRadarMicroHost();
        mod.initMatchRadarMicroApp(host);
        MATCH_RADAR_BOOT = mod;
        window.__MATCH_RADAR_MICRO_CLOSE__ = () => {
          try { mod.closeMatchRadarMicroApp(host); } catch(e) { removeModal(); }
        };
        return mod;
      })
      .finally(() => {
        MATCH_RADAR_BOOT_LOADING = null;
      });

    return MATCH_RADAR_BOOT_LOADING;
  }

  function getDedicatedMatchUrl(fixtureId){
    const locale = String(window.RT_LOCALE || document.documentElement?.lang || 'en').toLowerCase();
    return `/${locale}/radar/day/?fixture=${encodeURIComponent(String(fixtureId || ''))}&mr_mode=fullscreen`;
  }

  function persistMatchRadarSnapshot(fixtureId, payload){
    try {
      if(!fixtureId || !payload) return;
      const key = `mr_snapshot_${String(fixtureId)}`;
      sessionStorage.setItem(key, JSON.stringify(payload));
    } catch(e) {}
  }

  function restoreMatchRadarSnapshot(fixtureId){
    try {
      if(!fixtureId) return null;
      const key = `mr_snapshot_${String(fixtureId)}`;
      const raw = sessionStorage.getItem(key);
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      sessionStorage.removeItem(key);
      return parsed;
    } catch(e) {
      return null;
    }
  }

  function pickInitialTab(data, statsPayload){
    if(hasStatsPayload(statsPayload)) return 'stats';
    if(Array.isArray(data?.markets) && data.markets.length > 0) return 'markets';
    return 'details';
  }

  function resolveRadarMode(requestedMode){
    const isMobile = typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : (window.innerWidth || 1024) <= 768;
    if(requestedMode === 'fullscreen') return 'fullscreen';
    if(requestedMode === 'sidebar') return isMobile ? 'fullscreen' : 'sidebar';
    return isMobile ? 'fullscreen' : 'sidebar';
  }

  function SidebarContainer(content){
    return `<div class="mr-app-panel mr-app-panel--sidebar">${content}</div>`;
  }

  function applyRootMode(root, mode){
    if(!root) return;
    root.classList.remove('mr-v2-overlay', 'mr-v2-sidebar-host');
    root.classList.add(mode === 'fullscreen' ? 'mr-v2-overlay' : 'mr-v2-sidebar-host');

    // Force viewport anchoring
    root.style.position = 'fixed';
    root.style.top = '0';
    root.style.right = '0';
    root.style.bottom = '0';
    root.style.left = '0';
    root.style.zIndex = '2147483646';
  }

  function FullscreenContainer(content){
    return `<div class="mr-app-panel mr-app-panel--fullscreen">${content}</div>`;
  }

  function MatchRadarTabs(items, activeTab){
    return items.map((tab) => {
      const active = tab.id === activeTab ? ' mr-v2-tab-active' : '';
      return `<button class="mr-v2-tab${active}" data-mr-tab="${tab.id}">${tab.label}</button>`;
    }).join('');
  }

  function createMatchRadarDataController(){
    return {
      async getMatch(fixtureId, ctxMatch){
        const key = String(fixtureId || '');
        if(ctxMatch) {
          const normalized = normalizeMatch(ctxMatch, window.CAL_SNAPSHOT_META);
          matchCache.set(key, normalized);
          return normalized;
        }
        return getMatchRadarV2Data(key);
      },
      async getStats(fixtureId){
        try {
          return await fetchMatchStatsPayload(fixtureId);
        } catch(e) {
          return null;
        }
      },
      getMarkets(fixtureId, data){
        const key = String(fixtureId || '');
        if(marketsCache.has(key)) return marketsCache.get(key);
        const markets = Array.isArray(data?.markets) ? data.markets : [];
        marketsCache.set(key, markets);
        return markets;
      }
    };
  }

  const MatchRadarDataController = createMatchRadarDataController();

  const MatchRadarApp = {
    state: null,

    open(fixtureId, options = {}){
      const id = String(fixtureId || '');
      if(!id) return;
      const ctx = options.ctx || window.__MATCH_CTX__ || null;
      if(window.__MATCH_CTX__) window.__MATCH_CTX__ = null;

      const mode = resolveRadarMode(options.mode);
      const appState = {
        fixtureId: id,
        mode,
        data: null,
        stats: null,
        activeTab: 'details',
        loadedTabs: new Set(),
        shell: null,
        content: null,
        tabs: null,
        ctx: ctx || null,
        startedAt: Date.now()
      };

      this.state = appState;
      renderLoadingModal(mode);
      appState.shell = document.getElementById('mr-v2-overlay');
      appState.content = appState.shell ? appState.shell.querySelector('[data-mr-content]') : null;
      appState.tabs = appState.shell ? appState.shell.querySelector('[data-mr-tabs]') : null;

      this.bindShellEvents(appState);
      this.hydrate(appState).catch(() => renderEmpty());
    },

    close(){
      removeModal();
      try {
        const url = new URL(location.href);
        if(url.searchParams.has('fixture')) {
          url.searchParams.delete('fixture');
          url.searchParams.delete('mr_mode');
          const search = url.searchParams.toString();
          history.replaceState({}, '', url.pathname + (search ? `?${search}` : '') + (url.hash || ''));
        }
      } catch(e) {}
      this.state = null;
    },

    bindShellEvents(appState){
      if(!appState.shell) return;
      const closeBtn = appState.shell.querySelector('.mr-v2-close');
      if(closeBtn) closeBtn.addEventListener('click', () => this.close());

      const fullBtn = appState.shell.querySelector('[data-mr-fullview]');
      if(fullBtn) {
        fullBtn.addEventListener('click', () => {
          if(!appState.data) return;
          const preservedTab = appState.activeTab || pickInitialTab(appState.data, appState.stats);
          persistMatchRadarSnapshot(appState.fixtureId, {
            match: appState.data,
            stats: appState.stats,
            markets: Array.isArray(appState.data?.markets) ? appState.data.markets : [],
            activeTab: preservedTab
          });

          // Prefer micro-app mode switch to preserve loaded state and active tab without full navigation.
          ensureMatchRadarMicroBootstrap()
            .then((mod) => mod.openMatchRadarMicroApp(getMatchRadarMicroHost(), {
              fixtureId: appState.fixtureId,
              mode: 'fullscreen',
              requestedTab: preservedTab,
              ctxMatch: appState.data,
              syncUrl: true
            }))
            .catch(() => {
              // Legacy in-place fallback keeps UX stable if module load fails.
              appState.mode = 'fullscreen';
              this.renderShell(appState);
              this.switchTab(appState, preservedTab, { force: true });
            });
        });
      }

      const tabHost = appState.shell.querySelector('[data-mr-tabs]');
      if(tabHost) {
        tabHost.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-mr-tab]');
          if(!btn) return;
          const tab = btn.getAttribute('data-mr-tab');
          this.switchTab(appState, tab);
        });
      }
    },

    async hydrate(appState){
      const fromStorage = restoreMatchRadarSnapshot(appState.fixtureId);
      if(fromStorage?.match) {
        matchCache.set(appState.fixtureId, fromStorage.match);
        if(fromStorage.stats) statsPayloadCache.set(appState.fixtureId, fromStorage.stats);
        if(Array.isArray(fromStorage.markets)) marketsCache.set(appState.fixtureId, fromStorage.markets);
      }

      const data = await MatchRadarDataController.getMatch(appState.fixtureId, appState.ctx?.match || fromStorage?.match || null);
      if(!data) {
        renderEmpty();
        return;
      }

      appState.data = data;
      const statsCached = statsPayloadCache.get(appState.fixtureId) || fromStorage?.stats || null;
      const statsPromise = statsCached ? Promise.resolve(statsCached) : MatchRadarDataController.getStats(appState.fixtureId);
      const stats = await statsPromise;
      if(stats) {
        appState.stats = stats;
        statsPayloadCache.set(appState.fixtureId, stats);
      }

      appState.activeTab = pickInitialTab(data, appState.stats);
      this.renderShell(appState);
      this.switchTab(appState, appState.activeTab, { force: true });

      persistMatchRadarSnapshot(appState.fixtureId, {
        match: data,
        stats: appState.stats,
        markets: MatchRadarDataController.getMarkets(appState.fixtureId, data)
      });
    },

    renderShell(appState){
      if(!appState.shell || !appState.data) return;

      applyRootMode(appState.shell, appState.mode);

      const data = appState.data;
      const homeLogo = pickTeamLogo(data, 'home');
      const awayLogo = pickTeamLogo(data, 'away');
      const homeShield = `<div style="min-width:42px;width:42px;height:42px;">${crestHTML(data.home.name, homeLogo)}</div>`;
      const awayShield = `<div style="min-width:42px;width:42px;height:42px;">${crestHTML(data.away.name, awayLogo)}</div>`;

      const tabs = [
        { id: 'stats', label: t('match_radar.tabs.stats', 'Estatisticas') },
        { id: 'markets', label: t('match_radar.tabs.markets', 'Mercados') },
        { id: 'details', label: t('match_radar.tabs.details', 'Detalhes') }
      ];

      const tabButtons = MatchRadarTabs(tabs, appState.activeTab);

      const fullAction = appState.mode === 'sidebar'
        ? `<button class="mr-v2-fullview" data-mr-fullview>${t('match_radar.full_view', 'Visualizacao completa')}</button>`
        : '';

      const shellInner = `
          <div class="mr-v2-head">
            <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">${homeShield}${awayShield}<div class="mr-v2-title">${escapeHtml(data.home.name)} vs ${escapeHtml(data.away.name)} ${formatScore(data)}</div></div>
            <div class="mr-v2-actions">${fullAction}<button class="mr-v2-close">×</button></div>
          </div>
          <div class="mr-v2-tabs" data-mr-tabs>${tabButtons}</div>
          <div class="mr-v2-body" data-mr-content></div>
      `;

      appState.shell.innerHTML = appState.mode === 'fullscreen'
        ? FullscreenContainer(shellInner)
        : SidebarContainer(shellInner);

      bindModalClose(appState.shell);
      this.bindShellEvents(appState);
      appState.content = appState.shell.querySelector('[data-mr-content]');
      appState.tabs = appState.shell.querySelector('[data-mr-tabs]');
    },

    switchTab(appState, tabId, opts = {}){
      if(!appState || !appState.content || !appState.data) return;
      const tab = String(tabId || 'details');
      appState.activeTab = tab;

      if(appState.tabs) {
        appState.tabs.querySelectorAll('[data-mr-tab]').forEach((btn) => {
          const isActive = btn.getAttribute('data-mr-tab') === tab;
          btn.classList.toggle('mr-v2-tab-active', isActive);
        });
      }

      if(!opts.force && appState.loadedTabs.has(tab)) return;
      appState.content.innerHTML = `<div class="mr-v2-stats-loading">${t('match_radar.loading', 'Carregando...')}</div>`;

      const overlay = appState.shell;
      const data = appState.data;
      if(tab === 'markets') {
        appState.content.innerHTML = `<div class="mr-v2-tabpanel" data-panel="markets"></div>`;
        renderMarketsTab(overlay, data);
      } else if(tab === 'stats') {
        appState.content.innerHTML = `<div class="mr-v2-tabpanel" data-panel="stats"></div>`;
        renderStatsTab(overlay, data, appState.stats || null);
      } else {
        const leagueName = escapeHtml(data?.league?.name || '');
        const country = escapeHtml(data?.league?.country || '');
        const kickoff = escapeHtml(String(data?.datetimeUtc || ''));
        appState.content.innerHTML = `
          <div class="mr-v2-details">
            <div class="mr-v2-detail-row"><strong>${t('match_radar.details.fixture', 'Fixture')}</strong><span>#${escapeHtml(appState.fixtureId)}</span></div>
            <div class="mr-v2-detail-row"><strong>${t('match_radar.details.league', 'Liga')}</strong><span>${leagueName || '—'}</span></div>
            <div class="mr-v2-detail-row"><strong>${t('match_radar.details.country', 'Pais')}</strong><span>${country || '—'}</span></div>
            <div class="mr-v2-detail-row"><strong>${t('match_radar.details.kickoff', 'Kickoff UTC')}</strong><span>${kickoff || '—'}</span></div>
          </div>
        `;
      }

      appState.loadedTabs.add(tab);

      // Lazy-warm non-selected tabs after first content paint.
      setTimeout(() => {
        if(tab !== 'stats' && !appState.stats) {
          MatchRadarDataController.getStats(appState.fixtureId).then((stats) => {
            if(stats) {
              appState.stats = stats;
              statsPayloadCache.set(appState.fixtureId, stats);
            }
          }).catch(() => {});
        }
      }, 0);
    }
  };

  function normalizeMatch(m, snapshotMeta){
    const fixtureId = getFixtureId(m);
    const fixtureIdStr = fixtureId ? String(fixtureId) : '';
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
      fixtureId: fixtureIdStr,
      fixture_id: fixtureId,
      id: fixtureId,
      competition_id: getCompetitionId(m) ?? m.competition_id ?? m.league_id ?? league.id,
      home, away, league, season, datetimeUtc, markets, stats,
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

  function openMatchRadarV2(fixtureId, options = {}){
    ensureStyles();
    const mode = resolveRadarMode(options.mode);
    renderLoadingModal(mode);

    const ctx = window.__MATCH_CTX__ || null;
    if(window.__MATCH_CTX__) window.__MATCH_CTX__ = null;

    ensureMatchRadarMicroBootstrap()
      .then((mod) => mod.openMatchRadarMicroApp(getMatchRadarMicroHost(), {
        fixtureId,
        mode,
        requestedTab: options.requestedTab || null,
        ctxMatch: ctx?.match || null,
        syncUrl: options.syncUrl !== false
      }))
      .catch(() => {
        if(ctx?.match) window.__MATCH_CTX__ = ctx;
        MatchRadarApp.open(fixtureId, options);
      });
  }

  // modal management
  function renderLoadingModal(mode = 'sidebar'){
    removeModal();
    const ov = el('div','mr-v2-root'); ov.id = 'mr-v2-overlay';
    applyRootMode(ov, mode);
    const shellInner = `
        <div class="mr-v2-head">
          <div class="mr-v2-title">${t('match_radar.loading', 'Carregando radar...')}</div>
          <button class="mr-v2-close">×</button>
        </div>
        <div class="mr-v2-tabs">
          <button class="mr-v2-tab mr-v2-tab-active">${t('match_radar.tabs.stats', 'Estatisticas')}</button>
          <button class="mr-v2-tab">${t('match_radar.tabs.markets', 'Mercados')}</button>
          <button class="mr-v2-tab">${t('match_radar.tabs.details', 'Detalhes')}</button>
        </div>
        <div class="mr-v2-body mr-v2-skeleton-wrap" aria-busy="true" aria-live="polite" data-mr-content>
          <div class="mr-v2-skeleton-row"></div>
          <div class="mr-v2-skeleton-row mr-v2-skeleton-row-wide"></div>
          <div class="mr-v2-skeleton-grid">
            <div class="mr-v2-skeleton-card"></div>
            <div class="mr-v2-skeleton-card"></div>
            <div class="mr-v2-skeleton-card"></div>
            <div class="mr-v2-skeleton-card"></div>
          </div>
        </div>
    `;
    ov.innerHTML = mode === 'fullscreen'
      ? FullscreenContainer(shellInner)
      : SidebarContainer(shellInner);
    document.body.appendChild(ov);
    bindModalClose(ov);
  }

  function renderEmpty(){
    const body = qsBody();
    if(!body) return; // nothing
    const modal = document.querySelector('#mr-v2-overlay [data-mr-content], #mr-v2-overlay .mr-v2-body');
    if(modal) modal.innerHTML = '<div class="mr-v2-empty">Sem dados disponíveis</div>';
  }

  function removeModal(){
    const overlays = Array.from(document.querySelectorAll('#mr-v2-overlay, .mr-v2-overlay, .mr-v2-sidebar-host'));
    overlays.forEach((node) => {
      if(node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function bindModalClose(ov){
    const closeAny = () => {
      if(typeof window.__MATCH_RADAR_MICRO_CLOSE__ === 'function') {
        window.__MATCH_RADAR_MICRO_CLOSE__();
      } else {
        MatchRadarApp.close();
      }
    };
    ov.addEventListener('click', (e)=>{
      if(!ov.classList.contains('mr-v2-overlay')) return;
      if(e.target === ov) closeAny();
    });
    document.addEventListener('keydown', function onEsc(e){ if(e.key==='Escape'){ closeAny(); document.removeEventListener('keydown', onEsc); } });
    const btn = ov.querySelector('.mr-v2-close'); if(btn) btn.addEventListener('click', ()=>closeAny());
  }

  function qsBody(){ return document.querySelector('#mr-v2-overlay'); }

  function renderModal(data){
    const fixtureId = getFixtureId(data);
    if(!fixtureId) return renderEmpty();
    window.__MATCH_CTX__ = { match: data, meta: null, fixtureId: String(fixtureId) };
    openMatchRadarV2(fixtureId, { mode: 'sidebar' });
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

  function safeNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function fmt(v) {
    const n = safeNum(v);
    return n === null ? "—" : String(n);
  }

  function pct(a, b) {
    const A = safeNum(a), B = safeNum(b);
    if (A === null && B === null) return { l:50, r:50 };
    const aa = A ?? 0, bb = B ?? 0;
    const max = Math.max(aa, bb, 1);
    return { l: Math.round((aa/max)*100), r: Math.round((bb/max)*100) };
  }

  function classifyTrend(gfA, gaA, gfB, gaB) {
    const t = (safeNum(gfA)??0)+(safeNum(gaA)??0)+(safeNum(gfB)??0)+(safeNum(gaB)??0);
    if (t >= 14) return "Jogo com cara de gols";
    if (t >= 10) return "Tendência de 2+ gols";
    return "Tendência de poucos gols";
  }

  function classifyDefense(ga) {
    const n = safeNum(ga);
    if (n === null) return "Sem leitura";
    if (n >= 8) return "Defesa vazando";
    if (n >= 5) return "Defesa instável";
    return "Defesa consistente";
  }

  function renderStatsV2(api, ctx) {
    ensureStatsV2Css();

    const h = api?.home?.stats?.total_last5 || {};
    const a = api?.away?.stats?.total_last5 || {};

    const homeName = api?.home?.name || "Home";
    const awayName = api?.away?.name || "Away";

    const homeGamesMeta = api?.home?.games_used || {};
    const awayGamesMeta = api?.away?.games_used || {};

    const homeGames = safeNum(homeGamesMeta?.games_used_total);
    const awayGames = safeNum(awayGamesMeta?.games_used_total);

    const formatSampleLabel = (meta, games) => {
      const partialByFlag = meta && Object.keys(meta).some(k => k.startsWith('partial_') && meta[k] === true);
      const partialBySize = games !== null && games < 5;
      if(partialByFlag || partialBySize) return `parcial (${games ?? 0}/5)`;
      if(games === null) return 'amostra: —';
      return `amostra: ${games}/5`;
    };

    const hGF = safeNum(h.gols_marcados);
    const hGA = safeNum(h.gols_sofridos);
    const hCS = safeNum(h.clean_sheets);
    const hFTS = safeNum(h.falha_marcar);

    const aGF = safeNum(a.gols_marcados);
    const aGA = safeNum(a.gols_sofridos);
    const aCS = safeNum(a.clean_sheets);
    const aFTS = safeNum(a.falha_marcar);

    const trend = classifyTrend(hGF, hGA, aGF, aGA);
    const defA = classifyDefense(aGA);

    const pGF = pct(hGF, aGF);
    const pGA = pct(hGA, aGA);
    const pCS = pct(hCS, aCS);
    const pFTS = pct(hFTS, aFTS);

    const mode = ctx?.mode || "last5";

    return `
  <div class="rt-statsv2">
    <div class="sv2-tabs" role="tablist" aria-label="Stats mode">
      <div class="sv2-tab ${mode==="last5"?"is-active":""}" data-sv2-mode="last5">Últimos 5 jogos</div>
      <div class="sv2-tab ${mode==="h2h"?"is-active":""}" data-sv2-mode="h2h">${homeName} vs ${awayName}</div>
    </div>

    <div class="sv2-grid">
      <div class="sv2-card">
        <div class="sv2-card-h">
          <div>
            <div class="sv2-team">${homeName}</div>
            <div class="sv2-sub">Home</div>
          </div>
          <div class="sv2-pill">${formatSampleLabel(homeGamesMeta, homeGames)}</div>
        </div>

        <div class="sv2-card-b">
          <div class="sv2-kpis">
            <div class="sv2-kpi"><div class="k">Jogos</div><div class="v">${fmt(homeGames)}</div><div class="h">usados</div></div>
            <div class="sv2-kpi"><div class="k">GF</div><div class="v">${fmt(hGF)}</div><div class="h">gols pró</div></div>
            <div class="sv2-kpi"><div class="k">GA</div><div class="v">${fmt(hGA)}</div><div class="h">gols contra</div></div>
            <div class="sv2-kpi"><div class="k">CS</div><div class="v">${fmt(hCS)}</div><div class="h">clean sheets</div></div>
            <div class="sv2-kpi"><div class="k">FTS</div><div class="v">${fmt(hFTS)}</div><div class="h">falhou</div></div>
          </div>

          <div class="sv2-compare">
            <div class="sv2-compare-title">Comparativo (Home vs Away)</div>

            <div class="sv2-row">
              <div class="sv2-label">Gols marcados (GF)</div>
              <div class="sv2-num">${fmt(hGF)}</div>
              <div class="sv2-bar"><i style="width:${pGF.l}%"></i><b style="width:${pGF.r}%"></b></div>
              <div class="sv2-num">${fmt(aGF)}</div>
            </div>

            <div class="sv2-row">
              <div class="sv2-label">Gols sofridos (GA)</div>
              <div class="sv2-num">${fmt(hGA)}</div>
              <div class="sv2-bar"><i style="width:${pGA.l}%"></i><b style="width:${pGA.r}%"></b></div>
              <div class="sv2-num">${fmt(aGA)}</div>
            </div>

            <div class="sv2-row">
              <div class="sv2-label">Clean sheets (CS)</div>
              <div class="sv2-num">${fmt(hCS)}</div>
              <div class="sv2-bar"><i style="width:${pCS.l}%"></i><b style="width:${pCS.r}%"></b></div>
              <div class="sv2-num">${fmt(aCS)}</div>
            </div>

            <div class="sv2-row">
              <div class="sv2-label">Falhou em marcar (FTS)</div>
              <div class="sv2-num">${fmt(hFTS)}</div>
              <div class="sv2-bar"><i style="width:${pFTS.l}%"></i><b style="width:${pFTS.r}%"></b></div>
              <div class="sv2-num">${fmt(aFTS)}</div>
            </div>

            <div class="sv2-note">
              Observação: cartões/escanteios só aparecem quando o snapshot traz esses campos. Aqui mostramos o essencial (GF/GA/CS/FTS).
            </div>
          </div>
        </div>
      </div>

      <div class="sv2-card">
        <div class="sv2-card-h">
          <div>
            <div class="sv2-team">${awayName}</div>
            <div class="sv2-sub">Away</div>
          </div>
          <div class="sv2-pill">${formatSampleLabel(awayGamesMeta, awayGames)}</div>
        </div>

        <div class="sv2-quick">
          <div class="qtitle">Leitura rápida</div>
          <div class="sv2-qline"><div class="sv2-qk">Tendência</div><div class="sv2-qv">${trend}</div></div>
          <div class="sv2-qline"><div class="sv2-qk">Defesa (Away)</div><div class="sv2-qv">${defA}</div></div>
          <div class="sv2-qline"><div class="sv2-qk">Clean sheets (H/A)</div><div class="sv2-qv">${fmt(hCS)} / ${fmt(aCS)}</div></div>

          <div class="sv2-note">
            Se algum time vier com “—”, o snapshot ainda não trouxe dados suficientes para essa amostra.
          </div>
        </div>
      </div>
    </div>
  </div>`;
  }

  function renderStatsTab(ov, data, prefetchedStats){
    const panel = ov.querySelector('[data-panel="stats"]');
    if(!panel) return;

    const fixtureId = getFixtureId(data);
    if(!Number.isInteger(fixtureId) || fixtureId <= 0) {
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.empty', 'Sem dados disponíveis')}</div>`;
      return;
    }

    panel.innerHTML = `<div class="mr-v2-stats-loading">${t('match_radar.loading_stats', 'Carregando estatísticas...')}</div>`;

    const bindModeSwitch = (api) => {
      panel.innerHTML = renderStatsV2(api, { mode: 'last5' });
      const root = panel.querySelector('.rt-statsv2');
      if (root) {
        root.addEventListener('click', (e) => {
          const el = e.target.closest('[data-sv2-mode]');
          if (!el) return;
          const mode = el.getAttribute('data-sv2-mode');
          panel.innerHTML = renderStatsV2(api, { mode });
        });
      }

      // Optional progressive enhancement (lazy module).
      loadStatsEnhancer().then((enhance) => {
        if(typeof enhance === 'function' && document.body.contains(panel)) {
          enhance(panel, api);
        }
      }).catch(() => {});
    };

    if(prefetchedStats && hasStatsPayload(prefetchedStats)){
      bindModeSwitch(prefetchedStats);
      return;
    }

    fetchMatchStatsPayload(fixtureId)
      .then(api => {
        if(!hasStatsPayload(api)) throw new Error('api_no_stats');
        bindModeSwitch(api);
      })
      .catch((err) => {
        console.warn('[MR2][stats] api load failed after modal open', {
          fixtureId,
          error: err?.message || String(err)
        });
        panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.empty', 'Sem dados disponíveis')}</div>`;
      });
  }

  function renderStatsTabLegacy(ov, data, reason){
    const panel = ov.querySelector('[data-panel="stats"]');
    if(!panel) return;

    console.log('[MR2][stats][legacy] start', {
      fixtureId: data?.fixture_id || data?.id,
      reason: reason || 'unknown'
    });

    const goalsWindow = data.goals_window || 5;
    const gfHome = data.gf_home;
    const gaHome = data.ga_home;
    const gfAway = data.gf_away;
    const gaAway = data.ga_away;
    const formHomeDetails = Array.isArray(data.form_home_details) ? data.form_home_details : [];
    const formAwayDetails = Array.isArray(data.form_away_details) ? data.form_away_details : [];

    const hasGoalsData = (gfHome != null && gaHome != null && gfAway != null && gaAway != null);
    const allGoalsZero = Number(gfHome || 0) === 0 && Number(gaHome || 0) === 0 && Number(gfAway || 0) === 0 && Number(gaAway || 0) === 0;
    const hasFormData = (formHomeDetails.length > 0 || formAwayDetails.length > 0);

    console.log('[MR2][stats][legacy] data check', {
      fixtureId: data?.fixture_id || data?.id,
      hasGoalsData,
      allGoalsZero,
      formHome: formHomeDetails.length,
      formAway: formAwayDetails.length
    });

    if((!hasGoalsData && !hasFormData) || (allGoalsZero && !hasFormData)) {
      console.warn('[MR2][stats][legacy] no stats available', {
        fixtureId: data?.fixture_id || data?.id,
        reason: reason || 'legacy_no_data'
      });
      panel.innerHTML = `<div class="mr-v2-empty">${t('match_radar.no_stats', 'Estatísticas indisponíveis para este jogo')}</div>`;
      return;
    }

    const homeName = data.home?.name || data.home || '—';
    const awayName = data.away?.name || data.away || '—';
    let html = `<div class="mr-stats-container" style="padding:20px;">`;
    html += `<div style="font-size:0.9em;color:#888;margin-bottom:15px;">`;
    const lastMatches = `${t('match_radar.form_window', `Últimos ${goalsWindow} jogos`).replace('{n}', goalsWindow)}`;
    html += lastMatches !== 'match_radar.form_window' ? lastMatches : `Últimos ${goalsWindow} jogos`;
    html += `</div>`;
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
    html += `</div>`;
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
  window.prefetchMatchRadarV2 = prefetchMatchRadarV2;
  window.renderStatsV2 = renderStatsV2;
  window.ensureMatchRadarMicroBootstrap = ensureMatchRadarMicroBootstrap;

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
const I18N_VERSION = "b0b2f7cc";

function renderComplianceFooter(lang){
  const foot = qs(".footer");
  if(!foot) return;
  const labels = {
    en:{note:"Informational content • We are not a bookmaker • 18+"},
    pt:{note:"Conteúdo informativo • Não somos casa de apostas • +18"},
    es:{note:"Contenido informativo • No somos casa de apuestas • 18+"},
    fr:{note:"Contenu informatif • Pas un bookmaker • 18+"},
    de:{note:"Info-Inhalt • Kein Buchmacher • 18+"}
  }[lang] || {note:"Informational content • We are not a bookmaker • 18+"};

  foot.innerHTML = `
    <div class="foot-wrap">
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
  // /{lang}/radar/day/
  const parts = location.pathname.split("/").filter(Boolean);
  const p = parts.slice(1).join("/");
  if(p.startsWith("radar/day")) return "day";
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
    const isCompSnapshot = /standings_|compstats_/.test(url);
    if(isCompSnapshot) console.log("[loadJSON] Fetching from:", url);
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok){
      if(isCompSnapshot) console.log("[loadJSON] Failed, status:", r.status);
      throw 0;
    }
    const data = await r.json();
    if(isCompSnapshot) console.log("[loadJSON] Success, data keys:", Object.keys(data));
    return data;
  }catch(e){ 
    if(/standings_|compstats_/.test(url)) console.log("[loadJSON] Exception:", e, "url:", url);
    return fallback; 
  }
}

// Prefer Worker API (/api/v1) with automatic fallback to static files (/data/v1).
// This enables real-time live updates without triggering Cloudflare Pages builds.
const V1_API_BASE = "/api/v1";
const V1_STATIC_BASE = "/data/v1";
const RADAR_DAY_ENDPOINT = "/api/v1/radar_day.json";

// Snapshots (calendar + radar) must come from the R2 data worker.
// IMPORTANT: do NOT prefer /api/v1 for these files.
// Debug flag for calendar data loading (set to false in production)
const DEBUG_CAL = false;
const RADAR_DEBUG = false;
window.RADAR_DEBUG = window.RADAR_DEBUG ?? false; // Global guard for inline scripts

// If /api/v1 responds with an older JSON, it will "win" and the UI stays stuck.
const V1_DATA_BASE = "https://radartips-data.m2otta-music.workers.dev/v1";
const SNAPSHOT_FILES = new Set(["radar_day.json","calendar_day.json","manifest.json"]);

// Helper to check if a file is a standings or compstats snapshot (pattern matching)
function isCompetitionSnapshot(filename){
  if(!filename) return false;
  return /^standings_\d+_\d+\.json$/.test(filename) || /^compstats_\d+_\d+\.json$/.test(filename);
}


async function loadV1JSON(file, fallback){
  // For snapshots, prefer R2 data worker first.
  if(SNAPSHOT_FILES.has(file) || isCompetitionSnapshot(file)){
    if (DEBUG_CAL && file === 'radar_day.json') {
      console.warn('[RADAR] Attempting R2 worker:', `${V1_DATA_BASE}/${file}`);
      console.warn('[RADAR] API endpoint (not used for snapshots):', RADAR_DAY_ENDPOINT);
    }
    const data = await loadJSON(`${V1_DATA_BASE}/${file}`, null);
    if(data) {
      if (DEBUG_CAL && file === 'radar_day.json') {
        console.warn('[RADAR] R2 worker responded:', {
          keys: Object.keys(data),
          has_matches: Array.isArray(data.matches),
          matches_count: Array.isArray(data.matches) ? data.matches.length : 'N/A',
          generated_at: data.generated_at_utc || data.timestamp || 'unknown'
        });
      }
      return data;
    }
    // IMPORTANT: For standings_/compstats_ (competitive data), do NOT fallback to /data/v1
    // If R2 returns 404, it likely means the snapshot doesn't exist in production.
    // Attempting /data/v1 may return HTML error page, breaking JSON parsing.
    if(isCompetitionSnapshot(file)) {
      console.log(`[COMPETITION-MANIFEST] Snapshot not found on CDN: ${file} (will not try local fallback)`);
      return fallback;
    }
    if (DEBUG_CAL && file === 'radar_day.json') {
      console.warn('[RADAR] R2 worker failed, trying static fallback:', `${V1_STATIC_BASE}/${file}`);
    }
    return await loadJSON(`${V1_STATIC_BASE}/${file}`, fallback);
  }

  // Default: API first (used for live, etc.), then static fallback.
  const api = await loadJSON(`${V1_API_BASE}/${file}`, null);
  if(api) return api;
  return await loadJSON(`${V1_STATIC_BASE}/${file}`, fallback);
}

let _manifestPromise = null;
let _manifestCacheTime = null;
let _manifestSeasonRules = null;
async function loadV1Manifest(){
  const now = Date.now();
  // Invalidate cache every 5 minutes to get fresh manifest
  if(_manifestPromise && (!_manifestCacheTime || (now - _manifestCacheTime) < 300000)) return _manifestPromise;
  
  console.log("[MANIFEST] Loading manifest.json" + (_manifestCacheTime ? " (cache expired)" : " (first load)"));
  _manifestCacheTime = now;
  
  _manifestPromise = (async () => {
    const manifest = await loadV1JSON("manifest.json", null);
    if(!manifest || !Array.isArray(manifest.entries)){
      console.warn("[MANIFEST] Missing or invalid manifest.json");
      return null;
    }
    console.log("[MANIFEST] Loaded", manifest.entries.length, "entries, generated:", manifest.generated_at_utc);
    if(manifest.season_rules && typeof manifest.season_rules === "object"){
      _manifestSeasonRules = manifest.season_rules;
    }
    return manifest;
  })();
  return _manifestPromise;
}

function findManifestEntry(manifest, leagueId, season){
  if(!manifest || !Array.isArray(manifest.entries)) return null;
  const lid = Number(leagueId);
  const sn = Number(season);
  return manifest.entries.find(e => Number(e.leagueId) === lid && Number(e.season) === sn) || null;
}

function listManifestSeasons(manifest, leagueId){
  if(!manifest || !Array.isArray(manifest.entries)) return [];
  const lid = Number(leagueId);
  if(!Number.isFinite(lid)) return [];
  
  const matches = manifest.entries.filter(e => Number(e.leagueId) === lid);
  
  return matches
    .map(e => Number(e.season))
    .filter(s => Number.isFinite(s));
}

async function resolveLeagueSeasonFromManifest({ leagueId, kickoffUTC, computedSeason }){
  const lid = Number(leagueId);
  if(!Number.isFinite(lid)) return { season: null, foundExact: false, pickedFallback: false };

  const manifest = await loadV1Manifest();
  if(!manifest || !Array.isArray(manifest.entries)) return { season: null, foundExact: false, pickedFallback: false };

  const seasons = listManifestSeasons(manifest, lid);
  if(seasons.length === 0) return { season: null, foundExact: false, pickedFallback: false };

  const computed = Number(computedSeason);
  if(Number.isFinite(computed) && seasons.includes(computed)) return { season: computed, foundExact: true, pickedFallback: false };

  if(kickoffUTC){
    const d = new Date(kickoffUTC);
    if(!isNaN(d.getTime())){
      const year = d.getUTCFullYear();
      const candidates = [year, year - 1, year + 1];
      for(const candidate of candidates){
        if(seasons.includes(candidate)) return { season: candidate, foundExact: false, pickedFallback: false };
      }
    }
  }

  const maxSeason = seasons.reduce((max, value) => (value > max ? value : max), -Infinity);
  if(Number.isFinite(maxSeason)) return { season: maxSeason, foundExact: false, pickedFallback: true };
  return { season: null, foundExact: false, pickedFallback: false };
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
          scoreEl.textContent = "—";
        }
        scoreEl.classList.remove("is-live","is-not-started");
        const isLive = ["1H","2H","HT","ET","BT","P"].includes(st);
        if(isLive) scoreEl.classList.add("is-live");
        else if(["NS","TBD",""].includes(st)) scoreEl.classList.add("is-not-started");
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

function mountOfficialHeaderLogo(){
  const logoRoot = qs(".topbar .logo");
  if(!logoRoot) return;

  logoRoot.innerHTML = `
    <div class="rt-logo" aria-label="RadarTips">
      <svg class="rt-logo-symbol" viewBox="0 0 64 64" role="img" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="rtLogoGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#2F80FF"/>
            <stop offset="100%" stop-color="#56CCF2"/>
          </linearGradient>
        </defs>
        <path d="M16 50V14h18c9 0 14 5 14 13 0 6-3 10-8 12l8 11H39l-7-10h-7v10h-9zm9-18h8c4 0 6-2 6-5s-2-5-6-5h-8v10z" fill="url(#rtLogoGrad)"/>
        <circle cx="42" cy="22" r="2" fill="#56CCF2"/>
        <path d="M34 22a8 8 0 0 1 8-8" fill="none" stroke="#56CCF2" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M30 22a12 12 0 0 1 12-12" fill="none" stroke="#2F80FF" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>
      </svg>
      <span class="rt-logo-wordmark"><span class="rt-logo-radar">Radar</span><span class="rt-logo-tips">Tips</span></span>
    </div>
  `;
}

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
    "italia":"it",
    "england":"gb",
    "united kingdom":"gb",
    "scotland":"gb",
    "wales":"gb",
    "spain":"es",
    "españa":"es",
    "france":"fr",
    "frança":"fr",
    "germany":"de",
    "deutschland":"de",
    "brazil":"br",
    "brasil":"br",
    "argentina":"ar",
    "mexico":"mx",
    "colombia":"co",
    "chile":"cl",
    "uruguay":"uy",
    "paraguay":"py",
    "portugal":"pt",
    "netherlands":"nl",
    "holland":"nl",
    "belgium":"be",
    "switzerland":"ch",
    "austria":"at",
    "turkey":"tr",
    "croatia":"hr",
    "serbia":"rs",
    "poland":"pl",
    "denmark":"dk",
    "sweden":"se",
    "norway":"no",
    "finland":"fi",
    "romania":"ro",
    "czech republic":"cz",
    "slovakia":"sk",
    "slovenia":"si",
    "greece":"gr",
    "ukraine":"ua",
    "russia":"ru",
    "japan":"jp",
    "korea republic":"kr",
    "south korea":"kr",
    "china":"cn",
    "usa":"us",
    "united states":"us",
    "canada":"ca",
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

function isWorldLikeLabel(value){
  const v = normalize(value);
  return v === "world" || v === "mundo" || v === "mundial" || v === "global" || v === "international" || v === "internacional";
}

function flagFallbackIconHTML(kind){
  if(kind === "globe"){
    return `<svg viewBox="0 0 24 24" role="img" aria-label="globe" focusable="false"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" role="img" aria-label="flag" focusable="false"><path d="M6 3v18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M7.5 5h9l-1.8 3 1.8 3h-9z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
}

function countryFlagHTML(countryName, flagUrl){
  const fallbackKind = isWorldLikeLabel(countryName) ? "globe" : "neutral";
  const fallbackCls = fallbackKind === "globe" ? "is-globe" : "is-neutral";
  const fallbackIcon = flagFallbackIconHTML(fallbackKind);

  if(!flagUrl){
    return `<span class="rt-cal-country-flag rt-cal-country-flag-fallback ${fallbackCls}" aria-hidden="true"><span class="rt-cal-country-flag-icon">${fallbackIcon}</span></span>`;
  }
  const alt = escAttr(countryName || "");
  const src = escAttr(flagUrl);
  return `<span class="rt-cal-country-flag ${fallbackCls}" aria-hidden="true"><img class="rt-cal-country-flag-img" src="${src}" alt="${alt}" loading="lazy" onerror="this.onerror=null;this.classList.add('is-hidden');this.parentElement.classList.add('is-missing-flag');" /><span class="rt-cal-country-flag-icon">${fallbackIcon}</span></span>`;
}

function detectCompetitionRegionLabel(competitionName){
  const n = normalize(competitionName);
  if(!n) return "";
  if(n.includes("fifa club world cup") || n.includes("intercontinental")) return "Mundo";
  if(n.includes("uefa")) return "Europa";
  if(n.includes("conmebol")) return "América do Sul";
  if(n.includes("concacaf")) return "América do Norte";
  if(n.includes("afc")) return "Ásia";
  if(n.includes("caf")) return "África";
  return "";
}

function countryDisplayLabel(countryName, competitions){
  const raw = String(countryName || "").trim() || "—";
  if(!isWorldLikeLabel(raw)) return raw;

  const labels = new Set();
  const groups = Array.isArray(competitions) ? competitions : [];
  for(const group of groups){
    const compLabel = detectCompetitionRegionLabel(group?.competition);
    if(compLabel) labels.add(compLabel);
    const ms = Array.isArray(group?.matches) ? group.matches : [];
    for(const m of ms){
      const matchLabel = detectCompetitionRegionLabel(m?.competition);
      if(matchLabel) labels.add(matchLabel);
    }
  }

  if(labels.size === 1) return [...labels][0];
  if(labels.has("Mundo")) return "Mundo";
  return raw === "—" ? raw : "Mundo";
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

function localeCopy(lang){
  const L = String(lang || LANG || "en").toLowerCase();
  const M = {
    en: {
      today: "Today",
      tomorrow: "Tomorrow",
      leagues: "Leagues",
      calendar: "Calendar",
      daySignals: "Signals of the Day",
      openMatchRadar: "Open Match Radar",
      bestUnder: "Best Under",
      balancedMatch: "Most Balanced Match",
      balancedDetail: "Form gap: {value}",
      strongSignalEmpty: "No strong signal available today",
      underStrong: "STRONG UNDER",
      balanced: "BALANCED",
      balancedTip: "Balanced recent scoring form between both teams"
      ,noMatchesToday: "No matches for today"
      ,noMatchesTomorrow: "No matches for tomorrow"
      ,emptyList: "No matches found"
      ,emptyHint: "Try another day or adjust your search"
      ,rankTip: "Radar ranking (highlight order)"
      ,riskTip: "Risk level for this suggestion"
    },
    pt: {
      today: "Hoje",
      tomorrow: "Amanhã",
      leagues: "Ligas",
      calendar: "Calendário",
      daySignals: "Sinais do Dia",
      openMatchRadar: "Abrir Match Radar",
      bestUnder: "Melhor Under",
      balancedMatch: "Jogo Mais Equilibrado",
      balancedDetail: "Diferença de forma: {value}",
      strongSignalEmpty: "Sem sinal forte disponível hoje",
      underStrong: "UNDER FORTE",
      balanced: "EQUILIBRADO",
      balancedTip: "Forma recente equilibrada entre as equipes"
      ,noMatchesToday: "Sem jogos para hoje"
      ,noMatchesTomorrow: "Sem jogos para amanhã"
      ,emptyList: "Nenhum jogo encontrado"
      ,emptyHint: "Tente outro dia ou ajuste a busca"
      ,rankTip: "Ranking do Radar (ordem de destaque)"
      ,riskTip: "Nível de risco da sugestão"
    },
    es: {
      today: "Hoy",
      tomorrow: "Mañana",
      leagues: "Ligas",
      calendar: "Calendario",
      daySignals: "Señales del Día",
      openMatchRadar: "Abrir Match Radar",
      bestUnder: "Mejor Under",
      balancedMatch: "Partido Más Equilibrado",
      balancedDetail: "Diferencia de forma: {value}",
      strongSignalEmpty: "No hay señal fuerte disponible hoy",
      underStrong: "UNDER FUERTE",
      balanced: "EQUILIBRADO",
      balancedTip: "Forma reciente equilibrada entre ambos equipos"
      ,noMatchesToday: "Sin partidos para hoy"
      ,noMatchesTomorrow: "Sin partidos para mañana"
      ,emptyList: "No se encontraron partidos"
      ,emptyHint: "Prueba otro día o ajusta la búsqueda"
      ,rankTip: "Ranking del Radar (orden de destaque)"
      ,riskTip: "Nivel de riesgo de la sugerencia"
    },
    fr: {
      today: "Aujourd'hui",
      tomorrow: "Demain",
      leagues: "Ligues",
      calendar: "Calendrier",
      daySignals: "Signaux du Jour",
      openMatchRadar: "Ouvrir Match Radar",
      bestUnder: "Meilleur Under",
      balancedMatch: "Match le Plus Équilibré",
      balancedDetail: "Écart de forme: {value}",
      strongSignalEmpty: "Aucun signal fort disponible aujourd'hui",
      underStrong: "UNDER FORT",
      balanced: "ÉQUILIBRÉ",
      balancedTip: "Forme récente équilibrée entre les deux équipes"
      ,noMatchesToday: "Aucun match pour aujourd'hui"
      ,noMatchesTomorrow: "Aucun match pour demain"
      ,emptyList: "Aucun match trouvé"
      ,emptyHint: "Essayez un autre jour ou ajustez la recherche"
      ,rankTip: "Classement Radar (ordre de priorité)"
      ,riskTip: "Niveau de risque de cette suggestion"
    },
    de: {
      today: "Heute",
      tomorrow: "Morgen",
      leagues: "Ligen",
      calendar: "Kalender",
      daySignals: "Signale des Tages",
      openMatchRadar: "Match Radar öffnen",
      bestUnder: "Bestes Under",
      balancedMatch: "Ausgeglichenstes Spiel",
      balancedDetail: "Formdifferenz: {value}",
      strongSignalEmpty: "Heute kein starkes Signal verfügbar",
      underStrong: "STARKES UNDER",
      balanced: "AUSGEGLICHEN",
      balancedTip: "Ausgeglichene jüngste Form beider Teams"
      ,noMatchesToday: "Keine Spiele für heute"
      ,noMatchesTomorrow: "Keine Spiele für morgen"
      ,emptyList: "Keine Spiele gefunden"
      ,emptyHint: "Anderen Tag wählen oder Suche anpassen"
      ,rankTip: "Radar-Rangfolge (Prioritätsreihenfolge)"
      ,riskTip: "Risikostufe für diesen Vorschlag"
    }
  };
  return M[L] || M.en;
}

function setNav(lang, t){
  qsa("[data-nav]").forEach(a=>{
    a.remove();
  });

  syncTopNavActiveTab();

  // Language pills get decorated later with flags
  qsa("[data-lang]").forEach(b=>{
    const L=b.getAttribute("data-lang");
    b.classList.toggle("active", L===lang);
  });
}

function syncTopNavActiveTab(){
  const activeTab = CAL_ACTIVE_TAB || "today";
  qsa("[data-nav]").forEach((el) => {
    const key = String(el.getAttribute("data-nav") || "");
    const isActive = (key === "today" && activeTab === "today") || (key === "tomorrow" && activeTab === "tomorrow");
    el.classList.toggle("active", isActive);
  });
}

function bindTopNavActions(){
  qsa("[data-nav]").forEach((el) => {
    if(el.dataset.navBound === "1") return;
    el.dataset.navBound = "1";

    el.addEventListener("click", (e) => {
      const key = String(el.getAttribute("data-nav") || "");
      if(key !== "today" && key !== "tomorrow") return;

      e.preventDefault();
      CAL_ACTIVE_TAB = key;
      syncTopNavActiveTab();
      if(typeof window.__RERENDER_CALENDAR__ === "function") window.__RERENDER_CALENDAR__();

      const target = qs(key === "today" ? "#hero_section" : "#calendar_section");
      if(target && typeof target.scrollIntoView === "function"){
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function ensureHeroDayControls(t){
  const heroHeader = qs(".hero .hero-header");
  if(!heroHeader) return;
  if(qs("#rt_hero_day_tabs")) return;

  const copy = localeCopy(LANG);
  const tabs = document.createElement("div");
  tabs.id = "rt_hero_day_tabs";
  tabs.className = "rt-hero-day-tabs";
  tabs.innerHTML = `
    <button type="button" class="rt-hero-day-tab is-active" data-hero-tab="today" aria-pressed="true">${escAttr(t.tab_today || copy.today)}</button>
    <button type="button" class="rt-hero-day-tab" data-hero-tab="tomorrow" aria-pressed="false">${escAttr(t.tab_tomorrow || copy.tomorrow)}</button>
  `;

  heroHeader.appendChild(tabs);

  tabs.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-hero-tab]");
    if(!btn) return;
    e.preventDefault();
    const next = String(btn.getAttribute("data-hero-tab") || "today");
    if(next !== "today" && next !== "tomorrow") return;
    HERO_ACTIVE_TAB = next;
    if(typeof window.__RERENDER_HERO__ === "function") window.__RERENDER_HERO__();
  });
}

function syncHeroDayControls(t){
  const copy = localeCopy(LANG);
  qsa("#rt_hero_day_tabs [data-hero-tab]").forEach((btn)=>{
    const key = String(btn.getAttribute("data-hero-tab") || "today");
    const isActive = key === (HERO_ACTIVE_TAB || "today");
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    if(key === "today") btn.textContent = t.tab_today || copy.today;
    if(key === "tomorrow") btn.textContent = t.tab_tomorrow || copy.tomorrow;
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

function riskTone(riskRaw){
  const risk = String(riskRaw || "").toLowerCase();
  if(risk.includes("low") || risk.includes("baixo")) return "high";
  if(risk.includes("med") || risk.includes("medio") || risk.includes("médio")) return "medium";
  return "risk";
}

function confidenceFromMatch(item){
  const explicit = Number(
    item?.confidence ?? item?.confidence_pct ?? item?.confidence_score ?? item?.probability ?? item?.prob
  );
  if(Number.isFinite(explicit) && explicit > 0){
    return Math.max(1, Math.min(99, explicit > 1 ? explicit : explicit * 100));
  }
  const tone = riskTone(item?.risk);
  if(tone === "high") return 82;
  if(tone === "medium") return 71;
  return 59;
}

function confidenceHeatLevel(item, opts){
  const confidence = Math.round(confidenceFromMatch(item));
  const risk = riskTone(item?.risk);
  const forceStrong = opts?.forceStrong === true;

  if(forceStrong) return "strong";
  if(confidence >= 78 && risk === "high") return "strong";
  if(confidence >= 68) return "medium";
  return "neutral";
}

function oddFromMatch(item){
  const candidates = [
    item?.odd,
    item?.odds,
    item?.odd_avg,
    item?.avg_odd,
    item?.average_odd,
    item?.market_odds,
    item?.book_odds
  ];
  for(const value of candidates){
    const num = Number(value);
    if(Number.isFinite(num) && num > 1) return num.toFixed(2);
  }
  return null;
}

function matchSignalBadges(item){
  const copy = localeCopy(LANG);
  const badges = [];
  const suggestionRaw = String(item?.suggestion_free || "").toLowerCase();
  const confidence = Math.round(confidenceFromMatch(item));
  const heat = confidenceHeatLevel(item);
  const gfHome = Number(item?.gf_home ?? item?.gfHome ?? null);
  const gfAway = Number(item?.gf_away ?? item?.gfAway ?? null);
  const hasGoals = Number.isFinite(gfHome) && Number.isFinite(gfAway);

  if(/under/.test(suggestionRaw) && confidence >= 70){
    badges.push({ label: copy.underStrong, tone: "under", heat });
  }
  if(hasGoals && Math.abs(gfHome - gfAway) <= 0.8){
    badges.push({ label: copy.balanced, tone: "balanced", heat, tip: copy.balancedTip });
  }

  return badges.slice(0, 2);
}

function signalPriorityScore(type, match){
  if(!match) return -1;
  const confidence = Math.round(confidenceFromMatch(match));
  const gfHome = Number(match?.gf_home ?? match?.gfHome ?? null);
  const gfAway = Number(match?.gf_away ?? match?.gfAway ?? null);
  const hasGoals = Number.isFinite(gfHome) && Number.isFinite(gfAway);

  if(type === "under" || type === "btts") return confidence;
  if(type === "tempo") return hasGoals ? Math.round((gfHome + gfAway) * 20) : -1;
  if(type === "balanced") return hasGoals ? Math.round((1.5 - Math.min(1.5, Math.abs(gfHome - gfAway))) * 60) : -1;
  return -1;
}

function insightFromMatch(item, t){
  const analysis = String(item?.analysis || item?.note || "").trim();
  if(analysis) return analysis;

  const gfHome = Number(item?.gf_home ?? item?.gfHome ?? 0);
  const gfAway = Number(item?.gf_away ?? item?.gfAway ?? 0);
  const gaHome = Number(item?.ga_home ?? item?.gaHome ?? 0);
  const gaAway = Number(item?.ga_away ?? item?.gaAway ?? 0);
  const totalAttack = gfHome + gfAway;
  const totalDefense = gaHome + gaAway;

  if(Number.isFinite(totalAttack) && totalAttack >= 4){
    return t.hero_quick_insight_high_scoring || "Strong recent attacking output from both teams.";
  }
  if(Number.isFinite(totalDefense) && totalDefense <= 2){
    return t.hero_quick_insight_low_concede || "Consistent defensive profile in recent matches.";
  }
  return t.hero_quick_insight_default || "Balanced read for the suggested market.";
}

function ensurePremiumDayScaffold(t){
  ["#rt_metrics_strip", "#rt_quick_insights", "#rt_match_radar_entry"].forEach((sel)=>{
    const node = qs(sel);
    if(node) node.remove();
  });
}

function renderPremiumDayPanels(t, matches, highlights, activeTab){
  const subtitleRaw = activeTab === "tomorrow"
    ? (t.hero_sub_tomorrow || "Leitura prioritária do dia selecionado")
    : (t.hero_sub_day || "Leitura prioritária do dia selecionado");
  const subtitle = String(subtitleRaw).replace(/\s*\([^)]*free[^)]*\)\.?/ig, "").trim();
  setText("hero_sub", subtitle);
}

function renderTop3(t, data){
  const copy = localeCopy(LANG);
  const slots = data.highlights || [];
  const cards = qsa(".card[data-slot]");

  cards.forEach((card, idx)=>{
    const item = slots[idx];
    const badge = card.querySelector(".badge.risk");
    const top = card.querySelector(".badge.top");
    const h3 = card.querySelector("h3");
    const meta = card.querySelector(".meta");
    const lock = card.querySelector(".lock");
    const suggestionEl = card.querySelector(".suggestion-highlight");

    top.className = "badge top rank";
    top.textContent = `#${idx+1}`;
    top.setAttribute("title", t.rank_tooltip || copy.rankTip);
    top.setAttribute("data-tip", t.rank_tooltip || copy.rankTip);

    const tone = riskTone(item?.risk);
    const heatLevel = confidenceHeatLevel(item);
    card.classList.remove("risk-high", "risk-medium", "risk-low", "heat-strong", "heat-medium", "heat-neutral");
    card.classList.add(tone === "high" ? "risk-low" : tone === "medium" ? "risk-medium" : "risk-high");
    card.classList.add(`heat-${heatLevel}`);

    if (badge) {
      badge.style.display = "none";
      badge.textContent = "";
      badge.removeAttribute("title");
      badge.removeAttribute("data-tip");
    }

    if(!item){
      if (badge) {
        badge.style.display = "none";
        badge.textContent = "";
      }
      card.classList.remove("heat-strong", "heat-medium", "heat-neutral");
      h3.textContent = t.empty_slot;
      meta.innerHTML = "";
      if(suggestionEl) suggestionEl.textContent = "—";
      lock.innerHTML = "";
      lock.style.display = "none";
      return;
    }

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

    // Meta (simple text only: competition + kickoff)
    meta.innerHTML = `
      <div class="meta-simple">
        <span class="meta-competition" ${tipAttr(t.competition_tooltip || "")}>${escAttr(competitionDisplay(item.competition, item.country, LANG))}</span>
        <span class="meta-sep">•</span>
        <span class="meta-kickoff" ${tipAttr(t.kickoff_tooltip || "")}>${fmtTime(item.kickoff_utc)}</span>
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
    const confidence = Math.round(confidenceFromMatch(item));
    const odd = oddFromMatch(item);
    const insight = insightFromMatch(item, t);
    if(suggestionEl) suggestionEl.textContent = `PICK: ${suggestion}`;

    lock.innerHTML = `
      <div class="rt-card-kpis">
        ${odd ? `<span><small>${escAttr(t.odd_label || "Odd")}</small><strong>${escAttr(odd)}</strong></span>` : ""}
      </div>
      <div class="rt-card-confidence">
        <div class="rt-card-confidence-head"><small>${escAttr(t.confidence_label || "Confiança")}</small></div>
        <div class="rt-card-confidence-track"><i style="width:${confidence}%"></i></div>
      </div>
      <p class="rt-card-insight">${escAttr(insight)}</p>
    `;
    lock.style.display = "block";
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
    const derived = getSeasonFromKickoffFront(m?.kickoff_utc, m?.country, m?.competition);
    if(Number.isFinite(derived)) season = String(derived);
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


function groupByCountryCompetition(matches){
  const sorted = [...matches].sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
  const byCountry = new Map();

  function localMinuteOfDay(isoUtc){
    try{
      const d = new Date(isoUtc);
      return (d.getHours() * 60) + d.getMinutes();
    }catch(e){
      return Number.MAX_SAFE_INTEGER;
    }
  }

  for (const m of sorted) {
    const country = String(m.country || "—").trim() || "—";
    const comp = String(competitionDisplay(m.competition, m.country, LANG) || "—").trim() || "—";

    if (!byCountry.has(country)) byCountry.set(country, new Map());
    const byComp = byCountry.get(country);
    if (!byComp.has(comp)) byComp.set(comp, []);
    byComp.get(comp).push(m);
  }

  return [...byCountry.entries()]
    .sort((a,b)=> String(a[0]).localeCompare(String(b[0]), undefined, {sensitivity:"base"}))
    .map(([country, compMap])=>({
      country,
      competitions: [...compMap.entries()]
        .sort((a,b)=> String(a[0]).localeCompare(String(b[0]), undefined, {sensitivity:"base"}))
        .map(([competition, ms])=>(
          {
            competition,
            matches: [...ms].sort((a,b)=>{
              const am = localMinuteOfDay(a.kickoff_utc);
              const bm = localMinuteOfDay(b.kickoff_utc);
              if(am !== bm) return am - bm;
              return new Date(a.kickoff_utc)-new Date(b.kickoff_utc);
            })
          }
        ))
    }));
}

let CAL_ACTIVE_COMPETITION_KEY = "";
const CAL_SIDEBAR_EXPANDED_CONTINENTS = new Set();
const CAL_SIDEBAR_EXPANDED_COUNTRIES = new Set();
let CAL_SIDEBAR_INITIALIZED = false;

function normalizeContinentLabel(region){
  if(region === "Europa") return "Europe";
  if(region === "América do Sul") return "South America";
  if(region === "América do Norte") return "North America";
  if(region === "Ásia") return "Asia";
  if(region === "África") return "Africa";
  if(region === "Mundo") return "World";
  return "Other";
}

function detectContinentFromMatch(match){
  const byCompetition = normalizeContinentLabel(detectCompetitionRegionLabel(match?.competition));
  if(byCompetition !== "Other") return byCompetition;

  const country = normalize(match?.country);
  const MAP = {
    "brazil": "South America",
    "argentina": "South America",
    "chile": "South America",
    "uruguay": "South America",
    "paraguay": "South America",
    "colombia": "South America",
    "ecuador": "South America",
    "peru": "South America",
    "bolivia": "South America",
    "venezuela": "South America",
    "england": "Europe",
    "spain": "Europe",
    "italy": "Europe",
    "france": "Europe",
    "germany": "Europe",
    "portugal": "Europe",
    "netherlands": "Europe",
    "belgium": "Europe",
    "turkey": "Europe",
    "russia": "Europe",
    "austria": "Europe",
    "switzerland": "Europe",
    "scotland": "Europe",
    "wales": "Europe",
    "japan": "Asia",
    "china": "Asia",
    "saudi-arabia": "Asia",
    "saudi arabia": "Asia",
    "south korea": "Asia",
    "korea republic": "Asia",
    "qatar": "Asia",
    "australia": "Oceania",
    "new zealand": "Oceania",
    "egypt": "Africa",
    "south africa": "Africa",
    "morocco": "Africa",
    "nigeria": "Africa",
    "usa": "North America",
    "united states": "North America",
    "canada": "North America",
    "mexico": "North America"
  };

  if(MAP[country]) return MAP[country];
  if(isWorldLikeLabel(match?.country)) return "World";
  return "Other";
}

function sidebarCompetitionRef(match){
  const country = String(countryDisplayLabel(match?.country, [{ competition: match?.competition, matches: [match] }]) || "—").trim() || "—";
  const competition = String(competitionDisplay(match?.competition, match?.country, LANG) || "—").trim() || "—";
  const compIdRaw = String(competitionValue(match) || "").trim();
  const compId = compIdRaw !== "" ? compIdRaw : "";
  const key = compId ? `id:${compId}` : `name:${normalize(country)}|${normalize(competition)}`;
  return {
    key,
    id: compId || null,
    country,
    competition,
    countryNorm: normalize(country),
    competitionNorm: normalize(competition)
  };
}

function buildLeagueSidebarModel(matches){
  const byContinent = new Map();
  const competitionIndex = new Map();

  for(const m of (matches || [])){
    const continentName = detectContinentFromMatch(m);
    const compRef = sidebarCompetitionRef(m);

    if(!byContinent.has(continentName)){
      byContinent.set(continentName, { name: continentName, count: 0, countries: new Map() });
    }
    const continentNode = byContinent.get(continentName);
    continentNode.count += 1;

    if(!continentNode.countries.has(compRef.country)){
      continentNode.countries.set(compRef.country, { name: compRef.country, count: 0, competitions: new Map() });
    }
    const countryNode = continentNode.countries.get(compRef.country);
    countryNode.count += 1;

    if(!countryNode.competitions.has(compRef.key)){
      countryNode.competitions.set(compRef.key, { ...compRef, count: 0 });
    }
    countryNode.competitions.get(compRef.key).count += 1;

    if(!competitionIndex.has(compRef.key)){
      competitionIndex.set(compRef.key, { id: compRef.id, countryNorm: compRef.countryNorm, competitionNorm: compRef.competitionNorm });
    }
  }

  const continents = [...byContinent.values()].map((continentNode)=>{
    const countries = [...continentNode.countries.values()].map((countryNode)=>{
      const competitions = [...countryNode.competitions.values()]
        .sort((a,b)=> (Number(b.count) - Number(a.count)) || String(a.competition).localeCompare(String(b.competition), undefined, { sensitivity: "base" }));
      return {
        name: countryNode.name,
        count: countryNode.count,
        competitions
      };
    }).sort((a,b)=> (Number(b.count) - Number(a.count)) || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));

    return {
      name: continentNode.name,
      count: continentNode.count,
      countries
    };
  }).sort((a,b)=> (Number(b.count) - Number(a.count)) || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));

  return {
    continents,
    competitionIndex,
    totalMatches: Number(matches?.length || 0)
  };
}

function ensureSidebarExpansion(model){
  const validContinents = new Set((model?.continents || []).map((c)=> c.name));
  for(const key of [...CAL_SIDEBAR_EXPANDED_CONTINENTS]){
    if(!validContinents.has(key)) CAL_SIDEBAR_EXPANDED_CONTINENTS.delete(key);
  }

  if(!CAL_SIDEBAR_INITIALIZED && CAL_SIDEBAR_EXPANDED_CONTINENTS.size === 0 && model?.continents?.length){
    CAL_SIDEBAR_EXPANDED_CONTINENTS.add(model.continents[0].name);
    CAL_SIDEBAR_INITIALIZED = true;
  }

  const validCountries = new Set();
  for(const continent of (model?.continents || [])){
    for(const country of (continent.countries || [])){
      validCountries.add(`${continent.name}__${country.name}`);
    }
  }
  for(const key of [...CAL_SIDEBAR_EXPANDED_COUNTRIES]){
    if(!validCountries.has(key)) CAL_SIDEBAR_EXPANDED_COUNTRIES.delete(key);
  }
}

function matchesSidebarCompetition(match, selectedRef){
  if(!selectedRef) return true;

  const currentId = String(competitionValue(match) || "").trim();
  if(selectedRef.id && currentId) return currentId === selectedRef.id;

  const compRef = sidebarCompetitionRef(match);
  return compRef.countryNorm === selectedRef.countryNorm && compRef.competitionNorm === selectedRef.competitionNorm;
}

function renderLeagueSidebar(target, model, activeKey, t){
  if(!target) return;

  if(!model?.continents?.length){
    target.innerHTML = `<div class="rt-side-empty">${escAttr(t.empty_list || "Sem jogos para esta seleção")}</div>`;
    return;
  }

  const sections = model.continents.map((continent)=>{
    const continentOpen = CAL_SIDEBAR_EXPANDED_CONTINENTS.has(continent.name);
    const countriesHtml = continent.countries.map((country)=>{
      const countryKey = `${continent.name}__${country.name}`;
      const countryOpen = CAL_SIDEBAR_EXPANDED_COUNTRIES.has(countryKey);
      const competitionsHtml = country.competitions.map((competition)=>{
        const activeCls = competition.key === activeKey ? "is-active" : "";
        return `<button class="rt-side-competition ${activeCls}" type="button" data-side-action="select-competition" data-comp-key="${escAttr(competition.key)}" aria-pressed="${competition.key === activeKey ? "true" : "false"}">${escAttr(competition.competition)} <span class="rt-side-count">(${Number(competition.count)})</span></button>`;
      }).join("");

      return `
        <section class="rt-side-country ${countryOpen ? "is-open" : ""}">
          <button class="rt-side-toggle rt-side-toggle-country" type="button" data-side-action="toggle-country" data-continent="${escAttr(continent.name)}" data-country="${escAttr(country.name)}" aria-expanded="${countryOpen ? "true" : "false"}">
            <span class="rt-side-chevron" aria-hidden="true">▸</span>
            <span class="rt-side-label">${escAttr(country.name)}</span>
            <span class="rt-side-count">(${Number(country.count)})</span>
          </button>
          <div class="rt-side-competitions" ${countryOpen ? "" : "hidden"}>${competitionsHtml}</div>
        </section>
      `;
    }).join("");

    return `
      <section class="rt-side-continent ${continentOpen ? "is-open" : ""}">
        <button class="rt-side-toggle rt-side-toggle-continent" type="button" data-side-action="toggle-continent" data-continent="${escAttr(continent.name)}" aria-expanded="${continentOpen ? "true" : "false"}">
          <span class="rt-side-chevron" aria-hidden="true">▸</span>
          <span class="rt-side-label">${escAttr(continent.name)}</span>
          <span class="rt-side-count">(${Number(continent.count)})</span>
        </button>
        <div class="rt-side-countries" ${continentOpen ? "" : "hidden"}>${countriesHtml}</div>
      </section>
    `;
  }).join("");

  const clearButton = activeKey
    ? `<button class="rt-side-clear" type="button" data-side-action="clear-competition">${escAttr((t.clear_filters || "Limpar filtro"))}</button>`
    : "";

  target.innerHTML = `
    <div class="rt-side-shell">
      <div class="rt-side-head">
        <h3>${escAttr(t.leagues_label || "Ligas")}</h3>
        <span class="rt-side-total">${Number(model.totalMatches)}</span>
      </div>
      ${clearButton}
      <div class="rt-side-tree">${sections}</div>
    </div>
  `;
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


function renderCalendar(t, todayMatches, tomorrowMatches, meta, viewMode, query, activeTabType){
  console.log('📅 renderCalendar called:');
  console.log('   Today:', todayMatches.length, 'matches');
  console.log('   Tomorrow:', tomorrowMatches.length, 'matches');
  console.log('   First today:', todayMatches[0] ? `${todayMatches[0].home} vs ${todayMatches[0].away}` : 'none');
  
  const root = qs("#calendar");
  const copy = localeCopy(LANG);
  if(!root) return;
  root.classList.add("rt-cal-root");
  root.innerHTML = "";

  if(!root.__rtCountryDelegationBound){
    root.__rtCountryDelegationBound = true;
    root.addEventListener("click", (e)=>{
      const toggle = e.target.closest(".rt-cal-country-toggle");
      if(toggle && root.contains(toggle)){
        e.preventDefault();
        const accordion = toggle.closest(".rt-cal-country-accordion");
        const body = accordion ? accordion.querySelector(".rt-cal-country-body") : null;
        if(!body) return;

        const nextCollapsed = !body.classList.contains("is-collapsed");
        body.classList.toggle("is-collapsed", nextCollapsed);
        toggle.classList.toggle("is-open", !nextCollapsed);
        toggle.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");

        const countryName = String(toggle.getAttribute("data-country") || "");
        if(countryName) setCountryCollapsed(countryName, nextCollapsed);
        return;
      }
    });
  }

  if(!root.__rtSidebarDelegationBound){
    root.__rtSidebarDelegationBound = true;
    root.addEventListener("click", (e)=>{
      const actionNode = e.target.closest("[data-side-action]");
      if(!actionNode || !root.contains(actionNode)) return;

      const action = String(actionNode.getAttribute("data-side-action") || "");
      if(!action) return;
      e.preventDefault();

      if(action === "toggle-continent"){
        const continent = String(actionNode.getAttribute("data-continent") || "");
        if(!continent) return;
        if(CAL_SIDEBAR_EXPANDED_CONTINENTS.has(continent)){
          CAL_SIDEBAR_EXPANDED_CONTINENTS.delete(continent);
        }else{
          CAL_SIDEBAR_EXPANDED_CONTINENTS.add(continent);
        }
      }else if(action === "toggle-country"){
        const continent = String(actionNode.getAttribute("data-continent") || "");
        const country = String(actionNode.getAttribute("data-country") || "");
        const key = `${continent}__${country}`;
        if(!continent || !country) return;
        if(CAL_SIDEBAR_EXPANDED_COUNTRIES.has(key)){
          CAL_SIDEBAR_EXPANDED_COUNTRIES.delete(key);
        }else{
          CAL_SIDEBAR_EXPANDED_COUNTRIES.add(key);
          CAL_SIDEBAR_EXPANDED_CONTINENTS.add(continent);
        }
      }else if(action === "select-competition"){
        const key = String(actionNode.getAttribute("data-comp-key") || "");
        if(!key) return;
        CAL_ACTIVE_COMPETITION_KEY = CAL_ACTIVE_COMPETITION_KEY === key ? "" : key;
      }else if(action === "clear-competition"){
        CAL_ACTIVE_COMPETITION_KEY = "";
      }else{
        return;
      }

      if(typeof window.__RERENDER_CALENDAR__ === "function"){
        window.__RERENDER_CALENDAR__();
      }
    });
  }

  const q = normalize(query);

  // Determine active tab (default to "today" if both have matches, else to whichever has matches)
  let active = CAL_ACTIVE_TAB || activeTabType || "today";
  if(todayMatches.length === 0 && tomorrowMatches.length > 0) active = "tomorrow";
  if(tomorrowMatches.length === 0 && todayMatches.length > 0) active = "today";

  // Get matches for the active tab
  const matchesForTab = active === "today" ? todayMatches : tomorrowMatches;

  const baseFiltered = (matchesForTab || []).filter(m=>{
    if(!q) return true;
    const blob = `${m.country} ${m.competition} ${m.home} ${m.away}`.toLowerCase();
    return blob.includes(q);
  });

  const sidebarModel = buildLeagueSidebarModel(baseFiltered);
  ensureSidebarExpansion(sidebarModel);

  if(CAL_ACTIVE_COMPETITION_KEY && !sidebarModel.competitionIndex.has(CAL_ACTIVE_COMPETITION_KEY)){
    CAL_ACTIVE_COMPETITION_KEY = "";
  }

  const activeCompetitionRef = CAL_ACTIVE_COMPETITION_KEY
    ? sidebarModel.competitionIndex.get(CAL_ACTIVE_COMPETITION_KEY)
    : null;

  const filtered = activeCompetitionRef
    ? baseFiltered.filter((m)=> matchesSidebarCompetition(m, activeCompetitionRef))
    : baseFiltered;

  // Format date labels (DD/MM)
  const localeByLang = { pt: "pt-BR", en: "en-GB", es: "es-ES", fr: "fr-FR", de: "de-DE" };
  const dateLocale = localeByLang[LANG] || "en-GB";
  function formatTabDate(offset, baseDate = meta?.today_key || meta?.today || new Date()) {
    const parts = typeof baseDate === 'string' ? baseDate.split('-') : [];
    if (parts.length === 3) {
      // baseDate is in YYYY-MM-DD format from Worker
      const [year, month, day] = parts;
      const d = new Date(year, Number(month) - 1, Number(day));
      if (offset === 1) d.setDate(d.getDate() + 1);
      return new Intl.DateTimeFormat(dateLocale, {day:"2-digit", month:"2-digit"}).format(d);
    } else {
      // Fallback to local calculation
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return new Intl.DateTimeFormat(dateLocale, {day:"2-digit", month:"2-digit"}).format(d);
    }
  }

  const todayLabel = t.tab_today || copy.today;
  const tomorrowLabel = t.tab_tomorrow || copy.tomorrow;
  const todayDate = formatTabDate(0);
  const tomorrowDate = formatTabDate(1);

  // Create tab header
  const header = document.createElement("div");
  header.className = "rt-cal-tabs-header";

  // Tab styling
  const makeTabButton = (label, date, type, isActive, count) => {
    const btn = document.createElement("button");
    btn.className = `rt-cal-tab ${isActive ? "rt-cal-tab-active is-active" : ""}`;
    btn.setAttribute("data-cal-tab", type);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    const countSuffix = Number.isFinite(Number(count)) ? ` (${Number(count)})` : "";
    btn.innerHTML = `
      <div class="rt-cal-tab-inner">
        <span class="rt-cal-tab-label">${escAttr(`${label} ${date}${countSuffix}`)}</span>
      </div>
    `;

    return btn;
  };

  header.appendChild(makeTabButton(todayLabel, todayDate, "today", active === "today", todayMatches.length));
  header.appendChild(makeTabButton(tomorrowLabel, tomorrowDate, "tomorrow", active === "tomorrow", tomorrowMatches.length));

  root.appendChild(header);

  const mainGrid = document.createElement("div");
  mainGrid.className = "rt-day-main-grid";
  root.appendChild(mainGrid);

  const sidebarColumn = document.createElement("aside");
  sidebarColumn.className = "rt-day-sidebar";
  mainGrid.appendChild(sidebarColumn);

  const listColumn = document.createElement("div");
  listColumn.className = "rt-day-main-list";
  mainGrid.appendChild(listColumn);

  const signalsColumn = document.createElement("aside");
  signalsColumn.className = "rt-day-signals";
  mainGrid.appendChild(signalsColumn);

  renderLeagueSidebar(sidebarColumn, sidebarModel, CAL_ACTIVE_COMPETITION_KEY, t);

  const signalCard = (label, match, valueBuilder, type)=>{
    if(!match) return "";
    const fixtureId = match?.fixture_id ?? match?.fixtureId ?? match?.id ?? "";
    const matchup = `${String(match?.home || "--")} vs ${String(match?.away || "--")}`;
    const detail = valueBuilder(match);
    if(!detail) return "";
    const heat = confidenceHeatLevel(match);
    return {
      type,
      score: signalPriorityScore(type, match),
      heat,
      html: `
        <article class="rt-day-signal-item heat-${escAttr(heat)}" ${fixtureId ? `data-fixture-id="${escAttr(String(fixtureId))}"` : ""} data-sugg="${escAttr(String(match?.suggestion_free || ""))}">
          <p class="kicker">${escAttr(label)}</p>
          <h4>${escAttr(matchup)}</h4>
          <p>${escAttr(detail)}</p>
        </article>
      `
    };
  };

  const signalPool = filtered;
  const bySuggestion = (rx)=> (signalPool || []).find((m)=> rx.test(String(m?.suggestion_free || "")));
  const bestUnder = bySuggestion(/under/i);
  const mostBalanced = (signalPool || [])
    .filter((m)=> Number.isFinite(Number(m?.gf_home ?? null)) && Number.isFinite(Number(m?.gf_away ?? null)))
    .sort((a,b)=> Math.abs(Number(a?.gf_home ?? 0) - Number(a?.gf_away ?? 0)) - Math.abs(Number(b?.gf_home ?? 0) - Number(b?.gf_away ?? 0)))[0];

  const signalsItems = [
    signalCard(copy.bestUnder, bestUnder, (m)=> {
      const c = Math.round(confidenceFromMatch(m));
      if(c < 70) return "";
      return localizeMarket(m?.suggestion_free, t) || "";
    }, "under"),
    signalCard(copy.balancedMatch, mostBalanced, (m)=> {
      const diff = Math.abs(Number(m?.gf_home ?? 0) - Number(m?.gf_away ?? 0));
      if(!Number.isFinite(diff) || diff > 0.8) return "";
      return copy.balancedDetail.replace("{value}", diff.toFixed(1));
    }, "balanced")
  ].filter(Boolean);

  const signalsSorted = signalsItems
    .sort((a,b)=> Number(b?.score ?? -1) - Number(a?.score ?? -1));
  const strongestType = signalsSorted[0]?.type || null;

  const signalsHtml = signalsSorted.map((item)=> {
    if(!item?.html) return "";
    if(item.type && item.type === strongestType){
      return item.html
        .replace("rt-day-signal-item ", "rt-day-signal-item is-priority ")
        .replace("heat-neutral", "heat-medium");
    }
    return item.html;
  }).filter(Boolean);

  signalsColumn.innerHTML = `
    <div class="rt-day-signals-head"><h3>${escAttr(t.day_signals_title || copy.daySignals)}</h3></div>
    ${signalsHtml.length ? `<div class="rt-day-signals-list">${signalsHtml.join("")}</div>` : ""}
  `;

  if(!signalsHtml.length){
    signalsColumn.innerHTML += `<p class="rt-day-signals-empty">${escAttr(copy.strongSignalEmpty)}</p>`;
  }

  // Render content based on selected tab
  if(!filtered.length){
    const hasAnyMatches = matchesForTab.length > 0;
    
    let title, subtitle;
    if (!hasAnyMatches) {
      // No matches for this tab
      title = active === "today" 
        ? (t.no_matches_today || copy.noMatchesToday)
        : (t.no_matches_tomorrow || copy.noMatchesTomorrow);
      subtitle = t.calendar_empty_hint || copy.emptyHint;
    } else {
      // Matches exist but search filtered to zero
      title = t.empty_list || copy.emptyList;
      subtitle = t.calendar_empty_hint || copy.emptyHint;
    }
    
    listColumn.innerHTML = `
      <div class="rt-cal-empty-state">
        <div class="rt-cal-empty-title">${escAttr(title)}</div>
        <div class="rt-cal-empty-sub">${escAttr(subtitle)}</div>
      </div>
    `;
    return;
  }

  function renderMatchRow(m){
    const homeName = String(m?.home?.name || m?.home_team || m?.home_team_name || m?.home || "");
    const awayName = String(m?.away?.name || m?.away_team || m?.away_team_name || m?.away || "");

    const row = document.createElement("div");
    row.className = "rt-match-card rt-cal-match";
    row.setAttribute("role","button");
    row.setAttribute("tabindex","0");
    const radarLabel = t.match_radar || "Match Radar";
    const matchLabel = `${radarLabel}: ${homeName} vs ${awayName}`;
    row.setAttribute("aria-label", matchLabel);
    row.setAttribute("title", matchLabel);
    row.setAttribute("data-tip", matchLabel);

    // Live bindings
    const _fxId = m.fixture_id ?? m.fixtureId ?? m.id ?? m.fixture ?? null;
    const fixtureId = (_fxId !== null && _fxId !== undefined && String(_fxId).trim() !== "") ? String(_fxId) : "";
    if(fixtureId){
      row.setAttribute("data-fixture-id", fixtureId);
    }
    row.setAttribute("data-sugg", String(m.suggestion_free || ""));

    const homeLogo = pickTeamLogo(m, "home");
    const awayLogo = pickTeamLogo(m, "away");

    const goalHomeRaw = m?.goals?.home ?? m?.goals_home ?? m?.goalsHome ?? m?.home?.score ?? null;
    const goalAwayRaw = m?.goals?.away ?? m?.goals_away ?? m?.goalsAway ?? m?.away?.score ?? null;
    const hasScore = goalHomeRaw !== null && goalHomeRaw !== undefined && goalAwayRaw !== null && goalAwayRaw !== undefined;
    const scoreText = hasScore ? `${goalHomeRaw} - ${goalAwayRaw}` : "—";
    const statusShort = String(m?.status_short || m?.status?.short || "").toUpperCase();
    const isNotStarted = !statusShort || ["NS","TBD"].includes(statusShort);
    const isLive = ["1H","2H","HT","ET","BT","P"].includes(statusShort);
    const scoreClass = `rt-match-score${isNotStarted ? " is-not-started" : ""}${isLive ? " is-live" : ""}`;

    const market = localizeMarket(m.suggestion_free, t) || "—";
    const moreTitle = `${copy.openMatchRadar}: ${homeName} vs ${awayName}`;
    const moreAttrs = fixtureId
      ? `data-fixture-id="${escAttr(fixtureId)}" data-sugg="${escAttr(String(m.suggestion_free || ""))}"`
      : `disabled aria-disabled="true"`;

    const summary = insightFromMatch(m, t);
    const badges = matchSignalBadges(m);
    const badgesHtml = badges.length
      ? `<div class="rt-cal-signal-badges">${badges.map((b)=> `<span class="rt-cal-signal-badge tone-${escAttr(b.tone)} heat-${escAttr(b.heat || "neutral")}" ${b.tip ? tipAttr(b.tip) : ""}>${escAttr(b.label)}</span>`).join("")}</div>`
      : "";

    row.innerHTML = `
      <div class="rt-cal-when" ${tipAttr(t.kickoff_tooltip || "")}>
        <div class="rt-cal-time">${fmtTime(m.kickoff_utc)}</div>
        <div class="${scoreClass} rt-cal-score" data-score>${escAttr(scoreText)}</div>
      </div>
      <div class="rt-cal-teams">
        <div class="rt-cal-teamrow rt-team-home">${crestHTML(homeName, homeLogo)}<span class="name">${escAttr(homeName)}</span></div>
        <div class="rt-cal-teamrow rt-team-away">${crestHTML(awayName, awayLogo)}<span class="name">${escAttr(awayName)}</span></div>
        ${badgesHtml}
        <p class="rt-cal-brief">${escAttr(summary)}</p>
      </div>
      <div class="rt-cal-actions">
        <div class="rt-match-market rt-cal-market" ${tipAttr(t.suggestion_tooltip || "")}><span class="rt-match-suggestion">${escAttr(market)}</span></div>
        <button class="rt-match-more-btn rt-cal-more" type="button" title="${escAttr(moreTitle)}" aria-label="${escAttr(moreTitle)}" ${moreAttrs}>${escAttr(copy.openMatchRadar)}</button>
      </div>
    `;

    if(fixtureId){
      row.setAttribute("data-fixture-id", fixtureId);
      row.setAttribute("data-sugg", String(m.suggestion_free || ""));
      row.querySelector(".rt-match-market")?.setAttribute("data-fixture-id", fixtureId);
      row.querySelector(".rt-match-market")?.setAttribute("data-sugg", String(m.suggestion_free || ""));
      row.querySelector(".rt-match-score")?.setAttribute("data-fixture-id", fixtureId);
      row.querySelector(".rt-match-score")?.setAttribute("data-sugg", String(m.suggestion_free || ""));
      row.querySelector(".rt-team-home")?.setAttribute("data-fixture-id", fixtureId);
      row.querySelector(".rt-team-home")?.setAttribute("data-sugg", String(m.suggestion_free || ""));
      row.querySelector(".rt-team-away")?.setAttribute("data-fixture-id", fixtureId);
      row.querySelector(".rt-team-away")?.setAttribute("data-sugg", String(m.suggestion_free || ""));
    }

    return row;
  }

  const countryGroups = groupByCountryCompetition(filtered);
  const currentCollapsed = _loadCollapse();
  const collapsedSet = new Set(Array.isArray(currentCollapsed.country) ? currentCollapsed.country : []);
  const hasStoredState = collapsedSet.size > 0;

  if(!hasStoredState && countryGroups.length > 1){
    for(let i = 1; i < countryGroups.length; i++){
      collapsedSet.add(String(countryGroups[i].country || ""));
    }
    _saveCollapse({
      ...currentCollapsed,
      country: [...collapsedSet]
    });
  }

  for (const cg of countryGroups) {
    const countryBox = document.createElement("div");
    countryBox.className = "rt-cal-country-accordion";
    const countryName = String(cg.country || "—");
    const displayCountryName = countryDisplayLabel(countryName, cg.competitions);
    const totalMatches = cg.competitions.reduce((acc, comp)=> acc + (Array.isArray(comp.matches) ? comp.matches.length : 0), 0);
    const isCollapsed = collapsedSet.has(countryName);
    countryBox.classList.toggle("rt-cal-country-collapsed", isCollapsed);

    const countryFlag = pickCountryFlag({ country: displayCountryName }) || "";
    const countryFlagHtml = countryFlagHTML(displayCountryName, countryFlag);

    countryBox.innerHTML = `
      <div class="rt-cal-country-head">
        <button class="rt-cal-country-toggle ${isCollapsed ? "" : "is-open"}" data-country="${escAttr(countryName)}" type="button" aria-expanded="${isCollapsed ? "false" : "true"}" aria-label="${escAttr(countryName)}">
          <div class="rt-cal-country-title">${countryFlagHtml}<span class="rt-cal-country-label">${escAttr(displayCountryName)} (${totalMatches})</span></div>
          <span class="rt-cal-country-chevron" aria-hidden="true">▾</span>
        </button>
      </div>
      <div class="rt-cal-country-body rt-cal-competition-groups ${isCollapsed ? "is-collapsed" : ""}" data-country-body="${escAttr(countryName)}"></div>
    `;

    const subgroups = countryBox.querySelector(".rt-cal-competition-groups");

    cg.competitions.forEach((compGroup) => {
      const compBox = document.createElement("div");
      compBox.className = "rt-cal-competition-group";
      compBox.innerHTML = `
        <div class="rt-cal-competition-head">
          <div class="rt-cal-competition-title"><span class="rt-cal-competition-label">${escAttr(compGroup.competition)}</span></div>
        </div>
        <div class="rt-cal-match-list"></div>
      `;

      const list = compBox.querySelector(".rt-cal-match-list");
      compGroup.matches.forEach((m) => list.appendChild(renderMatchRow(m)));

      subgroups.appendChild(compBox);
    });

    listColumn.appendChild(countryBox);
  }
}

let T = null;
let LANG = null;
let CAL_MATCHES = [];
let CAL_META = { form_window: 5, goals_window: 5 };
let CAL_ACTIVE_TAB = "today";
let HERO_ACTIVE_TAB = "today";
let CAL_DATA = { today: [], tomorrow: [] };
let DEBUG_CALENDAR = false;

function setupCalendarTabDelegation(){
  if(window.__CAL_TAB_DELEGATION_BOUND__) return;
  window.__CAL_TAB_DELEGATION_BOUND__ = true;
  
  document.addEventListener("click", (e)=>{
    const tabBtn = e.target.closest("[data-cal-tab]");
    if(!tabBtn) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const newTab = String(tabBtn.getAttribute("data-cal-tab") || "today");
    if(DEBUG_CALENDAR) console.log("[calendar] tab click ->", newTab, "today:", CAL_DATA.today?.length, "tomorrow:", CAL_DATA.tomorrow?.length);
    
    CAL_ACTIVE_TAB = newTab;
    syncTopNavActiveTab();
    if(typeof window.__RERENDER_CALENDAR__ === "function"){
      window.__RERENDER_CALENDAR__();
    }
  }, true);
}
let RADAR_DAY_DATA = null;

// Caches para single-source-of-truth architecture
window.__RADAR_DAY_CACHE = { data: null, loadedAt: 0 };
window.__DAILY_MATCHES_CACHE = { data: null, loadedAt: 0 };
window.__CALENDAR_2D_CACHE = { data: null, loadedAt: 0 };

async function loadRadarDay() {
  const radar = await loadV1JSON('radar_day.json', { highlights: [] });
  console.log('📡 loadRadarDay() returned:', {
    highlights_count: Array.isArray(radar?.highlights) ? radar.highlights.length : 0,
    matches_count: Array.isArray(radar?.matches) ? radar.matches.length : 0,
    raw_highlights: radar?.highlights?.slice(0, 3).map(h => h.home + ' vs ' + h.away) || []
  });
  RADAR_DAY_DATA = radar;
  return radar;
}

async function loadDailyMatches() {
  const cache = window.__DAILY_MATCHES_CACHE;
  const now = Date.now();
  if (cache.data && (now - cache.loadedAt) < 300000) return cache.data;

  const daily = await loadV1JSON('calendar_day.json', { matches: [] });
  const matches = Array.isArray(daily?.matches) ? daily.matches : [];
  cache.data = { matches, meta: daily };
  cache.loadedAt = now;
  return cache.data;
}

async function getRadarDay() {
  const cache = window.__RADAR_DAY_CACHE;
  const now = Date.now();
  if (cache.data && (now - cache.loadedAt) < 300000) return cache.data;

  try {
    const data = await loadV1JSON('radar_day.json', null);
    if (data) {
      cache.data = data;
      cache.loadedAt = now;
      return data;
    }
  } catch (e) {}
  return cache.data;
}

// Load calendar separated by today/tomorrow from Worker (timezone-aware)
async function loadCalendar2D() {
  const cache = window.__CALENDAR_2D_CACHE;
  const now = Date.now();
  const ttl = 60000; // 60 seconds
  if (cache.data && (now - cache.loadedAt) < ttl) return cache.data;

  const emptyFallback = (tz) => ({
    meta: { timezone: 'America/Bahia', source: 'fallback_unavailable', today_key: null, tomorrow_key: null, available_day_keys: [] },
    days: {},
    today: [],
    tomorrow: []
  });

  try {
    const tz = 'America/Bahia';
    const url = `/api/v1/calendar_2d?ts=${Date.now()}`;
    let response = await fetch(url, { cache: 'no-store' });

    if (!response.ok && response.status === 400) {
      console.warn('loadCalendar2D validation error, retrying default timezone', { tz, status: response.status });
      const fallbackUrl = `/api/v1/calendar_2d?tz=${encodeURIComponent('America/Sao_Paulo')}&ts=${Date.now()}`;
      response = await fetch(fallbackUrl, { cache: 'no-store' });
    }

    if (!response.ok) {
      console.warn('loadCalendar2D failed:', response.status, response.statusText);
      const fallback = emptyFallback(tz);
      cache.data = fallback;
      cache.loadedAt = now;
      return fallback;
    }

    const data = await response.json();
    if (!Array.isArray(data?.today) || !Array.isArray(data?.tomorrow)) {
      console.warn('loadCalendar2D invalid payload shape, using empty fallback');
      const fallback = emptyFallback(tz);
      cache.data = fallback;
      cache.loadedAt = now;
      return fallback;
    }

    cache.data = data;
    cache.loadedAt = now;
    return data;
  } catch (e) {
    console.error('loadCalendar2D error:', e.message);
    const fallback = emptyFallback('America/Sao_Paulo');
    cache.data = fallback;
    cache.loadedAt = now;
    return fallback;
  }
}

function getCalendarMetaDayKey(cal2d, tabType) {
  const meta = cal2d?.meta || {};
  if (tabType === 'tomorrow') {
    return String(meta.tomorrow_key || meta.tomorrow || '');
  }
  return String(meta.today_key || meta.today || '');
}

function getCalendarBucketForTab(cal2d, tabType) {
  const dayKey = getCalendarMetaDayKey(cal2d, tabType);
  const fromDays = cal2d?.days && dayKey && cal2d.days[dayKey] && Array.isArray(cal2d.days[dayKey].matches)
    ? cal2d.days[dayKey].matches
    : null;
  if (Array.isArray(fromDays)) return fromDays;
  return tabType === 'tomorrow'
    ? (Array.isArray(cal2d?.tomorrow) ? cal2d.tomorrow : [])
    : (Array.isArray(cal2d?.today) ? cal2d.today : []);
}

function getRadarTop3ForTab(cal2d, tabType, radarFallback) {
  const dayKey = getCalendarMetaDayKey(cal2d, tabType);
  const bucket = cal2d?.days && dayKey ? cal2d.days[dayKey] : null;
  if (Array.isArray(bucket?.radar_top3) && bucket.radar_top3.length) {
    return bucket.radar_top3;
  }
  const matches = getCalendarBucketForTab(cal2d, tabType);
  if (matches.length) return matches.slice(0, 3);
  if (Array.isArray(radarFallback?.highlights)) return radarFallback.highlights.slice(0, 3);
  return [];
}

function flattenCalendarMatches(cal2d) {
  const out = [];
  const days = cal2d?.days && typeof cal2d.days === 'object' ? cal2d.days : null;
  if (days) {
    for (const day of Object.values(days)) {
      if (Array.isArray(day?.matches)) out.push(...day.matches);
    }
  }
  if (!out.length) {
    out.push(...(Array.isArray(cal2d?.today) ? cal2d.today : []));
    out.push(...(Array.isArray(cal2d?.tomorrow) ? cal2d.tomorrow : []));
  }
  return out;
}

// Resolver match APENAS do radar_day
async function resolveMatchByFixtureId(fixtureId) {
  if (!fixtureId) return null;
  const fid = Number(fixtureId);
  if (isNaN(fid)) return null;
  
  const found = CAL_MATCHES.find(m => {
    const candidates = [m?.fixture_id, m?.fixtureId, m?.id, m?.fixture?.id];
    return candidates.some(c => c != null && Number(c) === fid);
  });
  if (found) return found;
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
  
  // 1) Search in Radar Day data (CAL_MATCHES)
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
  
  return null;
}

function computeCompetitionAggregates(matches){
  if(!matches || matches.length === 0){
    return {
      matchesCount: 0,
      teamsCount: 0,
      goalsTotal: 0,
      goalsAvg: 0,
      bttsRate: 0,
      over25Rate: 0,
      possessionAvg: 0,
      shotsAvg: 0,
      shotsOnTargetAvg: 0,
      cornersAvg: 0,
      cardsAvg: 0,
      xgAvg: 0
    };
  }

  const agg = {
    matchesCount: matches.length,
    teamsCount: 0,
    goalsTotal: 0,
    goalsAvg: 0,
    bttsCount: 0,
    bttsRate: 0,
    over25Count: 0,
    over25Rate: 0,
    possessionSum: 0,
    possessionCount: 0,
    possessionAvg: 0,
    shotsSum: 0,
    shotsCount: 0,
    shotsAvg: 0,
    shotsOnTargetSum: 0,
    shotOnTargetCount: 0,
    shotsOnTargetAvg: 0,
    cornersSum: 0,
    cornersCount: 0,
    cornersAvg: 0,
    cardsSum: 0,
    cardsCount: 0,
    cardsAvg: 0,
    xgSum: 0,
    xgCount: 0,
    xgAvg: 0
  };

  const teams = new Set();
  let matchesWithScore = 0;

  matches.forEach(m => {
    // Teams
    if(m.home) teams.add(String(m.home).trim().toLowerCase());
    if(m.away) teams.add(String(m.away).trim().toLowerCase());

    // Goals
    const goalHome = m.goals_home ?? m.goalsHome ?? null;
    const goalAway = m.goals_away ?? m.goalsAway ?? null;
    if(goalHome !== null && goalAway !== null){
      if(!isNaN(goalHome) && !isNaN(goalAway)){
        agg.goalsTotal += Number(goalHome) + Number(goalAway);
        matchesWithScore++;
        
        // BTTS
        if(goalHome > 0 && goalAway > 0) agg.bttsCount++;
        // Over 2.5
        if(Number(goalHome) + Number(goalAway) > 2.5) agg.over25Count++;
      }
    }

    // Possession
    const posHome = m.stats?.home?.possession ?? m.possession_home ?? null;
    const posAway = m.stats?.away?.possession ?? m.possession_away ?? null;
    if(posHome !== null && !isNaN(posHome)){
      agg.possessionSum += Number(posHome);
      agg.possessionCount++;
    }
    if(posAway !== null && !isNaN(posAway)){
      agg.possessionSum += Number(posAway);
      agg.possessionCount++;
    }

    // Shots
    const shotsHome = m.stats?.home?.shots ?? m.shots_home ?? null;
    const shotsAway = m.stats?.away?.shots ?? m.shots_away ?? null;
    if(shotsHome !== null && !isNaN(shotsHome)){
      agg.shotsSum += Number(shotsHome);
      agg.shotsCount++;
    }
    if(shotsAway !== null && !isNaN(shotsAway)){
      agg.shotsSum += Number(shotsAway);
      agg.shotsCount++;
    }

    // Shots on Target
    const sotHome = m.stats?.home?.shots_on_target ?? m.shots_on_target_home ?? null;
    const sotAway = m.stats?.away?.shots_on_target ?? m.shots_on_target_away ?? null;
    if(sotHome !== null && !isNaN(sotHome)){
      agg.shotsOnTargetSum += Number(sotHome);
      agg.shotOnTargetCount++;
    }
    if(sotAway !== null && !isNaN(sotAway)){
      agg.shotsOnTargetSum += Number(sotAway);
      agg.shotOnTargetCount++;
    }

    // Corners
    const cornHome = m.stats?.home?.corners ?? m.corners_home ?? null;
    const cornAway = m.stats?.away?.corners ?? m.corners_away ?? null;
    if(cornHome !== null && !isNaN(cornHome)){
      agg.cornersSum += Number(cornHome);
      agg.cornersCount++;
    }
    if(cornAway !== null && !isNaN(cornAway)){
      agg.cornersSum += Number(cornAway);
      agg.cornersCount++;
    }

    // Cards
    const cardsHome = m.stats?.home?.yellow_cards ?? m.yellow_cards_home ?? null;
    const cardsAway = m.stats?.away?.yellow_cards ?? m.yellow_cards_away ?? null;
    if(cardsHome !== null && !isNaN(cardsHome)){
      agg.cardsSum += Number(cardsHome);
      agg.cardsCount++;
    }
    if(cardsAway !== null && !isNaN(cardsAway)){
      agg.cardsSum += Number(cardsAway);
      agg.cardsCount++;
    }

    // xG
    const xgHome = m.stats?.home?.xg ?? m.xg_home ?? null;
    const xgAway = m.stats?.away?.xg ?? m.xg_away ?? null;
    if(xgHome !== null && !isNaN(xgHome)){
      agg.xgSum += Number(xgHome);
      agg.xgCount++;
    }
    if(xgAway !== null && !isNaN(xgAway)){
      agg.xgSum += Number(xgAway);
      agg.xgCount++;
    }
  });

  // Compute averages
  agg.teamsCount = teams.size;
  if(matchesWithScore > 0){
    agg.goalsAvg = agg.goalsTotal / matchesWithScore;
    agg.bttsRate = Math.round((agg.bttsCount / matchesWithScore) * 100);
    agg.over25Rate = Math.round((agg.over25Count / matchesWithScore) * 100);
  }

  if(agg.possessionCount > 0){
    agg.possessionAvg = agg.possessionSum / agg.possessionCount;
  }
  if(agg.shotsCount > 0){
    agg.shotsAvg = agg.shotsSum / agg.shotsCount;
  }
  if(agg.shotOnTargetCount > 0){
    agg.shotsOnTargetAvg = agg.shotsOnTargetSum / agg.shotOnTargetCount;
  }
  if(agg.cornersCount > 0){
    agg.cornersAvg = agg.cornersSum / agg.cornersCount;
  }
  if(agg.cardsCount > 0){
    agg.cardsAvg = agg.cardsSum / agg.cardsCount;
  }
  if(agg.xgCount > 0){
    agg.xgAvg = agg.xgSum / agg.xgCount;
  }

  return agg;
}

// Helper functions for competition snapshots
// Keep in sync with tools/snapshots-config.json (single source of truth for season rules).
const SEASON_RULES = {
  default: { type: "europe_default" },
  overrides: {
    Brazil: { type: "calendar_year" }
  }
};

function normalizeCountryFront(country, competitionName){
  const direct = String(country || "").trim();
  if(direct) return direct;
  const comp = String(competitionName || "").toLowerCase();
  if(comp.includes("brazil") || comp.includes("brasil")) return "Brazil";
  return "";
}

function getSeasonFromKickoffFront(kickoffUTC, country, competitionName, rulesOverride){
  if(!kickoffUTC) return null;
  const d = new Date(kickoffUTC);
  if(isNaN(d.getTime())) return null;

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();

  const rules = rulesOverride || _manifestSeasonRules || SEASON_RULES;
  const overrides = rules?.overrides || {};
  const normalizedCountry = normalizeCountryFront(country, competitionName);
  const overrideRule = normalizedCountry ? overrides[normalizedCountry] : null;
  const ruleType = (overrideRule && overrideRule.type) || (rules?.default && rules.default.type) || "europe_default";

  if(ruleType === "calendar_year") return year;
  return month >= 7 ? year : year - 1;
}

function inferSeasonFromMatches(list) {
  if (!list || list.length === 0) return null;
  const first = list[0];
  return getSeasonFromKickoffFront(first.kickoff_utc, first.country, first.competition);
}

function getCompetitionSnapshotNames(leagueId, season) {
  if (!leagueId || !season) {
    return { standingsFile: null, compstatsFile: null };
  }
  return {
    standingsFile: `standings_${leagueId}_${season}.json`,
    compstatsFile: `compstats_${leagueId}_${season}.json`,
  };
}

async function renderCompetitionStandings(leagueId, season, fallbackMatches = []){
  const lid = Number(leagueId);
  const computedSeason = Number(season);
  const sample = Array.isArray(fallbackMatches) ? fallbackMatches[0] : null;
  const kickoffUTC = sample?.kickoff_utc || null;
  const country = sample?.country || null;
  const competitionName = sample?.competition || null;

  const manifest = await loadV1Manifest();
  const manifestSeasons = listManifestSeasons(manifest, lid);
  const resolutionResult = await resolveLeagueSeasonFromManifest({
    leagueId: lid,
    kickoffUTC,
    computedSeason
  });
  const seasonResolved = resolutionResult.season;
  const foundExact = resolutionResult.foundExact;
  const pickedFallback = resolutionResult.pickedFallback;
  
  const entry = findManifestEntry(manifest, lid, seasonResolved);
  const { standingsFile, compstatsFile } = getCompetitionSnapshotNames(lid, seasonResolved);

  console.log("[COMPETITION-MANIFEST]", JSON.stringify({
    leagueId: lid,
    computedSeason,
    resolvedSeason: seasonResolved,
    kickoffUTC,
    seasonsAvailableCount: manifestSeasons.length,
    foundExact,
    pickedFallback,
    standingsFile,
    compstatsFile
  }));

  if(seasonResolved === null){
    const debug = `leagueId=${String(leagueId)} kickoff=${String(kickoffUTC || "")}`;
    return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.standings_unavailable || "Classificação indisponível no momento.")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">${escAttr(debug)}</div></div>`;
  }

  if(!standingsFile){
    return `<div class="smallnote" style="padding:20px;text-align:center;">${escAttr(T.standings_unavailable || "Classificação indisponível no momento.")} (sem leagueId/season)</div>`;
  }

  if(!entry || !entry.standings){
    const debugInfo = `Liga ${lid} / Season ${seasonResolved} / Arquivo: ${standingsFile} / Entry: ${entry ? 'existe' : 'NÃO EXISTE'} / Standings: ${entry?.standings ? 'existe' : 'NÃO EXISTE'}`;
    console.warn("[STANDINGS] Entry check failed:", debugInfo);
    return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.standings_unavailable || "Classificação indisponível no momento.")}</div><div style="font-size:0.75em;margin-top:8px;opacity:0.6;font-family:monospace;word-break:break-all;">${escAttr(debugInfo)}</div></div>`;
  }

  // Load from API/R2/static
  const standings = await loadV1JSON(standingsFile, null);
  
  // Validate schema: must be v1 format with standings array
  if (!standings || standings.schemaVersion !== 1 || !Array.isArray(standings.standings)) {
    console.warn("[COMPETITION-MANIFEST][STANDINGS-SCHEMA-FAIL]", {
      schemaVersion: standings?.schemaVersion,
      hasStandings: Array.isArray(standings?.standings)
    });
    return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.standings_unavailable || "Classificação indisponível no momento.")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">Snapshot incompatível</div></div>`;
  }

  console.log("[COMPETITION-MANIFEST][STANDINGS-DATA]", {
    teams: standings.standings?.length,
    dataStatus: standings.meta?.dataStatus
  });
  
  if(standings.standings.length === 0){
    const reason = standings.meta?.dataStatus === 'empty' 
      ? 'API sem dados para esta competição/temporada'
      : `Arquivo: ${standingsFile}`;
    return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.standings_unavailable || "Classificação indisponível no momento.")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">${escAttr(reason)}</div></div>`;
  }

  const table = standings.standings;
  const sampleTeams = Array.isArray(table)
    ? table.slice(0, 5).map(row => row?.team?.name || row?.team || row?.name || "—")
    : [];
  console.log("[STANDINGS] Sample teams:", sampleTeams);
  
  // Reject dummy data (Team 1, Team 2, etc.) - indicates snapshot not yet populated with real data
  const isDummy = table.some(row => {
    const teamName = (row.team?.name || row.team || row.name || "").toLowerCase();
    return /^team\s*\d+$/.test(teamName);
  });
  
  if(isDummy){
    console.log("[STANDINGS] Detected dummy data (Team 1/2...), rejecting");
    return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.standings_unavailable || "Classificação indisponível no momento.")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">Aguardando dados reais da API...</div></div>`;
  }

  // Render table
  const rows = table.map((row, idx) => {
    const rank = row.rank || row.position || (idx + 1);
    const team = row.team?.name || row.team || row.name || "—";
    const played = row.all?.played || row.played || row.matches_played || row.p || 0;
    const wins = row.all?.win || row.wins || row.w || 0;
    const draws = row.all?.draw || row.draws || row.d || 0;
    const losses = row.all?.lose || row.losses || row.l || 0;
    const gf = row.all?.goals?.for || row.goals_for || row.gf || row.gp || 0;
    const ga = row.all?.goals?.against || row.goals_against || row.ga || row.gc || 0;
    const gd = (gf - ga);
    const points = row.points || row.pts || 0;

    const isTopFour = rank <= 4;
    const isReligation = rank > table.length - 4;
    const rowClass = isTopFour ? "standings-row top-four" : isReligation ? "standings-row religation" : "standings-row";

    return `<tr class="${rowClass}">
      <td class="rank">${escAttr(String(rank))}</td>
      <td class="team-name">${escAttr(team)}</td>
      <td class="number">${escAttr(String(played))}</td>
      <td class="number">${escAttr(String(wins))}</td>
      <td class="number">${escAttr(String(draws))}</td>
      <td class="number">${escAttr(String(losses))}</td>
      <td class="number">${escAttr(String(gf))}</td>
      <td class="number">${escAttr(String(ga))}</td>
      <td class="number goal-diff">${escAttr(String(gd > 0 ? '+' : '') + gd)}</td>
      <td class="number points" style="font-weight:900;"><strong>${escAttr(String(points))}</strong></td>
    </tr>`;
  }).join("");

  return `<div class="standings-wrap"><table class="standings-table">
    <thead>
      <tr>
        <th>#</th>
        <th>${escAttr(T.team_label || "Time")}</th>
        <th>${escAttr(T.played_short || "J")}</th>
        <th>${escAttr(T.wins_short || "V")}</th>
        <th>${escAttr(T.draws_short || "E")}</th>
        <th>${escAttr(T.losses_short || "D")}</th>
        <th>${escAttr(T.goals_for_short || "GP")}</th>
        <th>${escAttr(T.goals_against_short || "GC")}</th>
        <th>${escAttr(T.goal_diff_short || "SG")}</th>
        <th>${escAttr(T.points_short || "PTS")}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table></div>`;
}

async function renderCompetitionStats(leagueId, season, fallbackMatches = []){
  const lid = Number(leagueId);
  const computedSeason = Number(season);
  const sample = Array.isArray(fallbackMatches) ? fallbackMatches[0] : null;
  const kickoffUTC = sample?.kickoff_utc || null;
  const country = sample?.country || null;
  const competitionName = sample?.competition || null;

  const manifest = await loadV1Manifest();
  const manifestSeasons = listManifestSeasons(manifest, lid);
  const resolutionResult = await resolveLeagueSeasonFromManifest({
    leagueId: lid,
    kickoffUTC,
    computedSeason
  });
  const seasonResolved = resolutionResult.season;
  const foundExact = resolutionResult.foundExact;
  const pickedFallback = resolutionResult.pickedFallback;
  
  const entry = findManifestEntry(manifest, lid, seasonResolved);
  const { standingsFile, compstatsFile } = getCompetitionSnapshotNames(lid, seasonResolved);

  console.log("[COMPETITION-MANIFEST]", JSON.stringify({
    leagueId: lid,
    computedSeason,
    resolvedSeason: seasonResolved,
    kickoffUTC,
    seasonsAvailableCount: manifestSeasons.length,
    foundExact,
    pickedFallback,
    standingsFile,
    compstatsFile
  }));

  if(seasonResolved === null){
    const debug = `leagueId=${String(leagueId)} kickoff=${String(kickoffUTC || "")}`;
    return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.no_stats_available || "Estatísticas indisponíveis")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">${escAttr(debug)}</div></div>`;
  }

  if(compstatsFile){
    if(!entry){
      return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.no_stats_available || "Estatísticas indisponíveis")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">Arquivo: ${escAttr(compstatsFile)}</div></div>`;
    }
    if(!entry.compstats){
      return `<div class="smallnote" style="padding:20px;text-align:center;">${escAttr("Estatísticas ainda não disponíveis para esta competição/temporada.")}</div>`;
    }

    const compStats = await loadV1JSON(compstatsFile, null);
    console.log("[STATS] Loaded data:", { compstatsFile, has_metrics: compStats && compStats.metrics, keys: compStats ? Object.keys(compStats) : [] });

    if(compStats && Number(compStats.schemaVersion) !== 1){
      console.error("[STATS] Snapshot schemaVersion mismatch", {
        compstatsFile,
        schemaVersion: compStats.schemaVersion
      });
      return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.no_stats_available || "Estatísticas indisponíveis")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">Snapshot incompatível</div></div>`;
    }

    // Reject dummy data (no real metrics)
    if(compStats && (!compStats.metrics || Object.keys(compStats.metrics).length === 0)){
      console.log("[STATS] Detected dummy/empty metrics, rejecting");
      return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.no_stats_available || "Estatísticas indisponíveis")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">Aguardando dados reais da API...</div></div>`;
    }

    if(compStats && compStats.metrics){
      return renderCompStatsDisplay(compStats);
    }
  }

  // Fallback: show unavailable message with expected filename
  if(compstatsFile){
    return `<div class="smallnote" style="padding:20px;text-align:center;"><div>${escAttr(T.no_stats_available || "Estatísticas indisponíveis")}</div><div style="font-size:0.85em;margin-top:6px;opacity:0.7;">Arquivo: ${escAttr(compstatsFile)}</div></div>`;
  }

  return `<div class="smallnote" style="padding:20px;text-align:center;">${escAttr(T.no_stats_available || "Sem dados de estatísticas.")} (sem leagueId/season)</div>`;
}

function renderCompStatsDisplay(compStats){
  const fmt = (v, decimals = 2) => {
    if(v === null || v === undefined) return "—";
    if(typeof v !== "number") return String(v);
    if(isNaN(v)) return "—";
    return v.toFixed(decimals);
  };

  const metrics = compStats.metrics || {};
  const sample = compStats.sample || {};

  const stats = [
    { label: T.goals_per_game || "Gols por jogo", value: fmt(metrics.goals_avg) },
    { label: T.shots_per_game || "Chutes por jogo", value: fmt(metrics.shots_avg) },
    { label: T.sot_per_game || "Chutes ao gol por jogo", value: fmt(metrics.sot_avg) },
    { label: T.corners_per_game || "Escanteios por jogo", value: fmt(metrics.corners_avg) },
    { label: T.cards_per_game || "Cartões por jogo", value: fmt(metrics.cards_avg) },
  ];

  const optionalStats = [];
  if(metrics.possession_avg !== null && metrics.possession_avg !== undefined){
    optionalStats.push({ label: T.possession_avg || "Posse média", value: fmt(metrics.possession_avg) + "%" });
  }
  if(metrics.xg_avg !== null && metrics.xg_avg !== undefined){
    optionalStats.push({ label: T.xg_per_game || "xG por jogo", value: fmt(metrics.xg_avg) });
  }
  if(metrics.btts_pct !== null && metrics.btts_pct !== undefined){
    optionalStats.push({ label: T.btts_rate || "BTTS %", value: String(metrics.btts_pct) + "%" });
  }
  if(metrics.over25_pct !== null && metrics.over25_pct !== undefined){
    optionalStats.push({ label: T.over25_rate || "Over 2.5 %", value: String(metrics.over25_pct) + "%" });
  }

  const allStats = [...stats, ...optionalStats];

  return `
    <div class="panel" style="margin-bottom:12px;">
      <div class="panel-title">${escAttr(T.stats_base_label || "Base")}</div>
      <div style="opacity:.85;font-size:.9em;">
        <div>${escAttr(T.matches_sample || "Partidas consideradas")}: <b>${escAttr(String(sample.fixtures_used || 0))}</b></div>
        <div>${escAttr(T.with_stats || "Com estatísticas")}: <b>${escAttr(String(sample.fixtures_with_stats || 0))}</b></div>
        <div>${escAttr(T.period_label || "Período")}: <b>${escAttr(T.generated_at || compStats.generated_at_utc || "—")}</b></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-title">${escAttr(T.statistics_label || "Estatísticas")}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${allStats.map(s => `
          <div class="stat-card" style="padding:10px;background:rgba(255,255,255,.04);border-radius:8px;border:1px solid rgba(255,255,255,.08);">
            <div style="font-size:.9em;opacity:.8;">${escAttr(s.label)}</div>
            <div style="font-size:1.2em;font-weight:900;margin-top:4px;">${escAttr(s.value)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
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

  if(type === "competition" || type === "country"){
    title.textContent = T.unavailable_title || "Indisponível";
    body.innerHTML = `<div class="smallnote" style="padding:20px;text-align:center;">${escAttr(T.unavailable_text || "Conteúdo não disponível no modo Free.")}</div>`;
    back.style.display = "flex";
    bindModalClicks();
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

      <div class="mnote">
        ${escAttr(T.free_includes || "FREE: sugestão + risco + forma + gols.")}
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
    day: `/${lang}/radar/day/`
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
  const resolved = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = resolved;
  if(document.body) document.body.dataset.theme = resolved;
}

function pickDefaultTheme(){
  // RadarTips: dark by default (more "tips & odds" vibe)
  return "dark";
}

function setTheme(theme, t){
  const resolved = theme === "light" ? "light" : "dark";
  applyTheme(resolved);
  const btn = qs("#theme_toggle");
  if(!btn) return;

  const isDark = resolved === "dark";
  const label = isDark ? ((t && t.theme_light_short) || "Light") : ((t && t.theme_dark_short) || "Dark");
  btn.textContent = label;

  const tip = isDark ? ((t && t.theme_light_tip) || "Switch to light theme") : ((t && t.theme_dark_tip) || "Switch to dark theme");
  btn.setAttribute("data-tip", tip);
  btn.title = tip;
}

function initThemeToggle(t){
  const saved = getSavedTheme();
  const fromDom = document.documentElement?.dataset?.theme;
  const domTheme = (fromDom === "dark" || fromDom === "light") ? fromDom : null;
  const theme = saved || domTheme || pickDefaultTheme();
  setTheme(theme, t);

  const btn = qs("#theme_toggle");
  if(btn && !btn.dataset.bound){
    btn.dataset.bound = "1";
    btn.addEventListener("click", ()=>{
      const cur = document.documentElement.dataset.theme || document.body.dataset.theme || "dark";
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

  /* Date chips: make Today/Tomorrow pop a bit */
  .date-strip .date-chip.today,
  .date-strip .date-chip.tomorrow{
    font-weight: 950;
  }

  /* Standings table */
  .standings-table{
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9em;
    margin-top: 12px;
  }
  .standings-table thead {
    background: rgba(255,255,255,.06);
  }
  .standings-table th {
    padding: 10px 8px;
    text-align: left;
    font-weight: 900;
    opacity: 0.85;
    border-bottom: 1px solid rgba(255,255,255,.10);
  }
  .standings-table td {
    padding: 10px 8px;
    border-bottom: 1px solid rgba(255,255,255,.06);
  }
  .standings-table tbody tr {
    transition: background 0.15s ease;
  }
  .standings-table tbody tr:hover {
    background: rgba(255,255,255,.04);
  }
  .standings-table td.rank {
    font-weight: 900;
    opacity: 0.85;
    width: 2em;
  }
  .standings-table td.team-name {
    font-weight: 800;
  }
  .standings-table td.number {
    text-align: center;
    opacity: 0.85;
  }
  .standings-table td.points {
    font-weight: 950;
    color: #4ade80;
  }
  .standings-table td.goal-diff {
    opacity: 0.85;
  }
  .standings-row.top-four {
    background: rgba(59,130,246,.08);
  }
  .standings-row.religation {
    background: rgba(239,68,68,.08);
  }
  `;
  document.head.appendChild(style);
}


async function init(){
  LANG = pathLang() || detectLang();
  const dict = await loadJSON(`/i18n/strings.json?v=${I18N_VERSION}`, {});
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

  mountOfficialHeaderLogo();

  const heroContainer = qs(".hero");
  if(heroContainer) heroContainer.classList.add("rt-hero-radar-day");
  const heroGrid = qs(".grid");
  if(heroGrid) heroGrid.classList.add("rt-hero-radar-day-grid");
  const calendarSection = qs("#calendar_section");
  if(calendarSection) calendarSection.classList.add("rt-cal-section");
  const legacyCalendarControls = calendarSection ? calendarSection.querySelector(".controls") : null;
  if(legacyCalendarControls) legacyCalendarControls.remove();
  const calendarRoot = qs("#calendar");
  if(calendarRoot) calendarRoot.classList.add("rt-cal-root");

  ensurePremiumDayScaffold(T);

  setNav(LANG, T);
  bindTopNavActions();
  initThemeToggle(T);
  ensureHeroDayControls(T);
  decorateLangPills(LANG);
  initTooltips();
  injectPatchStyles();

  const p = pageType();
  setText("hero_title", T.hero_title_day || "Daily Radar");
  const baseHeroSub = String(T.hero_sub_day || "").replace(/\s*\([^)]*free[^)]*\)\.?/ig, "").trim();
  setText("hero_sub", baseHeroSub || "Leitura prioritária do dia selecionado");

  const radar = await loadRadarDay();
  const cal2d = await loadCalendar2D();

  // DEBUG LOGS
  console.log('=== RADAR DAY INIT DEBUG ===');
  console.log('Radar Data:', radar);
  console.log('Calendar 2D Data:', cal2d);
  console.log('Radar highlights count:', Array.isArray(radar?.highlights) ? radar.highlights.length : 0);
  console.log('Radar matches count:', Array.isArray(radar?.matches) ? radar.matches.length : 0);
  console.log('Calendar today count:', Array.isArray(cal2d?.today) ? cal2d.today.length : 0);
  console.log('Calendar tomorrow count:', Array.isArray(cal2d?.tomorrow) ? cal2d.tomorrow.length : 0);

  const initialTop3 = getRadarTop3ForTab(cal2d, HERO_ACTIVE_TAB, radar);
  renderTop3(T, { highlights: initialTop3 });
  renderPremiumDayPanels(T, getCalendarBucketForTab(cal2d, HERO_ACTIVE_TAB), initialTop3, HERO_ACTIVE_TAB);
  syncHeroDayControls(T);

  setText("calendar_title", "");
  setText("calendar_sub", "");
  const calendarTitle = qs("#calendar_title");
  const calendarSub = qs("#calendar_sub");
  if(calendarTitle) calendarTitle.style.display = "none";
  if(calendarSub) calendarSub.style.display = "none";

  // Merge all matches for fixture resolution (radar + calendar)
  const radarMatches = [
    ...(Array.isArray(radar.highlights) ? radar.highlights : []),
    ...(Array.isArray(radar.matches) ? radar.matches : [])
  ];
  console.log('Radar matches merged:', radarMatches.length);
  
  const allMatches = [
    ...radarMatches,
    ...flattenCalendarMatches(cal2d)
  ];
  console.log('All matches total:', allMatches.length);
  console.log('First 3 matches:', allMatches.slice(0, 3).map(m => `${m.home} vs ${m.away}`));
  
  CAL_MATCHES = allMatches;
  CAL_META = {
    form_window: Number(cal2d?.meta?.form_window || 5),
    goals_window: Number(cal2d?.meta?.goals_window || 5)
  };
  CAL_DATA = {
    today: getCalendarBucketForTab(cal2d, 'today'),
    tomorrow: getCalendarBucketForTab(cal2d, 'tomorrow')
  };
  window.CAL_MATCHES = CAL_MATCHES;
  window.CAL_SNAPSHOT_META = { goals_window: CAL_META.goals_window, form_window: CAL_META.form_window };

  setupCalendarTabDelegation();
  window.__RERENDER_CALENDAR__ = function(){
    rerender();
  };

  function rerender(){
    const todayMatches = getCalendarBucketForTab(cal2d, 'today');
    const tomorrowMatches = getCalendarBucketForTab(cal2d, 'tomorrow');
    const activeTab = CAL_ACTIVE_TAB || 'today';
    const heroTab = HERO_ACTIVE_TAB || 'today';
    const highlights = getRadarTop3ForTab(cal2d, heroTab, radar);
    const activeMatches = heroTab === 'tomorrow' ? tomorrowMatches : todayMatches;
    const heroSub = String(T.hero_sub_day || "").replace(/\s*\([^)]*free[^)]*\)\.?/ig, "").trim();
    setText("hero_sub", heroSub || "Leitura prioritária do dia selecionado");
    renderTop3(T, { highlights });
    renderPremiumDayPanels(T, activeMatches, highlights, heroTab);
    syncHeroDayControls(T);
    console.log('📅 renderCalendar day_key buckets:', todayMatches.length, 'today and', tomorrowMatches.length, 'tomorrow', 'active=', activeTab);
    renderCalendar(T, todayMatches, tomorrowMatches, cal2d.meta, "time", "", activeTab);
    bindOpenHandlers();
  }

  window.__RERENDER_HERO__ = function(){
    const todayMatches = getCalendarBucketForTab(cal2d, 'today');
    const tomorrowMatches = getCalendarBucketForTab(cal2d, 'tomorrow');
    const heroTab = HERO_ACTIVE_TAB || 'today';
    const highlights = getRadarTop3ForTab(cal2d, heroTab, radar);
    const activeMatches = heroTab === 'tomorrow' ? tomorrowMatches : todayMatches;
    renderTop3(T, { highlights });
    renderPremiumDayPanels(T, activeMatches, highlights, heroTab);
    syncHeroDayControls(T);
    bindOpenHandlers();
  };

  function bindOpenHandlers(){
    const prefetchFn = typeof window.prefetchMatchRadarV2 === 'function' ? window.prefetchMatchRadarV2 : null;

    // Bind the match-card click handler ONCE (rerender() calls bindOpenHandlers repeatedly)
    if(!window.__MR_CARD_CLICK_BOUND__){
      window.__MR_CARD_CLICK_BOUND__ = true;

      document.addEventListener('click', (e) => {
        const card = e.target.closest('[data-fixture-id]');
        if(!card) return;

        const interactive = e.target.closest('a,button,input,select,textarea,label,[role="button"],[role="link"]');
        if(interactive && interactive !== card) return;

        const fixtureId = card.getAttribute('data-fixture-id');
        if(!fixtureId) return;

        e.preventDefault();
        e.stopPropagation();

        // Immediate visual feedback (<50ms perceived): open the radar now.
        const matchSync = findMatchByFixtureId(fixtureId);
        const path = (window.location.pathname || '');
        let metaSync = null;
        if(path.includes('/radar/day')) {
          metaSync = RADAR_DAY_DATA ? findRadarMetaByFixtureId(RADAR_DAY_DATA, fixtureId) : null;
        }
        if(matchSync) {
          window.__MATCH_CTX__ = { match: matchSync, meta: metaSync, fixtureId };
        }
        openMatchRadarV2(fixtureId, { mode: 'sidebar' });

        // Continue enrichment asynchronously (metadata and cache warmup).
        if(prefetchFn) prefetchFn(fixtureId, { includeStats: true });
      }, true);

      // Hover/focus prefetch.
      document.addEventListener('mouseenter', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('[data-fixture-id]') : null;
        if(!card || !prefetchFn) return;
        const fixtureId = card.getAttribute('data-fixture-id');
        if(fixtureId) prefetchFn(fixtureId, { includeStats: true });
      }, true);

      document.addEventListener('focusin', (e) => {
        const card = e.target && e.target.closest ? e.target.closest('[data-fixture-id]') : null;
        if(!card || !prefetchFn) return;
        const fixtureId = card.getAttribute('data-fixture-id');
        if(fixtureId) prefetchFn(fixtureId, { includeStats: true });
      });

      // Viewport prefetch with IntersectionObserver.
      if(prefetchFn && typeof window.IntersectionObserver === 'function') {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if(!entry.isIntersecting) return;
            const fixtureId = entry.target?.getAttribute?.('data-fixture-id');
            if(fixtureId) prefetchFn(fixtureId, { includeStats: false });
            io.unobserve(entry.target);
          });
        }, { rootMargin: '140px 0px' });

        window.__MR_PREFETCH_IO__ = io;
      }

      // Idle-time warmup for first visible cards.
      if(prefetchFn) {
        const idle = window.requestIdleCallback
          ? window.requestIdleCallback.bind(window)
          : (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 120);

        idle(() => {
          const cards = qsa('[data-fixture-id]').slice(0, 10);
          cards.forEach((el) => {
            const fixtureId = el.getAttribute('data-fixture-id');
            if(fixtureId) prefetchFn(fixtureId, { includeStats: false });
          });
        });
      }
    }

    if(window.__MR_PREFETCH_IO__) {
      qsa('[data-fixture-id]').forEach((el) => {
        try { window.__MR_PREFETCH_IO__.observe(el); } catch(e) {}
      });
    }

    // No competition/country modal bindings in Free mode

    // keyboard on match rows
    qsa(".match[role='button']").forEach(el=>{
      if(el.dataset.boundKey === "1") return;
      el.dataset.boundKey = "1";
      el.addEventListener("keydown", (e)=>{
        if(e.key==="Enter" || e.key===" "){ e.preventDefault(); el.click(); }
      });
    });
  }

  const modalClose = qs("#modal_close");
  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }
  const modalBackdrop = qs("#modal_backdrop");
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", (e)=>{ if(e.target.id==="modal_backdrop") closeModal(); });
  }

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

  rerender();
  bindOpenHandlers();

  const idleWarm = window.requestIdleCallback
    ? window.requestIdleCallback.bind(window)
    : (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 0 }), 120);

  function bootstrapMatchRadarFromRoute(){
    try {
      if(window.__MR_ROUTE_BOOTSTRAPPED__) return false;
      const params = new URLSearchParams(window.location.search || '');
      const fixtureFromRoute = params.get('fixture');
      const modeFromRoute = params.get('mr_mode');
      const tabFromRoute = params.get('mr_tab');
      if(!fixtureFromRoute) return false;

      const preMatch = findMatchByFixtureId(fixtureFromRoute);
      if(preMatch) {
        window.__MATCH_CTX__ = { match: preMatch, meta: null, fixtureId: fixtureFromRoute };
      }

      const routeMode = (modeFromRoute === 'full' || modeFromRoute === 'fullscreen' || modeFromRoute === 'sidebar')
        ? (modeFromRoute === 'full' ? 'fullscreen' : modeFromRoute)
        : 'fullscreen';

      window.__MR_ROUTE_BOOTSTRAPPED__ = true;
      openMatchRadarV2(fixtureFromRoute, {
        mode: routeMode,
        requestedTab: tabFromRoute || null,
        syncUrl: false
      });
      return true;
    } catch(e) {
      return false;
    }
  }

  // Route bootstrap first so direct URL opens overlay immediately.
  bootstrapMatchRadarFromRoute();

  idleWarm(() => {
    if(typeof window.ensureMatchRadarMicroBootstrap === 'function') {
      window.ensureMatchRadarMicroBootstrap().catch(() => null);
    }
  });

  // Dedicated route bootstrap: /{lang}/radar/day/?fixture={id}&mr_mode=fullscreen
  bootstrapMatchRadarFromRoute();

  startLivePolling(T);
}

document.addEventListener("DOMContentLoaded", init);
