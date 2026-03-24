import { createMatchRadarState, selectInitialTab } from "./state.js";
import { getAvailableTabs, MATCH_RADAR_TABS } from "./tabs.js";
import { parseMatchRadarRoute, syncRoute, clearRouteParams } from "./router.js";
import { renderLoadingShell, renderAppShell } from "./views/shell.js";
import { renderStatsView } from "./views/stats-view.js";
import { renderMarketsView } from "./views/markets-view.js";
import { renderDetailsView } from "./views/details-view.js";

function safeEscapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export class MatchRadarMicroApp {
  constructor({ host, dataController }) {
    this.host = host;
    this.dataController = dataController;
    this.state = createMatchRadarState();
    this.root = null;
    this.boundPopState = this.onPopState.bind(this);
  }

  mountGlobalListeners() {
    window.addEventListener("popstate", this.boundPopState);
  }

  unmountGlobalListeners() {
    window.removeEventListener("popstate", this.boundPopState);
  }

  get t() {
    return typeof this.host.t === "function" ? this.host.t : ((_, fallback) => fallback || "");
  }

  formatScore(data) {
    if (typeof this.host.formatScore === "function") return this.host.formatScore(data);
    return "";
  }

  pickMode(requestedMode) {
    const isMobile = typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 768px)").matches
      : (window.innerWidth || 1024) <= 768;
    if (requestedMode === "fullscreen") return "fullscreen";
    if (requestedMode === "sidebar") return isMobile ? "fullscreen" : "sidebar";
    return isMobile ? "fullscreen" : "sidebar";
  }

  applyRootMode(mode) {
    if (!this.root) return;
    this.root.classList.remove("mr-v2-overlay", "mr-v2-sidebar-host");
    this.root.classList.add(mode === "fullscreen" ? "mr-v2-overlay" : "mr-v2-sidebar-host");

    // Force viewport anchoring
    this.root.style.position = "fixed";
    this.root.style.top = "0";
    this.root.style.right = "0";
    this.root.style.bottom = "0";
    this.root.style.left = "0";
    this.root.style.zIndex = "2147483646";
  }

  ensureRoot() {
    const overlays = Array.from(document.querySelectorAll("#mr-v2-overlay, .mr-v2-overlay, .mr-v2-sidebar-host"));
    if (overlays.length > 0) {
      const primary = overlays[overlays.length - 1];
      const duplicates = overlays.slice(0, -1);
      duplicates.forEach((node) => {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
      primary.id = "mr-v2-overlay";
      primary.classList.add("mr-v2-root");
      this.root = primary;
      return primary;
    }

    const root = document.createElement("div");
    root.id = "mr-v2-overlay";
    root.className = "mr-v2-root";
    document.body.appendChild(root);
    this.root = root;
    return root;
  }

  renderLoading(mode) {
    const root = this.ensureRoot();
    this.applyRootMode(mode);
    root.innerHTML = renderLoadingShell({ mode, t: this.t });
    this.bindCommonShellEvents();
  }

  bindCommonShellEvents() {
    if (!this.root) return;

    const closeBtn = this.root.querySelector(".mr-v2-close");
    if (closeBtn) closeBtn.onclick = () => this.close();

    this.root.onclick = (e) => {
      if (!this.root.classList.contains("mr-v2-overlay")) return;
      if (e.target === this.root) this.close();
    };
  }

  open({ fixtureId, mode, ctxMatch, requestedTab, syncUrl = true }) {
    const id = String(fixtureId || "");
    if (!id) return;

    this.state = createMatchRadarState();
    this.state.fixtureId = id;
    this.state.mode = this.pickMode(mode);
    this.state.loading.base = true;
    this.state.activeTab = requestedTab || "details";

    this.renderLoading(this.state.mode);

    if (syncUrl) {
      syncRoute({
        fixtureId: id,
        mode: this.state.mode,
        tab: this.state.activeTab,
        replace: false,
        host: this.host
      });
    }

    this.hydrate({ ctxMatch });
  }

  async hydrate({ ctxMatch }) {
    const fixtureId = this.state.fixtureId;
    const base = await this.dataController.getBaseMatch(fixtureId, ctxMatch || null);

    if (!base) {
      this.state.loading.base = false;
      this.state.error = "no_base";
      this.renderError();
      return;
    }

    this.state.data.base = base;
    this.state.loading.base = false;
    this.state.loading.stats = true;
    this.state.loading.markets = true;

    const [stats, markets] = await Promise.all([
      this.dataController.getStats(fixtureId),
      this.dataController.getMarkets(fixtureId, base)
    ]);

    this.state.data.stats = stats || null;
    this.state.data.markets = Array.isArray(markets) ? markets : [];
    this.state.loading.stats = false;
    this.state.loading.markets = false;

    this.state.availability.stats = typeof this.host.hasStatsPayload === "function"
      ? this.host.hasStatsPayload(this.state.data.stats)
      : Boolean(this.state.data.stats);
    this.state.availability.markets = this.state.data.markets.length > 0;

    this.state.activeTab = selectInitialTab(this.state);
    this.render();

    // Warm lazy enhancer after first useful paint.
    if (typeof this.host.loadStatsEnhancer === "function") {
      this.host.loadStatsEnhancer().catch(() => null);
    }
  }

  buildTabButtons() {
    const availableIds = new Set(getAvailableTabs(this.state).map((t) => t.id));
    return MATCH_RADAR_TABS
      .filter((tab) => availableIds.has(tab.id) || tab.id === "details")
      .map((tab) => {
        const active = tab.id === this.state.activeTab ? " mr-v2-tab-active" : "";
        const label = this.t(tab.i18n, tab.fallback);
        return `<button class="mr-v2-tab${active}" data-mr-tab="${tab.id}">${label}</button>`;
      });
  }

  render() {
    if (!this.root || !this.state.data.base) return;

    this.applyRootMode(this.state.mode);

    const base = this.state.data.base;
    const homeLogo = typeof this.host.pickTeamLogo === "function" ? this.host.pickTeamLogo(base, "home") : null;
    const awayLogo = typeof this.host.pickTeamLogo === "function" ? this.host.pickTeamLogo(base, "away") : null;
    const homeShield = typeof this.host.crestHTML === "function"
      ? `<div style="min-width:42px;width:42px;height:42px;">${this.host.crestHTML(base.home?.name || "", homeLogo)}</div>`
      : "";
    const awayShield = typeof this.host.crestHTML === "function"
      ? `<div style="min-width:42px;width:42px;height:42px;">${this.host.crestHTML(base.away?.name || "", awayLogo)}</div>`
      : "";

    this.root.innerHTML = renderAppShell({
      mode: this.state.mode,
      t: this.t,
      state: this.state,
      tabButtons: this.buildTabButtons(),
      homeShield,
      awayShield,
      escapeHtml: safeEscapeHtml,
      formatScore: (d) => this.formatScore(d)
    });

    this.bindCommonShellEvents();
    this.bindInteractiveEvents();
    this.renderActiveTab();
  }

  bindInteractiveEvents() {
    if (!this.root) return;

    const tabs = this.root.querySelector("[data-mr-tabs]");
    if (tabs) {
      tabs.onclick = (e) => {
        const btn = e.target.closest("[data-mr-tab]");
        if (!btn) return;
        const nextTab = btn.getAttribute("data-mr-tab");
        this.switchTab(nextTab);
      };
    }

    const fullBtn = this.root.querySelector("[data-mr-fullview]");
    if (fullBtn) {
      fullBtn.onclick = () => {
        this.switchMode("fullscreen", { push: true, keepTab: true });
      };
    }
  }

  switchTab(tabId) {
    const tab = String(tabId || "details");
    this.state.activeTab = tab;
    syncRoute({
      fixtureId: this.state.fixtureId,
      mode: this.state.mode,
      tab,
      replace: true,
      host: this.host
    });
    this.render();
  }

  switchMode(mode, { push = false, keepTab = true } = {}) {
    this.state.mode = this.pickMode(mode);
    syncRoute({
      fixtureId: this.state.fixtureId,
      mode: this.state.mode,
      tab: keepTab ? this.state.activeTab : null,
      replace: !push,
      host: this.host
    });
    this.render();
  }

  renderActiveTab() {
    if (!this.root) return;
    const content = this.root.querySelector("[data-mr-content]");
    if (!content) return;

    if (this.state.activeTab === "stats") {
      content.innerHTML = renderStatsView({
        state: this.state,
        t: this.t,
        renderStatsV2: this.host.renderStatsV2
      });
      if (typeof this.host.loadStatsEnhancer === "function") {
        this.host.loadStatsEnhancer().then((fn) => {
          if (typeof fn === "function" && document.body.contains(content)) {
            fn(content, this.state.data.stats);
          }
        }).catch(() => null);
      }
      return;
    }

    if (this.state.activeTab === "markets") {
      content.innerHTML = renderMarketsView({
        state: this.state,
        t: this.t,
        escapeHtml: safeEscapeHtml
      });
      return;
    }

    content.innerHTML = renderDetailsView({
      state: this.state,
      t: this.t,
      escapeHtml: safeEscapeHtml
    });
  }

  renderError() {
    if (!this.root) return;
    this.applyRootMode(this.state.mode);
    const msg = this.t("match_radar.empty", "Sem dados disponiveis");
    this.root.innerHTML = `<div class="mr-app-panel mr-app-panel--${this.state.mode}"><div class="mr-v2-head"><div class="mr-v2-title">Radar</div><button class="mr-v2-close">x</button></div><div class="mr-v2-body"><div class="mr-v2-empty">${msg}</div></div></div>`;
    this.bindCommonShellEvents();
  }

  close({ clearUrl = true } = {}) {
    if (this.root) {
      this.root.remove();
      this.root = null;
    }
    if (clearUrl) clearRouteParams({ replace: true });
  }

  onPopState() {
    const route = parseMatchRadarRoute();
    if (!route.fixtureId) {
      this.close({ clearUrl: false });
      return;
    }

    if (this.state.fixtureId === route.fixtureId && this.root) {
      if (route.mode) this.state.mode = this.pickMode(route.mode);
      if (route.tab) this.state.activeTab = route.tab;
      this.render();
      return;
    }

    this.open({
      fixtureId: route.fixtureId,
      mode: route.mode || "fullscreen",
      requestedTab: route.tab || null,
      syncUrl: false
    });
  }
}
