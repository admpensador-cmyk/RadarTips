import { renderSidebarContainer } from "./sidebar-container.js";
import { renderFullscreenContainer } from "./fullscreen-container.js";
import { renderHeader } from "./header.js";

function renderTabs(tabItems) {
  return `<div class="mr-v2-tabs" data-mr-tabs>${tabItems.join("")}</div>`;
}

function renderSkeletonBody(t) {
  return `
    <div class="mr-v2-body mr-v2-skeleton-wrap" aria-busy="true" aria-live="polite" data-mr-content>
      <div class="mr-v2-skeleton-row"></div>
      <div class="mr-v2-skeleton-row mr-v2-skeleton-row-wide"></div>
      <div class="mr-v2-skeleton-grid">
        <div class="mr-v2-skeleton-card"></div>
        <div class="mr-v2-skeleton-card"></div>
        <div class="mr-v2-skeleton-card"></div>
        <div class="mr-v2-skeleton-card"></div>
      </div>
      <div class="mr-v2-stats-loading">${t("match_radar.loading", "Carregando...")}</div>
    </div>
  `;
}

export function renderShell({ mode, t, header, tabs, loading = false }) {
  const tabHtml = renderTabs(tabs);
  const body = loading
    ? renderSkeletonBody(t)
    : `<div class="mr-v2-body" data-mr-content></div>`;

  const inner = `${header}${tabHtml}${body}`;
  return mode === "fullscreen"
    ? renderFullscreenContainer(inner)
    : renderSidebarContainer(inner);
}

export function renderLoadingShell({ mode, t }) {
  const header = `
    <div class="mr-v2-head">
      <div class="mr-v2-title">${t("match_radar.loading", "Carregando radar...")}</div>
      <button class="mr-v2-close">x</button>
    </div>
  `;
  const tabs = [
    `<button class="mr-v2-tab mr-v2-tab-active">${t("match_radar.tabs.stats", "Estatisticas")}</button>`,
    `<button class="mr-v2-tab">${t("match_radar.tabs.markets", "Mercados")}</button>`,
    `<button class="mr-v2-tab">${t("match_radar.tabs.details", "Detalhes")}</button>`
  ];

  return renderShell({ mode, t, header, tabs, loading: true });
}

export function renderAppShell({ mode, t, state, tabButtons, homeShield, awayShield, escapeHtml, formatScore }) {
  const homeName = escapeHtml(state.data.base?.home?.name || "-");
  const awayName = escapeHtml(state.data.base?.away?.name || "-");
  const header = renderHeader({
    homeName,
    awayName,
    score: formatScore(state.data.base),
    homeShield,
    awayShield,
    showFullscreenCta: mode === "sidebar",
    t
  });

  return renderShell({
    mode,
    t,
    header,
    tabs: tabButtons,
    loading: false
  });
}
