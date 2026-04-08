/**
 * Team Profile v1 — winsorized percentile normalization (cohort-relative).
 * engine_version metadata references this as normalization_method = "winsorized_percentile_v1"
 */

export const NORMALIZATION_METHOD_ID = "winsorized_percentile_v1";

const DEFAULT_WINSOR_LOW = 0.05;
const DEFAULT_WINSOR_HIGH = 0.95;

/**
 * @param {number[]} sorted ascending finite numbers, length >= 1
 * @param {number} p in [0,1]
 */
export function quantileSorted(sorted, p) {
  if (!sorted.length) return null;
  const clamped = Math.min(1, Math.max(0, p));
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * clamped;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

/**
 * Winsorize a single value against cohort distribution.
 * @param {number} value
 * @param {number[]} cohort finite values (any order)
 * @param {number} pLow
 * @param {number} pHigh
 * @returns {number|null}
 */
export function winsorizeValue(value, cohort, pLow = DEFAULT_WINSOR_LOW, pHigh = DEFAULT_WINSOR_HIGH) {
  const vals = cohort.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  if (!vals.length || !Number.isFinite(value)) return null;
  const lo = quantileSorted(vals, pLow);
  const hi = quantileSorted(vals, pHigh);
  if (lo == null || hi == null) return null;
  if (hi === lo) return value;
  return Math.min(hi, Math.max(lo, value));
}

/**
 * Percentile rank 0–100: proportion of winsorized cohort strictly below value + half ties.
 * Higher percentile = higher value in cohort (before invert flag).
 *
 * @param {number} value — raw metric for target team
 * @param {number[]} cohortValues — same metric for all cohort teams (may include target)
 * @param {{ higherIsBetter?: boolean }} opts — if false, returned score is inverted (100 - p)
 * @returns {number|null}
 */
export function winsorizedPercentileScore(value, cohortValues, opts = {}) {
  const higherIsBetter = opts.higherIsBetter !== false;
  const vals = cohortValues.filter((x) => Number.isFinite(x));
  if (!Number.isFinite(value) || vals.length < 2) return null;

  const sorted = vals.slice().sort((a, b) => a - b);
  const lo = quantileSorted(sorted, DEFAULT_WINSOR_LOW);
  const hi = quantileSorted(sorted, DEFAULT_WINSOR_HIGH);
  if (lo == null || hi == null) return null;

  const w = sorted.map((x) => Math.min(hi, Math.max(lo, x)));
  const wTarget = Math.min(hi, Math.max(lo, value));

  let below = 0;
  let equal = 0;
  for (const x of w) {
    if (x < wTarget) below++;
    else if (x === wTarget) equal++;
  }
  const n = w.length;
  const midrank = (below + 0.5 * equal) / n;
  let score = midrank * 100;

  if (!higherIsBetter) score = 100 - score;

  return Math.min(100, Math.max(0, Number(score.toFixed(4))));
}
