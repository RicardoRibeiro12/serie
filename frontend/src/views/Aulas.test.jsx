// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/* Group classes (supabase/classes.sql): a member books and cancels; the class PT and the owner see
   who booked; the owner calls a session off and reaches the weekly timetable. */
const mocks = vi.hoisted(() => ({ answers: {}, posts: [], confirm: vi.fn(), toasts: [], go: [], user: {} }))
vi.mock('../lib/api.js', () => ({
  api: (path, init) => {
    if (init?.method === 'POST') mocks.posts.push({ path, body: JSON.parse(init.body) })
    const key = path.split('?')[0]
    const a = mocks.answers[key]
    if (a instanceof Error) return Promise.reject(a)
    return a !== undefined ? Promise.resolve(typeof a === 'function' ? a(init) : a) : Promise.reject(new Error('not found'))
  }
}))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ user: mocks.user, config: { classes: true }, S: {} })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: m => mocks.toasts.push(m) })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => to => mocks.go.push(to), Navigate: () => null }))
vi.mock('../sheets.jsx', () => ({ confirmSheet: o => { mocks.confirm(o); o.onConfirm() } }))

const { default: Aulas } = await import('./Aulas.jsx')
const { todayISO } = await import('../lib/format.js')
const { addDaysISO } = await import('../lib/classes.js')
const TODAY = todayISO()
const { default: AulasHorario } = await import('./AulasHorario.jsx')

const session = (extra = {}) => ({ id: 'c1', date: TODAY, name: 'Spinning', room: 'Sala 1', starts: '18:30', minutes: 50, capacity: 2, trainer: 'PT Ana', booked: 1, mine: false, skipped: false, started: false, roster: null, ...extra })
const mounted = []
async function render(El = Aulas) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  await act(async () => { root.render(<El />) })
  await act(async () => {})
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)

beforeEach(() => { mocks.answers = {}; mocks.posts = []; mocks.toasts = []; mocks.go = []; mocks.user = { id: 'u1', name: 'Rui' } })
afterEach(() => { mounted.splice(0).forEach(r => act(() => r.unmount())); document.body.innerHTML = '' })

describe('classes', () => {
  it('a member books a place, and the count follows the server', async () => {
    mocks.answers['/api/classes'] = { gym: { id: 'g', name: 'Ginásio Central', owner: false }, sessions: [session()], mine: [] }
    mocks.answers['/api/classes/book'] = { booked: 2, mine: true }
    const host = await render()
    expect(host.textContent).toContain('Spinning')
    expect(host.querySelector('.au-pt').textContent).toBe('With PT Ana')
    expect(host.textContent).toContain('Sala 1')
    expect(host.textContent).toContain('1 place left')
    expect(host.querySelector('.au-roster-btn')).toBe(null)
    await act(async () => { button(host, 'Book').click() })
    expect(mocks.posts[0]).toEqual({ path: '/api/classes/book', body: { id: 'c1', date: TODAY, on: true } })
    expect(host.textContent).toContain('You’re in')
    expect(host.textContent).toContain('Full · 2/2')
    expect(button(host, 'Cancel')).toBeTruthy()
    expect(button(host, 'Timetable')).toBeFalsy()
  })
  it('a full class says so, and a refused booking is said in words', async () => {
    mocks.answers['/api/classes'] = { gym: { id: 'g', name: 'G', owner: false }, sessions: [session({ booked: 2 }), session({ id: 'c2', name: 'Pilates' })], mine: [] }
    mocks.answers['/api/classes/book'] = new Error('class full')
    const host = await render()
    expect(host.querySelector('.au-full')).toBeTruthy()
    await act(async () => { button(host, 'Book').click() })
    expect(mocks.toasts).toContain('No places left in this class.')
  })
  it('the owner sees who booked, calls a session off and opens the timetable', async () => {
    mocks.user = { id: 'o', name: 'Dono', admin: true }
    mocks.answers['/api/classes'] = { gym: { id: 'g', name: 'G', owner: true }, sessions: [session({ roster: ['Aluno Rui'] })], mine: [] }
    mocks.answers['/api/admin/classes/skip'] = { ok: true }
    const host = await render()
    await act(async () => { button(host, '1 person booked').click() })
    expect(host.querySelector('.au-roster').textContent).toBe('Aluno Rui')
    await act(async () => { button(host, 'Call off').click() })
    expect(mocks.posts.at(-1)).toEqual({ path: '/api/admin/classes/skip', body: { id: 'c1', date: TODAY, skip: true } })
    expect(host.textContent).toContain('Called off')
    expect(button(host, 'Put back on')).toBeTruthy()
    await act(async () => { button(host, 'Timetable').click() })
    expect(mocks.go).toContain('/aulas/horario')
  })
  it('one day per page: arrows, the date, and back to today', async () => {
    const tomorrow = addDaysISO(TODAY, 1), later = addDaysISO(TODAY, 3)
    mocks.answers['/api/classes'] = { gym: { id: 'g', name: 'G', owner: false }, sessions: [session(), session({ id: 'c2', name: 'Pilates', date: tomorrow }), session({ id: 'c3', name: 'Yoga', date: later })], mine: [] }
    const host = await render()
    const prev = host.querySelector('[aria-label="Previous day"]'), next = host.querySelector('[aria-label="Next day"]')
    expect(host.querySelector('.au-pager-d b').textContent).toBe('Today')
    expect(prev.disabled).toBe(true)
    expect(button(host, 'Back to today').disabled).toBe(true)
    expect(host.textContent).toContain('Spinning')
    expect(host.textContent).not.toContain('Pilates')
    await act(async () => { next.click() })
    expect(host.querySelector('.au-pager-d b').textContent).toBe('Tomorrow')
    expect(host.textContent).toContain('Pilates')
    expect(host.textContent).not.toContain('Spinning')
    await act(async () => { next.click() })
    expect(host.textContent).toContain('No classes on this day.')
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })) })
    expect(host.textContent).toContain('Yoga')
    await act(async () => { button(host, 'Back to today').click() })
    expect(host.querySelector('.au-pager-d b').textContent).toBe('Today')
    expect(host.textContent).toContain('Spinning')
  })
  it('an owner with no classes is pointed at the timetable', async () => {
    mocks.user = { id: 'o', admin: true }
    mocks.answers['/api/classes'] = { gym: { id: 'g', name: 'G', owner: true }, sessions: [], mine: [] }
    const host = await render()
    expect(host.textContent).toContain('No classes on the timetable yet.')
    expect(button(host, 'Set up the timetable')).toBeTruthy()
  })
  it('the owner adds a class to the weekly timetable, with its PT', async () => {
    mocks.user = { id: 'o', name: 'Dono', admin: true }
    let saved = []
    mocks.answers['/api/admin/classes'] = () => ({ classes: saved })
    mocks.answers['/api/admin/users'] = { users: [{ id: 'o', name: 'Dono', admin: true }, { id: 'p', name: 'PT Ana', trainer: true }, { id: 'a', name: 'Aluno Rui' }] }
    mocks.answers['/api/admin/classes/save'] = init => { const b = JSON.parse(init.body); saved = [{ ...b, id: 'n1', trainer: 'PT Ana' }]; return { ok: true, id: 'n1' } }
    const host = await render(AulasHorario)
    expect(host.textContent).toContain('No classes yet.')
    await act(async () => { button(host, 'Add class').click() })
    const opts = [...host.querySelectorAll('#au-pt option')].map(o => o.textContent)
    expect(opts).toEqual(['No PT', 'Dono', 'PT Ana'])
    await act(async () => { button(host, 'Add class').click() })
    expect(mocks.toasts).toContain('Give the class a name.')
    const set = (sel, v) => { const el = host.querySelector(sel); const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }
    await act(async () => { set('#au-n', 'Spinning'); set('#au-pt', 'p'); set('#au-wd', '2'); set('#au-cp', '15') })
    await act(async () => { button(host, 'Add class').click() })
    await act(async () => {})
    expect(mocks.posts.at(-1)).toEqual({ path: '/api/admin/classes/save', body: { id: null, name: 'Spinning', trainerId: 'p', weekday: 2, starts: '18:30', minutes: 50, capacity: 15, room: '' } })
    expect(host.textContent).toContain('Spinning')
    expect(host.textContent).toContain('PT Ana · 15 places')
  })
})
