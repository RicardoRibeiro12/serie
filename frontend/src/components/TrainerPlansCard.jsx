// On Home, for a student: the plans their trainer wrote for them (api/trainer.js, GET /api/my-plans)
// and their latest assessment. A plan carries no weekdays: "Add to my plan" brings its workouts in
// through the same import sheet as a plan file from a friend, and the student puts them on their
// own week or picks one on the day. The trainer can update a plan; the card then says so.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { parsePlan } from '../lib/plan-share.js'
import { planImportSheet } from '../sheets.jsx'
import AssessmentSheet from './AssessmentSheet.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

// Which version of each plan this device already added: { [id]: updated }. A convenience only.
const KEY = 'serie_trainer_plans_added'
const readAdded = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} } }
const markAdded = (id, updated) => { try { localStorage.setItem(KEY, JSON.stringify({ ...readAdded(), [id]: updated })) } catch {} }

export default function TrainerPlansCard() {
  const user = useStore(s => s.user)
  const unit = useStore(s => s.S.unit)
  const toast = useUI(s => s.toast)
  const [plans, setPlans] = useState([])
  const [assess, setAssess] = useState([])
  const [added, setAdded] = useState(readAdded)
  const [showAssess, setShowAssess] = useState(false)

  useEffect(() => {
    if (!user) return
    let live = true
    api('/api/my-plans').then(r => { if (live) setPlans((r && r.plans) || []) }).catch(() => {})
    api('/api/assessments?all=1').then(r => { if (live) setAssess((r && r.assessments) || []) }).catch(() => {})
    return () => { live = false }
  }, [user?.id])

  if (!plans.length && !assess.length) return null
  const add = p => {
    let bundle
    try { bundle = parsePlan(JSON.stringify(p.plan), unit || 'kg') } catch { return toast(t('Couldn’t read that file.')) }
    if (!bundle.name) bundle.name = p.name
    planImportSheet(bundle, () => { markAdded(p.id, p.updated); setAdded(readAdded()) })
  }
  const from = plans[0]?.from || assess[0]?.from

  return <div className="card offer-card tp-card">
    <div className="row offer-head">
      <span className="lrow-i offer-icon" aria-hidden="true"><Icon name="clipboard" /></span>
      <div className="offer-copy">
        <div className="lbl2">{from ? t('From {0}, your trainer', from) : t('From your trainer')}</div>
        <div className="ttl">{plans.length ? tn('{0} plan for you', '{0} plans for you', plans.length) : t('Your assessments')}</div>
      </div>
    </div>
    {plans.length > 0 && <ul className="ts-plans">
      {plans.map(p => {
        const state = !added[p.id] ? 'new' : added[p.id] !== p.updated ? 'updated' : 'added'
        return <li key={p.id} className="ts-plan">
          <div className="grow">
            <div className="ttl">{p.name}{state === 'updated' && <span className="small tr-pending"> · {t('updated')}</span>}</div>
            <div className="small dim">{(p.plan.routines || []).map(r => r.name).join(' · ')}</div>
          </div>
          <Button size="sm" variant={state === 'added' ? 'ghost' : 'primary'} onClick={() => add(p)}>{state === 'added' ? t('Add again') : t('Add to my plan')}</Button>
        </li>
      })}
    </ul>}
    {plans.length > 0 && <p className="small dim">{t('Choose the day for each workout in your Plan, or start one whenever you like.')}</p>}
    {assess.length > 0 && <div className="tp-assess">
      <button type="button" className="btn-link small" aria-expanded={showAssess} onClick={() => setShowAssess(v => !v)}>
        {showAssess ? t('Hide assessment') : t('Latest assessment: {0}', fmtDate(assess[0].date))}
      </button>
      {showAssess && <AssessmentSheet list={assess} />}
    </div>}
  </div>
}
