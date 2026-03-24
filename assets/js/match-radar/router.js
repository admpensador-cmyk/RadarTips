function parseMode(rawMode) {
  if (rawMode === "fullscreen" || rawMode === "sidebar") return rawMode;
  return null;
}

export function parseMatchRadarRoute(url = window.location.href) {
  const u = new URL(url);
  const fixtureId = u.searchParams.get("fixture");
  const mode = parseMode(u.searchParams.get("mr_mode"));
  const tab = u.searchParams.get("mr_tab");

  return {
    fixtureId: fixtureId ? String(fixtureId) : null,
    mode,
    tab: tab ? String(tab) : null
  };
}

export function buildMatchRadarUrl({ fixtureId, mode, tab, host }) {
  if (host && typeof host.getDedicatedMatchUrl === "function") {
    const base = new URL(host.getDedicatedMatchUrl(fixtureId), window.location.origin);
    if (mode) base.searchParams.set("mr_mode", mode);
    if (tab) base.searchParams.set("mr_tab", tab);
    return base.toString();
  }

  const u = new URL(window.location.href);
  if (fixtureId) u.searchParams.set("fixture", String(fixtureId));
  if (mode) u.searchParams.set("mr_mode", mode);
  if (tab) u.searchParams.set("mr_tab", tab);
  return u.toString();
}

export function syncRoute({ fixtureId, mode, tab, replace = false, host }) {
  const next = buildMatchRadarUrl({ fixtureId, mode, tab, host });
  if (replace) {
    history.replaceState({}, "", next);
  } else {
    history.pushState({}, "", next);
  }
}

export function clearRouteParams({ replace = true } = {}) {
  const u = new URL(window.location.href);
  u.searchParams.delete("fixture");
  u.searchParams.delete("mr_mode");
  u.searchParams.delete("mr_tab");
  const next = u.pathname + (u.searchParams.toString() ? `?${u.searchParams.toString()}` : "") + (u.hash || "");
  if (replace) history.replaceState({}, "", next);
  else history.pushState({}, "", next);
}
