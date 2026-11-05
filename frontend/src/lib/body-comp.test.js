import { describe, it, expect } from 'vitest'
import { bmi, bmiClass, fatClass, leanMass, hrMaxTheoretical, waterPct, assessmentRows } from './body-comp.js'

describe('body composition', () => {
  it('works out BMI and its WHO band', () => {
    expect(bmi(110, 175)).toBe(35.9)
    expect(bmiClass(35.9)).toBe('Obesity class II')
    expect(bmiClass(22)).toBe('Normal weight')
    expect(bmiClass(18.4)).toBe('Underweight')
    expect(bmi(80, null)).toBe(null)
  })

  it('bands body fat by sex, and does not guess without one', () => {
    expect(fatClass(32, 'm')).toBe('Very high')
    expect(fatClass(32, 'f')).toBe('High')
    expect(fatClass(16, 'm')).toBe('Fit')
    expect(fatClass(20, undefined)).toBe(null)
  })

  it('prefers a measured lean mass and water share, else derives them', () => {
    expect(leanMass(100, 30)).toBe(70)
    expect(leanMass(100, 30, 68.4)).toBe(68.4)
    expect(waterPct(50, 100)).toBe(50)
    expect(waterPct(50, 100, 48.2)).toBe(48.2)
    expect(hrMaxTheoretical(40)).toBe(180)
  })

  it('lists every sheet row, null where nothing was measured', () => {
    const rows = assessmentRows({ weight: 110, values: { bodyFat: 34 }, body: { age: 40, height: 175, sex: 'm' } })
    const by = Object.fromEntries(rows.map(r => [r.key, r]))
    expect(by.bmi.cls).toBe('Obesity class II')
    expect(by.bodyFat.cls).toBe('Very high')
    expect(by.leanKg.v).toBe(72.6)
    expect(by.hrMax.v).toBe(180)
    expect(by.visceral.v).toBe(null)
  })
})
