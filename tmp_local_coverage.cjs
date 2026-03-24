const fs = require('fs');
const cal = JSON.parse(fs.readFileSync('data/v1/calendar_2d.json', 'utf8'));
const allow = JSON.parse(fs.readFileSync('data/coverage_allowlist.json', 'utf8'));
const allowSet = new Set((allow.leagues || []).map(l => Number(l.league_id)).filter(Number.isFinite));
const rows = [...(cal.today || []), ...(cal.tomorrow || [])];
const map = new Map();
for (const x of rows) {
  const id = Number(x.competition_id);
  if (!Number.isFinite(id)) continue;
  const k = `${id}|${x.country || ''}|${x.competition || ''}`;
  map.set(k, (map.get(k) || 0) + 1);
}
const leak = [...map.keys()].map(k => Number(k.split('|')[0])).filter(id => !allowSet.has(id));
const brazilAllow = (allow.leagues || []).filter(l => String(l.country).toLowerCase() === 'brazil').map(l => Number(l.league_id)).sort((a,b) => a-b);
const brazilInCal = [...map.keys()]
  .map(k => {
    const [id, country] = k.split('|');
    return { id: Number(id), country };
  })
  .filter(x => String(x.country).toLowerCase().includes('brazil'))
  .map(x => x.id)
  .sort((a,b) => a-b);
console.log('calendar_rows=' + rows.length);
console.log('calendar_competitions=' + map.size);
console.log('leaked_competition_ids=' + JSON.stringify([...new Set(leak)].sort((a,b)=>a-b)));
console.log('brazil_allowlist_ids=' + JSON.stringify(brazilAllow));
console.log('brazil_in_calendar_ids=' + JSON.stringify(brazilInCal));
