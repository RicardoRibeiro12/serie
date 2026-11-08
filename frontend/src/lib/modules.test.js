import { describe, expect, it } from 'vitest'
import { MODULES, MODULE_IDS, GROUPS, PRESETS, isOn, moduleStates, presetModules, presetOf, applyPreset, setModule, turnedOff, onCount } from './modules.js'

describe('modules', () => {
  it('every module belongs to a group, with an icon and copy', () => {
    const groups = new Set(GROUPS.map(g => g.id))
    for (const m of MODULES) {
      expect(groups.has(m.group)).toBe(true)
      expect(m.icon && m.title && m.desc).toBeTruthy()
      expect(m.desc).not.toMatch(/—/)
    }
    expect(new Set(MODULE_IDS).size).toBe(MODULE_IDS.length)
  })

  it('a profile from before Modules has every module on', () => {
    // Série: every module but the openGym gym check-in, which the gym's own card replaces.
    for (const id of MODULE_IDS) expect(isOn({}, id)).toBe(id !== 'checkin')
    expect(isOn(null, 'body')).toBe(true)
    expect(isOn({ modules: 'junk' }, 'body')).toBe(true)
    expect(presetOf({})).toBe('all')
    expect(onCount({})).toBe(MODULE_IDS.length - 1)
  })

  it('reads an explicit choice, and an unknown id is on', () => {
    expect(isOn({ modules: { body: false } }, 'body')).toBe(false)
    expect(isOn({ modules: { body: true } }, 'body')).toBe(true)
    expect(isOn({ modules: { body: false } }, 'later-module')).toBe(true)
  })

  // Série retired the openGym gym check-in: off whatever the old switch or Modules say.
  it('the retired check-in is off for every profile', () => {
    expect(isOn({ checkIn: true }, 'checkin')).toBe(false)
    expect(isOn({ checkIn: false, modules: { checkin: true } }, 'checkin')).toBe(false)
    expect(isOn({}, 'checkin')).toBe(false)
  })

  it('presets are nested, smallest first, and every one round-trips', () => {
    let prev = new Set()
    for (const p of PRESETS) {
      const on = new Set(p.on)
      for (const id of prev) expect(on.has(id)).toBe(true)
      prev = on
      const s = {}
      applyPreset(s, p.id)
      expect(presetOf(s)).toBe(p.id)
      expect(Object.keys(s.modules).sort()).toEqual([...MODULE_IDS].sort())
    }
    expect(presetModules('nope')).toBe(null)
  })

  it('Just training keeps the training tools and drops the rest', () => {
    const s = {}
    applyPreset(s, 'training')
    expect(isOn(s, 'effort')).toBe(true)
    expect(isOn(s, 'plates')).toBe(true)
    for (const id of ['body', 'health', 'motivation', 'coach', 'seasonal', 'checkin']) expect(isOn(s, id)).toBe(false)
  })

  it('one switch away from a preset is Custom, and keeps the other keys', () => {
    const s = { modules: { foo: 1 } }
    applyPreset(s, 'body')
    setModule(s, 'seasonal', true)
    expect(presetOf(s)).toBe('custom')
    expect(s.modules.foo).toBe(1)
    setModule(s, 'nope', true)
    expect('nope' in s.modules).toBe(false)
    expect(moduleStates(s).seasonal).toBe(true)
  })

  it('names what a change switches off', () => {
    expect(turnedOff({}, presetModules('training')).sort()).toEqual(['body', 'coach', 'health', 'integrations', 'motivation', 'seasonal', 'strength', 'videos'])
    expect(turnedOff({ modules: { body: false } }, { body: false, coach: false })).toEqual(['coach'])
  })
})

describe('Série', () => {
  it('the published app has no watches, health apps or integrations', async () => {
    const m = await import('./modules.js')
    expect(m.SERIE_OFF).toEqual(['watch', 'health', 'integrations'])
    // Under the test runner they stay on, so openGym's tests of those screens still run.
    for (const id of m.SERIE_OFF) expect(m.RETIRED.has(id)).toBe(false)
    expect(m.RETIRED.has('checkin')).toBe(true)
  })
})
