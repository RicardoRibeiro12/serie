// The gym's weekly class timetable, for its owner (Série, supabase/classes.sql): each class on a
// weekday and time, with its PT, length, places and room. Members book the sessions in views/Aulas.jsx.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n.js'
import { byWeekday, classProblem, endTime } from '../lib/classes.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import './aulas.css'

// "Monday" … "Sunday" in the app's language (2026-11-09 was a Monday).
export const weekdayName = wd => new Date(Date.UTC(2026, 10, 8 + wd, 12)).toLocaleDateString(dateLocale(), { weekday: 'long', timeZone: 'UTC' })

const BLANK = { id: null, name: '', trainerId: '', weekday: 1, starts: '18:30', minutes: 50, capacity: 12, room: '' }

function ClassForm({ initial, trainers, onSaved, onCancel }) {
  const toast = useUI(s => s.toast)
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const save = async () => {
    const form = { ...f, weekday: Number(f.weekday), minutes: Number(f.minutes), capacity: Number(f.capacity) }
    const problem = classProblem(form)
    if (problem) return toast(t(problem))
    setBusy(true)
    try {
      await api('/api/admin/classes/save', { method: 'POST', body: JSON.stringify({ ...form, name: form.name.trim(), trainerId: form.trainerId || null }) })
      toast(f.id ? t('Class saved') : t('Class added'))
      onSaved()
    } catch (e) { toast(/not a trainer/.test(e.message) ? t('That person is not a PT of this gym.') : e.message) } finally { setBusy(false) }
  }
  return <div className="card au-form">
    <div className="ttl">{f.id ? t('Edit class') : t('New class')}</div>
    <label className="small dim" htmlFor="au-n">{t('Name')}</label>
    <input id="au-n" className="input" maxLength={60} placeholder={t('e.g. Spinning, Pilates, Cross training')} value={f.name} onChange={e => set('name', e.target.value)} />
    <label className="small dim" htmlFor="au-pt">{t('PT')}</label>
    <select id="au-pt" className="input" value={f.trainerId || ''} onChange={e => set('trainerId', e.target.value)}>
      <option value="">{t('No PT')}</option>
      {trainers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <div className="au-grid">
      <div><label className="small dim" htmlFor="au-wd">{t('Day')}</label>
        <select id="au-wd" className="input" value={f.weekday} onChange={e => set('weekday', e.target.value)}>
          {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{weekdayName(d)}</option>)}
        </select></div>
      <div><label className="small dim" htmlFor="au-st">{t('Starts')}</label>
        <input id="au-st" className="input" type="time" step={300} value={f.starts} onChange={e => set('starts', e.target.value)} /></div>
      <div><label className="small dim" htmlFor="au-mn">{t('Minutes')}</label>
        <input id="au-mn" className="input" type="number" inputMode="numeric" min={10} max={240} step={5} value={f.minutes} onChange={e => set('minutes', e.target.value)} /></div>
      <div><label className="small dim" htmlFor="au-cp">{t('Places')}</label>
        <input id="au-cp" className="input" type="number" inputMode="numeric" min={1} max={500} value={f.capacity} onChange={e => set('capacity', e.target.value)} /></div>
    </div>
    <label className="small dim" htmlFor="au-rm">{t('Room (optional)')}</label>
    <input id="au-rm" className="input" maxLength={40} placeholder={t('e.g. Studio 1')} value={f.room || ''} onChange={e => set('room', e.target.value)} />
    <div className="row au-form-acts">
      <Button variant="ghost" className="dim" onClick={onCancel}>{t('Cancel')}</Button>
      <Button variant="primary" disabled={busy} onClick={save}>{f.id ? t('Save') : t('Add class')}</Button>
    </div>
  </div>
}

export default function AulasHorario() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const toast = useUI(s => s.toast)
  const [classes, setClasses] = useState(null)
  const [people, setPeople] = useState([])
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)

  const load = useCallback(() => Promise.all([api('/api/admin/classes'), api('/api/admin/users').catch(() => ({ users: [] }))])
    .then(([c, u]) => { setClasses(c.classes || []); setPeople(u.users || []); setErr(null) }).catch(e => setErr(e.message)), [])
  useEffect(() => { load() }, [load])
  // The PTs of the gym, and its owner, who can give a class too.
  const trainers = useMemo(() => people.filter(p => p.trainer || p.id === user?.id || p.admin).sort((a, b) => a.name.localeCompare(b.name)), [people, user?.id])

  if (!user?.admin) return <Navigate to="/aulas" replace />
  const remove = c => confirmSheet({
    title: t('Take “{0}” off the timetable?', c.name),
    message: t('Its sessions disappear and the bookings for them go. Past no-shows stay in the dashboard.'),
    confirmText: t('Remove'), danger: true,
    onConfirm: () => api('/api/admin/classes/remove', { method: 'POST', body: JSON.stringify({ id: c.id }) }).then(() => { toast(t('Class removed')); load() }).catch(e => toast(e.message))
  })
  const week = byWeekday(classes)

  return <div className="narrow au">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/aulas')} aria-label={t('Back')} data-back><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>{t('Timetable')}</h1><div className="small dim">{t('Every week, the same classes')}</div></div>
      {!edit && <Button size="sm" variant="primary" icon="plus" onClick={() => setEdit({ ...BLANK })}>{t('Add class')}</Button>}
    </div>
    {err && <div className="card small" role="alert">{err}</div>}
    {edit && <ClassForm key={edit.id || 'new'} initial={edit} trainers={trainers} onCancel={() => setEdit(null)} onSaved={() => { setEdit(null); load() }} />}
    {classes && !classes.length && !edit && <div className="card au-empty"><p className="small dim">{t('No classes yet. Add the first one: a name, its PT, the day and time, and how many places.')}</p></div>}
    {week.map(d => <section key={d.weekday} className="au-day">
      <h2 className="au-date capitalize">{weekdayName(d.weekday)}</h2>
      {d.classes.map(c => <article key={c.id} className="card au-s">
        <div className="au-time"><b>{c.starts}</b><span className="small dim">{endTime(c.starts, c.minutes)}</span></div>
        <div className="au-main">
          <div className="au-name">{c.name}</div>
          <div className="small dim">{[c.trainer || t('No PT'), c.room, t('{0} places', c.capacity)].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="au-act">
          <Button size="sm" onClick={() => setEdit({ ...BLANK, ...c, trainerId: c.trainerId || '', room: c.room || '' })}>{t('Edit')}</Button>
          <button type="button" className="au-skip small dim" onClick={() => remove(c)}>{t('Remove')}</button>
        </div>
      </article>)}
    </section>)}
  </div>
}
