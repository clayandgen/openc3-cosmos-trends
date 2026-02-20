import { describe, it, expect } from 'vitest'
import { smaFit } from '../sma'

describe('smaFit', () => {
  it('returns SMA equal to constant for constant data', () => {
    const data = Array.from({ length: 20 }, (_, i) => [i, 5])
    const result = smaFit(data, 5)
    expect(result).not.toBeNull()
    expect(result.r2).toBeCloseTo(0, 1) // ssTot=0 → r2=0
    // All fitted points should be 5
    for (const [, y] of result.points) {
      expect(y).toBeCloseTo(5, 5)
    }
  })

  it('clamps window size to minimum of 2', () => {
    const data = Array.from({ length: 10 }, (_, i) => [i, i * 2])
    const result = smaFit(data, 0)
    expect(result).not.toBeNull()
    expect(result.string).toContain('SMA(window=2)')
  })

  it('clamps window size to max of n', () => {
    const data = Array.from({ length: 5 }, (_, i) => [i, i])
    const result = smaFit(data, 100)
    expect(result).not.toBeNull()
    expect(result.string).toContain('SMA(window=5)')
  })

  it('predict in-range returns interpolated value', () => {
    const data = Array.from({ length: 20 }, (_, i) => [i, i * 3])
    const result = smaFit(data, 5)
    // In-range prediction should be close to the SMA at that point
    const predicted = result.predict(10)
    expect(isFinite(predicted)).toBe(true)
  })

  it('predict beyond range extrapolates linearly', () => {
    const data = Array.from({ length: 20 }, (_, i) => [i, i * 2])
    const result = smaFit(data, 5)
    const lastX = 19
    const beyondPred = result.predict(lastX + 10)
    // Should extrapolate based on slope — for linear data this should be roughly 2*29
    expect(beyondPred).toBeGreaterThan(result.predict(lastX))
  })

  it('returns null for insufficient data', () => {
    expect(smaFit(null)).toBeNull()
    expect(smaFit([[0, 1]])).toBeNull()
  })
})
