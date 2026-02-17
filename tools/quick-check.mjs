#!/usr/bin/env node

const DEFAULT_BASE = "https://radartips-data.m2otta-music.workers.dev/v1";
const BASE_URL = (process.env.QUICK_CHECK_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

async function fetchJSON(url) {
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

async function main() {
  const manifestUrl = `${BASE_URL}/manifest.json`;
  const manifest = await fetchJSON(manifestUrl);
  if (!manifest || !Array.isArray(manifest.entries)) {
    throw new Error("Invalid manifest structure");
  }

  const firstStandings = manifest.entries.find(e => e.standings?.file);
  const firstCompstats = manifest.entries.find(e => e.compstats?.file);

  if (!firstStandings) {
    throw new Error("No standings entry found in manifest");
  }

  console.log(`[quick-check] manifest: ${manifestUrl}`);
  console.log(`[quick-check] standings: ${firstStandings.standings.file}`);

  await fetchJSON(`${BASE_URL}/${firstStandings.standings.file}`);

  if (firstCompstats) {
    console.log(`[quick-check] compstats: ${firstCompstats.compstats.file}`);
    await fetchJSON(`${BASE_URL}/${firstCompstats.compstats.file}`);
  } else {
    console.log("[quick-check] compstats: none found in manifest");
  }

  console.log("✅ quick-check passed");
}

main().catch(err => {
  console.error(`❌ quick-check failed: ${err.message}`);
  process.exit(1);
});
