// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// Front desk mode: today's classes for a PT at the desk computer, with how many booked and who.
const mocks = vi.hoisted(() => ({ answer: null }))
vi.mock('../lib/api.js', () => ({ api: () => Promise.resolve(mocks.answer) }))

const { default: DeskClasses } = await import('./DeskClasses.jsx')
const { todayISO } = await import('../lib/format.js')

let root
afterEach(() => { act(() => root.unmount()); document.body.innerHTML = '' })

it('lists today’s classes with the count, the PT and who booked', async () => {
  const today = todayISO()
  mocks.answer = { sessions: [
    { id: 'a', date: today, name: 'Spinning', starts: '18:30', minutes: 50, capacity: 15, booked: 2, trainer: 'PT Ana', room: 'Estúdio 1', started: true, skipped: false, roster: ['Rui', 'Bia'] },
    { id: 'b', date: today, name: 'Yoga', starts: '20:00', minutes: 60, capacity: 12, booked: 0, trainer: 'PT Ana', room: null, started: false, skipped: true, roster: [] },
    { id: 'c', date: '2099-01-01', name: 'Later', starts: '08:00', minutes: 45, capacity: 10, booked: 0, roster: [] },
  ] }
  const host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  const close = vi.fn()
  await act(async () => { root.render(<DeskClasses onClose={close} />) })
  await act(async () => {})
  const items = host.querySelectorAll('.rc-class')
  expect(items.length).toBe(2)
  expect(items[0].textContent).toContain('18:30–19:20')
  expect(items[0].textContent).toContain('2/15')
  expect(items[0].textContent).toContain('On now')
  expect(items[0].textContent).toContain('PT Ana · Estúdio 1')
  expect([...items[0].querySelectorAll('.rc-class-roster li')].map(li => li.textContent)).toEqual(['Rui', 'Bia'])
  expect(items[1].textContent).toContain('Called off')
  await act(async () => { host.querySelector('[aria-label="Close"]').click() })
  expect(close).toHaveBeenCalled()
})
