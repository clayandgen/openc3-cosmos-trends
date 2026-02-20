import { describe, it, expect } from 'vitest'
import { sinusoidalFit } from '../sinusoidalFit'

describe('sinusoidalFit', () => {
  it('fits a pure sine wave with high R²', () => {
    const data = Array.from({ length: 200 }, (_, i) => {
      const x = i * 0.1
      return [x, 3 * Math.sin(1.5 * x + 0.5) + 7]
    })

    const result = sinusoidalFit(data)
    expect(result).not.toBeNull()
    expect(result.r2).toBeGreaterThan(0.9)
    expect(result.string).toContain('sin')
  })

  it('returns R²=0 for flat data', () => {
    const data = Array.from({ length: 20 }, (_, i) => [i, 5])
    const result = sinusoidalFit(data)
    expect(result.r2).toBe(0)
  })

  it('returns fallback for insufficient data', () => {
    const data = [
      [0, 1],
      [1, 2],
    ]
    const result = sinusoidalFit(data)
    expect(result).not.toBeNull()
    expect(result.r2).toBe(0)
    expect(result.string).toContain('Insufficient')
  })

  it('predict returns [x, y] pairs', () => {
    const data = Array.from({ length: 100 }, (_, i) => {
      const x = i * 0.1
      return [x, 2 * Math.sin(x) + 5]
    })
    const result = sinusoidalFit(data)
    const pred = result.predict(5)
    expect(Array.isArray(pred)).toBe(true)
    expect(pred).toHaveLength(2)
    expect(pred[0]).toBe(5)
    expect(isFinite(pred[1])).toBe(true)
  })
})
