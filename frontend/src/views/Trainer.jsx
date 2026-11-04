// A trainer's students (api/trainer.js): who they are, how they train, and sending each one a
// plan. The plan is built in the trainer's own Plan screen like any other, then sent as the plan
// file openGym already shares (lib/plan-share.js): the whole week, or one programme.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { buildPlanBundle, buildProgrammeBundle } from '../lib/plan-share.js'
import { programmesOf } from '../lib/programmes.js'
import { MEASUREMENT_FIELDS } from '../lib/measurements.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

export default function Trainer() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const toast = useUI(s => s.toast)
  const [students, setStudents] = useState(null)
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState(null)
  const [checkin, setCheckin] = useState(null)
  const [invite, setInvite] = useState(null)

  const load = () => api('/api/trainer/students').then(r => setStudents(r.students)).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  const newInvite = () => api('/api/trainer/invites/new', { method: 'POST', body: JSON.stringify({}) })
    .then(r => setInvite(r.invite.code)).catch(e => toast(e.message))

  return <div className="narrow trainer">
    <div className="hdr">
      <div><h1>{t('Students')}</h1><div className="sub">{students ? tn('{0} student', '{0} students', students.length) : ' '}</div></div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
    </div>

    <div className="card">
      <div className="row between tr-invite">
        <div className="tr-invite-copy">
          <div className="ttl">{t('Invite a student')}</div>
          <div className="small dim">{t('Whoever signs up with this code becomes your student.')}</div>
        </div>
        <Button size="sm" variant="primary" icon="plus" onClick={newInvite}>{t('New code')}</Button>
      </div>
      {invite && <div className="tr-code" aria-live="polite">{invite}</div>}
    </div>

    {!students && !err && <div className="card small dim" aria-live="polite">{t('Loading…')}</div>}
    {err && <div className="card small dim" role="alert">{err}</div>}
    {students && !students.length && <div className="card small dim">{t('No students yet. Send them an invite code.')}</div>}

    {students && students.length > 0 && <div className="card tr-list">
      {students.map(s => <div key={s.id} className="tr-row">
        <span className="tr-ini" aria-hidden="true">{initials(s.name)}</span>
        <div className="tr-who">
          <div className="ttl">{s.name}</div>
          <div className="small dim">
            {tn('{0} workout', '{0} workouts', s.workouts)}
            {s.lastWorkout ? ' · ' + t('last {0}', fmtDate(s.lastWorkout)) : ''}
          </div>
          {(s.weight || s.bodyFat) && <div className="small dim">
            {s.weight && <><span className="tnum">{fmtNum(s.weight.w)} {s.unit}</span> · {fmtDate(s.weight.d)}</>}{s.weight && s.bodyFat ? ' · ' : ''}{s.bodyFat ? t('{0}% body fat', fmtNum(s.bodyFat.v)) : ''}
          </div>}
          {s.pending && <div className="small tr-pending">{t('“{0}” sent, not opened yet', s.pending.name)}</div>}
        </div>
        <div className="tr-acts">
          <Button size="sm" variant="tinted" aria-expanded={checkin === s.id} icon="ruler" onClick={() => { setPicked(null); setCheckin(checkin === s.id ? null : s.id) }}>{t('Check-in')}</Button>
          <Button size="sm" variant="tinted" aria-expanded={picked === s.id} icon="share" onClick={() => { setCheckin(null); setPicked(picked === s.id ? null : s.id) }}>{t('Send plan')}</Button>
        </div>
        {picked === s.id && <SendPlan S={S} student={s} done={() => { setPicked(null); load() }} />}
        {checkin === s.id && <CheckInForm student={s} done={() => { setCheckin(null); load() }} />}
      </div>)}
    </div>}
  </div>
}

const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

// What to send: the trainer's whole current plan, or one of their programmes.
function SendPlan({ S, student, done }) {
  const toast = useUI(s => s.toast)
  const programmes = programmesOf(S)
  const [what, setWhat] = useState('plan')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const hasPlan = (S.routines || []).some(r => r.ex && r.ex.length)

  const send = async () => {
    const plan = what === 'plan' ? buildPlanBundle(S, name) : buildProgrammeBundle(S, what)
    if (!plan || !(plan.routines || []).length) return toast(t('There is nothing in that plan yet.'))
    setBusy(true)
    try {
      await api('/api/trainer/plan', { method: 'POST', body: JSON.stringify({ studentId: student.id, plan, name: name || plan.name || '' }) })
      toast(t('Plan sent to {0}', student.name))
      done()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  return <div className="tr-send">
    <label className="small dim" htmlFor={'tr-what-' + student.id}>{t('Plan to send')}</label>
    <select id={'tr-what-' + student.id} className="input" value={what} onChange={e => setWhat(e.target.value)}>
      <option value="plan" disabled={!hasPlan}>{t('My current weekly plan')}</option>
      {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
    <label className="small dim" htmlFor={'tr-name-' + student.id}>{t('Name the student sees')}</label>
    <input id={'tr-name-' + student.id} className="input" value={name} maxLength={80} placeholder={t('e.g. Hypertrophy, 8 weeks')} onChange={e => setName(e.target.value)} />
    <Button variant="primary" disabled={busy} onClick={send}>{busy ? t('Sending…') : t('Send to {0}', student.name)}</Button>
  </div>
}

// A check-in: weight, body fat and the tape measurements, in kg, % and cm. The student's app adds
// them to their own weigh-ins and measurements (lib/assessment.js).
const MAIN_FIELDS = ['waist', 'chest', 'hips', 'upperArmRight', 'thighRight']
function CheckInForm({ student, done }) {
  const toast = useUI(s => s.toast)
  const [date, setDate] = useState(todayISO())
  const [vals, setVals] = useState({})
  const [note, setNote] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = k => e => setVals(v => ({ ...v, [k]: e.target.value }))
  const num = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
  const fields = MEASUREMENT_FIELDS.filter(f => f.key !== 'bodyFat' && (more || MAIN_FIELDS.includes(f.key)))
  const id = k => 'ci-' + student.id + '-' + k

  const save = async () => {
    const values = {}
    for (const f of MEASUREMENT_FIELDS) { const n = num(vals[f.key]); if (n != null) values[f.key] = n }
    const weight = num(vals.weight)
    if (weight == null && !Object.keys(values).length) return toast(t('Fill in at least one value.'))
    setBusy(true)
    try {
      await api('/api/trainer/assessment', { method: 'POST', body: JSON.stringify({ studentId: student.id, date, weight, values, note }) })
      toast(t('Check-in saved for {0}', student.name))
      done()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  const input = (k, label, unit) => <div className="tr-field" key={k}>
    <label className="small dim" htmlFor={id(k)}>{label} <span className="tnum">({unit})</span></label>
    <input id={id(k)} className="input tnum" inputMode="decimal" value={vals[k] ?? ''} onChange={set(k)} />
  </div>

  return <div className="tr-send">
    <div className="tr-grid">
      <div className="tr-field">
        <label className="small dim" htmlFor={id('date')}>{t('Date')}</label>
        <input id={id('date')} className="input" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} />
      </div>
      {input('weight', t('Weight'), 'kg')}
      {input('bodyFat', t('Body fat'), '%')}
      {fields.map(f => input(f.key, t(f.label), 'cm'))}
    </div>
    <button type="button" className="btn-link small" onClick={() => setMore(m => !m)}>{more ? t('Fewer measurements') : t('More measurements')}</button>
    <label className="small dim" htmlFor={id('note')}>{t('Note')}</label>
    <input id={id('note')} className="input" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
    <Button variant="primary" disabled={busy} onClick={save}>{busy ? t('Saving…') : t('Save check-in')}</Button>
  </div>
}
