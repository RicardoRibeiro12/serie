// One student, for their trainer: how they are training, their assessments (read from the server,
// so a check-in shows here as soon as it is saved), a new check-in, and the plans written for them.
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtNum, todayISO } from '../lib/format.js'
import { MEASUREMENT_FIELDS } from '../lib/measurements.js'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import AssessmentSheet from '../components/AssessmentSheet.jsx'
import TrainerPlanEditor from '../components/TrainerPlanEditor.jsx'

export default function TrainerStudent() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('progress')
  const [checkin, setCheckin] = useState(false)
  const [editing, setEditing] = useState(null)   // null, 'new' or a plan

  const load = () => api('/api/trainer/student?id=' + encodeURIComponent(id)).then(setData).catch(e => setErr(e.message))
  useEffect(() => { load() }, [id])

  const remove = async p => {
    if (!window.confirm(t('Remove “{0}” from {1}’s plans?', p.name, data.name))) return
    try { await api('/api/trainer/plans/delete', { method: 'POST', body: JSON.stringify({ studentId: id, id: p.id }) }); load() } catch (e) { toast(e.message) }
  }

  const tabs = [['progress', t('Progress')], ['assessments', t('Assessments')], ['plans', t('Plans')]]
  return <div className="narrow trainer">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/trainer')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>{data ? data.name : ' '}</h1><div className="sub">{t('Student')}</div></div>
    </div>
    {err && <div className="card small dim" role="alert">{err}</div>}
    {!data && !err && <div className="card small dim" aria-live="polite">{t('Loading…')}</div>}
    {data && <>
      <Segmented className="ts-tabs" options={tabs.map(([value, label]) => ({ value, label }))} value={tab} onChange={setTab} />

      {tab === 'progress' && <Progress p={data.progress} />}

      {tab === 'assessments' && <div className="card">
        <div className="row between ts-bar">
          <div className="ttl">{t('Assessments')}</div>
          <Button size="sm" variant="tinted" icon={checkin ? undefined : 'plus'} aria-expanded={checkin} onClick={() => setCheckin(c => !c)}>{checkin ? t('Cancel') : t('New assessment')}</Button>
        </div>
        {checkin && <CheckInForm student={data} last={data.assessments[0]} done={() => { setCheckin(false); load() }} />}
        {!checkin && <AssessmentSheet list={data.assessments} />}
      </div>}

      {tab === 'plans' && <div className="card">
        {editing
          ? <TrainerPlanEditor student={data} initial={editing === 'new' ? null : editing} done={saved => { setEditing(null); if (saved) load() }} />
          : <>
            <div className="row between ts-bar">
              <div><div className="ttl">{t('Plans')}</div><div className="small dim">{t('The student picks one of these on the day, or puts them on their own week.')}</div></div>
              <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing('new')}>{t('New plan')}</Button>
            </div>
            {!data.plans.length && <div className="small dim">{t('No plans yet.')}</div>}
            <ul className="ts-plans">
              {data.plans.map(p => <li key={p.id} className="ts-plan">
                <div className="grow">
                  <div className="ttl">{p.name}</div>
                  <div className="small dim">{(p.plan.routines || []).map(r => r.name).join(' · ')}</div>
                  <div className="small dim">{t('Updated {0}', fmtDate((p.updated || p.at).slice(0, 10)))}</div>
                </div>
                {p.mine && <div className="tr-acts">
                  <Button size="sm" variant="tinted" onClick={() => setEditing(p)}>{t('Edit')}</Button>
                  <Button size="sm" variant="ghost" className="dim" onClick={() => remove(p)}>{t('Remove')}</Button>
                </div>}
              </li>)}
            </ul>
          </>}
      </div>}
    </>}
  </div>
}

function Progress({ p }) {
  const first = p.weights[0], last = p.weights[p.weights.length - 1]
  const change = first && last && first !== last ? Math.round((last.w - first.w) * 10) / 10 : null
  return <>
    <div className="ts-stats">
      <div className="card ts-stat"><div className="lbl2">{t('Workouts')}</div><div className="ts-big tnum">{p.total}</div></div>
      <div className="card ts-stat"><div className="lbl2">{t('Last 4 weeks')}</div><div className="ts-big tnum">{p.last28}</div></div>
      <div className="card ts-stat"><div className="lbl2">{t('Weight')}</div><div className="ts-big tnum">{last ? fmtNum(last.w) : '–'} <span className="small dim">{last ? p.unit : ''}</span></div>
        {change != null && <div className="small dim tnum">{change > 0 ? '+' : ''}{fmtNum(change)} {p.unit} {t('since {0}', fmtDate(first.d))}</div>}</div>
    </div>
    <div className="card">
      <div className="ttl ts-sub">{t('Recent workouts')}</div>
      {!p.recent.length && <div className="small dim">{t('No workouts yet.')}</div>}
      <ul className="ts-recent">
        {p.recent.map((w, i) => <li key={i} className="ts-wk">
          <div className="grow"><div>{w.name || t('Workout')}</div><div className="small dim">{fmtDate(w.d)}{w.min ? ' · ' + t('{0} min', w.min) : ''}</div></div>
          <div className="small dim tnum ts-wnums">{tn('{0} set', '{0} sets', w.sets)}{w.volume ? ' · ' + fmtNum(w.volume) + ' ' + p.unit : ''}</div>
        </li>)}
      </ul>
    </div>
  </>
}

// A check-in as a gym's assessment sheet: weight and body composition, the heart rate, then the
// tape. Kg, cm, % and the units beside each field. Age, height and sex carry over from the last one.
const BODY = [
  ['age', 'Age', 'years'], ['height', 'Height', 'cm'],
  ['muscleKg', 'Skeletal muscle mass', 'kg'], ['leanKg', 'Lean mass', 'kg'], ['visceral', 'Visceral fat', 'level'],
  ['waterL', 'Total body water', 'l'], ['waterPct', 'Total body water (%)', '%'], ['ecwL', 'Extracellular water', 'l'],
  ['restingKcal', 'Resting metabolism', 'kcal'], ['restingVo2', 'Resting oxygen uptake', 'ml/kg/min'], ['hrRest', 'Resting heart rate', 'bpm']
]
const MAIN_FIELDS = ['waist', 'chest', 'hips', 'upperArmRight', 'thighRight']
function CheckInForm({ student, last, done }) {
  const toast = useUI(s => s.toast)
  const lb = last && last.body ? last.body : {}
  const [date, setDate] = useState(todayISO())
  const [vals, setVals] = useState(() => ({ age: lb.age ?? '', height: lb.height ?? '' }))
  const [sex, setSex] = useState(lb.sex || '')
  const [note, setNote] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const set = k => e => setVals(v => ({ ...v, [k]: e.target.value }))
  const num = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')))
  const tape = MEASUREMENT_FIELDS.filter(f => f.key !== 'bodyFat' && (more || MAIN_FIELDS.includes(f.key)))
  const fid = k => 'ci-' + student.id + '-' + k

  const save = async () => {
    const values = {}
    for (const f of MEASUREMENT_FIELDS) { const n = num(vals[f.key]); if (n != null) values[f.key] = n }
    const body = {}
    for (const [k] of BODY) { const n = num(vals[k]); if (n != null) body[k] = n }
    if (sex) body.sex = sex
    const weight = num(vals.weight)
    if (weight == null && !Object.keys(values).length && !Object.keys(body).some(k => !['sex', 'age', 'height'].includes(k))) return toast(t('Fill in at least one value.'))
    setBusy(true)
    try {
      await api('/api/trainer/assessment', { method: 'POST', body: JSON.stringify({ studentId: student.id, date, weight, values, body, note }) })
      toast(t('Check-in saved for {0}', student.name))
      done()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  const input = (k, label, unit) => <div className="tr-field" key={k}>
    <label className="small dim" htmlFor={fid(k)}>{t(label)} <span className="tnum">({unit === 'years' ? t('years') : unit === 'level' ? t('level') : unit})</span></label>
    <input id={fid(k)} className="input tnum" inputMode="decimal" value={vals[k] ?? ''} onChange={set(k)} />
  </div>

  return <div className="tr-send">
    <div className="tr-grid">
      <div className="tr-field">
        <label className="small dim" htmlFor={fid('date')}>{t('Date')}</label>
        <input id={fid('date')} className="input" type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)} />
      </div>
      <div className="tr-field">
        <label className="small dim" htmlFor={fid('sex')}>{t('Sex')}</label>
        <select id={fid('sex')} className="input" value={sex} onChange={e => setSex(e.target.value)}>
          <option value="">–</option><option value="f">{t('Female')}</option><option value="m">{t('Male')}</option>
        </select>
      </div>
      {input('age', 'Age', 'years')}
      {input('height', 'Height', 'cm')}
      {input('weight', 'Weight', 'kg')}
      {input('bodyFat', 'Body fat', '%')}
    </div>
    <div className="lbl2 as-sub">{t('Body composition and heart rate')}</div>
    <div className="tr-grid">{BODY.slice(2).map(([k, l, u]) => input(k, l, u))}</div>
    <div className="lbl2 as-sub">{t('Circumferences')}</div>
    <div className="tr-grid">{tape.map(f => input(f.key, f.label, 'cm'))}</div>
    <button type="button" className="btn-link small" onClick={() => setMore(m => !m)}>{more ? t('Fewer measurements') : t('More measurements')}</button>
    <label className="small dim" htmlFor={fid('note')}>{t('Note')}</label>
    <input id={fid('note')} className="input" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
    <Button variant="primary" disabled={busy} onClick={save}>{busy ? t('Saving…') : t('Save check-in')}</Button>
  </div>
}
