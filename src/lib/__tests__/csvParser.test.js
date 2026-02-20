import { describe, it, expect } from 'vitest'
import { parseCSV } from '../csvParser'

describe('parseCSV', () => {
  it('parses valid CSV with numeric and string columns', () => {
    const csv = [
      'TIME,TARGET,VALUE,RATE',
      '100,INST,1.5,2.0',
      '200,INST,2.5,3.0',
      '300,INST,3.5,4.0',
    ].join('\n')

    const result = parseCSV(csv)
    expect(result.headerRow).toEqual(['TIME', 'VALUE', 'RATE'])
    expect(result.data).toHaveLength(3)
    expect(result.data[0]).toEqual([100, 1.5, 2.0])
    expect(result.metadata).toEqual({ TARGET: 'INST' })
  })

  it('parses ISO timestamp strings to seconds', () => {
    const csv = [
      'TIME,VALUE',
      '2024-01-01T00:00:00Z,10',
      '2024-01-01T00:01:00Z,20',
    ].join('\n')

    const result = parseCSV(csv)
    expect(result.data).toHaveLength(2)
    // Timestamps should be in seconds
    const t1 = new Date('2024-01-01T00:00:00Z').getTime() / 1000
    const t2 = new Date('2024-01-01T00:01:00Z').getTime() / 1000
    expect(result.data[0][0]).toBeCloseTo(t1)
    expect(result.data[1][0]).toBeCloseTo(t2)
  })

  it('throws on missing rows', () => {
    const csv = 'TIME,VALUE'
    expect(() => parseCSV(csv)).toThrow('header row and at least one data row')
  })

  it('throws when no numeric columns found', () => {
    const csv = ['TIME,NAME,STATUS', '100,foo,bar', '200,baz,qux'].join('\n')
    expect(() => parseCSV(csv)).toThrow('No numeric data columns')
  })

  it('skips rows with insufficient columns', () => {
    const csv = [
      'TIME,VALUE,RATE',
      '100,1.5,2.0',
      '200,2.5', // too few columns
      '300,3.5,4.0',
    ].join('\n')

    const result = parseCSV(csv)
    expect(result.data).toHaveLength(2)
    expect(result.data[0][0]).toBe(100)
    expect(result.data[1][0]).toBe(300)
  })

  it('sorts data by timestamp', () => {
    const csv = [
      'TIME,VALUE',
      '300,3',
      '100,1',
      '200,2',
    ].join('\n')

    const result = parseCSV(csv)
    expect(result.data[0][0]).toBe(100)
    expect(result.data[1][0]).toBe(200)
    expect(result.data[2][0]).toBe(300)
  })

  it('returns null metadata when no string columns exist', () => {
    const csv = ['TIME,VALUE', '100,1', '200,2'].join('\n')
    const result = parseCSV(csv)
    expect(result.metadata).toBeNull()
  })
})
