// The membership card the gym issued (api/members.js): a bank-card shape with the gym's name, the
// member, their number and status, and the QR the front desk scans at the way in and the way out.
// Entries and exits are the desk's: whoever is still in at the end of the day is checked out then.
// Tapping the QR shows it large on white, which is what a desk scanner reads best.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import Icon from '../components/Icon.jsx'
import QrCanvas from '../components/QrCanvas.jsx'

const timeOf = iso => new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

export default function MemberCard() {
  const nav = useNavigate()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [big, setBig] = useState(false)

  useEffect(() => { api('/api/card').then(setData).catch(e => setErr(e.message)) }, [])
  useEffect(() => {
    if (!big) return
    const close = e => { if (e.key === 'Escape') setBig(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [big])

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
        <header className="mc-head">
          <div className="mc-gym">{card.gym}</div>
          <div className="mc-kind">{t('Membership card')}</div>
        </header>
        <div className="mc-who">
          <div className="mc-name">{card.name}</div>
          <div className="mc-meta">
            <span className="mc-num">{card.number}</span>
            <span className={'mc-status ' + (active ? 'on' : 'off')}><span className="mc-dot" aria-hidden="true" />{active ? t('Active') : t('Suspended')}</span>
          </div>
        </div>
        <button type="button" className="mc-qr" disabled={!active} onClick={() => setBig(true)} aria-label={t('Show the QR larger')}>
          {active ? <QrCanvas value={card.qr} size={104} /> : <Icon name="lock" />}
        </button>
        <div className="mc-brand" aria-hidden="true"><span className="mc-mark" />Série</div>
      </article>

      <div className="mc-state" aria-live="polite">
        {data.inside ? t('In the gym since {0}', timeOf(data.inside)) : t('Not in the gym')}
      </div>
      <p className="mc-hint">{t('Show the QR at the front desk when you arrive and when you leave. If you forget on the way out, you are checked out at the end of the day.')}</p>
      <p className="mc-hint mc-wallet">{t('Apple Wallet and Google Wallet need the gym’s own developer account; until then, keep this screen on your phone’s home screen.')}</p>
    </>}

    {big && card && <div className="mc-big" role="dialog" aria-modal="true" aria-label={t('QR for the front desk')} onClick={() => setBig(false)}>
      <div className="mc-big-in">
        <QrCanvas value={card.qr} size={264} />
        <div className="mc-big-name">{card.name}</div>
        <div className="mc-big-num">{card.number} · {card.gym}</div>
        <button type="button" className="mc-big-close" onClick={() => setBig(false)}>{t('Close')}</button>
      </div>
    </div>}
  </div>
}
