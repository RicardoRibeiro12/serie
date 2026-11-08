import { describe, expect, it } from 'vitest'
import { endTime, byDay, sessionState, placesLeft, afterBooking, byWeekday, classProblem, isoWeekday, addDaysISO, dayList } from './classes.js'

describe('group classes', () => {
  it('works out when a class ends', () => {
    expect(endTime('18:30', 50)).toBe('19:20')
    expect(endTime('23:30', 45)).toBe('00:15')
  })
  it('groups the sessions by day, in order', () => {
    const g = byDay([{ date: '2026-11-09', id: 'a' }, { date: '2026-11-09', id: 'b' }, { date: '2026-11-10', id: 'c' }])
    expect(g.map(d => [d.date, d.sessions.length])).toEqual([['2026-11-09', 2], ['2026-11-10', 1]])
  })
  it('says what a member can do with a session', () => {
    expect(sessionState({ capacity: 10, booked: 3 })).toBe('book')
    expect(sessionState({ capacity: 10, booked: 10 })).toBe('full')
    expect(sessionState({ capacity: 10, booked: 10, mine: true })).toBe('booked')
    expect(sessionState({ capacity: 10, booked: 3, skipped: true, mine: true })).toBe('off')
    expect(sessionState({ capacity: 10, booked: 3, started: true })).toBe('started')
    expect(placesLeft({ capacity: 2, booked: 5 })).toBe(0)
    expect(afterBooking({ booked: 3, mine: false }, { booked: 4 }, true)).toEqual({ booked: 4, mine: true })
  })
  it('lays the weekly timetable out by weekday and time', () => {
    const w = byWeekday([{ weekday: 3, starts: '19:00', n: 'b' }, { weekday: 1, starts: '07:00', n: 'a' }, { weekday: 3, starts: '08:00', n: 'c' }])
    expect(w.map(d => [d.weekday, d.classes.map(c => c.n).join('')])).toEqual([[1, 'a'], [3, 'cb']])
  })
  it('checks the class form', () => {
    const ok = { name: 'Spinning', weekday: 2, starts: '18:30', minutes: 50, capacity: 12 }
    expect(classProblem(ok)).toBe(null)
    expect(classProblem({ ...ok, name: ' ' })).toBe('Give the class a name.')
    expect(classProblem({ ...ok, starts: '25:00' })).toBe('Pick a start time.')
    expect(classProblem({ ...ok, capacity: 0 })).toBe('Places: 1 to 500.')
    expect(isoWeekday('2026-11-08')).toBe(7)
    expect(isoWeekday('2026-11-09')).toBe(1)
  })
})

describe('the day pages', () => {
  it('counts days across a month end', () => {
    expect(addDaysISO('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDaysISO('2026-11-01', -1)).toBe('2026-10-31')
    expect(dayList('2026-11-08', 3)).toEqual(['2026-11-08', '2026-11-09', '2026-11-10'])
  })
})
