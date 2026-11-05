// The membership card the gym issued (api/members.js): a normal card shape with the gym, the
// member's name and number, the status and the QR the desk scans, plus the member's own
// Check-in / Check-out. The QR text comes from the server each time; nothing is stored here.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import Icon from '../components/Icon.jsx'
import QrCanvas from '../components/QrCanvas.jsx'
import { Button } from '../components/ui.jsx'

const timeOf = iso => new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
const initials = name => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')

export default function MemberCard() {
  const nav = useNavigate()
  const toast = useUI(s => s.toast)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => api('/api/card').then(setData).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])

  const go = async dir => {
    setBusy(true)
    try {
      const r = await api('/api/checkin', { method: 'POST', body: JSON.stringify({ dir }) })
      toast(r.dir === 'in' ? t('Checked in at {0}', timeOf(r.at)) : t('Checked out at {0}', timeOf(r.at)))
      load()
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  const card = data && data.card
  const active = card && card.status === 'active'
  return <div className="narrow mc">
    <div className="hdr">
      <button className="iconbtn" onClick={() => nav('/home')} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
      <div className="grow"><h1>{t('Membership card')}</h1></div>
    </div>
    {err && <div className="card small dim" role="alert">{err}</div>}
    {!data && !err && <div className="card small dim" aria-live="polite">{t('Loading…')}</div>}
    {data && !card && <div className="card small dim">{t('Your gym has not issued you a card yet. Ask at the front desk.')}</div>}
    {card && <>
      <article className={'mc-card' + (active ? '' : ' mc-off')} aria-label={t('Membership card')}>
        <div className="mc-top">
          <span className="mc-gym">{card.gym}</span>
          <span className={'mc-status ' + (active ? 'on' : 'off')}>{active ? t('Active') : t('Suspended')}</span>
        </div>
        <div className="mc-body">
          <div className="mc-who">
            <span className="mc-ini" aria-hidden="true">{initials(card.name)}</span>
            <div>
              <div className="mc-name">{card.name}</div>
              <div className="mc-role">{card.role === 'trainer' ? t('Personal trainer') : t('Member')}</div>
              <div className="mc-num tnum">{card.number}</div>
            </div>
          </div>
          <div className="mc-qr">{active ? <QrCanvas value={card.qr} size={132} /> : <span className="small">{t('Suspended')}</span>}</div>
        </div>
      </article>
      <p className="small dim mc-hint">{t('Show the QR at the front desk, or use the buttons when you arrive and leave.')}</p>

      <div className="card mc-visit" aria-live="polite">
        <div className="ttl">{data.inside ? t('In the gym since {0}', timeOf(data.inside)) : t('Not in the gym')}</div>
        <div className="row mc-acts">
          <Button variant="primary" disabled={busy || !active || !!data.inside} onClick={() => go('in')}>{t('Card check-in')}</Button>
          <Button variant="tinted" disabled={busy || !active || !data.inside} onClick={() => go('out')}>{t('Card check-out')}</Button>
        </div>
      </div>

      <div className="card small dim mc-wallet">
        {t('Apple Wallet and Google Wallet need the gym’s own developer account; until then, keep this screen on your phone’s home screen.')}
      </div>
    </>}
  </div>
}
