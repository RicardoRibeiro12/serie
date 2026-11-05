// RGPD consent (Série on Supabase, config.consent). Two separate choices, as the law asks for
// health data (art. 9): the privacy policy, needed to use the app; and, optional, letting the
// person's PT record assessments, which hold health data (body composition, heart rate). Without the
// second the server refuses any assessment for them (supabase/app.sql record_assessment).
//
// ConsentChecks sits in the sign-up form; ConsentGate asks an account that has not accepted yet
// (every account made before this existed) before it can use the app.
import { useState } from 'react'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { appBase } from '../lib/app-base.js'
import { Button } from './ui.jsx'

// The policy is on the public site, one level above the app (/privacidade/ beside /app/).
export const policyUrl = () => appBase().replace(/\/app\/?$/, '') + '/privacidade/'

export function ConsentChecks({ terms, setTerms, health, setHealth, id = 'consent' }) {
  return <div className="consent">
    <label className="consent-row" htmlFor={id + '-terms'}>
      <input id={id + '-terms'} type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
      <span>{t('I have read and accept the')} <a href={policyUrl()} target="_blank" rel="noopener">{t('privacy policy')}</a>. <span className="dim">{t('(required)')}</span></span>
    </label>
    <label className="consent-row" htmlFor={id + '-health'}>
      <input id={id + '-health'} type="checkbox" checked={health} onChange={e => setHealth(e.target.checked)} />
      <span>{t('I allow my PT to record assessments about me: weight, body composition and heart rate. These are health data; I can withdraw this and erase them in Settings at any time.')} <span className="dim">{t('(optional)')}</span></span>
    </label>
  </div>
}

export function ConsentGate() {
  const setUser = useStore(s => s.setUser)
  const user = useStore(s => s.user)
  const [terms, setTerms] = useState(false)
  const [health, setHealth] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    if (!terms) return setErr(t('To use the app, accept the privacy policy.'))
    setBusy(true); setErr('')
    try { const r = await api('/api/consent', { method: 'POST', body: JSON.stringify({ terms: true, health }) }); setUser({ ...user, ...r.user }) }
    catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  return <div className="consent-gate" role="dialog" aria-modal="true" aria-labelledby="consent-title">
    <div className="consent-box">
      <h2 id="consent-title">{t('Your data, your choice')}</h2>
      <p className="dim">{t('Before you go on: Série keeps your training, and, if you allow it, the assessments your PT records. Your gym and your PT only see what concerns them.')}</p>
      <ConsentChecks terms={terms} setTerms={setTerms} health={health} setHealth={setHealth} id="gate" />
      {err && <div className="small consent-err" role="alert">{err}</div>}
      <Button variant="primary" disabled={busy} onClick={go}>{t('Continue')}</Button>
    </div>
  </div>
}
