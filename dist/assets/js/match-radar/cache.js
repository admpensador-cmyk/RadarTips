const MAX_CACHE_ENTRIES = 48;

function trimMap(map) {
  while (map.size > MAX_CACHE_ENTRIES) {
    const first = map.keys().next().value;
    map.delete(first);
  }
}

export function createMatchRadarCache() {
  const matchCache = new Map();
  const statsCache = new Map();
  const marketsCache = new Map();
  const inflight = {
    match: new Map(),
    stats: new Map(),
    markets: new Map()
  };

  return {
    matchCache,
    statsCache,
    marketsCache,
    inflight,
    setMatch(key, value) {
      matchCache.set(String(key), value);
      trimMap(matchCache);
    },
    setStats(key, value) {
      statsCache.set(String(key), value);
      trimMap(statsCache);
    },
    setMarkets(key, value) {
      marketsCache.set(String(key), value);
      trimMap(marketsCache);
    }
  };
}
