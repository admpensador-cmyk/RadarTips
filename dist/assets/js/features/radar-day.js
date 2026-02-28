// assets/js/features/radar-day.js
(function() {
  function loadScriptOnce(url, globalFlag) {
    return new Promise(function(resolve, reject) {
      if (window[globalFlag]) return resolve();
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = function() {
        window[globalFlag] = true;
        resolve();
      };
      script.onerror = function() {
        reject(new Error('Falha ao carregar ' + url));
      };
      document.head.appendChild(script);
    });
  }
  function initFeature() {
    loadScriptOnce('/assets/js/app.js', '__rt_app_loaded__')
      .then(function() {
        if (typeof window.init === 'function') window.init();
      })
      .catch(function(e) { setTimeout(function(){ throw e; }, 0); });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFeature);
  } else {
    initFeature();
  }
})();
