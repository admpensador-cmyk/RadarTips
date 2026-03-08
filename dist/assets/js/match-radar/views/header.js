export function renderHeader({ homeName, awayName, score, homeShield, awayShield, showFullscreenCta, t }) {
  const fullViewLabel = t("match_radar.full_view", "Visualizacao completa");
  const fullAction = showFullscreenCta
    ? `<button class="mr-v2-fullview" data-mr-fullview>${fullViewLabel}</button>`
    : "";

  return `
    <div class="mr-v2-head">
      <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
        ${homeShield}${awayShield}
        <div class="mr-v2-title">${homeName} vs ${awayName} ${score || ""}</div>
      </div>
      <div class="mr-v2-actions">${fullAction}<button class="mr-v2-close">x</button></div>
    </div>
  `;
}
