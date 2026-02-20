import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock uPlot before importing the module
vi.mock('uplot', () => {
  class FakeUPlot {
    constructor(opts, data, container) {
      this.opts = opts
      this.data = data
      this.series = [...opts.series]
    }
    setData(d) {
      this.data = d
    }
    addSeries(s, idx) {
      this.series.splice(idx, 0, s)
    }
    delSeries(idx) {
      this.series.splice(idx, 1)
    }
    setSize() {}
    destroy() {}
  }
  return { default: FakeUPlot }
})

// Mock the CSS import
vi.mock('uplot/dist/uPlot.min.css', () => ({}))

// Mock ResizeObserver
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
}

import {
  createChart,
  updateThreshold,
  addTrendSeries,
  removeTrendSeries,
} from '../chartRenderer'

function makeContainer() {
  return { clientWidth: 800 }
}

const headerRow = ['TIME', 'TEMP', 'PRESS']
const parsedData = [
  [100, 1, 10],
  [200, 2, 20],
  [300, 3, 30],
]

describe('createChart', () => {
  it('returns null when container is missing', () => {
    expect(createChart(null, headerRow, parsedData)).toBeNull()
  })

  it('returns null when data is missing', () => {
    expect(createChart(makeContainer(), headerRow, null)).toBeNull()
  })

  it('creates a chart with correct uData shape', () => {
    const result = createChart(makeContainer(), headerRow, parsedData)
    expect(result).not.toBeNull()
    expect(result.chart).toBeDefined()
    expect(result.uData).toHaveLength(3) // TIME, TEMP, PRESS
    expect(result.uData[0]).toEqual([100, 200, 300])
    expect(result.uData[1]).toEqual([1, 2, 3])
    expect(result.uData[2]).toEqual([10, 20, 30])
    expect(result.trendSeriesCount).toBe(0)
    expect(result.hasThreshold).toBe(false)
  })

  it('adds threshold series when threshold is provided', () => {
    const result = createChart(makeContainer(), headerRow, parsedData, null, 50)
    expect(result.hasThreshold).toBe(true)
    // uData should have an extra column for threshold
    expect(result.uData).toHaveLength(4)
    expect(result.uData[3]).toEqual([50, 50, 50])
  })

  it('re-applies an existing trend with future points', () => {
    const existingTrend = {
      label: 'Linear',
      points: [
        [100, 1],
        [200, 2],
        [300, 3],
        [400, 4], // future point
        [500, 5], // future point
      ],
    }
    const result = createChart(
      makeContainer(),
      headerRow,
      parsedData,
      existingTrend,
    )
    expect(result.trendSeriesCount).toBe(1)
    // Future timestamps should be appended
    expect(result.uData[0].length).toBeGreaterThan(3)
    // Trend data should be the last series
    const trendSeries = result.uData[result.uData.length - 1]
    expect(trendSeries.length).toBe(result.uData[0].length)
  })

  it('chart.destroy disconnects the ResizeObserver', () => {
    const result = createChart(makeContainer(), headerRow, parsedData)
    // Should not throw
    expect(() => result.chart.destroy()).not.toThrow()
  })
})

describe('updateThreshold', () => {
  let result

  beforeEach(() => {
    result = createChart(makeContainer(), headerRow, parsedData)
  })

  it('returns hasThreshold unchanged when chart is null', () => {
    expect(updateThreshold(null, [], false, 50)).toBe(false)
    expect(updateThreshold(null, [], true, 50)).toBe(true)
  })

  it('adds a new threshold when none exists', () => {
    const has = updateThreshold(
      result.chart,
      result.uData,
      false,
      42,
    )
    expect(has).toBe(true)
    const threshCol = result.uData[result.uData.length - 1]
    expect(threshCol.every((v) => v === 42)).toBe(true)
  })

  it('updates an existing threshold value', () => {
    // First add one
    updateThreshold(result.chart, result.uData, false, 42)
    // Then update it
    const has = updateThreshold(
      result.chart,
      result.uData,
      true,
      99,
    )
    expect(has).toBe(true)
    const threshCol = result.uData[result.uData.length - 1]
    expect(threshCol.every((v) => v === 99)).toBe(true)
  })

  it('removes threshold when value is invalid', () => {
    // Add threshold first
    updateThreshold(result.chart, result.uData, false, 42)
    const lengthBefore = result.uData.length
    const has = updateThreshold(
      result.chart,
      result.uData,
      true,
      null,
    )
    expect(has).toBe(false)
    expect(result.uData.length).toBe(lengthBefore - 1)
  })

  it('returns false when no threshold exists and value is invalid', () => {
    const has = updateThreshold(
      result.chart,
      result.uData,
      false,
      null,
    )
    expect(has).toBe(false)
  })
})

describe('addTrendSeries', () => {
  it('adds trend data aligned to chart timestamps', () => {
    const result = createChart(makeContainer(), headerRow, parsedData)
    const trendPoints = [
      [100, 10],
      [200, 20],
      [300, 30],
      [400, 40],
    ]
    const count = addTrendSeries(
      result.chart,
      result.uData,
      headerRow,
      0,
      false,
      trendPoints,
      'Linear Trend',
    )
    expect(count).toBe(1)
    // Future timestamp 400 should be appended
    expect(result.uData[0]).toContain(400)
  })

  it('re-adds threshold after trend when threshold exists', () => {
    const res = createChart(makeContainer(), headerRow, parsedData, null, 50)
    const trendPoints = [
      [100, 10],
      [200, 20],
      [300, 30],
    ]
    const count = addTrendSeries(
      res.chart,
      res.uData,
      headerRow,
      0,
      true,
      trendPoints,
      'Trend',
    )
    expect(count).toBe(1)
    // Last column should still be threshold
    const lastCol = res.uData[res.uData.length - 1]
    expect(lastCol[0]).toBe(50)
  })
})

describe('removeTrendSeries', () => {
  it('removes trend series and trims future timestamps', () => {
    const result = createChart(makeContainer(), headerRow, parsedData)
    const trendPoints = [
      [100, 10],
      [200, 20],
      [300, 30],
      [400, 40],
      [500, 50],
    ]
    const trendCount = addTrendSeries(
      result.chart,
      result.uData,
      headerRow,
      0,
      false,
      trendPoints,
      'Trend',
    )

    const remaining = removeTrendSeries(
      result.chart,
      result.uData,
      headerRow,
      trendCount,
      false,
    )
    expect(remaining).toBe(0)
    // Future timestamps (where all data cols are null) should be trimmed
    expect(result.uData[0].length).toBe(3)
    // Should be back to original column count
    expect(result.uData.length).toBe(headerRow.length)
  })

  it('preserves threshold after removing trends', () => {
    const res = createChart(makeContainer(), headerRow, parsedData, null, 50)
    const trendPoints = [
      [100, 10],
      [200, 20],
      [300, 30],
    ]
    const trendCount = addTrendSeries(
      res.chart,
      res.uData,
      headerRow,
      0,
      true,
      trendPoints,
      'Trend',
    )

    const remaining = removeTrendSeries(
      res.chart,
      res.uData,
      headerRow,
      trendCount,
      true,
    )
    expect(remaining).toBe(0)
    // Threshold should still be present as the last column
    const lastCol = res.uData[res.uData.length - 1]
    expect(lastCol.every((v) => v === 50)).toBe(true)
  })
})
