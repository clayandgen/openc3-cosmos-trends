import { describe, it, expect } from 'vitest'
import {
  fitTrend,
  generatePredictionPoints,
  TREND_TYPES,
  trendLabel,
} from '../trendEngine'

const linearData = Array.from({ length: 50 }, (_, i) => [1000 + i, i * 2 + 1])

describe('fitTrend', () => {
  it.each(['linear', 'polynomial', 'exponential', 'logarithmic', 'power'])(
    'returns non-null result with expected keys for %s',
    (type) => {
      const result = fitTrend(linearData, { type })
      expect(result).not.toBeNull()
      expect(result).toHaveProperty('equation')
      expect(result).toHaveProperty('r2')
      expect(result).toHaveProperty('rmse')
      expect(result).toHaveProperty('predict')
      expect(result).toHaveProperty('t0')
      expect(typeof result.predict).toBe('function')
    },
  )

  it.each(['sma', 'ema', 'holts'])(
    'returns non-null result with expected keys for %s',
    (type) => {
      const result = fitTrend(linearData, { type })
      expect(result).not.toBeNull()
      expect(result).toHaveProperty('equation')
      expect(result).toHaveProperty('r2')
      expect(result).toHaveProperty('rmse')
      expect(result).toHaveProperty('predict')
      expect(result).toHaveProperty('t0')
      expect(result).toHaveProperty('points')
    },
  )

  it('returns non-null result for sinusoidal', () => {
    const sineData = Array.from({ length: 100 }, (_, i) => [
      i,
      Math.sin(i * 0.2) * 5 + 10,
    ])
    const result = fitTrend(sineData, { type: 'sinusoidal' })
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('predict')
  })

  it('returns null for insufficient data', () => {
    expect(fitTrend(null, { type: 'linear' })).toBeNull()
    expect(fitTrend([[0, 1]], { type: 'linear' })).toBeNull()
    expect(fitTrend([], { type: 'linear' })).toBeNull()
  })

  it('returns null for unknown type', () => {
    expect(fitTrend(linearData, { type: 'notreal' })).toBeNull()
  })
})

describe('generatePredictionPoints', () => {
  it('returns correct number of points spanning the range', () => {
    const predict = (x) => x * 2
    const points = generatePredictionPoints(predict, 0, 100, 50, 50)
    expect(points).toHaveLength(50)
    // First point should be at startTimestamp
    expect(points[0][0]).toBeCloseTo(0)
    // Last point should be at lastTimestamp + horizonSec
    expect(points[points.length - 1][0]).toBeCloseTo(150)
  })

  it('filters out non-finite predictions', () => {
    const predict = (x) => (x === 0 ? Infinity : x)
    const points = generatePredictionPoints(predict, 0, 10, 5, 10)
    for (const [, y] of points) {
      expect(isFinite(y)).toBe(true)
    }
  })
})

describe('TREND_TYPES', () => {
  it('contains all 9 types', () => {
    expect(TREND_TYPES).toHaveLength(9)
    expect(TREND_TYPES).toContain('linear')
    expect(TREND_TYPES).toContain('polynomial')
    expect(TREND_TYPES).toContain('exponential')
    expect(TREND_TYPES).toContain('logarithmic')
    expect(TREND_TYPES).toContain('power')
    expect(TREND_TYPES).toContain('sinusoidal')
    expect(TREND_TYPES).toContain('sma')
    expect(TREND_TYPES).toContain('ema')
    expect(TREND_TYPES).toContain('holts')
  })
})

describe('trendLabel', () => {
  it('returns display names for sma, ema, holts', () => {
    expect(trendLabel('sma')).toBe('Simple Moving Avg')
    expect(trendLabel('ema')).toBe('Exponential Moving Avg')
    expect(trendLabel('holts')).toBe("Holt's Linear")
  })

  it('capitalizes other types', () => {
    expect(trendLabel('linear')).toBe('Linear')
    expect(trendLabel('polynomial')).toBe('Polynomial')
  })
})
