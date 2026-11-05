// The person's RGPD choices (Série on Supabase): whether their PT may record assessments (health
// data, art. 9), and erasing the ones already recorded. The privacy policy itself was accepted at
// sign-up or by components/Consent.jsx ConsentGate; withdrawing it is deleting the account.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { confirmSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { policyUrl } from '../components/Consent.jsx'

export default function DataConsent() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const setUser = useStore(s => s.setUser)
  const toast = useUI(s => s.toast)
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const on = !!user.consentHealth

  const setHealth = async health => {
    setBusy(true)
    try {
      const r = await api('/api/consent', { method: 'POST', body: JSON.stringify({ health }) })
      setUser({ ...user, ...r.user })
      toast(health ? t('Your PT may record assessments again.') : t('Done. Your PT can no longer record assessments.'))
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }
  const erase = () => confirmSheet({
    title: t('Erase all your assessments?'),
    message: t('Every assessment your PT recorded about you is deleted, for you and for your PT. The weigh-ins already in your own history stay. This cannot be undone.'),
    confirmText: t('Erase'), danger: true,
    onConfirm: () => api('/api/assessments/delete-mine', { method: 'POST', body: '{}' })
      .then(r => toast(t('{0} assessments erased.', r.removed || 0))).catch(e => toast(e.message))
  })

  return <div className="narrow dc">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/settings/account')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>{t('Privacy and health data')}</h1></div>
    </div>

    <div className="card">
      <div className="ttl">{t('Privacy policy')}</div>
      <p className="small dim">{user.consentTerms ? t('Accepted on {0}.', fmtDate(String(user.consentTerms).slice(0, 10))) : t('Not accepted yet.')} <a href={policyUrl()} target="_blank" rel="noopener">{t('Read the policy')}</a></p>
    </div>

    <div className="card">
      <div className="ttl">{t('Assessments by your PT')}</div>
      <p className="small dim">{t('Weight, body composition and heart rate are health data. Your PT records them only with your permission, and you can change your mind at any time.')}</p>
      <p className="small">{on ? t('Allowed since {0}.', fmtDate(String(user.consentHealth).slice(0, 10))) : t('Not allowed.')}</p>
      <div className="row dc-acts">
        {on
          ? <Button variant="tinted" disabled={busy} onClick={() => setHealth(false)}>{t('Withdraw permission')}</Button>
          : <Button variant="primary" disabled={busy} onClick={() => setHealth(true)}>{t('Allow assessments')}</Button>}
        <Button variant="ghost" className="dim" onClick={erase}>{t('Erase my assessments')}</Button>
      </div>
    </div>

    <p className="small dim dc-foot">{t('To take all your data with you, use Export in Settings. To leave for good, delete the account there.')}</p>
  </div>
}
