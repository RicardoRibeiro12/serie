// On Home, for a student: the plan their trainer sent (api/trainer.js), if one is waiting, and
// any check-in the trainer measured, merged straight into the student's history (lib/assessment.js).
// "Open" goes through the same import sheet as a plan file from a friend; once it is merged,
// or dismissed, the server forgets the offer.
import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { parsePlan } from '../lib/plan-share.js'
import { applyAssessment } from '../lib/assessment.js'
import { planImportSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

export default function PlanOfferCard() {
  const user = useStore(s => s.user)
  const unit = useStore(s => s.S.unit)
  const toast = useUI(s => s.toast)
  const [offer, setOffer] = useState(null)

  useEffect(() => {
    if (!user) return
    let live = true
    api('/api/plan-offer').then(r => { if (live) setOffer(r.offer) }).catch(() => {})
    api('/api/assessments').then(r => {
      const list = (r && r.assessments) || []
      if (!live || !list.length) return
      useStore.getState().update(S => { for (const a of list) applyAssessment(S, a) })
      api('/api/assessments/done', { method: 'POST', body: JSON.stringify({ ids: list.map(a => a.id) }) }).catch(() => {})
      const from = list[list.length - 1].from
      toast(from ? t('{0} recorded a check-in. It is in your weigh-ins and measurements.', from) : t('Your trainer recorded a check-in. It is in your weigh-ins and measurements.'))
    }).catch(() => {})
    return () => { live = false }
  }, [user?.id])

  if (!offer) return null
  const finish = () => api('/api/plan-offer/done', { method: 'POST', body: JSON.stringify({ id: offer.id }) })
    .catch(() => {}).finally(() => setOffer(null))
  const open = () => {
    let bundle
    try { bundle = parsePlan(JSON.stringify(offer.plan), unit || 'kg') } catch (e) { return toast(t('Couldn’t read that file.')) }
    if (!bundle.name) bundle.name = offer.name
    planImportSheet(bundle, finish)
  }

  return <div className="card offer-card">
    <div className="row offer-head">
      <span className="lrow-i offer-icon" aria-hidden="true"><Icon name="clipboard" /></span>
      <div className="offer-copy">
        <div className="lbl2">{offer.from ? t('From {0}, your trainer', offer.from) : t('From your trainer')}</div>
        <div className="ttl">{t('New plan: {0}', offer.name)}</div>
      </div>
    </div>
    <div className="row offer-acts">
      <Button variant="primary" onClick={open}>{t('Open plan')}</Button>
      <Button variant="ghost" className="dim" onClick={finish}>{t('Dismiss')}</Button>
    </div>
  </div>
}
