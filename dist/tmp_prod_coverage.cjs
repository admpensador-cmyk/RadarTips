(async () => {
  const fs = require('fs');
  const allow = JSON.parse(fs.readFileSync('data/coverage_allowlist.json', 'utf8'));
  const allowSet = new Set((allow.leagues || []).map(l => Number(l.league_id)).filter(Number.isFinite));
  const res = await fetch('https://radartips.com/api/v1/calendar_2d?nocache=' + Date.now(), { headers: { 'cache-control': 'no-cache' } });
  const j = await res.json();
  const rows = [...(j.today || []), ...(j.tomorrow || [])];
  const map = new Map();
  for (const x of rows) {
    const id = Number(x.competition_id);
    if (!Number.isFinite(id)) continue;
    const k = `${id}|${x.country || ''}|${x.competition || ''}`;
    map.set(k, (map.get(k) || 0) + 1);
  }
  const leak = [...map.keys()].map(k => Number(k.split('|')[0])).filter(id => !allowSet.has(id));
  console.log('http_status=' + res.status);
  console.log('snapshot_source_key=' + (j.snapshot_source_key || ''));
  console.log('meta_today=' + (j.meta?.today || ''));
  console.log('meta_tomorrow=' + (j.meta?.tomorrow || ''));
  console.log('prod_rows=' + rows.length);
  console.log('prod_competitions=' + map.size);
  console.log('prod_leaked_ids=' + JSON.stringify([...new Set(leak)].sort((a,b)=>a-b)));
})();
