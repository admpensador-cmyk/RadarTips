export function createMatchRadarState() {
  return {
    fixtureId: null,
    mode: "sidebar",
    activeTab: "details",
    availability: {
      stats: false,
      markets: false,
      details: true
    },
    loading: {
      base: false,
      stats: false,
      markets: false
    },
    data: {
      base: null,
      stats: null,
      markets: null
    },
    error: null
  };
}

export function selectInitialTab(state) {
  if (state?.availability?.stats) return "stats";
  if (state?.availability?.markets) return "markets";
  return "details";
}
