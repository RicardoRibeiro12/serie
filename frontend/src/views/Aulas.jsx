// Group classes (Série, supabase/classes.sql): the week ahead, by day. Members book a place and can
// cancel until the class starts. The class's PT and the gym's owner also see who booked; the owner
// can call one session off (a holiday) and opens the weekly timetable from here.
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, todayISO } from '../lib/format.js'
import { byDay, sessionState, placesLeft, afterBooking, endTime } from '../lib/classes.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import './aulas.css'

// The server's refusals, said in words.
export function bookingError(e) {
  const m = String(e?.message || '')
  if (/class full/.test(m)) return t('No places left in this class.')
  if (/class started/.test(m)) return t('This class has already started.')
  if (/called off/.test(m)) return t('This class was called off.')
  return m
}

export default function Aulas() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(null)
  const [open, setOpen] = useState(null)

  const load = useCallback(() => api('/api/classes?days=14').then(d => { setData(d); setErr(null) }).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])

  const key = s => s.id + '|' + s.date
  const patch = (s, next) => setData(d => ({ ...d, sessions: d.sessions.map(x => (key(x) === key(s) ? next : x)) }))
  const book = async (s, on) => {
    setBusy(key(s))
    try {
      const r = await api('/api/classes/book', { method: 'POST', body: JSON.stringify({ id: s.id, date: s.date, on }) })
      patch(s, afterBooking(s, r, on))
      toast(on ? t('Booked: {0}, {1} at {2}', s.name, fmtDate(s.date, true), s.starts) : t('Booking cancelled'))
    } catch (e) { toast(bookingError(e)); load() } finally { setBusy(null) }
  }
  const cancel = s => confirmSheet({
    title: t('Cancel your place?'),
    message: t('{0}, {1} at {2}. Your place goes to someone else.', s.name, fmtDate(s.date, true), s.starts),
    confirmText: t('Cancel booking'), danger: true,
    onConfirm: () => book(s, false)
  })
  const skip = (s, on) => confirmSheet({
    title: on ? t('Call off this class?') : t('Put this class back on?'),
    message: on ? t('{0} on {1} will not take place. Members who booked see it is called off; tell them in person too.', s.name, fmtDate(s.date, true))
      : t('{0} on {1} takes bookings again.', s.name, fmtDate(s.date, true)),
    confirmText: on ? t('Call off') : t('Put back on'), danger: on,
    onConfirm: () => api('/api/admin/classes/skip', { method: 'POST', body: JSON.stringify({ id: s.id, date: s.date, skip: on }) })
      .then(() => patch(s, { ...s, skipped: on })).catch(e => toast(e.message))
  })

  const owner = !!data?.gym?.owner
  const days = byDay(data?.sessions)
  const today = todayISO()

  return <div className="narrow au">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Back')} data-back><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>{t('Classes')}</h1>{data?.gym && <div className="small dim">{data.gym.name}</div>}</div>
      {owner && <Button size="sm" icon="calendar" onClick={() => nav('/aulas/horario')}>{t('Timetable')}</Button>}
    </div>

    {err && <div className="card small" role="alert">{err}</div>}
    {!data && !err && <div className="small dim au-empty">…</div>}
    {data && !data.gym && <div className="card small dim">{t('You are not in a gym yet. Ask your gym for its code.')}</div>}
    {data?.gym && !days.length && <div className="card au-empty">
      <p className="small dim">{owner ? t('No classes on the timetable yet.') : t('No classes in the next two weeks.')}</p>
      {owner && <Button variant="primary" icon="plus" onClick={() => nav('/aulas/horario')}>{t('Set up the timetable')}</Button>}
    </div>}

    {days.map(d => <section key={d.date} className="au-day" aria-label={fmtDate(d.date, true)}>
      <h2 className="au-date">{d.date === today ? t('Today') : fmtDate(d.date, true)}</h2>
      {d.sessions.map(s => {
        const st = sessionState(s)
        const sees = Array.isArray(s.roster)
        const k = key(s)
        return <article key={k} className={'card au-s au-' + st}>
          <div className="au-time"><b>{s.starts}</b><span className="small dim">{endTime(s.starts, s.minutes)}</span></div>
          <div className="au-main">
            <div className="au-name">{s.name}{st === 'off' && <span className="au-pill off">{t('Called off')}</span>}{st === 'booked' && <span className="au-pill in">{t('You’re in')}</span>}</div>
            <div className="small dim">{[s.trainer, s.room].filter(Boolean).join(' · ')}</div>
            <div className="small au-places">{st === 'off' ? '' : placesLeft(s) > 0
              ? tn('{0} place left', '{0} places left', placesLeft(s)) + ' · ' + s.booked + '/' + s.capacity
              : t('Full') + ' · ' + s.booked + '/' + s.capacity}</div>
            {sees && <button type="button" className="au-roster-btn small" aria-expanded={open === k} onClick={() => setOpen(o => (o === k ? null : k))}>
              {tn('{0} booked', '{0} booked', s.roster.length)}<Icon name={open === k ? 'chevronUp' : 'chevronDown'} /></button>}
            {sees && open === k && <ol className="au-roster small">{s.roster.length ? s.roster.map((n, i) => <li key={i}>{n}</li>) : <li className="dim">{t('Nobody yet.')}</li>}</ol>}
          </div>
          <div className="au-act">
            {st === 'book' && <Button size="sm" variant="primary" disabled={busy === k} onClick={() => book(s, true)}>{t('Book')}</Button>}
            {st === 'booked' && <Button size="sm" variant="tinted" disabled={busy === k} onClick={() => cancel(s)}>{t('Cancel')}</Button>}
            {st === 'full' && <span className="small dim">{t('Full')}</span>}
            {owner && !s.started && <button type="button" className="au-skip small dim" onClick={() => skip(s, !s.skipped)}>{s.skipped ? t('Put back on') : t('Call off')}</button>}
          </div>
        </article>
      })}
    </section>)}
    {!!user && data?.gym && <p className="small dim au-foot">{t('You can cancel until the class starts. If you booked and cannot come, cancel so someone else gets the place.')}</p>}
  </div>
}
