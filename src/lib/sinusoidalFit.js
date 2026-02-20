// Sinusoidal curve fitting: y = A * sin(B * x + C) + D
// Uses autocorrelation-based frequency estimation

export function sinusoidalFit(data) {
  if (!data || data.length < 4) {
    return {
      string: 'Insufficient data for sinusoidal fit',
      r2: 0,
      predict: (x) => [x, 0],
      points: data || [],
    }
  }

  const xs = data.map((d) => d[0])
  const ys = data.map((d) => d[1])

  // D = mean(y)
  const D = ys.reduce((a, b) => a + b, 0) / ys.length

  // A = (max - min) / 2
  const yMin = Math.min(...ys)
  const yMax = Math.max(...ys)
  const A = (yMax - yMin) / 2

  if (A === 0) {
    // Flat data, no sinusoidal component
    return {
      string: `y = ${D.toFixed(4)}`,
      r2: 0,
      predict: (x) => [x, D],
      points: data.map(([x]) => [x, D]),
    }
  }

  // B (angular frequency) via autocorrelation
  const B = estimateFrequency(xs, ys, D)

  // C (phase) via grid search
  const C = estimatePhase(xs, ys, A, B, D)

  // Refine A and D with least-squares given B and C
  const { A: Ar, D: Dr } = refineAmplitudeOffset(xs, ys, B, C)

  // Calculate R²
  const r2 = calcR2(data, Ar, B, C, Dr)

  const predict = (x) => [x, Ar * Math.sin(B * x + C) + Dr]
  const points = data.map(([x, y]) => [x, Ar * Math.sin(B * x + C) + Dr])
  const equation = `y = ${Ar.toFixed(4)} * sin(${B.toFixed(4)} * x + ${C.toFixed(4)}) + ${Dr.toFixed(4)}`

  return {
    string: equation,
    r2,
    predict,
    points,
  }
}

function estimateFrequency(xs, ys, mean) {
  const n = ys.length
  const centered = ys.map((y) => y - mean)

  // Calculate the average sample interval
  const dt = (xs[xs.length - 1] - xs[0]) / (n - 1)

  // Autocorrelation to find the period
  const maxLag = Math.floor(n / 2)
  const autocorr = new Array(maxLag)
  let ac0 = 0
  for (let i = 0; i < n; i++) {
    ac0 += centered[i] * centered[i]
  }
  autocorr[0] = ac0

  // Find first positive-to-negative-to-positive transition (first peak after lag 0)
  let bestLag = 1
  let bestVal = -Infinity

  for (let lag = 1; lag < maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < n - lag; i++) {
      sum += centered[i] * centered[i + lag]
    }
    autocorr[lag] = sum

    // Look for peak in autocorrelation (skip very short lags)
    if (lag > 2 && sum > bestVal) {
      // Make sure we're past the initial decline
      if (autocorr[lag - 1] <= sum) {
        bestVal = sum
        bestLag = lag
      }
    }
  }

  // Verify we found a real peak (it should be positive and significant)
  if (bestVal <= 0 || bestLag <= 2) {
    // Fallback: use zero-crossing count
    let crossings = 0
    for (let i = 1; i < n; i++) {
      if (centered[i - 1] * centered[i] < 0) {
        crossings++
      }
    }
    if (crossings > 0) {
      const period = (2 * (xs[n - 1] - xs[0])) / crossings
      return (2 * Math.PI) / period
    }
    // Last resort: assume one full cycle over the data
    return (2 * Math.PI) / (xs[n - 1] - xs[0])
  }

  const period = bestLag * dt
  return (2 * Math.PI) / period
}

function estimatePhase(xs, ys, A, B, D) {
  // Grid search over 0..2π for phase that minimizes SSE
  let bestPhase = 0
  let bestSSE = Infinity
  const steps = 72 // 5-degree increments

  for (let i = 0; i < steps; i++) {
    const phase = (i / steps) * 2 * Math.PI
    let sse = 0
    for (let j = 0; j < xs.length; j++) {
      const predicted = A * Math.sin(B * xs[j] + phase) + D
      sse += (ys[j] - predicted) ** 2
    }
    if (sse < bestSSE) {
      bestSSE = sse
      bestPhase = phase
    }
  }

  // Fine-tune around best phase
  const fineStep = (2 * Math.PI) / steps / 10
  for (let i = -5; i <= 5; i++) {
    const phase = bestPhase + i * fineStep
    let sse = 0
    for (let j = 0; j < xs.length; j++) {
      const predicted = A * Math.sin(B * xs[j] + phase) + D
      sse += (ys[j] - predicted) ** 2
    }
    if (sse < bestSSE) {
      bestSSE = sse
      bestPhase = phase
    }
  }

  return bestPhase
}

function refineAmplitudeOffset(xs, ys, B, C) {
  // Given B and C, solve for best A and D via least squares:
  // y = A * sin(Bx + C) + D
  // This is linear in A and D
  const n = xs.length
  let sumS = 0,
    sumY = 0,
    sumSS = 0,
    sumSY = 0
  for (let i = 0; i < n; i++) {
    const s = Math.sin(B * xs[i] + C)
    sumS += s
    sumY += ys[i]
    sumSS += s * s
    sumSY += s * ys[i]
  }
  // Solve 2x2 system: [sumSS, sumS; sumS, n] * [A; D] = [sumSY; sumY]
  const det = sumSS * n - sumS * sumS
  if (Math.abs(det) < 1e-12) {
    return { A: (Math.max(...ys) - Math.min(...ys)) / 2, D: sumY / n }
  }
  const A = (sumSY * n - sumS * sumY) / det
  const D = (sumSS * sumY - sumS * sumSY) / det
  return { A, D }
}

function calcR2(data, A, B, C, D) {
  const ys = data.map((d) => d[1])
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length
  let ssTot = 0
  let ssRes = 0
  for (const [x, y] of data) {
    ssTot += (y - mean) ** 2
    const predicted = A * Math.sin(B * x + C) + D
    ssRes += (y - predicted) ** 2
  }
  return ssTot === 0 ? 0 : 1 - ssRes / ssTot
}
