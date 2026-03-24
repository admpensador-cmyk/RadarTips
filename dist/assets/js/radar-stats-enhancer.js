// Lazy enhancement hooks for Match Radar stats panel.
// This module is loaded on demand via dynamic import after the base stats UI is rendered.

export function enhanceRadarStats(panel, api) {
  if (!panel || !api) return;

  // Add non-blocking metadata badge after initial paint.
  const meta = api && api.meta && typeof api.meta === 'object' ? api.meta : {};
  const fixture = meta.fixture_id || meta.fixtureId || null;
  const source = meta.source || 'api/match-stats';

  const host = panel.querySelector('.rt-statsv2');
  if (!host) return;
  if (host.querySelector('.mr-v2-lazy-meta')) return;

  const badge = document.createElement('div');
  badge.className = 'mr-v2-lazy-meta';
  badge.style.cssText = 'margin-top:8px;font-size:11px;color:#8aa0b6;opacity:.8';
  badge.textContent = fixture
    ? `Stats source: ${source} • Fixture ${fixture}`
    : `Stats source: ${source}`;

  host.appendChild(badge);
}
