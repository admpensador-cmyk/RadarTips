const fs = require('fs');
const snap7d = JSON.parse(fs.readFileSync('workers/radartips-api/snapshots/calendar_7d.json', 'utf8'));

function formatLocalYMD(date, tz = 'UTC') {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  return formatter.format(date);
}

function getTodayTomorrowYMD(tz = 'UTC') {
  const today = formatLocalYMD(new Date(), tz);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { today, tomorrow: formatLocalYMD(tomorrow, tz) };
}

function classifyMatch(kickoffUTC, tz, todayYMD, tomorrowYMD) {
  const d = new Date(kickoffUTC);
  const matchYMD = formatLocalYMD(d, tz);
  if (matchYMD === todayYMD) return 'today';
  if (matchYMD === tomorrowYMD) return 'tomorrow';
  return null;
}

const tz = 'America/Sao_Paulo';
const { today: todayYMD, tomorrow: tomorrowYMD } = getTodayTomorrowYMD(tz);

console.log('==============================================================');
console.log('        DIAGNOSTIC: CALENDAR_2D WITH calendar_7d.json');
console.log('==============================================================\n');
console.log(`Timezone: ${tz}`);
console.log(`Today:    ${todayYMD}`);
console.log(`Tomorrow: ${tomorrowYMD}`);
console.log();

let c_today = 0, c_tomorrow = 0, c_other = 0;
const samples = {};

snap7d.matches.forEach((m, idx) => {
  const cls = classifyMatch(m.kickoff_utc, tz, todayYMD, tomorrowYMD);
  if (cls === 'today') c_today++;
  else if (cls === 'tomorrow') c_tomorrow++;
  else c_other++;
  
  if (idx < 3) {
    if (!samples[cls]) samples[cls] = [];
    samples[cls].push(`  [${cls}] ${m.kickoff_utc} - ${m.home} vs ${m.away}`);
  }
});

console.log('CLASSIFIED MATCHES:');
console.log(`  Today:    ${c_today}`);
console.log(`  Tomorrow: ${c_tomorrow}`);
console.log(`  Other:    ${c_other}`);
console.log(`  Total:    ${snap7d.matches.length}`);
console.log();

console.log('SAMPLE MATCHES:');
Object.keys(samples).forEach(cls => {
  samples[cls].forEach(s => console.log(s));
});

console.log();
console.log('DATA SOURCE:');
console.log(`  File:      snapshots/calendar_7d.json`);
console.log(`  Matches:   ${snap7d.matches.length}`);
console.log(`  Generated: ${snap7d.generated_at_utc}`);
console.log(`  Form:      ${snap7d.form_window}`);
console.log();
console.log('==============================================================\n');
