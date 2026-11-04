import { describe, it, expect } from 'vitest'
import { applyAssessment } from './assessment.js'

const base = () => ({ unit: 'kg', bodyweight: [], measurements: [], measurementEnabled: ['waist', 'chest'], customMeasurements: [] })
const A = { id: 'abc', date: '2026-11-02', weight: 82.4, values: { waist: 84, bodyFat: 17.5 } }

describe('applyAssessment', () => {
  it('adds the weight as that day\'s weigh-in and the measurements to that day', () => {
    const S = applyAssessment(base(), A, 1000)
    expect(S.bodyweight).toHaveLength(1)
    expect(S.bodyweight[0]).toMatchObject({ d: '2026-11-02', w: 82.4 })
    const m = S.measurements.find(e => e.d === '2026-11-02')
    expect(m.waist).toBe(84)
    expect(m.bodyFat).toBe(17.5)
    expect(S.measurementEnabled).toContain('bodyFat')
  })

  it('is idempotent: the same check-in twice is one weigh-in', () => {
    const S = applyAssessment(applyAssessment(base(), A, 1000), A, 2000)
    expect(S.bodyweight[0].ins).toHaveLength(1)
    expect(S.measurements.filter(e => e.d === '2026-11-02')).toHaveLength(1)
  })

  it('keeps what the student already logged that day', () => {
    const S = base()
    S.measurements = [{ d: '2026-11-02', t: 1, chest: 101 }]
    applyAssessment(S, A, 1000)
    const m = S.measurements.find(e => e.d === '2026-11-02')
    expect(m.chest).toBe(101)
    expect(m.waist).toBe(84)
  })

  it('switches on a field the trainer measured on a profile that never chose its fields', () => {
    const S = applyAssessment({ ...base(), measurementEnabled: null }, A, 1000)
    expect(S.measurementEnabled).toEqual(expect.arrayContaining(['waist', 'chest', 'bodyFat']))
  })

  it('shows the weight in pounds on a pound profile', () => {
    const S = applyAssessment({ ...base(), unit: 'lb' }, { id: 'x', date: '2026-11-02', weight: 100 }, 1000)
    expect(S.bodyweight[0].w).toBeCloseTo(220.5, 1)
  })

  it('ignores a check-in with no valid date or unknown fields', () => {
    const S = applyAssessment(base(), { id: 'y', date: 'nope', weight: 80 })
    expect(S.bodyweight).toHaveLength(0)
    applyAssessment(S, { id: 'z', date: '2026-11-02', values: { hacked: 5 } })
    expect(S.measurements).toHaveLength(0)
  })
})
