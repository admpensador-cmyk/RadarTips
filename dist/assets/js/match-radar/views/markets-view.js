function riskPercent(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `${Math.round(n * 100)}%`;
}

function oddString(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

export function renderMarketsView({ state, t, escapeHtml }) {
  const markets = Array.isArray(state?.data?.markets) ? state.data.markets : [];
  if (!markets.length) {
    return `<div class="mr-v2-empty">${t("match_radar.empty", "Sem dados disponiveis")}</div>`;
  }

  const rows = markets.map((m) => {
    const market = escapeHtml(m.market || "-");
    const line = escapeHtml(m.line || m.pick || "-");
    const reason = escapeHtml(m.reason || "-");
    return `<tr><td class="mr-market">${market}</td><td class="mr-line">${line}</td><td class="mr-risk">${riskPercent(m.risk)}</td><td class="mr-odd">${oddString(m.odd_fair)}</td><td class="mr-reason">${reason}</td></tr>`;
  }).join("");

  return `
    <div class="mr-table-wrap">
      <table class="mr-table">
        <thead>
          <tr>
            <th>${t("match_radar.columns.market", "Mercado")}</th>
            <th>${t("match_radar.columns.line", "Linha")}</th>
            <th>${t("match_radar.columns.risk", "Risco")}</th>
            <th>${t("match_radar.columns.odd_fair", "Odd Justa")}</th>
            <th>${t("match_radar.columns.reason", "Justificativa")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
