// On Home: the way to the membership card (views/MemberCard.jsx), once the gym has issued one.
// Says whether the member is in the gym now, so leaving without checking out is noticed.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function MemberCardTile() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const [data, setData] = useState(null)
  useEffect(() => {
    if (!user) return
    let live = true
    api('/api/card').then(r => { if (live) setData(r) }).catch(() => {})
    return () => { live = false }
  }, [user?.id])
  if (!data || !data.card) return null
  return <button type="button" className="card lrow mc-tile" onClick={() => nav('/card')}>
    <span className="lrow-i" style={{ background: 'var(--acc)', color: 'var(--on-acc)' }} aria-hidden="true"><Icon name="qr" /></span>
    <span className="grow mc-tile-copy">
      <span className="ttl">{t('Membership card')}</span>
      <span className="small dim">{data.card.number} · {data.inside ? t('in the gym now') : t('show it at the front desk')}</span>
    </span>
    <Icon name="chevronRight" className="dim" />
  </button>
}
