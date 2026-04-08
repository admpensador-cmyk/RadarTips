#!/usr/bin/env node
/**
 * REMOVED: this file used to synthesize profile rows from standings + goal totals.
 * Team Profile for Brasileirão now requires real fixtures only (schema v2).
 *
 * Regenerate data/preview/brasileirao/profile-finished-matches.json with:
 *   npm run pipeline:brasileirao:preview
 *
 * Validate:
 *   node tools/validate-profile-finished-matches.mjs
 */
console.error(
  "This generator was removed (synthetic / standings-based rows are not allowed).\n" +
    "Run: npm run pipeline:brasileirao:preview\n" +
    "Then: node tools/validate-profile-finished-matches.mjs"
);
process.exit(1);
