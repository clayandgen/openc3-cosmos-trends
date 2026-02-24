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
