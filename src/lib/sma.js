// Simple Moving Average with linear extrapolation for forecasting
// windowSize: number of points to average over

import { interpolate, avgSlope, calcFitStats } from './tsUtils'

export function smaFit(data, windowSize = 10) {
  if (!data || data.length < 2) return null

  const n = data.length
  const w = Math.max(2, Math.min(Math.round(windowSize), n))
  const xs = data.map((d) => d[0])
  const ys = data.map((d) => d[1])

  // Compute SMA using a rolling window
  const sma = new Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += ys[i]
    if (i >= w) {
      sum -= ys[i - w]
    }
    const count = Math.min(i + 1, w)
    sma[i] = sum / count
  }

  // Use weighted average of recent slopes for extrapolation
  const slope = avgSlope(xs, sma)
  const lastX = xs[n - 1]
  const lastSma = sma[n - 1]

  const predict = (x) => {
    if (x <= lastX) {
      return interpolate(xs, sma, x)
    }
    return lastSma + slope * (x - lastX)
  }

  const { r2, rmse } = calcFitStats(ys, sma)
  const points = data.map((d, i) => [d[0], sma[i]])

  return {
    string: `SMA(window=${w})`,
    r2,
    rmse,
    predict,
    points,
  }
}
