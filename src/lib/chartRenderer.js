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

// Format large numbers with SI suffixes (K, M, B, T)
function formatAxisValue(self, rawValue) {
  if (rawValue == null) return '--'
  const abs = Math.abs(rawValue)
  if (abs >= 1e12) return (rawValue / 1e12).toFixed(1) + 'T'
  if (abs >= 1e9) return (rawValue / 1e9).toFixed(1) + 'B'
  if (abs >= 1e6) return (rawValue / 1e6).toFixed(1) + 'M'
  if (abs >= 1e3) return (rawValue / 1e3).toFixed(1) + 'K'
  if (Number.isInteger(rawValue)) return rawValue.toString()
  return rawValue.toPrecision(4)
}

const TREND_COLOR = '#ff6b6b'
const THRESHOLD_COLOR = '#ffa726'

// Build a uPlot plugin that draws limit bands (red/yellow/green) behind the data
function limitsPlugin(limitsRef) {
  return {
    hooks: {
      draw: (u) => {
        const vals = limitsRef.value
        if (!vals || vals.length < 4) return

        const { ctx, bbox } = u
        const yMin = u.valToPos(u.scales.y.min, 'y', true)
        const yMax = u.valToPos(u.scales.y.max, 'y', true)
        const redLow = u.valToPos(vals[0], 'y', true)
        const yellowLow = u.valToPos(vals[1], 'y', true)
        const yellowHigh = u.valToPos(vals[2], 'y', true)
        const redHigh = u.valToPos(vals[3], 'y', true)

        // NOTE: Canvas y-axis is inverted (0 at top, grows downward).
        // valToPos returns canvas coordinates, so "higher" graph values
        // produce smaller canvas y values.

        ctx.save()
        ctx.beginPath()

        // Red bands
        ctx.fillStyle = 'rgba(255,0,0,0.15)'
        if (u.scales.y.min < vals[0]) {
          let start = redLow < yMax ? yMax : redLow
          ctx.fillRect(bbox.left, redLow, bbox.width, yMin - start)
        }
        if (u.scales.y.max > vals[3]) {
          let end = yMin < redHigh ? yMin : redHigh
          ctx.fillRect(bbox.left, yMax, bbox.width, end - yMax)
        }

        // Yellow bands
        ctx.fillStyle = 'rgba(255,255,0,0.15)'
        if (u.scales.y.min < vals[1] && u.scales.y.max > vals[0]) {
          let start = yellowLow < yMax ? yMax : yellowLow
          ctx.fillRect(bbox.left, start, bbox.width, redLow - start)
        }
        if (u.scales.y.max > vals[2] && u.scales.y.min < vals[3]) {
          let start = yMin < redHigh ? yMin : redHigh
          let end = yMin < yellowHigh ? yMin : yellowHigh
          ctx.fillRect(bbox.left, start, bbox.width, end - start)
        }

        // Green / operational bands
        ctx.fillStyle = 'rgba(0,255,0,0.15)'
        if (vals.length === 4) {
          if (u.scales.y.min < vals[2] && u.scales.y.max > vals[1]) {
            let start = yellowHigh < yMax ? yMax : yellowHigh
            let end = yMin < yellowLow ? yMin : yellowLow
            ctx.fillRect(bbox.left, start, bbox.width, end - start)
          }
        } else {
          const greenLow = u.valToPos(vals[4], 'y', true)
          const greenHigh = u.valToPos(vals[5], 'y', true)
          if (u.scales.y.min < vals[4] && u.scales.y.max > vals[1]) {
            let start = greenLow < yMax ? yMax : greenLow
            ctx.fillRect(bbox.left, start, bbox.width, yellowLow - start)
          }
          if (u.scales.y.max > vals[5] && u.scales.y.min < vals[2]) {
            let start = yMin < yellowHigh ? yMin : yellowHigh
            let end = yMin < greenHigh ? yMin : greenHigh
            ctx.fillRect(bbox.left, start, bbox.width, end - start)
          }
          ctx.fillStyle = 'rgba(0,0,255,0.15)'
          let start = greenHigh < yMax ? yMax : greenHigh
          let end = yMin < greenLow ? yMin : greenLow
          ctx.fillRect(bbox.left, start, bbox.width, end - start)
        }

        ctx.stroke()
        ctx.restore()
      },
    },
  }
}

const ANOMALY_COLOR = '#ff1744'

// Build a uPlot plugin that draws sigma bands behind the data
function sigmaBandsPlugin(bandsRef) {
  return {
    hooks: {
      draw: (u) => {
        const bands = bandsRef.value
        if (!bands || !bands.upper || !bands.lower) return

        const { ctx } = u
        const timestamps = u.data[0]
        if (!timestamps || timestamps.length === 0) return

        ctx.save()
        ctx.fillStyle = 'rgba(100,100,255,0.12)'
        ctx.beginPath()

        // Draw forward path along upper bound
        let started = false
        for (let i = 0; i < timestamps.length; i++) {
          if (i >= bands.upper.length) break
          if (bands.upper[i] == null) continue
          const x = u.valToPos(timestamps[i], 'x', true)
          const y = u.valToPos(bands.upper[i], 'y', true)
          if (!started) {
            ctx.moveTo(x, y)
            started = true
          } else {
            ctx.lineTo(x, y)
          }
        }

        // Draw backward path along lower bound
        const len = Math.min(timestamps.length, bands.lower.length)
        for (let i = len - 1; i >= 0; i--) {
          if (bands.lower[i] == null) continue
          const x = u.valToPos(timestamps[i], 'x', true)
          const y = u.valToPos(bands.lower[i], 'y', true)
          ctx.lineTo(x, y)
        }

        ctx.closePath()
        ctx.fill()
        ctx.restore()
      },
    },
  }
}

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
export function createChart(container, headerRow, parsedData, existingTrend, threshold, timeZone, limitsRef, sigmaBandsRef) {
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
      value: (u, v) => formatAxisValue(u, v),
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
      { stroke: '#888', grid: { stroke: 'rgba(255,255,255,0.1)' }, size: 80, values: (u, vals) => vals.map(v => formatAxisValue(u, v)) },
    ],
    cursor: { drag: { x: true, y: false } },
    plugins: [
      ...(limitsRef ? [limitsPlugin(limitsRef)] : []),
      ...(sigmaBandsRef ? [sigmaBandsPlugin(sigmaBandsRef)] : []),
    ],
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

  // Double-click to reset zoom to full data range
  const overEl = chart.root.querySelector('.u-over')
  const onDblClick = () => {
    const ts = chart.data[0]
    if (ts && ts.length > 0) {
      chart.setScale('x', { min: ts[0], max: ts[ts.length - 1] })
    }
  }
  if (overEl) {
    overEl.addEventListener('dblclick', onDblClick)
  }

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
    if (overEl) overEl.removeEventListener('dblclick', onDblClick)
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

// Temporarily remove threshold series, run a callback, then re-add threshold.
// Ensures series are always inserted before the threshold.
function withoutThreshold(chart, uData, hasThreshold, fn) {
  let threshData = null
  if (hasThreshold) {
    threshData = uData.pop()
    chart.delSeries(uData.length)
  }

  fn()

  if (hasThreshold && threshData) {
    const threshVal = threshData[0]
    const threshArray = uData[0].map(() => threshVal)
    uData.push(threshArray)
    chart.addSeries({ ...THRESHOLD_SERIES }, uData.length - 1)
  }

  chart.setData(uData)
}

// Add a trend overlay to an existing chart
export function addTrendSeries(chart, uData, headerRow, trendSeriesCount, hasThreshold, points, label) {
  const lastDataTime = uData[0][uData[0].length - 1]
  const futurePts = points.filter((p) => p[0] > lastDataTime)
  const numCols = headerRow.length

  withoutThreshold(chart, uData, hasThreshold, () => {
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
  })

  return trendSeriesCount + 1
}

// Remove all trend series and future timestamps from the chart
export function removeTrendSeries(chart, uData, headerRow, trendSeriesCount, hasThreshold) {
  const numCols = headerRow.length

  withoutThreshold(chart, uData, hasThreshold, () => {
    while (trendSeriesCount > 0) {
      const idx = uData.length - 1
      uData.splice(idx, 1)
      chart.delSeries(idx)
      trendSeriesCount--
    }

    // Trim future timestamps where all real data columns are null
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
  })

  return 0
}

// Add a scatter series for anomaly points (red dots, no line)
export function addAnomalySeries(chart, uData, anomalies, hasThreshold) {
  if (!chart || !anomalies || anomalies.length === 0) return false

  const anomalySet = new Map(anomalies.map((a) => [a.ts, a.value]))
  const anomalyData = uData[0].map((t) => anomalySet.get(t) ?? null)

  withoutThreshold(chart, uData, hasThreshold, () => {
    uData.push(anomalyData)
    chart.addSeries(
      {
        label: 'Anomalies',
        stroke: ANOMALY_COLOR,
        width: 0,
        points: {
          show: true,
          size: 10,
          fill: ANOMALY_COLOR,
          stroke: ANOMALY_COLOR,
        },
        paths: () => null,
      },
      uData.length - 1,
    )
  })

  return true
}

// Remove anomaly series from the chart
export function removeAnomalySeries(chart, uData, hasAnomaly, hasThreshold) {
  if (!chart || !hasAnomaly) return false

  withoutThreshold(chart, uData, hasThreshold, () => {
    const idx = uData.length - 1
    uData.splice(idx, 1)
    chart.delSeries(idx)
  })

  return false
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
