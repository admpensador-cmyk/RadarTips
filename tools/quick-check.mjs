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

  const standingsEntries = manifest.entries.filter(e => e.standings?.file);
  if (!standingsEntries.length) {
    throw new Error("No standings entry found in manifest");
  }

  const shuffled = standingsEntries.slice();
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = tmp;
  }

  const sample = shuffled.slice(0, Math.min(3, shuffled.length));
  console.log(`[quick-check] manifest: ${manifestUrl}`);
  console.log(`[quick-check] sampling ${sample.length} leagues`);

  for (const entry of sample) {
    console.log(`[quick-check] standings: ${entry.standings.file}`);
    await fetchJSON(`${BASE_URL}/${entry.standings.file}`);

    if (entry.compstats?.file) {
      console.log(`[quick-check] compstats: ${entry.compstats.file}`);
      await fetchJSON(`${BASE_URL}/${entry.compstats.file}`);
    } else {
      console.log("[quick-check] compstats: none for this league");
    }
  }

  console.log("✅ quick-check passed");
}

main().catch(err => {
  console.error(`❌ quick-check failed: ${err.message}`);
  process.exit(1);
});
