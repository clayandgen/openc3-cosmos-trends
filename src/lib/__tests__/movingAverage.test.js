import { describe, it, expect } from 'vitest'
import { movingAverageFit } from '../movingAverage'

describe('movingAverageFit', () => {
  const linearData = Array.from({ length: 20 }, (_, i) => [i, i * 2])

  it('alpha=1 → EMA equals raw data', () => {
    const data = Array.from({ length: 10 }, (_, i) => [i, i * 3 + 1])
    const result = movingAverageFit(data, 1)
    expect(result).not.toBeNull()
    for (let i = 0; i < data.length; i++) {
      expect(result.points[i][1]).toBeCloseTo(data[i][1], 5)
    }
  })

  it('alpha=0 → EMA stays at first value', () => {
    const data = Array.from({ length: 10 }, (_, i) => [i, i * 5])
    const result = movingAverageFit(data, 0)
    expect(result).not.toBeNull()
    for (const [, y] of result.points) {
      expect(y).toBeCloseTo(0, 5) // stays at ys[0] = 0
    }
  })

  it('predict in-range returns a value', () => {
    const result = movingAverageFit(linearData, 0.3)
    const predicted = result.predict(10)
    expect(isFinite(predicted)).toBe(true)
  })

  it('predict beyond range extrapolates', () => {
    const result = movingAverageFit(linearData, 0.3)
    const atEnd = result.predict(19)
    const beyond = result.predict(30)
    expect(beyond).toBeGreaterThan(atEnd)
  })

  it('returns correct shape', () => {
    const result = movingAverageFit(linearData, 0.3)
    expect(result).toHaveProperty('string')
    expect(result).toHaveProperty('r2')
    expect(result).toHaveProperty('rmse')
    expect(result).toHaveProperty('predict')
    expect(result).toHaveProperty('points')
    expect(typeof result.predict).toBe('function')
    expect(result.points).toHaveLength(linearData.length)
  })

  it('returns null for insufficient data', () => {
    expect(movingAverageFit(null)).toBeNull()
    expect(movingAverageFit([[0, 1]])).toBeNull()
  })
})
