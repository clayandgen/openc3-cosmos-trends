import regression from 'regression'
import { sinusoidalFit } from './sinusoidalFit'
import { smaFit } from './sma'
import { movingAverageFit } from './movingAverage'
import { holtsLinearFit } from './holtsLinear'

const TREND_TYPES = [
  'linear',
  'polynomial',
  'exponential',
  'logarithmic',
  'power',
  'sinusoidal',
  'sma',
  'ema',
  'holts',
]

// Fit a trend to the given data points
// data: array of [timestamp, value] pairs (timestamps in seconds)
// config: { type: string, order?: number }
// Returns: { equation: string, r2: number, rmse: number, predict: (x) => y, points: [[x,y],...] }
export function fitTrend(data, config) {
  if (!data || data.length < 2) {
    return null
  }

  const type = config.type || 'linear'

  // Time-series models work directly on the raw data
  if (type === 'sma' || type === 'ema' || type === 'holts') {
    let result
    try {
      if (type === 'sma') {
        const windowSize = config.windowSize != null ? config.windowSize : 10
        result = smaFit(data, windowSize)
      } else if (type === 'ema') {
        const alpha = config.alpha != null ? config.alpha : 0.3
        result = movingAverageFit(data, alpha)
      } else {
        const alpha = config.alpha != null ? config.alpha : 0.3
        result = holtsLinearFit(data, alpha)
      }
    } catch {
      return null
    }
    if (!result) return null
    return {
      equation: result.string || '',
      r2: result.r2,
      rmse: result.rmse,
      predict: result.predict,
      t0: data[0][0],
      points: result.points,
    }
  }

  // Normalize timestamps: subtract t0 to avoid float precision issues
  const t0 = data[0][0]
  let normalized = data.map(([x, y]) => [x - t0, y])

  // For logarithmic/power: x must be > 0, but normalized[0][0] is 0.
  // Offset all x by 1 so the range starts at 1.
  let xOffset = 0
  if (type === 'logarithmic' || type === 'power') {
    xOffset = 1
    normalized = normalized.map(([x, y]) => [x + xOffset, y])
  }

  // For exponential/power: y must be > 0.
  // Shift y up if there are non-positive values.
  let yShift = 0
  if (type === 'exponential' || type === 'power') {
    const minY = Math.min(...normalized.map(([, y]) => y))
    if (minY <= 0) {
      yShift = Math.abs(minY) + 1
      normalized = normalized.map(([x, y]) => [x, y + yShift])
    }
  }

  let result
  try {
    if (type === 'sinusoidal') {
      result = sinusoidalFit(normalized)
    } else if (type === 'polynomial') {
      const order = config.order || 2
      result = regression.polynomial(normalized, { order, precision: 10 })
    } else if (TREND_TYPES.includes(type)) {
      result = regression[type](normalized, { precision: 10 })
    } else {
      return null
    }
  } catch {
    return null
  }

  if (!result || !result.predict) return null

  // Calculate RMSE on the shifted/offset data
  const rmse = calcRMSE(normalized, result.predict)

  // Build prediction function that reverses all transforms
  const predict = (x) => {
    const nx = x - t0 + xOffset
    const yArr = result.predict(nx)
    const rawY = Array.isArray(yArr) ? yArr[1] : yArr
    return rawY - yShift
  }

  // Calculate R² on original (un-shifted) data for accurate reporting
  const r2 = calcR2(data, predict)

  return {
    equation: result.string || '',
    r2,
    rmse,
    predict,
    t0,
    points: result.points,
  }
}

// Generate prediction points extending from lastTimestamp into the future
export function generatePredictionPoints(
  predict,
  startTimestamp,
  lastTimestamp,
  horizonSec,
  numPoints = 200,
) {
  const points = []
  const totalStart = startTimestamp
  const totalEnd = lastTimestamp + horizonSec
  const step = (totalEnd - totalStart) / (numPoints - 1)

  for (let i = 0; i < numPoints; i++) {
    const x = totalStart + step * i
    const y = predict(x)
    if (isFinite(y)) {
      points.push([x, y])
    }
  }
  return points
}

function calcRMSE(data, predictFn) {
  if (!data.length) return 0
  let sumSqErr = 0
  let count = 0
  for (const [x, y] of data) {
    const predicted = predictFn(x)
    const py = Array.isArray(predicted) ? predicted[1] : predicted
    if (isFinite(py)) {
      sumSqErr += (y - py) ** 2
      count++
    }
  }
  return count > 0 ? Math.sqrt(sumSqErr / count) : 0
}

function calcR2(data, predictFn) {
  const ys = data.map((d) => d[1])
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length
  let ssTot = 0
  let ssRes = 0
  for (const [x, y] of data) {
    ssTot += (y - mean) ** 2
    const py = predictFn(x)
    if (isFinite(py)) {
      ssRes += (y - py) ** 2
    }
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot
}

const TREND_LABELS = {
  sma: 'Simple Moving Avg',
  ema: 'Exponential Moving Avg',
  holts: "Holt's Linear",
}

function trendLabel(type) {
  return TREND_LABELS[type] || type.charAt(0).toUpperCase() + type.slice(1)
}

export { TREND_TYPES, TREND_LABELS, trendLabel }
