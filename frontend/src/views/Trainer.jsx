// A trainer's students (api/trainer.js): who they are and how they train. Each one opens on their
// own page (TrainerStudent.jsx): progress, assessments and the plans written for them. Those plans
// live in the student's library, never in the trainer's own plan or Home.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

export default function Trainer() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [students, setStudents] = useState(null)
  const [err, setErr] = useState('')
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
      {students.map(s => <button type="button" key={s.id} className="tr-row tr-open" onClick={() => nav('/trainer/' + s.id)}>
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
          <div className="small dim">{tn('{0} plan', '{0} plans', s.plans || 0)} · {tn('{0} assessment', '{0} assessments', s.assessments || 0)}</div>
        </div>
        <Icon name="chevronRight" className="dim" />
      </button>)}
    </div>}
  </div>
}

const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
