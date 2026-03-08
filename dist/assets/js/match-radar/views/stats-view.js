export function renderStatsView({ state, t, renderStatsV2 }) {
  const stats = state?.data?.stats;
  if (!stats) {
    return `<div class="mr-v2-stats-loading">${t("match_radar.loading_stats", "Carregando estatisticas...")}</div>`;
  }

  if (typeof renderStatsV2 !== "function") {
    return `<div class="mr-v2-empty">${t("match_radar.empty", "Sem dados disponiveis")}</div>`;
  }

  return renderStatsV2(stats, { mode: "last5" });
}
