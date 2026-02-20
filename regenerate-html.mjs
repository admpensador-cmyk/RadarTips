#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ler o arquivo scaffold e extrair a função de geração de HTML
const scaffoldContent = fs.readFileSync(path.join(__dirname, 'scaffold-radartips.sh'), 'utf-8');

// Extrair strings JSON do scaffold
const stringsMatch = scaffoldContent.match(/cat > i18n\/strings\.json <<'JSON'([\s\S]*?)^JSON/m);
const cssMatch = scaffoldContent.match(/cat > assets\/css\/style\.css <<'CSS'([\s\S]*?)^CSS/m);

if (!stringsMatch || !cssMatch) {
  console.error('❌ Erro: não foi possível extrair CSS ou i18n do scaffold');
  process.exit(1);
}

const i18nContent = stringsMatch[1].trim();
const cssContent = cssMatch[1].trim();

// Criar diretórios
const dirs = [
  'assets/css', 'assets/js', 'assets/img',
  'i18n', 'data/v1',
  'en/radar/day', 'en/radar/week', 'en/calendar',
  'pt/radar/day', 'pt/radar/week', 'pt/calendar',
  'es/radar/day', 'es/radar/week', 'es/calendar',
  'fr/radar/day', 'fr/radar/week', 'fr/calendar',
  'de/radar/day', 'de/radar/week', 'de/calendar'
];

dirs.forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Escrever arquivos
fs.writeFileSync(path.join(__dirname, 'i18n/strings.json'), i18nContent);
fs.writeFileSync(path.join(__dirname, 'assets/css/style.css'), cssContent);

console.log('✅ CSS e i18n regenerados');

// Agora parse as strings para gerar os HTMLs
const i18n = JSON.parse(i18nContent);

const languages = Object.keys(i18n);
const pages = [
  { key: 'day', title: 'hero_title_day', path: 'radar/day' },
  { key: 'week', title: 'hero_title_week', path: 'radar/week' },
  { key: 'calendar', title: 'hero_title_cal', path: 'calendar' }
];

// Template base para HTML
function generateHtml(lang, page, strings) {
  const title = strings[page.title] || 'Radar';
  const pageName = page.key;

  return `<!doctype html>
<html lang="${lang}">
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-ME07NV3W8Y"></script>
  <script>window.dataLayer=window.dataLayer||[]; function gtag(){dataLayer.push(arguments);} gtag('js', new Date()); gtag('config','G-ME07NV3W8Y', { anonymize_ip: true });</script>

  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RadarTips • ${title}</title>
  <meta name="description" content="RadarTips: informational fixtures, quick suggestions and stats. Not a bookmaker. 18+." />
  <link rel="icon" href="/assets/favicon.svg" />
  <link rel="stylesheet" href="/assets/css/style.css?v=11" />
</head>
<body data-page="${pageName}">
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

        <span style="width:10px"></span>

        
        <button class="lang theme-toggle" id="theme_toggle" type="button" aria-label="Theme">☾</button>

        <span class="lang" data-lang="en">EN</span>
        <span class="lang" data-lang="pt">PT</span>
        <span class="lang" data-lang="es">ES</span>
        <span class="lang" data-lang="fr">FR</span>
        <span class="lang" data-lang="de">DE</span>
      </div>
    </div>

    <div class="hero">
      <div class="hero-header">
        <h1 id="hero_title">Radar</h1>
        <p id="hero_sub">—</p>
      </div>

      <div class="grid">
        <div class="card" data-slot="1">
          <div class="row">
            <span class="badge risk low">pt</span>
            <span class="badge top" style="opacity:.75">TOP 1</span>
          </div>
          <h3><span>—</span> <span class="vs">vs</span> <span>—</span></h3>
          <div class="meta"></div>
          <div class="suggestion-highlight">—</div>
          <div class="lock"></div>
        </div>

        <div class="card" data-slot="2">
          <div class="row">
            <span class="badge risk med">pt</span>
            <span class="badge top" style="opacity:.75">TOP 2</span>
          </div>
          <h3><span>—</span> <span class="vs">vs</span> <span>—</span></h3>
          <div class="meta"></div>
          <div class="suggestion-highlight">—</div>
          <div class="lock"></div>
        </div>

        <div class="card" data-slot="3">
          <div class="row">
            <span class="badge risk high">pt</span>
            <span class="badge top" style="opacity:.75">TOP 3</span>
          </div>
          <h3><span>—</span> <span class="vs">vs</span> <span>—</span></h3>
          <div class="meta"></div>
          <div class="suggestion-highlight">—</div>
          <div class="lock"></div>
        </div>
      </div>
    </div>

    <div class="section" id="calendar_section">
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

  <script>
    window.RT_LOCALE = "${lang}";
  </script>
  <script src="/assets/radar.js"></script>
  <link rel="stylesheet" href="/assets/match-radar-v2.66f5a85a02d7.css" />
</body>
</html>
`;
}

// Gerar HTMLs para todas as combinações de lang+page
languages.forEach(lang => {
  const langStrings = i18n[lang];
  pages.forEach(page => {
    const htmlContent = generateHtml(lang, page, langStrings);
    const filePath = path.join(__dirname, lang, page.path, 'index.html');
    fs.writeFileSync(filePath, htmlContent);
    console.log(`✅ ${filePath}`);
  });
});

console.log('\n✨ Regeneração concluída com sucesso!');
