// Parses a CSV string from Data Extractor into structured data.
// Returns: { headerRow: string[], data: number[][], metadata: object|null }
export function parseCSV(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row.')
  }

  const header = lines[0].split(',').map((h) => h.trim())
  if (header.length < 2) {
    throw new Error(
      'CSV must have at least 2 columns (timestamp + one data column).',
    )
  }

  // Detect which columns are numeric vs string by inspecting the first data row
  const firstRow = lines[1].split(',').map((c) => c.trim())
  const numericCols = []
  const stringCols = []
  for (let c = 1; c < header.length; c++) {
    if (!isNaN(Number(firstRow[c]))) {
      numericCols.push(c)
    } else {
      stringCols.push(c)
    }
  }

  if (numericCols.length === 0) {
    throw new Error(
      'No numeric data columns found. CSV must have at least one numeric column besides the timestamp.',
    )
  }

  // Extract string column values as metadata (e.g. TARGET, PACKET)
  const metadata = {}
  for (const c of stringCols) {
    metadata[header[c]] = firstRow[c]
  }

  // Build filtered header: TIME + only numeric columns
  const headerRow = [header[0], ...numericCols.map((c) => header[c])]

  const data = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim())
    if (cols.length < header.length) continue

    // Parse timestamp: try as number first, then as date string
    let time = Number(cols[0])
    if (isNaN(time)) {
      const d = new Date(cols[0])
      if (isNaN(d.getTime())) continue
      time = d.getTime() / 1000
    }

    const row = [time]
    let valid = true
    for (const c of numericCols) {
      const val = Number(cols[c])
      if (isNaN(val)) {
        valid = false
        break
      }
      row.push(val)
    }
    if (valid) data.push(row)
  }

  if (data.length < 2) {
    throw new Error(
      'Could not parse at least 2 valid numeric data rows from the CSV.',
    )
  }

  data.sort((a, b) => a[0] - b[0])

  return {
    headerRow,
    data,
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  }
}
