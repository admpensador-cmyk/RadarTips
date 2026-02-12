#!/usr/bin/env bash
set -euo pipefail

ts="$(date +%Y%m%d_%H%M%S)"
backup_dir="_backup_${ts}"

need_backup=0
for p in assets i18n data en pt es fr de index.html robots.txt sitemap.xml README.md; do
  if [ -e "$p" ]; then need_backup=1; fi
done

if [ "$need_backup" -eq 1 ]; then
  mkdir -p "$backup_dir"
  for p in assets i18n data en pt es fr de index.html robots.txt sitemap.xml README.md; do
    if [ -e "$p" ]; then
      cp -R "$p" "$backup_dir/" 2>/dev/null || true
    fi
  done
  echo "Backup criado em: $backup_dir"
fi

mkdir -p assets/css assets/js assets/img i18n data/v1
for lang in en pt es fr de; do
  mkdir -p "$lang/radar/day" "$lang/radar/week" "$lang/calendar"
done

# =========================
# 1) i18n strings (definitivo)
# =========================
cat > i18n/strings.json <<'JSON'
{
  "en": {
    "brand": "RadarTips",
    "disclaimer": "Informational content • We are not a bookmaker • 18+",
    "nav_day": "Daily Radar",
    "nav_week": "Weekly Radar",
    "nav_calendar": "Calendar",
    "hero_title_day": "Daily Radar",
    "hero_sub_day": "Top 3 picks for quick decisions (free shows suggestion + risk).",
    "hero_title_week": "Weekly Radar",
    "hero_sub_week": "Week overview (Mon–Sun). Transparency with results as games finish.",
    "hero_title_cal": "Calendar",
    "hero_sub_cal": "All games for the next 7 days. Browse by time or by country.",
    "top_slot": "TOP",
    "risk_low": "LOW",
    "risk_med": "MED",
    "risk_high": "HIGH",
    "pro_badge": "PRO",
    "pro_locked_title": "PRO details locked",
    "pro_locked_text": "Unlock probabilities, EV, odds and deeper stats with PRO.",
    "calendar_title": "Match calendar (7 days)",
    "calendar_sub": "Browse by time or by country. Times are shown in your local timezone.",
    "view_by_time": "By time",
    "view_by_country": "By country",
    "search_placeholder": "Search team / competition...",
    "empty_slot": "No highlight available",
    "country_radar": "Country Radar",
    "competition_radar": "Competition Radar",
    "close": "Close",
    "form_label": "Last 5",
    "goals_label": "G",
    "cta_pro": "Get PRO",
    "free_label": "FREE",
    "result_pending": "PENDING",
    "result_green": "GREEN",
    "result_red": "RED"
  },
  "pt": {
    "brand": "RadarTips",
    "disclaimer": "Conteúdo informativo • Não somos casa de apostas • 18+",
    "nav_day": "Radar do Dia",
    "nav_week": "Radar da Semana",
    "nav_calendar": "Calendário",
    "hero_title_day": "Radar do Dia",
    "hero_sub_day": "Top 3 sugestões para decisão rápida (free mostra sugestão + risco).",
    "hero_title_week": "Radar da Semana",
    "hero_sub_week": "Visão da semana (Seg–Dom). Transparência com resultado conforme os jogos terminam.",
    "hero_title_cal": "Calendário",
    "hero_sub_cal": "Todos os jogos dos próximos 7 dias. Navegue por horário ou por país.",
    "top_slot": "TOP",
    "risk_low": "BAIXO",
    "risk_med": "MÉDIO",
    "risk_high": "ALTO",
    "pro_badge": "PRO",
    "pro_locked_title": "Detalhes PRO bloqueados",
    "pro_locked_text": "Desbloqueie probabilidades, EV, odds e estatísticas completas com o PRO.",
    "calendar_title": "Calendário de jogos (7 dias)",
    "calendar_sub": "Navegue por horário ou por país. Horários no seu fuso local.",
    "view_by_time": "Por horário",
    "view_by_country": "Por país",
    "search_placeholder": "Buscar time / competição...",
    "empty_slot": "Sem destaque",
    "country_radar": "Radar do País",
    "competition_radar": "Radar da Competição",
    "close": "Fechar",
    "form_label": "Últimos 5",
    "goals_label": "G",
    "cta_pro": "Assinar PRO",
    "free_label": "FREE",
    "result_pending": "PENDENTE",
    "result_green": "GREEN",
    "result_red": "RED"
  },
  "es": {
    "brand": "RadarTips",
    "disclaimer": "Contenido informativo • No somos casa de apuestas • 18+",
    "nav_day": "Radar del Día",
    "nav_week": "Radar de la Semana",
    "nav_calendar": "Calendario",
    "hero_title_day": "Radar del Día",
    "hero_sub_day": "Top 3 sugerencias para decisión rápida (free muestra sugerencia + riesgo).",
    "hero_title_week": "Radar de la Semana",
    "hero_sub_week": "Resumen semanal (Lun–Dom). Transparencia con resultados al finalizar.",
    "hero_title_cal": "Calendario",
    "hero_sub_cal": "Todos los partidos de los próximos 7 días. Por hora o por país.",
    "top_slot": "TOP",
    "risk_low": "BAJO",
    "risk_med": "MEDIO",
    "risk_high": "ALTO",
    "pro_badge": "PRO",
    "pro_locked_title": "Detalles PRO bloqueados",
    "pro_locked_text": "Desbloquea probabilidades, EV, cuotas y más con PRO.",
    "calendar_title": "Calendario de partidos (7 días)",
    "calendar_sub": "Por hora o por país. Horas en tu zona local.",
    "view_by_time": "Por hora",
    "view_by_country": "Por país",
    "search_placeholder": "Buscar equipo / competición...",
    "empty_slot": "Sin destacado",
    "country_radar": "Radar del País",
    "competition_radar": "Radar de la Competición",
    "close": "Cerrar",
    "form_label": "Últimos 5",
    "goals_label": "G",
    "cta_pro": "Obtener PRO",
    "free_label": "FREE",
    "result_pending": "PENDIENTE",
    "result_green": "GREEN",
    "result_red": "RED"
  },
  "fr": {
    "brand": "RadarTips",
    "disclaimer": "Contenu informatif • Nous ne sommes pas un bookmaker • 18+",
    "nav_day": "Radar du Jour",
    "nav_week": "Radar de la Semaine",
    "nav_calendar": "Calendrier",
    "hero_title_day": "Radar du Jour",
    "hero_sub_day": "Top 3 sélections pour décider vite (free: suggestion + risque).",
    "hero_title_week": "Radar de la Semaine",
    "hero_sub_week": "Vue semaine (Lun–Dim). Transparence des résultats après les matchs.",
    "hero_title_cal": "Calendrier",
    "hero_sub_cal": "Tous les matchs des 7 prochains jours. Par heure ou par pays.",
    "top_slot": "TOP",
    "risk_low": "FAIBLE",
    "risk_med": "MOYEN",
    "risk_high": "ÉLEVÉ",
    "pro_badge": "PRO",
    "pro_locked_title": "Détails PRO verrouillés",
    "pro_locked_text": "Débloquez probabilités, EV, cotes et plus avec PRO.",
    "calendar_title": "Calendrier des matchs (7 jours)",
    "calendar_sub": "Par heure ou par pays. Heures dans votre fuseau local.",
    "view_by_time": "Par heure",
    "view_by_country": "Par pays",
    "search_placeholder": "Rechercher équipe / compétition...",
    "empty_slot": "Pas de sélection",
    "country_radar": "Radar du Pays",
    "competition_radar": "Radar de la Compétition",
    "close": "Fermer",
    "form_label": "5 derniers",
    "goals_label": "G",
    "cta_pro": "Passer PRO",
    "free_label": "FREE",
    "result_pending": "EN ATTENTE",
    "result_green": "GREEN",
    "result_red": "RED"
  },
  "de": {
    "brand": "RadarTips",
    "disclaimer": "Informationsinhalt • Kein Wettanbieter • 18+",
    "nav_day": "Tagesradar",
    "nav_week": "Wochenradar",
    "nav_calendar": "Kalender",
    "hero_title_day": "Tagesradar",
    "hero_sub_day": "Top-3-Tipps für schnelle Entscheidungen (free: Tipp + Risiko).",
    "hero_title_week": "Wochenradar",
    "hero_sub_week": "Wochenübersicht (Mo–So). Transparenz mit Ergebnissen nach Spielende.",
    "hero_title_cal": "Kalender",
    "hero_sub_cal": "Alle Spiele der nächsten 7 Tage. Nach Uhrzeit oder Land.",
    "top_slot": "TOP",
    "risk_low": "NIEDRIG",
    "risk_med": "MITTEL",
    "risk_high": "HOCH",
    "pro_badge": "PRO",
    "pro_locked_title": "PRO-Details gesperrt",
    "pro_locked_text": "Schalte Wahrscheinlichkeiten, EV, Quoten und mehr mit PRO frei.",
    "calendar_title": "Spielkalender (7 Tage)",
    "calendar_sub": "Nach Uhrzeit oder Land. Zeiten in deiner lokalen Zeitzone.",
    "view_by_time": "Nach Zeit",
    "view_by_country": "Nach Land",
    "search_placeholder": "Team / Wettbewerb suchen...",
    "empty_slot": "Kein Highlight",
    "country_radar": "Länderradar",
    "competition_radar": "Wettbewerbsradar",
    "close": "Schließen",
    "form_label": "Letzte 5",
    "goals_label": "G",
    "cta_pro": "PRO holen",
    "free_label": "FREE",
    "result_pending": "AUSSTEHEND",
    "result_green": "GREEN",
    "result_red": "RED"
  }
}
JSON

# =========================
# 2) CSS definitivo (azul claro, estilo “opção 1”)
# =========================
cat > assets/css/style.css <<'CSS'
:root{
  --bg1:#d9e9ff;
  --bg2:#f7fbff;
  --ink:#0b1220;
  --muted:#4a586e;
  --card:#ffffffcc;
  --stroke:#d7e3f6;
  --accent:#2b6ff2;
  --accent2:#7aa7ff;
  --shadow: 0 12px 40px rgba(8, 24, 56, .12);
  --radius: 18px;
  --green:#18a957;
  --red:#e04545;
  --yellow:#e0b300;
}
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif;
  color:var(--ink);
  background:
    radial-gradient(900px 500px at 18% 10%, rgba(122,167,255,.55), transparent 60%),
    radial-gradient(700px 450px at 80% 0%, rgba(43,111,242,.25), transparent 55%),
    linear-gradient(180deg, var(--bg1), var(--bg2) 60%);
}
a{color:inherit; text-decoration:none}
.container{max-width:1120px;margin:0 auto;padding:22px 18px 70px;}

.topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
.brand{display:flex;flex-direction:column;gap:4px}
.brandline{display:flex;align-items:center;gap:10px}
.logo{
  font-weight:900;letter-spacing:.2px;font-size:20px;
  display:flex;align-items:center;gap:10px
}
.badge-mini{
  padding:5px 10px;border-radius:999px;border:1px solid rgba(43,111,242,.25);
  background:rgba(43,111,242,.06);font-weight:900;font-size:11px;color:#163261;
}
.mini{color:var(--muted);font-size:12px;font-weight:650}

.nav{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
.pill{
  padding:10px 14px;border:1px solid var(--stroke);
  background:rgba(255,255,255,.55);border-radius:999px;
  font-weight:800;font-size:13px;color:#13213a;
  transition:transform .12s ease, background .12s ease;
  user-select:none;
}
.pill:hover{transform:translateY(-1px)}
.pill.active{
  background:linear-gradient(180deg, rgba(43,111,242,.22), rgba(43,111,242,.08));
  border-color: rgba(43,111,242,.35);
}
.lang{
  padding:10px 12px;border:1px solid var(--stroke);
  border-radius:999px;background:rgba(255,255,255,.45);
  font-weight:900;font-size:12px;
}
.lang.active{border-color:rgba(43,111,242,.40);background:rgba(43,111,242,.08)}

.hero{
  margin-top:18px;
  padding:22px;
  border:1px solid var(--stroke);
  background:linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  border-radius:var(--radius);
  box-shadow:var(--shadow);
  position:relative;
  overflow:hidden;
}
.hero::after{
  content:"";
  position:absolute;
  inset:-140px -120px auto auto;
  width:320px;height:320px;border-radius:50%;
  background: radial-gradient(circle at 35% 35%, rgba(43,111,242,.35), transparent 60%);
}
.hero h1{margin:0;font-size:34px;letter-spacing:-.6px}
.hero p{margin:10px 0 0;color:var(--muted);font-weight:650;max-width:900px}

.grid{margin-top:16px;display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
.card{
  grid-column:span 4;
  padding:14px;
  background:var(--card);
  border:1px solid var(--stroke);
  border-radius:16px;
  box-shadow:0 10px 30px rgba(8,24,56,.08);
  backdrop-filter: blur(10px);
}
.card .row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.badge{
  padding:6px 10px;border-radius:999px;font-weight:950;font-size:11px;
  border:1px solid var(--stroke);color:#15305b;background:rgba(255,255,255,.6);
}
.badge.low{border-color:rgba(24,169,87,.35)}
.badge.med{border-color:rgba(224,179,0,.35)}
.badge.high{border-color:rgba(224,69,69,.35)}
h3{margin:10px 0 0;font-size:16px;letter-spacing:-.2px}
.meta{margin-top:6px;color:var(--muted);font-weight:650;font-size:12px;display:flex;gap:10px;flex-wrap:wrap}
.meta a{
  text-decoration:underline;
  text-decoration-color:rgba(43,111,242,.25);
  text-underline-offset:3px;
}
.lock{
  margin-top:10px;padding:10px 12px;
  border:1px dashed rgba(43,111,242,.35);
  border-radius:14px;background:rgba(43,111,242,.06);
  color:#163261;font-weight:750;font-size:12px;
}
.lock .pro{font-weight:950;color:var(--accent)}
.lock .btn{
  float:right;
  padding:8px 10px;border-radius:999px;border:1px solid rgba(43,111,242,.28);
  background:rgba(255,255,255,.65);font-weight:950;font-size:12px;
}

.section{
  margin-top:18px;padding:18px;
  border:1px solid var(--stroke);
  border-radius:var(--radius);
  background:rgba(255,255,255,.55);
}
.section h2{margin:0;font-size:18px;letter-spacing:-.2px}
.section .sub{margin-top:6px;color:var(--muted);font-weight:650;font-size:13px}

.controls{
  margin-top:14px;
  display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between
}
.toggle{
  display:flex;gap:8px;flex-wrap:wrap
}
.input{
  flex:1;
  min-width:240px;
  border:1px solid var(--stroke);
  background:rgba(255,255,255,.7);
  border-radius:999px;
  padding:10px 14px;
  font-weight:750;
  color:#13213a;
  outline:none;
}
.input::placeholder{color:rgba(74,88,110,.85)}
.smallnote{color:rgba(74,88,110,.9);font-weight:650;font-size:12px}

.cal{margin-top:14px;display:flex;flex-direction:column;gap:12px}
.group{
  padding:14px;border:1px solid var(--stroke);border-radius:16px;background:rgba(255,255,255,.65);
}
.group-head{
  display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;flex-wrap:wrap
}
.group-title{display:flex;align-items:center;gap:10px;font-weight:950}
.flag{width:10px;height:10px;border-radius:3px;background:var(--accent);box-shadow:0 4px 14px rgba(43,111,242,.35)}
.group-actions{display:flex;gap:8px;flex-wrap:wrap}
.chip{
  padding:8px 12px;border-radius:999px;border:1px solid rgba(43,111,242,.22);
  background:rgba(43,111,242,.06);font-weight:900;font-size:12px;color:#163261;
  cursor:pointer;
}

.matches{display:flex;flex-direction:column;gap:10px}
.match{
  display:grid;grid-template-columns:78px 1fr 170px;
  gap:10px;align-items:center;
  padding:10px;border-radius:14px;border:1px solid rgba(215,227,246,.9);
  background:rgba(255,255,255,.55);
}
.time{font-weight:950;color:#11244b}
.teams{display:flex;flex-direction:column;gap:2px;font-weight:900}
.subline{margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:center}
.form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.dot{width:18px;height:18px;border-radius:6px;border:1px solid rgba(0,0,0,.06)}
.dot.g{background:rgba(24,169,87,.18);border-color:rgba(24,169,87,.25)}
.dot.r{background:rgba(224,69,69,.18);border-color:rgba(224,69,69,.25)}
.dot.y{background:rgba(224,179,0,.18);border-color:rgba(224,179,0,.25)}
.gfga{font-weight:850;color:#15243e}
.gfga .gf{color:var(--green);font-weight:950}
.gfga .ga{color:var(--red);font-weight:950}

.suggestion{
  justify-self:end;
  font-weight:950;color:#13213a;
  padding:8px 10px;border-radius:999px;
  border:1px solid rgba(43,111,242,.28);
  background:rgba(43,111,242,.06);
  text-align:center;
  min-width:170px;
}
.proline{
  margin-top:8px;
  display:flex;gap:10px;flex-wrap:wrap;align-items:center;
  color:#163261;font-weight:800;font-size:12px;
}
.proline .lockicon{opacity:.8}
.proline .pro{color:var(--accent);font-weight:950}

.footer{
  margin-top:20px;color:rgba(20,34,64,.78);
  font-size:12px;font-weight:650;text-align:center;
}

.modal-backdrop{
  position:fixed;inset:0;background:rgba(10,18,34,.38);
  display:none;align-items:flex-end;justify-content:center;padding:18px;
}
.modal{
  width:min(920px, 100%);
  background:rgba(255,255,255,.92);
  border:1px solid rgba(215,227,246,.9);
  border-radius:22px;
  box-shadow:0 18px 60px rgba(8,24,56,.20);
  overflow:hidden;
}
.modal-head{
  padding:16px 16px 12px;
  display:flex;justify-content:space-between;align-items:center;gap:12px;
  border-bottom:1px solid rgba(215,227,246,.9);
  background:linear-gradient(180deg, rgba(43,111,242,.10), rgba(255,255,255,.60));
}
.modal-title{font-weight:950}
.modal-body{padding:16px}
.btn{
  padding:10px 12px;border-radius:999px;border:1px solid rgba(43,111,242,.28);
  background:rgba(255,255,255,.75);font-weight:950;font-size:12px;cursor:pointer;
}
.btn.primary{
  background:rgba(43,111,242,.10);
}
@media (max-width:900px){
  .card{grid-column:span 12}
  .match{grid-template-columns:64px 1fr;grid-template-rows:auto auto}
  .suggestion{justify-self:start;grid-column:1/-1;min-width:auto;width:100%}
  .subline{grid-template-columns:1fr}
  .modal-backdrop{align-items:stretch}
}
CSS

# =========================
# 3) Favicon
# =========================
cat > assets/favicon.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" x2="1">
      <stop offset="0" stop-color="#2b6ff2"/>
      <stop offset="1" stop-color="#7aa7ff"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="52" height="52" rx="16" fill="url(#g)"/>
  <path d="M18 40c9-18 19-18 28 0" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
  <circle cx="32" cy="28" r="6" fill="#fff"/>
</svg>
SVG

# =========================
# 4) Dados placeholder (até ligar automação/API)
# =========================
cat > data/v1/radar_day.json <<'JSON'
{
  "generated_at_utc": "2026-01-30T00:00:00Z",
  "highlights": [
    {
      "country": "England",
      "competition": "Premier League",
      "home": "Arsenal",
      "away": "Brighton",
      "kickoff_utc": "2026-01-30T19:00:00Z",
      "risk": "low",
      "suggestion_free": "1X (Home or Draw)",
      "pro_locked": true
    },
    {
      "country": "Brazil",
      "competition": "Brasileirão Série A",
      "home": "Bahia",
      "away": "Flamengo",
      "kickoff_utc": "2026-01-30T23:30:00Z",
      "risk": "medium",
      "suggestion_free": "Under 3.5",
      "pro_locked": true
    },
    {
      "country": "Spain",
      "competition": "LaLiga",
      "home": "Betis",
      "away": "Valencia",
      "kickoff_utc": "2026-01-30T20:00:00Z",
      "risk": "high",
      "suggestion_free": "DNB Home",
      "pro_locked": true
    }
  ]
}
JSON

cat > data/v1/radar_week.json <<'JSON'
{
  "generated_at_utc": "2026-01-30T00:00:00Z",
  "week_scope": "Mon–Sun",
  "items": [
    {
      "country": "England",
      "competition": "Premier League",
      "home": "Liverpool",
      "away": "Chelsea",
      "kickoff_utc": "2026-02-01T16:30:00Z",
      "risk": "medium",
      "suggestion_free": "Over 1.5",
      "result": "pending"
    },
    {
      "country": "Brazil",
      "competition": "Brasileirão Série A",
      "home": "Botafogo",
      "away": "Cruzeiro",
      "kickoff_utc": "2026-02-02T00:30:00Z",
      "risk": "low",
      "suggestion_free": "DNB Home",
      "result": "pending"
    }
  ]
}
JSON

cat > data/v1/calendar_7d.json <<'JSON'
{
  "generated_at_utc": "2026-01-30T00:00:00Z",
  "matches": [
    {
      "kickoff_utc": "2026-01-30T15:00:00Z",
      "country": "Egypt",
      "competition": "Egypt Premier League",
      "home": "Al Ahly",
      "away": "Zamalek",
      "risk": "low",
      "suggestion_free": "1X",
      "form_home": "WWWWW",
      "gf_home": 12,
      "ga_home": 2
    },
    {
      "kickoff_utc": "2026-01-30T17:00:00Z",
      "country": "Europe",
      "competition": "Europa League",
      "home": "Aston Villa",
      "away": "Salzburg",
      "risk": "medium",
      "suggestion_free": "1X",
      "form_home": "WWDWL",
      "gf_home": 9,
      "ga_home": 4
    },
    {
      "kickoff_utc": "2026-01-30T23:00:00Z",
      "country": "Brazil",
      "competition": "Brasileirão",
      "home": "Mirassol",
      "away": "Vasco",
      "risk": "medium",
      "suggestion_free": "Under 3.5",
      "form_home": "DWWLD",
      "gf_home": 7,
      "ga_home": 5
    },
    {
      "kickoff_utc": "2026-02-01T19:00:00Z",
      "country": "England",
      "competition": "Premier League",
      "home": "Arsenal",
      "away": "Brighton",
      "risk": "low",
      "suggestion_free": "1X",
      "form_home": "WDLWW",
      "gf_home": 8,
      "ga_home": 3
    }
  ]
}
JSON

# =========================
# 5) JS definitivo (render + i18n + timezone + por horário/país + modal radar)
# =========================
cat > assets/js/app.js <<'JS'
const LANGS = ["en","pt","es","fr","de"];

function pathLang(){
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return LANGS.includes(seg) ? seg : null;
}
function detectLang(){
  const host = (location.hostname||"").toLowerCase();
  if(host.endsWith(".com.br")) return "pt";
  const n = (navigator.language||"").toLowerCase();
  if(n.startsWith("pt")) return "pt";
  if(n.startsWith("es")) return "es";
  if(n.startsWith("fr")) return "fr";
  if(n.startsWith("de")) return "de";
  return "en";
}
function pageType(){
  // /{lang}/radar/day/ | /{lang}/radar/week/ | /{lang}/calendar/
  const parts = location.pathname.split("/").filter(Boolean);
  const p = parts.slice(1).join("/");
  if(p.startsWith("radar/day")) return "day";
  if(p.startsWith("radar/week")) return "week";
  if(p.startsWith("calendar")) return "calendar";
  return "day";
}
function fmtTime(isoUtc){
  try{
    const d = new Date(isoUtc);
    return new Intl.DateTimeFormat(undefined, {hour:"2-digit", minute:"2-digit"}).format(d);
  }catch{ return "--:--"; }
}
function riskClass(r){
  const v=(r||"").toLowerCase();
  if(v==="low") return "low";
  if(v==="high") return "high";
  return "med";
}
function squareFor(ch){
  if(ch==="W") return "g";
  if(ch==="D") return "y";
  return "r";
}
async function loadJSON(url, fallback){
  try{
    const r = await fetch(url,{cache:"no-store"});
    if(!r.ok) throw 0;
    return await r.json();
  }catch{ return fallback; }
}

function setText(id, val){
  const el = document.getElementById(id);
  if(el) el.textContent = val;
}
function setHTML(id, val){
  const el = document.getElementById(id);
  if(el) el.innerHTML = val;
}
function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }

function setNav(lang, t){
  const map = {
    day: `/${lang}/radar/day/`,
    week: `/${lang}/radar/week/`,
    calendar: `/${lang}/calendar/`
  };
  qsa("[data-nav]").forEach(a=>{
    const k=a.getAttribute("data-nav");
    a.href = map[k];
    a.textContent = (k==="day") ? t.nav_day : (k==="week") ? t.nav_week : t.nav_calendar;
    a.classList.toggle("active", location.pathname.startsWith(map[k]));
  });
  qsa("[data-lang]").forEach(b=>{
    const L=b.getAttribute("data-lang");
    b.classList.toggle("active", L===lang);
  });
}

function renderTop3(t, data){
  const slots = data.highlights || [];
  const cards = qsa(".card[data-slot]");
  cards.forEach((card, idx)=>{
    const item = slots[idx];
    const badge = card.querySelector(".badge.risk");
    const top = card.querySelector(".badge.top");
    const h3 = card.querySelector("h3");
    const meta = card.querySelector(".meta");
    const lock = card.querySelector(".lock");
    top.textContent = `${t.top_slot} ${idx+1}`;

    if(!item){
      badge.className = "badge risk high";
      badge.textContent = t.risk_high;
      h3.textContent = t.empty_slot;
      meta.innerHTML = "";
      lock.innerHTML = `<span class="pro">${t.pro_badge}</span> · ${t.pro_locked_text} <button class="btn primary" type="button">${t.cta_pro}</button>`;
      return;
    }

    badge.className = `badge risk ${riskClass(item.risk)}`;
    badge.textContent = (item.risk==="low")?t.risk_low:(item.risk==="high")?t.risk_high:t.risk_med;

    h3.textContent = `${item.home} vs ${item.away}`;
    meta.innerHTML = `
      <span>${item.competition}</span>
      <span>•</span>
      <a href="javascript:void(0)" data-open="competition" data-value="${item.competition}">${t.competition_radar}</a>
      <span>•</span>
      <a href="javascript:void(0)" data-open="country" data-value="${item.country}">${t.country_radar}</a>
      <span>•</span>
      <span>${fmtTime(item.kickoff_utc)}</span>
    `;
    lock.innerHTML = `<span class="pro">${t.pro_badge}</span> · ${t.pro_locked_text} <button class="btn primary" type="button">${t.cta_pro}</button>`;
  });
}

function normalize(s){ return (s||"").toLowerCase().trim(); }

function groupByTime(matches){
  // groups by competition, sorted by kickoff
  const sorted = [...matches].sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
  const map = new Map();
  for(const m of sorted){
    const key = m.competition;
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.entries()].map(([name, ms])=>({name, matches: ms}));
}

function groupByCountry(matches){
  const sorted = [...matches].sort((a,b)=> new Date(a.kickoff_utc)-new Date(b.kickoff_utc));
  const map = new Map();
  for(const m of sorted){
    const key = m.country;
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  return [...map.entries()].map(([name, ms])=>({name, matches: ms}));
}

function renderCalendar(t, matches, viewMode, query){
  const root = qs("#calendar");
  root.innerHTML = "";

  const q = normalize(query);
  const filtered = matches.filter(m=>{
    if(!q) return true;
    const blob = `${m.country} ${m.competition} ${m.home} ${m.away}`.toLowerCase();
    return blob.includes(q);
  });

  const groups = (viewMode==="country") ? groupByCountry(filtered) : groupByTime(filtered);

  for(const g of groups){
    const box = document.createElement("div");
    box.className = "group";
    box.innerHTML = `
      <div class="group-head">
        <div class="group-title"><span class="flag"></span><span>${g.name}</span></div>
        <div class="group-actions">
          <span class="chip" data-open="competition" data-value="${viewMode==="country" ? "" : g.name}">${t.competition_radar}</span>
          <span class="chip" data-open="country" data-value="${viewMode==="country" ? g.name : ""}">${t.country_radar}</span>
        </div>
      </div>
      <div class="matches"></div>
    `;
    const list = box.querySelector(".matches");

    for(const m of g.matches){
      const row = document.createElement("div");
      row.className = "match";

      const form = (m.form_home || "WDLWD").slice(0,5).split("").map(ch=>`<span class="dot ${squareFor(ch)}"></span>`).join("");

      row.innerHTML = `
        <div class="time">${fmtTime(m.kickoff_utc)}</div>
        <div>
          <div class="teams">${m.home}<br/>${m.away}</div>
          <div class="subline">
            <div class="form" title="${t.form_label}">${form}</div>
            <div class="gfga"><span>${t.goals_label}</span> <span class="gf">${m.gf_home ?? 0}</span>/<span class="ga">${m.ga_home ?? 0}</span></div>
          </div>
          <div class="proline">
            <span class="lockicon">🔒</span>
            <span><span class="pro">${t.pro_badge}</span> · ${t.pro_locked_title}: Prob • EV • Odds</span>
          </div>
        </div>
        <div class="suggestion">${m.suggestion_free} • ${ (m.risk==="low")?t.risk_low:(m.risk==="high")?t.risk_high:t.risk_med }</div>
      `;
      list.appendChild(row);
    }

    root.appendChild(box);
  }

  // bind chips
  qsa("[data-open]").forEach(el=>{
    el.addEventListener("click", ()=>{
      const type = el.getAttribute("data-open");
      const val = el.getAttribute("data-value") || "";
      openModal(type, val);
    });
  });
}

let T = null;
let LANG = null;

function openModal(type, value){
  const back = qs("#modal_backdrop");
  const title = qs("#modal_title");
  const body = qs("#modal_body");

  const label = (type==="country") ? T.country_radar : T.competition_radar;
  title.textContent = value ? `${label}: ${value}` : label;

  body.innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between">
      <div style="font-weight:900">Radar</div>
      <button class="btn primary" type="button">${T.cta_pro}</button>
    </div>
    <div style="margin-top:12px;color:rgba(74,88,110,.95);font-weight:650">
      ${T.pro_locked_text}
    </div>
    <div style="margin-top:14px;padding:12px;border:1px dashed rgba(43,111,242,.35);border-radius:16px;background:rgba(43,111,242,.06);font-weight:800;color:#163261">
      🔒 ${T.pro_badge}: Probabilidades • EV • Odds • Estatísticas avançadas
    </div>
  `;

  back.style.display = "flex";
}

function closeModal(){
  const back = qs("#modal_backdrop");
  back.style.display = "none";
}

async function init(){
  LANG = pathLang() || detectLang();
  const dict = await loadJSON("/i18n/strings.json", {});
  T = dict[LANG] || dict.en;

  setText("brand", T.brand);
  setText("disclaimer", T.disclaimer);

  setNav(LANG, T);

  const p = pageType();
  if(p==="day"){
    setText("hero_title", T.hero_title_day);
    setText("hero_sub", T.hero_sub_day);
    const radar = await loadJSON("/data/v1/radar_day.json", {highlights:[]});
    renderTop3(T, radar);
  } else if(p==="week"){
    setText("hero_title", T.hero_title_week);
    setText("hero_sub", T.hero_sub_week);
    // reaproveita top3 com highlights vazios; week terá card area como “status”
    renderTop3(T, {highlights:[]});
  } else {
    setText("hero_title", T.hero_title_cal);
    setText("hero_sub", T.hero_sub_cal);
    renderTop3(T, {highlights:[]});
  }

  // Calendar controls always available
  setText("calendar_title", T.calendar_title);
  setText("calendar_sub", T.calendar_sub);
  qs("#search").setAttribute("placeholder", T.search_placeholder);
  qs("#btn_time").textContent = T.view_by_time;
  qs("#btn_country").textContent = T.view_by_country;

  let viewMode = "time";
  let q = "";
  const data = await loadJSON("/data/v1/calendar_7d.json", {matches:[]});

  function rerender(){
    qs("#btn_time").classList.toggle("active", viewMode==="time");
    qs("#btn_country").classList.toggle("active", viewMode==="country");
    renderCalendar(T, data.matches, viewMode, q);
  }

  qs("#btn_time").addEventListener("click", ()=>{ viewMode="time"; rerender(); });
  qs("#btn_country").addEventListener("click", ()=>{ viewMode="country"; rerender(); });
  qs("#search").addEventListener("input", (e)=>{ q=e.target.value; rerender(); });

  qs("#modal_close").addEventListener("click", closeModal);
  qs("#modal_backdrop").addEventListener("click", (e)=>{ if(e.target.id==="modal_backdrop") closeModal(); });

  // language switch (preserve page)
  qsa("[data-lang]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const target = btn.getAttribute("data-lang");
      const rest = location.pathname.split("/").slice(2).join("/");
      location.href = `/${target}/${rest}`.replace(/\/+/g,"/"); // keep trailing slash
    });
  });

  // year
  setText("year", String(new Date().getFullYear()));

  rerender();
}

document.addEventListener("DOMContentLoaded", init);
JS

# =========================
# 6) HTML pages (day/week/calendar) para 5 idiomas
# =========================
page() {
  local lang="$1"
  local page="$2"  # day|week|calendar
  local title="$3"
  local path="$lang/$4/index.html"

  cat > "$path" <<HTML
<!doctype html>
<html lang="$lang">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RadarTips • $title</title>
  <meta name="description" content="RadarTips: informational fixtures, quick suggestions and stats. Not a bookmaker. 18+." />
  <link rel="icon" href="/assets/favicon.svg" />
  <link rel="stylesheet" href="/assets/css/style.css" />
</head>
<body data-page="$page">
  <div class="container">
    <div class="topbar">
      <div class="brand">
        <div class="brandline">
          <div class="logo">
            <span id="brand">RadarTips</span>
            <span class="badge-mini" id="disclaimer">—</span>
          </div>
        </div>
        <div class="mini" id="subtitle"></div>
      </div>

      <div class="nav">
        <a class="pill" data-nav="day" href="#">—</a>
        <a class="pill" data-nav="week" href="#">—</a>
        <a class="pill" data-nav="calendar" href="#">—</a>

        <span style="width:10px"></span>

        <span class="lang" data-lang="en">EN</span>
        <span class="lang" data-lang="pt">PT</span>
        <span class="lang" data-lang="es">ES</span>
        <span class="lang" data-lang="fr">FR</span>
        <span class="lang" data-lang="de">DE</span>
      </div>
    </div>

    <div class="hero">
      <h1 id="hero_title">Radar</h1>
      <p id="hero_sub">—</p>

      <div class="grid">
        <div class="card" data-slot="1">
          <div class="row">
            <span class="badge risk low">$lang</span>
            <span class="badge top" style="opacity:.75">TOP 1</span>
          </div>
          <h3>—</h3>
          <div class="meta"></div>
          <div class="lock"><span class="pro">PRO</span> · — <button class="btn primary" type="button">PRO</button></div>
        </div>

        <div class="card" data-slot="2">
          <div class="row">
            <span class="badge risk med">$lang</span>
            <span class="badge top" style="opacity:.75">TOP 2</span>
          </div>
          <h3>—</h3>
          <div class="meta"></div>
          <div class="lock"><span class="pro">PRO</span> · — <button class="btn primary" type="button">PRO</button></div>
        </div>

        <div class="card" data-slot="3">
          <div class="row">
            <span class="badge risk high">$lang</span>
            <span class="badge top" style="opacity:.75">TOP 3</span>
          </div>
          <h3>—</h3>
          <div class="meta"></div>
          <div class="lock"><span class="pro">PRO</span> · — <button class="btn primary" type="button">PRO</button></div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 id="calendar_title">—</h2>
      <div class="sub" id="calendar_sub">—</div>

      <div class="controls">
        <div class="toggle">
          <button class="pill" id="btn_time" type="button">—</button>
          <button class="pill" id="btn_country" type="button">—</button>
        </div>
        <input class="input" id="search" type="text" placeholder="—" />
      </div>

      <div class="cal" id="calendar"></div>
    </div>

    <div class="footer">
      © <span id="year"></span> RadarTips
    </div>
  </div>

  <div class="modal-backdrop" id="modal_backdrop" role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title" id="modal_title">Radar</div>
        <button class="btn" id="modal_close" type="button">×</button>
      </div>
      <div class="modal-body" id="modal_body"></div>
    </div>
  </div>

  <link rel="stylesheet" href="/assets/css/match-radar-v2.css" />
  <script src="/assets/js/match-radar-v2.js"></script>
  <script src="/assets/js/app.js"></script>
</body>
</html>
HTML
}

for lang in en pt es fr de; do
  page "$lang" "day" "Radar" "radar/day"
  page "$lang" "week" "Radar" "radar/week"
  page "$lang" "calendar" "Calendar" "calendar"
done

# =========================
# 7) Root index (fallback redirect)
# =========================
cat > index.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>RadarTips</title>
  <script>
    (function(){
      function pick(){
        var host=(location.hostname||"").toLowerCase();
        if(host.endsWith(".com.br")) return "pt";
        var l=(navigator.language||"").toLowerCase();
        if(l.indexOf("pt")===0) return "pt";
        if(l.indexOf("es")===0) return "es";
        if(l.indexOf("fr")===0) return "fr";
        if(l.indexOf("de")===0) return "de";
        return "en";
      }
      if(location.pathname==="/"||location.pathname===""){
        location.replace("/"+pick()+"/radar/day/");
      }
    })();
  </script>
</head>
<body style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;padding:30px;">
  Redirecting…
</body>
</html>
HTML

# =========================
# 8) robots + sitemap + README
# =========================
cat > robots.txt <<'TXT'
User-agent: *
Allow: /

Sitemap: https://radartips.com/sitemap.xml
TXT

cat > sitemap.xml <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://radartips.com/en/radar/day/</loc></url>
  <url><loc>https://radartips.com/en/radar/week/</loc></url>
  <url><loc>https://radartips.com/en/calendar/</loc></url>

  <url><loc>https://radartips.com/pt/radar/day/</loc></url>
  <url><loc>https://radartips.com/pt/radar/week/</loc></url>
  <url><loc>https://radartips.com/pt/calendar/</loc></url>

  <url><loc>https://radartips.com/es/radar/day/</loc></url>
  <url><loc>https://radartips.com/es/radar/week/</loc></url>
  <url><loc>https://radartips.com/es/calendar/</loc></url>

  <url><loc>https://radartips.com/fr/radar/day/</loc></url>
  <url><loc>https://radartips.com/fr/radar/week/</loc></url>
  <url><loc>https://radartips.com/fr/calendar/</loc></url>

  <url><loc>https://radartips.com/de/radar/day/</loc></url>
  <url><loc>https://radartips.com/de/radar/week/</loc></url>
  <url><loc>https://radartips.com/de/calendar/</loc></url>
</urlset>
XML

cat > README.md <<'MD'
# RadarTips (Cloudflare Pages)

Static multi-language site (EN/PT/ES/FR/DE) designed for:
- Daily Radar (Top 3)
- Weekly Radar
- 7-day Calendar (by time / by country)
- Free view shows: fixture + suggestion + risk + basic stats
- PRO fields are shown as locked (probability/EV/odds)

## Deploy (Cloudflare Pages)
- Framework preset: None
- Build command: (empty)
- Output directory: /

## Data
Currently reads JSON from:
- /data/v1/radar_day.json
- /data/v1/radar_week.json
- /data/v1/calendar_7d.json

Next step: replace JSON generation with Cloudflare Worker Cron + KV/D1 (automation).
MD

echo "OK: Scaffold definitivo gerado."
echo "Próximo passo: git add/commit/push."
