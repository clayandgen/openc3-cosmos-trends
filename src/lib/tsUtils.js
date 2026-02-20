// Shared utilities for time-series models

// Linear interpolation between fitted values at sorted x positions
export function interpolate(xs, vals, x) {
  const n = xs.length
  if (x <= xs[0]) return vals[0]
  if (x >= xs[n - 1]) return vals[n - 1]

  // Binary search for the bracketing interval
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (xs[mid] <= x) lo = mid
    else hi = mid
  }

  const dx = xs[hi] - xs[lo]
  if (dx === 0) return vals[lo]
  const t = (x - xs[lo]) / dx
  return vals[lo] + t * (vals[hi] - vals[lo])
}

// Weighted average slope from the last portion of fitted values
// Gives more weight to recent segments for stable extrapolation
export function avgSlope(xs, vals) {
  const n = xs.length
  if (n < 2) return 0

  // Use up to the last 20% of points (min 2 segments)
  const windowSize = Math.max(2, Math.ceil(n * 0.2))
  const start = n - windowSize

  let weightedSlope = 0
  let totalWeight = 0
  for (let i = start; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i]
    if (dx === 0) continue
    const slope = (vals[i + 1] - vals[i]) / dx
    const weight = i - start + 1 // linearly increasing weight
    weightedSlope += slope * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedSlope / totalWeight : 0
}

// Calculate R² and RMSE from original values and fitted values
export function calcFitStats(ys, fitted) {
  const n = ys.length
  const mean = ys.reduce((a, b) => a + b, 0) / n
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    ssTot += (ys[i] - mean) ** 2
    ssRes += (ys[i] - fitted[i]) ** 2
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
  const rmse = Math.sqrt(ssRes / n)
  return { r2, rmse }
}
