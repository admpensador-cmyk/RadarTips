function keyOf(fixtureId) {
  return String(fixtureId || "");
}

export function createMatchRadarDataController({ host, cache }) {
  async function dedupe(inflightMap, key, fn) {
    if (inflightMap.has(key)) return inflightMap.get(key);
    const p = Promise.resolve().then(fn).finally(() => inflightMap.delete(key));
    inflightMap.set(key, p);
    return p;
  }

  async function getBaseMatch(fixtureId, ctxMatch) {
    const key = keyOf(fixtureId);
    if (!key) return null;

    if (cache.matchCache.has(key)) return cache.matchCache.get(key);

    return dedupe(cache.inflight.match, key, async () => {
      if (ctxMatch && typeof host.normalizeMatch === "function") {
        const normalized = host.normalizeMatch(ctxMatch, host.snapshotMeta || null);
        cache.setMatch(key, normalized);
        return normalized;
      }

      if (typeof host.getMatchRadarV2Data === "function") {
        const data = await host.getMatchRadarV2Data(key);
        if (data) cache.setMatch(key, data);
        if (data) return data;
      }

      if (typeof host.resolveMatchByFixtureId === "function" && typeof host.normalizeMatch === "function") {
        const raw = await host.resolveMatchByFixtureId(key);
        if (raw) {
          const normalized = host.normalizeMatch(raw, host.snapshotMeta || null);
          cache.setMatch(key, normalized);
          return normalized;
        }
      }

      return null;
    });
  }

  async function getStats(fixtureId) {
    const key = keyOf(fixtureId);
    if (!key) return null;
    if (cache.statsCache.has(key)) return cache.statsCache.get(key);
    if (typeof host.fetchMatchStatsPayload !== "function") return null;

    return dedupe(cache.inflight.stats, key, async () => {
      try {
        const stats = await host.fetchMatchStatsPayload(key);
        if (stats) cache.setStats(key, stats);
        return stats || null;
      } catch (err) {
        return null;
      }
    });
  }

  async function getMarkets(fixtureId, baseData) {
    const key = keyOf(fixtureId);
    if (!key) return [];
    if (cache.marketsCache.has(key)) return cache.marketsCache.get(key);

    return dedupe(cache.inflight.markets, key, async () => {
      const markets = Array.isArray(baseData?.markets) ? baseData.markets : [];
      cache.setMarkets(key, markets);
      return markets;
    });
  }

  async function prefetch(fixtureId) {
    const base = await getBaseMatch(fixtureId, null);
    if (!base) return null;
    await Promise.allSettled([
      getStats(fixtureId),
      getMarkets(fixtureId, base)
    ]);
    return base;
  }

  return {
    getBaseMatch,
    getStats,
    getMarkets,
    prefetch
  };
}
