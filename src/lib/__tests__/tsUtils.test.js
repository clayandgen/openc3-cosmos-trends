import { describe, it, expect } from 'vitest'
import { interpolate, calcFitStats } from '../tsUtils'

describe('interpolate', () => {
  const xs = [0, 1, 2, 3, 4]
  const vals = [10, 20, 30, 40, 50]

  it('clamps to first value when x is below range', () => {
    expect(interpolate(xs, vals, -5)).toBe(10)
  })

  it('clamps to last value when x is above range', () => {
    expect(interpolate(xs, vals, 10)).toBe(50)
  })

  it('returns exact value at a known x', () => {
    expect(interpolate(xs, vals, 2)).toBe(30)
  })

  it('interpolates at midpoint', () => {
    expect(interpolate(xs, vals, 1.5)).toBe(25)
  })

  it('handles binary search with many points', () => {
    const manyXs = Array.from({ length: 100 }, (_, i) => i)
    const manyVals = manyXs.map((x) => x * 2)
    expect(interpolate(manyXs, manyVals, 50.5)).toBeCloseTo(101, 5)
  })

  it('handles equal-x values by returning the first', () => {
    const eqXs = [1, 1, 2]
    const eqVals = [10, 20, 30]
    // dx=0 at lo, should return vals[lo]
    expect(interpolate(eqXs, eqVals, 1)).toBe(10)
  })
})

describe('calcFitStats', () => {
  it('returns R²=1 and RMSE=0 for a perfect fit', () => {
    const ys = [1, 2, 3, 4, 5]
    const fitted = [1, 2, 3, 4, 5]
    const { r2, rmse } = calcFitStats(ys, fitted)
    expect(r2).toBeCloseTo(1, 10)
    expect(rmse).toBeCloseTo(0, 10)
  })

  it('returns R²≈0 for a poor fit', () => {
    const ys = [1, 2, 3, 4, 5]
    const mean = 3
    // Fitted values are just random noise far from the data
    const fitted = [5, 1, 5, 1, 5]
    const { r2 } = calcFitStats(ys, fitted)
    expect(r2).toBeLessThan(0.1)
  })

  it('returns R²=0 when data is flat (ssTot=0)', () => {
    const ys = [5, 5, 5, 5]
    const fitted = [5, 5, 5, 5]
    const { r2 } = calcFitStats(ys, fitted)
    expect(r2).toBe(0)
  })
})
