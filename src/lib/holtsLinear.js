// Holt's Linear (Double) Exponential Smoothing
// alpha: level smoothing (0–1), beta: trend smoothing (0–1)

import { interpolate, calcFitStats } from './tsUtils'

export function holtsLinearFit(data, alpha = 0.3, beta = 0.1) {
  if (!data || data.length < 2) return null

  const n = data.length
  const xs = data.map((d) => d[0])
  const ys = data.map((d) => d[1])

  // Initialize level and trend
  let level = ys[0]
  let trend = (ys[1] - ys[0]) / (xs[1] - xs[0] || 1)

  const fitted = new Array(n)
  fitted[0] = level

  for (let i = 1; i < n; i++) {
    const dt = xs[i] - xs[i - 1]
    const prevLevel = level
    level = alpha * ys[i] + (1 - alpha) * (prevLevel + trend * dt)
    trend = beta * ((level - prevLevel) / (dt || 1)) + (1 - beta) * trend
    fitted[i] = level
  }

  const lastX = xs[n - 1]

  const predict = (x) => {
    if (x <= lastX) {
      return interpolate(xs, fitted, x)
    }
    return level + trend * (x - lastX)
  }

  const { r2, rmse } = calcFitStats(ys, fitted)
  const points = data.map((d, i) => [d[0], fitted[i]])

  return {
    string: `Holt's(α=${alpha}, β=${beta})`,
    r2,
    rmse,
    predict,
    points,
  }
}
