export function renderDetailsView({ state, t, escapeHtml }) {
  const data = state?.data?.base || {};
  const leagueName = escapeHtml(data?.league?.name || "");
  const country = escapeHtml(data?.league?.country || "");
  const kickoff = escapeHtml(String(data?.datetimeUtc || ""));
  const fixtureId = escapeHtml(String(state?.fixtureId || ""));

  return `
    <div class="mr-v2-details">
      <div class="mr-v2-detail-row"><strong>${t("match_radar.details.fixture", "Fixture")}</strong><span>#${fixtureId || "-"}</span></div>
      <div class="mr-v2-detail-row"><strong>${t("match_radar.details.league", "Liga")}</strong><span>${leagueName || "-"}</span></div>
      <div class="mr-v2-detail-row"><strong>${t("match_radar.details.country", "Pais")}</strong><span>${country || "-"}</span></div>
      <div class="mr-v2-detail-row"><strong>${t("match_radar.details.kickoff", "Kickoff UTC")}</strong><span>${kickoff || "-"}</span></div>
    </div>
  `;
}
