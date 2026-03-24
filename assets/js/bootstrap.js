// assets/js/bootstrap.js — RadarTips v2 Resiliente
(function() {
  // Guard para evitar loop de fallback
  if (window.__rt_fallback_active) return;

  // Handler global de erros
  window.addEventListener("error", function() {
    if (!window.__rt_fallback_active) renderFallbackRadarDay();
  });
  window.addEventListener("unhandledrejection", function() {
    if (!window.__rt_fallback_active) renderFallbackRadarDay();
  });

  // Detecta feature
  function detectFeature() {
    var body = document.body;
    if (body && body.dataset.feature) return body.dataset.feature;
    var path = location.pathname;
    if (path.includes("/radar/day")) return "radar-day";
    if (path.includes("/match")) return "match-radar";
    if (path.includes("/competition")) return "competition-radar";
    return "radar-day";
  }

  // Carrega manifest com cache-busting
  fetch("/assets/manifest.json?ts=" + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(manifest) {
      var feature = detectFeature();
      var bundle = manifest[feature] || manifest["radar-day"];
      if (!bundle) throw new Error("Bundle não encontrado no manifest");
      var script = document.createElement("script");
      script.src = bundle;
      script.async = true;
      script.onerror = function() {
        if (!window.__rt_fallback_active) renderFallbackRadarDay();
      };
      document.body.appendChild(script);
    })
    .catch(function() {
      if (!window.__rt_fallback_active) renderFallbackRadarDay();
    });

  // Fallback robusto
  window.renderFallbackRadarDay = function() {
    if (window.__rt_fallback_active) return;
    window.__rt_fallback_active = true;
    var container = document.getElementById("app") || document.getElementById("content") || document.querySelector("main") || document.body;
    if (!container) container = document.body;
    container.innerHTML = "<div style='padding:2em;text-align:center;background:#222;color:#fff;'>Modo contingência ativo<br><small>Não foi possível carregar o Radar Day</small></div>";
    fetch("/api/v1/calendar_7d.json?force=1")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.matches || !Array.isArray(data.matches)) throw new Error("Sem dados");
        var top = data.matches.slice(0, 5).map(function(m) {
          var dt = m.kickoff_utc ? new Date(m.kickoff_utc).toLocaleString() : "";
          return "<div style='margin:8px 0;padding:8px;background:#333;border-radius:6px;'>" +
            "<b>" + (m.home || "?") + "</b> vs <b>" + (m.away || "?") + "</b> <span style='color:#aaa'>" + dt + "</span></div>";
        }).join("");
        container.innerHTML += "<div style='margin-top:1em;'>" + top + "</div>";
      })
      .catch(function() {
        container.innerHTML += "<div style='margin-top:1em;color:#ffb443;'>Falha ao buscar dados.<br><button onclick='location.reload()' style='margin-top:8px;padding:8px 16px;'>Recarregar</button></div>";
      });
  };
})();// assets/js/bootstrap.js — RadarTips v2 Resiliente
(function() {
  // Guard para evitar loop de fallback
  if (window.__rt_fallback_active) return;

  // Handler global de erros
  window.onerror = function(msg, url, line, col, error) {
    if (!window.__rt_fallback_active) renderFallbackRadarDay();
  };
  window.onunhandledrejection = function(e) {
    if (!window.__rt_fallback_active) renderFallbackRadarDay();
  };

  // Detecta feature
  function detectFeature() {
    var body = document.body;
    if (body && body.dataset.feature) return body.dataset.feature;
    var path = location.pathname;
    if (path.includes("/radar/day")) return "radar-day";
    if (path.includes("/match")) return "match-radar";
    if (path.includes("/competition")) return "competition-radar";
    return "radar-day";
  }

  // Carrega manifest com cache-busting
  fetch("/assets/manifest.json?ts=" + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(manifest) {
      var feature = detectFeature();
      var bundle = manifest[feature] || manifest["radar-day"];
      if (!bundle) throw new Error("Bundle não encontrado no manifest");
      var script = document.createElement("script");
      script.src = bundle;
      script.async = true;
      script.onerror = function() {
        if (!window.__rt_fallback_active) renderFallbackRadarDay();
      };
      document.body.appendChild(script);
    })
    .catch(function() {
      if (!window.__rt_fallback_active) renderFallbackRadarDay();
    });

  // Fallback robusto
  window.renderFallbackRadarDay = function() {
    if (window.__rt_fallback_active) return;
    window.__rt_fallback_active = true;
    var container = document.getElementById("app") || document.getElementById("content") || document.querySelector("main") || document.body;
    if (!container) container = document.body;
    container.innerHTML = "<div style='padding:2em;text-align:center;background:#222;color:#fff;'>Modo contingência<br><small>Não foi possível carregar o Radar Day</small></div>";
    fetch("/api/v1/calendar_7d.json?force=1")
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.matches || !Array.isArray(data.matches)) throw new Error("Sem dados");
        var top = data.matches.slice(0, 5).map(function(m) {
          var dt = m.kickoff_utc ? new Date(m.kickoff_utc).toLocaleString() : "";
          return "<div style='margin:8px 0;padding:8px;background:#333;border-radius:6px;'>" +
            "<b>" + (m.home || "?") + "</b> vs <b>" + (m.away || "?") + "</b> <span style='color:#aaa'>" + dt + "</span></div>";
        }).join("");
        container.innerHTML += "<div style='margin-top:1em;'>" + top + "</div>";
      })
      .catch(function() {
        container.innerHTML += "<div style='margin-top:1em;color:#ffb443;'>Falha ao buscar dados.<br><button onclick='location.reload()' style='margin-top:8px;padding:8px 16px;'>Recarregar</button></div>";
      });
  };
})();
