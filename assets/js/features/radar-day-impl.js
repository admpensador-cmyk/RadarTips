// assets/js/features/radar-day-impl.js — FASE 8 REAL
window.initRadarDay = function() {
  if (window.RT_TEL && typeof window.RT_TEL.record === 'function') {
    window.RT_TEL.record('radar_day_impl_start');
  }
  // Seleção de container
  var container = document.getElementById('app') || document.getElementById('content') || document.querySelector('main') || document.body;
  if (!container) throw Error('Nenhum container encontrado');
  var root = document.createElement('section');
  root.id = 'rt-radar-day-root';
  root.style = 'margin:2em auto;max-width:480px;background:#222;color:#eee;padding:2em;border-radius:12px;box-shadow:0 2px 16px #0003;';
  container.appendChild(root);

  function renderList(matches) {
    root.innerHTML = '<h2 style="text-align:center;margin-bottom:1em;">Radar Day</h2>';
    if (!matches || !matches.length) {
      root.innerHTML += '<div style="text-align:center;color:#ffb443;">Nenhum jogo encontrado.</div>';
      return;
    }
    var ul = document.createElement('ul');
    ul.style = 'list-style:none;padding:0;margin:0;';
    matches.slice(0,5).forEach(function(m) {
      var home = m.home || m.homeTeam || (m.teams && m.teams.home && (m.teams.home.name || m.teams.home)) || "?";
      var away = m.away || m.awayTeam || (m.teams && m.teams.away && (m.teams.away.name || m.teams.away)) || "?";
      var date = m.kickoff_utc || m.kickoff || m.date || (m.fixture && m.fixture.date) || "";
      var id = m.id || (m.fixture && m.fixture.id) || m.match_id || "";
      var li = document.createElement('li');
      li.style = 'margin-bottom:1em;padding:1em;background:#333;border-radius:8px;';
      li.textContent = `${home} vs ${away} — ${date}`;
      ul.appendChild(li);
    });
    root.appendChild(ul);
  }

  function fetchRadarDay() {
    return fetch('/api/v1/radar_day.json?force=1').then(function(r){
      if (!r.ok) throw Error('radar_day.json não disponível');
      return r.text();
    }).then(function(txt){
      try { return JSON.parse(txt); } catch(e) { throw Error('JSON inválido radar_day.json'); }
    });
  }
  function fetchCalendar2d() {
    return fetch('/api/v1/calendar_2d.json').then(function(r){
      if (!r.ok) throw Error('calendar_2d.json não disponível');
      return r.text();
    }).then(function(txt){
      try { return JSON.parse(txt); } catch(e) { throw Error('JSON inválido calendar_2d.json'); }
    });
  }

  function fetchCalendar7dFiltered() {
    return fetch('/api/v1/calendar_7d.json?force=1').then(function(r){
      if (!r.ok) throw Error('calendar_7d.json não disponível');
      return r.text();
    }).then(function(txt){
      try {
        var data = JSON.parse(txt);
        var arr = data.matches || [];
        var today = new Date();
        var tomorrow = new Date(today.getTime() + 86400000);
        var ymdToday = today.toISOString().slice(0,10);
        var ymdTomorrow = tomorrow.toISOString().slice(0,10);
        var filtered = arr.filter(function(m){
          var d = (m.kickoff_utc || m.date || '').slice(0,10);
          return d === ymdToday || d === ymdTomorrow;
        });
        return { matches: filtered };
      } catch(e) { throw Error('JSON inválido calendar_7d.json'); }
    });
  }

  (function(){
    fetchCalendar2d()
      .catch(function(){ return fetchCalendar7dFiltered(); })
      .then(function(data){
        var arr = data.matches || data.fixtures || data.items || data.radar || [];
        if (!Array.isArray(arr) || arr.length === 0) throw Error('Sem dados Radar Day');
        if (window.RT_TEL && typeof window.RT_TEL.record === 'function') {
          window.RT_TEL.record('radar_day_fetch_ok', { source: (data.matches ? 'calendar_2d' : 'calendar_7d_filtered'), count: arr.length });
        }
        renderList(arr);
        if (window.RT_TEL && typeof window.RT_TEL.record === 'function') {
          window.RT_TEL.record('radar_day_render_ok');
        }
      })
      .catch(function(e){
        if (window.RT_TEL && typeof window.RT_TEL.record === 'function') {
          window.RT_TEL.record('radar_day_fetch_fail', { error: String(e) });
        }
        throw e;
      });
  })();
};
