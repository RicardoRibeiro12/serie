// Group classes (Série, supabase/classes.sql): pure helpers for the timetable screens
// (views/Aulas.jsx, views/AulasHorario.jsx) and the Home tile.

/** "18:30" + 50 minutes → "19:20". */
export function endTime(starts, minutes) {
  const [h, m] = String(starts || '0:0').split(':').map(Number)
  const t = ((h * 60 + m + (Number(minutes) || 0)) % 1440 + 1440) % 1440
  return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0')
}

/** Sessions grouped by date, in order: [{ date, sessions }]. */
export function byDay(sessions) {
  const out = []
  for (const s of Array.isArray(sessions) ? sessions : []) {
    const last = out[out.length - 1]
    if (last && last.date === s.date) last.sessions.push(s)
    else out.push({ date: s.date, sessions: [s] })
  }
  return out
}

/**
 * What a member can do with a session: 'booked' (cancel), 'book', 'full', 'off' (called off),
 * 'started' (too late either way).
 */
export function sessionState(s) {
  if (!s) return 'off'
  if (s.skipped) return 'off'
  if (s.started) return 'started'
  if (s.mine) return 'booked'
  return (s.booked || 0) >= (s.capacity || 0) ? 'full' : 'book'
}

/** The places left, never below 0. */
export const placesLeft = s => Math.max(0, (s?.capacity || 0) - (s?.booked || 0))

/** The session after a booking or a cancellation: count and mine, as the server answered. */
export function afterBooking(s, answer, on) {
  return { ...s, booked: typeof answer?.booked === 'number' ? answer.booked : s.booked, mine: !!on }
}

/** The weekly timetable grouped by ISO weekday (1 Monday … 7 Sunday): [{ weekday, classes }]. */
export function byWeekday(classes) {
  const map = new Map()
  for (const c of Array.isArray(classes) ? classes : []) {
    if (!map.has(c.weekday)) map.set(c.weekday, [])
    map.get(c.weekday).push(c)
  }
  return [...map.keys()].sort((a, b) => a - b).map(weekday => ({
    weekday, classes: map.get(weekday).slice().sort((a, b) => String(a.starts).localeCompare(String(b.starts)))
  }))
}

/** Checks a class form before it is sent; null when it is fine, else the English message key. */
export function classProblem(f) {
  if (!String(f?.name || '').trim()) return 'Give the class a name.'
  if (!(f.weekday >= 1 && f.weekday <= 7)) return 'Pick a day.'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(f.starts || ''))) return 'Pick a start time.'
  if (!(f.minutes >= 10 && f.minutes <= 240)) return 'A class lasts 10 to 240 minutes.'
  if (!(f.capacity >= 1 && f.capacity <= 500)) return 'Places: 1 to 500.'
  return null
}

/** ISO weekday (1 Monday … 7 Sunday) of a "YYYY-MM-DD" date. */
export function isoWeekday(date) {
  const d = new Date(date + 'T12:00:00Z').getUTCDay()
  return d === 0 ? 7 : d
}

/** "YYYY-MM-DD" n days after a date (n may be negative). */
export const addDaysISO = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)

/** The days the classes page pages through: today and the n-1 after it. */
export const dayList = (today, n = 14) => Array.from({ length: n }, (_, i) => addDaysISO(today, i))
