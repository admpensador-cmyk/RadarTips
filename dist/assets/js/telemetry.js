// assets/js/telemetry.js — Observabilidade leve
(function(){
  var KEY_EVENTS = 'rt_telemetry_v1';
  var KEY_COUNTS = 'rt_telemetry_counts_v1';
  function safe(fn) { try { fn(); } catch(e) {} }
  function now() { return new Date().toISOString(); }
  function getEvents() {
    try {
      var arr = JSON.parse(localStorage.getItem(KEY_EVENTS) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch(e) { return []; }
  }
  function getCounts() {
    try {
      var obj = JSON.parse(localStorage.getItem(KEY_COUNTS) || '{}');
      return typeof obj === 'object' && obj ? obj : {};
    } catch(e) { return {}; }
  }
  window.RT_TEL = {
    record: function(type, payload) {
      safe(function(){
        var arr = getEvents();
        arr.push({ ts: now(), type: type, page: location.pathname, payload: payload });
        if (arr.length > 20) arr = arr.slice(-20);
        localStorage.setItem(KEY_EVENTS, JSON.stringify(arr));
        var counts = getCounts();
        counts[type] = (counts[type]||0)+1;
        localStorage.setItem(KEY_COUNTS, JSON.stringify(counts));
        // Optional ping
        if (type && navigator.sendBeacon) {
          try {
            navigator.sendBeacon('/api/v1/log', JSON.stringify({ ts: now(), type, page: location.pathname, payload }));
          } catch(e) {}
        }
      });
    },
    get: function() { return { events: getEvents(), counts: getCounts() }; },
    clear: function() {
      safe(function(){ localStorage.removeItem(KEY_EVENTS); localStorage.removeItem(KEY_COUNTS); });
    }
  };
})();
