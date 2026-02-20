// Exponential Moving Average with linear extrapolation for forecasting
// alpha: smoothing factor (0–1), higher = more weight on recent data

import { interpolate, avgSlope, calcFitStats } from './tsUtils'

export function movingAverageFit(data, alpha = 0.3) {
  if (!data || data.length < 2) return null

  const n = data.length
  const xs = data.map((d) => d[0])
  const ys = data.map((d) => d[1])

  // Compute EMA
  const ema = new Array(n)
  ema[0] = ys[0]
  for (let i = 1; i < n; i++) {
    ema[i] = alpha * ys[i] + (1 - alpha) * ema[i - 1]
  }

  // Use weighted average of recent slopes for more stable extrapolation
  const slope = avgSlope(xs, ema)
  const lastX = xs[n - 1]
  const lastEma = ema[n - 1]

  const predict = (x) => {
    if (x <= lastX) {
      return interpolate(xs, ema, x)
    }
    return lastEma + slope * (x - lastX)
  }

  const { r2, rmse } = calcFitStats(ys, ema)
  const points = data.map((d, i) => [d[0], ema[i]])

  return {
    string: `EMA(α=${alpha})`,
    r2,
    rmse,
    predict,
    points,
  }
}
