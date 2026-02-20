import { describe, it, expect } from 'vitest'
import { holtsLinearFit } from '../holtsLinear'

describe('holtsLinearFit', () => {
  const linearData = Array.from({ length: 20 }, (_, i) => [i, i * 3 + 5])

  it('tracks linear data closely with good R²', () => {
    const result = holtsLinearFit(linearData, 0.5, 0.3)
    expect(result).not.toBeNull()
    expect(result.r2).toBeGreaterThan(0.9)
  })

  it('predict beyond range continues the trend', () => {
    const result = holtsLinearFit(linearData, 0.5, 0.3)
    const atEnd = result.predict(19)
    const beyond = result.predict(30)
    // Linear data with slope=3, prediction should increase
    expect(beyond).toBeGreaterThan(atEnd)
  })

  it('returns correct shape', () => {
    const result = holtsLinearFit(linearData, 0.3, 0.1)
    expect(result).toHaveProperty('string')
    expect(result).toHaveProperty('r2')
    expect(result).toHaveProperty('rmse')
    expect(result).toHaveProperty('predict')
    expect(result).toHaveProperty('points')
    expect(typeof result.predict).toBe('function')
    expect(result.points).toHaveLength(linearData.length)
    expect(result.string).toContain("Holt's")
  })

  it('returns null for insufficient data', () => {
    expect(holtsLinearFit(null)).toBeNull()
    expect(holtsLinearFit([[0, 1]])).toBeNull()
  })
})
