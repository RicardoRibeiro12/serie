// The trainer writes a plan for one student here, apart from their own plan: routines of
// exercises with sets, reps, rest and a note. No weekdays: the student chooses when to train each
// routine, each exercise with its picture, as in the trainer's own picker. Saved as a plan file (lib/plan-share.js format) in the student's library on the server
// (api/trainer.js makeLibraryPlan). A routine from the trainer's own plan can be copied in as a start.
import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { uid, todayISO, exerciseNameText } from '../lib/format.js'
import { CATALOGUE, EXIDX, searchExercises } from '../lib/exercises.js'
import { Button } from './ui.jsx'
import { Thumb } from './Media.jsx'

const KEEP = ['id', 'sets', 'reps', 'repsMin', 'restSec', 'note', 'mode', 'sec', 'min', 'weight', 'sg', 'sgName', 'sgRest', 'side', 'prog', 'inc']
const fromRoutine = r => ({ id: uid(), name: r.name || '', ex: (r.ex || []).filter(e => EXIDX[e.id]).map(e => Object.fromEntries(KEEP.filter(k => e[k] != null).map(k => [k, e[k]]))) })
const blankRoutine = n => ({ id: uid(), name: t('Workout {0}', String.fromCharCode(65 + n)), ex: [] })

export default function TrainerPlanEditor({ student, initial, done }) {
  const toast = useUI(s => s.toast)
  const mine = useStore(s => s.S.routines) || []
  const [name, setName] = useState(initial ? initial.name : '')
  const [routines, setRoutines] = useState(() => initial ? (initial.plan.routines || []).map(fromRoutine) : [blankRoutine(0)])
  const [busy, setBusy] = useState(false)

  const setR = (i, f) => setRoutines(rs => rs.map((r, j) => (j === i ? f(r) : r)))
  const setEx = (i, k, f) => setR(i, r => ({ ...r, ex: r.ex.map((e, j) => (j === k ? f(e) : e)) }))
  const moveEx = (i, k, d) => setR(i, r => {
    const ex = [...r.ex]; const to = k + d
    if (to < 0 || to >= ex.length) return r
    ;[ex[k], ex[to]] = [ex[to], ex[k]]
    return { ...r, ex }
  })

  const save = async () => {
    const clean = routines.map(r => ({ ...r, name: r.name.trim() || t('Workout'), ex: r.ex.filter(e => EXIDX[e.id]) })).filter(r => r.ex.length)
    if (!clean.length) return toast(t('Add at least one exercise.'))
    if (!name.trim()) return toast(t('Give the plan a name.'))
    const plan = { opengym_plan: 1, exported: todayISO(), name: name.trim(), unit: 'kg', week: {}, routines: clean, customEx: [] }
    setBusy(true)
    try {
      await api('/api/trainer/plans', { method: 'POST', body: JSON.stringify({ studentId: student.id, id: initial?.id, name: name.trim(), plan }) })
      toast(initial ? t('Plan updated for {0}', student.name) : t('Plan added for {0}', student.name))
      done(true)
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  return <div className="tp-edit">
    <label className="small dim" htmlFor="tp-name">{t('Plan name')}</label>
    <input id="tp-name" className="input" value={name} maxLength={80} placeholder={t('e.g. Hypertrophy, 8 weeks')} onChange={e => setName(e.target.value)} />
    <p className="small dim">{t('The student chooses which day to do each workout, or puts them on their own week.')}</p>

    {routines.map((r, i) => <section className="tp-routine" key={r.id} aria-label={r.name}>
      <div className="row tp-rhead">
        <input className="input tp-rname" aria-label={t('Workout name')} value={r.name} maxLength={60} onChange={e => setR(i, x => ({ ...x, name: e.target.value }))} />
        {routines.length > 1 && <Button size="sm" variant="ghost" className="dim" onClick={() => setRoutines(rs => rs.filter((_, j) => j !== i))}>{t('Remove')}</Button>}
      </div>
      {r.ex.length > 0 && <ol className="tp-exlist">
        {r.ex.map((e, k) => <li key={k} className="tp-ex">
          <div className="tp-exhead"><Thumb ex={EXIDX[e.id]} /><div className="tp-exname">{exerciseNameText(EXIDX[e.id])}</div></div>
          <div className="tp-exnums">
            <label className="tp-num"><span className="small dim">{t('Sets')}</span><input className="input tnum" inputMode="numeric" value={e.sets ?? ''} onChange={ev => setEx(i, k, x => ({ ...x, sets: clampInt(ev.target.value, 1, 20) }))} /></label>
            <label className="tp-num"><span className="small dim">{t('Reps')}</span><input className="input tnum" inputMode="numeric" value={e.reps ?? ''} onChange={ev => setEx(i, k, x => ({ ...x, reps: clampInt(ev.target.value, 1, 100) }))} /></label>
            <label className="tp-num"><span className="small dim">{t('Rest (s)')}</span><input className="input tnum" inputMode="numeric" value={e.restSec ?? ''} onChange={ev => setEx(i, k, x => ({ ...x, restSec: clampInt(ev.target.value, 0, 900) }))} /></label>
          </div>
          <input className="input tp-note" aria-label={t('Note')} placeholder={t('Note for the student')} maxLength={200} value={e.note || ''} onChange={ev => setEx(i, k, x => ({ ...x, note: ev.target.value || undefined }))} />
          <div className="tp-exacts">
            <button type="button" className="iconbtn sm" aria-label={t('Move up')} disabled={k === 0} onClick={() => moveEx(i, k, -1)}>↑</button>
            <button type="button" className="iconbtn sm" aria-label={t('Move down')} disabled={k === r.ex.length - 1} onClick={() => moveEx(i, k, 1)}>↓</button>
            <button type="button" className="btn-link small" onClick={() => setR(i, x => ({ ...x, ex: x.ex.filter((_, j) => j !== k) }))}>{t('Remove')}</button>
          </div>
        </li>)}
      </ol>}
      <ExerciseFinder onPick={id => setR(i, x => ({ ...x, ex: [...x.ex, { id, sets: 3, reps: 12, restSec: 90 }] }))} />
    </section>)}

    <div className="row tp-more">
      <Button size="sm" variant="tinted" icon="plus" onClick={() => setRoutines(rs => [...rs, blankRoutine(rs.length)])}>{t('Add workout')}</Button>
      {mine.length > 0 && <select className="input tp-copy" aria-label={t('Copy one of my workouts')} value="" onChange={e => {
        const r = mine.find(x => x.id === e.target.value)
        if (r) setRoutines(rs => [...(rs.length === 1 && !rs[0].ex.length ? [] : rs), fromRoutine(r)])
      }}>
        <option value="">{t('Copy one of my workouts…')}</option>
        {mine.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>}
    </div>
    <div className="row tp-save">
      <Button variant="primary" disabled={busy} onClick={save}>{busy ? t('Saving…') : t('Save plan')}</Button>
      <Button variant="ghost" className="dim" onClick={() => done(false)}>{t('Cancel')}</Button>
    </div>
  </div>
}

const clampInt = (v, lo, hi) => {
  if (v === '') return undefined
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : undefined
}

// The muscle groups, in the order a trainer thinks of a body (lib/exercises.js `bp`).
const GROUPS = ['chest', 'back', 'shoulders', 'upper arms', 'lower arms', 'upper legs', 'lower legs', 'waist', 'full body', 'cardio']
const MAX_HITS = 12

// Search the catalogue in the app's language, optionally inside one muscle group; the first
// results as buttons. A group alone lists its exercises, so the trainer can browse without typing.
function ExerciseFinder({ onPick }) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState('')
  const pool = useMemo(() => (group ? CATALOGUE.filter(ex => ex.bp === group) : CATALOGUE), [group])
  const hits = useMemo(() => {
    if (q.trim().length >= 2) return searchExercises(pool, q).slice(0, MAX_HITS)
    return group ? pool.slice(0, MAX_HITS) : []
  }, [q, pool, group])
  return <div className="tp-find">
    <div className="tp-groups" role="group" aria-label={t('Muscle group')}>
      {GROUPS.map(g => <button key={g} type="button" className={'chip' + (group === g ? ' on' : '')} aria-pressed={group === g}
        onClick={() => setGroup(x => (x === g ? '' : g))}><span className="capitalize">{t(g)}</span></button>)}
    </div>
    <input className="input" type="search" aria-label={t('Add an exercise')} placeholder={group ? t('Search in {0}', t(group)) : t('Add an exercise: search by name or muscle')} value={q} onChange={e => setQ(e.target.value)} />
    {group && !q.trim() && <div className="small dim tp-hint">{t('The first {0} of {1}. Type to narrow it down.', Math.min(MAX_HITS, pool.length), pool.length)}</div>}
    {hits.length > 0 && <ul className="tp-hits">
      {hits.map(ex => <li key={ex.id}><button type="button" className="tp-hit" onClick={() => { onPick(ex.id); setQ('') }}>
        <Thumb ex={ex} /><span className="tp-hitname">{exerciseNameText(ex)}</span><span className="small dim capitalize">{ex.bp ? t(ex.bp) : ''}</span>
      </button></li>)}
    </ul>}
  </div>
}
