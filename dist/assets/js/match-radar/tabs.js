export const MATCH_RADAR_TABS = [
  { id: "stats", i18n: "match_radar.tabs.stats", fallback: "Estatisticas" },
  { id: "markets", i18n: "match_radar.tabs.markets", fallback: "Mercados" },
  { id: "details", i18n: "match_radar.tabs.details", fallback: "Detalhes" }
];

export function getAvailableTabs(state) {
  return MATCH_RADAR_TABS.filter((tab) => {
    if (tab.id === "stats") return Boolean(state.availability.stats);
    if (tab.id === "markets") return Boolean(state.availability.markets);
    return true;
  });
}
