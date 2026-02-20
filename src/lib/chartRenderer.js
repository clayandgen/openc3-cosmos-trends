import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

const COLORS = [
  '#00c7cb',
  '#938bdb',
  '#4dacff',
  'lime',
  'darkorange',
  'red',
  '#ff69b4',
  '#00fa9a',
]

const TREND_COLOR = '#ff6b6b'
const THRESHOLD_COLOR = '#ffa726'

const THRESHOLD_SERIES = {
  label: 'Threshold',
  stroke: THRESHOLD_COLOR,
  width: 2,
  dash: [6, 4],
  points: { show: false },
}

// Build uPlot-shaped data arrays from parsed CSV data
// Returns [times[], col1[], col2[], ...]
function buildUData(parsedData, numCols) {
  const uData = Array.from({ length: numCols }, () => [])
  for (const row of parsedData) {
    for (let c = 0; c < numCols; c++) {
      uData[c].push(row[c])
    }
  }
  return uData
}

// Create a new uPlot chart and render it into a container
// Returns { chart, uData }
export function createChart(container, headerRow, parsedData, existingTrend, threshold, timeZone) {
  if (!container || !parsedData) return null

  const numCols = headerRow.length
  const uData = buildUData(parsedData, numCols)

  const series = [
    {
      label: headerRow[0],
      value: (u, v) => {
        if (v == null) return '--'
        const d = new Date(v * 1000)
        const utc = timeZone === 'utc'
        const year = utc ? d.getUTCFullYear() : d.getFullYear()
        const month = utc ? d.getUTCMonth() + 1 : d.getMonth() + 1
        const day = utc ? d.getUTCDate() : d.getDate()
        const hrs = utc ? d.getUTCHours() : d.getHours()
        const min = utc ? d.getUTCMinutes() : d.getMinutes()
        const sec = utc ? d.getUTCSeconds() : d.getSeconds()
        const date = year + '-' +
          String(month).padStart(2, '0') + '-' +
          String(day).padStart(2, '0')
        const time = String(hrs).padStart(2, '0') + ':' +
          String(min).padStart(2, '0') + ':' +
          String(sec).padStart(2, '0')
        return date + '\n' + time + (utc ? ' UTC' : '')
      },
    },
  ]
  for (let c = 1; c < numCols; c++) {
    series.push({
      label: headerRow[c],
      stroke: COLORS[(c - 1) % COLORS.length],
      width: 2,
    })
  }

  let trendSeriesCount = 0

  // Re-apply an existing trend (e.g. when navigating back to step 3)
  if (existingTrend && existingTrend.points) {
    const lastDataTime = uData[0][uData[0].length - 1]
    const futurePts = existingTrend.points.filter((p) => p[0] > lastDataTime)

    for (const pt of futurePts) {
      uData[0].push(pt[0])
      for (let c = 1; c < numCols; c++) {
        uData[c].push(null)
      }
    }

    const trendData = interpolateTrendData(uData[0], existingTrend.points)
    uData.push(trendData)

    series.push({
      label: `${existingTrend.label} Trend`,
      stroke: TREND_COLOR,
      width: 2,
      dash: [10, 5],
      points: { show: false },
    })
    trendSeriesCount = 1
  }

  // Add threshold as a flat series
  let hasThreshold = threshold != null && isFinite(threshold)
  if (hasThreshold) {
    uData.push(uData[0].map(() => threshold))
    series.push({ ...THRESHOLD_SERIES })
  }

  const width = container.clientWidth || 800
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0
  const height = Math.max(400, Math.round(vh * 0.6))

  const opts = {
    width,
    height,
    series,
    scales: { x: { time: true } },
    axes: [
      { stroke: '#888', grid: { stroke: 'rgba(255,255,255,0.1)' } },
      { stroke: '#888', grid: { stroke: 'rgba(255,255,255,0.1)' } },
    ],
    cursor: { drag: { x: true, y: false } },
  }

  // Shift dates so uPlot's local-time axis labels display UTC values
  if (timeZone === 'utc') {
    opts.tzDate = (ts) => {
      const d = new Date(ts * 1000)
      return new Date(d.getTime() + d.getTimezoneOffset() * 60000)
    }
  }

  const chart = new uPlot(
    opts,
    uData,
    container,
  )

  const ro = new ResizeObserver((entries) => {
    const cr = entries[0].contentRect
    if (cr.width > 0) {
      const wh = typeof window !== 'undefined' ? window.innerHeight : 0
      const h = Math.max(400, Math.round(wh * 0.6))
      chart.setSize({ width: cr.width, height: h })
    }
  })
  ro.observe(container)

  const origDestroy = chart.destroy.bind(chart)
  chart.destroy = () => {
    ro.disconnect()
    origDestroy()
  }

  return { chart, uData, trendSeriesCount, hasThreshold }
}

// Update or add/remove threshold series on an existing chart
export function updateThreshold(chart, uData, hasThreshold, value) {
  if (!chart) return hasThreshold
  const valid = value != null && isFinite(value)

  if (hasThreshold) {
    if (valid) {
      // Update existing threshold data
      const idx = uData.length - 1
      uData[idx] = uData[0].map(() => value)
      chart.setData(uData)
    } else {
      // Remove threshold series
      const idx = uData.length - 1
      uData.splice(idx, 1)
      chart.delSeries(idx)
      chart.setData(uData)
      return false
    }
  } else if (valid) {
    // Add new threshold series
    uData.push(uData[0].map(() => value))
    chart.addSeries({ ...THRESHOLD_SERIES }, uData.length - 1)
    chart.setData(uData)
    return true
  }

  return hasThreshold
}

// Add a trend overlay to an existing chart
export function addTrendSeries(chart, uData, headerRow, trendSeriesCount, hasThreshold, points, label) {
  const lastDataTime = uData[0][uData[0].length - 1]
  const futurePts = points.filter((p) => p[0] > lastDataTime)
  const numCols = headerRow.length

  // Remove threshold temporarily so trend inserts before it
  let threshData = null
  if (hasThreshold) {
    threshData = uData.pop()
    chart.delSeries(uData.length)
  }

  for (const pt of futurePts) {
    uData[0].push(pt[0])
    for (let c = 1; c < numCols + trendSeriesCount; c++) {
      uData[c].push(null)
    }
  }

  const trendData = interpolateTrendData(uData[0], points)
  uData.push(trendData)

  chart.addSeries(
    {
      label,
      stroke: TREND_COLOR,
      width: 2,
      dash: [10, 5],
      points: { show: false },
    },
    uData.length - 1,
  )

  // Re-add threshold after trend
  if (hasThreshold && threshData) {
    // Extend threshold data for any new future timestamps
    const threshVal = threshData[0]
    while (threshData.length < uData[0].length) {
      threshData.push(threshVal)
    }
    uData.push(threshData)
    chart.addSeries({ ...THRESHOLD_SERIES }, uData.length - 1)
  }

  chart.setData(uData)
  return trendSeriesCount + 1
}

// Remove all trend series and future timestamps from the chart
export function removeTrendSeries(chart, uData, headerRow, trendSeriesCount, hasThreshold) {
  // Remove threshold first if present
  let threshData = null
  if (hasThreshold) {
    threshData = uData.pop()
    chart.delSeries(uData.length)
  }

  while (trendSeriesCount > 0) {
    const idx = uData.length - 1
    uData.splice(idx, 1)
    chart.delSeries(idx)
    trendSeriesCount--
  }

  // Trim future timestamps where all real data columns are null
  const numCols = headerRow.length
  while (uData[0].length > 0) {
    const last = uData[0].length - 1
    let allNull = true
    for (let c = 1; c < numCols; c++) {
      if (uData[c][last] !== null && uData[c][last] !== undefined) {
        allNull = false
        break
      }
    }
    if (!allNull) break
    for (let c = 0; c < uData.length; c++) {
      uData[c].pop()
    }
  }

  // Re-add threshold
  if (hasThreshold && threshData) {
    threshData = uData[0].map(() => threshData[0])
    uData.push(threshData)
    chart.addSeries({ ...THRESHOLD_SERIES }, uData.length - 1)
  }

  chart.setData(uData)
  return 0
}

// Build a trend data array aligned to chart timestamps, interpolating gaps
function interpolateTrendData(timestamps, points) {
  const trendMap = new Map(points.map((p) => [p[0], p[1]]))
  const trendData = timestamps.map((t) => trendMap.get(t) ?? null)

  for (let i = 0; i < timestamps.length; i++) {
    if (trendData[i] === null) {
      const t = timestamps[i]
      if (t >= points[0][0] && t <= points[points.length - 1][0]) {
        for (let j = 0; j < points.length - 1; j++) {
          if (t >= points[j][0] && t <= points[j + 1][0]) {
            const frac =
              (t - points[j][0]) / (points[j + 1][0] - points[j][0])
            trendData[i] =
              points[j][1] + frac * (points[j + 1][1] - points[j][1])
            break
          }
        }
      }
    }
  }

  return trendData
}
