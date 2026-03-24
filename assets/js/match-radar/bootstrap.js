import { createMatchRadarCache } from "./cache.js";
import { createMatchRadarDataController } from "./data-controller.js";
import { MatchRadarMicroApp } from "./app.js";
import { parseMatchRadarRoute } from "./router.js";

let singleton = null;

function ensureSingleton(host) {
  if (singleton) return singleton;

  const cache = createMatchRadarCache();
  const dataController = createMatchRadarDataController({ host, cache });
  const app = new MatchRadarMicroApp({ host, dataController });
  app.mountGlobalListeners();

  singleton = {
    app,
    cache,
    dataController,
    host
  };

  return singleton;
}

export function initMatchRadarMicroApp(host) {
  const inst = ensureSingleton(host);
  const route = parseMatchRadarRoute();
  if (route.fixtureId) {
    inst.app.open({
      fixtureId: route.fixtureId,
      mode: route.mode || "fullscreen",
      requestedTab: route.tab || null,
      syncUrl: false
    });
  }
  return inst;
}

export function openMatchRadarMicroApp(host, options) {
  const inst = ensureSingleton(host);
  inst.app.open(options || {});
  return inst;
}

export function prefetchMatchRadarMicroApp(host, fixtureId) {
  const inst = ensureSingleton(host);
  return inst.dataController.prefetch(fixtureId);
}

export function closeMatchRadarMicroApp(host) {
  const inst = ensureSingleton(host);
  inst.app.close({ clearUrl: true });
}
