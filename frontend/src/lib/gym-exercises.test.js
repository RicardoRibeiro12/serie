import { describe, expect, it } from 'vitest'
import { shareable, mergeGymExercises, planCustomEx } from './gym-exercises.js'

const row = (ex, extra = {}) => ({ ex, by: 'Ana PT', mine: false, ...extra })

describe('exercises shared within a gym', () => {
  it('shares the definition, never the uploaded media', () => {
    expect(shareable({ id: 'c1', n: 'Remada', media: { id: 'x' }, _ts: 5 })).toEqual({ id: 'c1', n: 'Remada', custom: true })
    expect(shareable({ id: 'c1', n: '  ' })).toBe(null)
    expect(shareable(null)).toBe(null)
  })
  it('adds what the library lacks, and leaves the same array when nothing changes', () => {
    const mine = [{ id: 'c0', n: 'Mine', custom: true }]
    const out = mergeGymExercises(mine, [row({ id: 'c1', n: 'Remada' })])
    expect(out).toEqual([mine[0], { id: 'c1', n: 'Remada', custom: true, gym: true, gymBy: 'Ana PT' }])
    expect(mergeGymExercises(out, [row({ id: 'c1', n: 'Remada' })])).toBe(out)
  })
  it('updates a copy from the gym, never an exercise the person made', () => {
    const mine = [{ id: 'c1', n: 'Old', custom: true, gym: true, _ts: 3 }, { id: 'c2', n: 'My own', custom: true }]
    const out = mergeGymExercises(mine, [row({ id: 'c1', n: 'New' }), row({ id: 'c2', n: 'Theirs' })])
    expect(out[0]).toMatchObject({ n: 'New', gym: true, _ts: 3 })
    expect(out[1]).toBe(mine[1])
  })
  it('skips the person’s own shares', () => {
    expect(mergeGymExercises([], [row({ id: 'c1', n: 'X' }, { mine: true })])).toEqual([])
  })
  it('a plan carries the custom exercises it uses', () => {
    const lib = [{ id: 'c1', n: 'Remada', media: { id: 'm' } }, { id: 'c2', n: 'Unused' }]
    expect(planCustomEx([{ ex: [{ id: 'c1' }, { id: '0025' }] }], lib)).toEqual([{ id: 'c1', n: 'Remada', custom: true }])
  })
})
