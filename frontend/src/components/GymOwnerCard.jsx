// On Home, for the gym's owner: the work screens one tap away, so the front desk mode, the
// dashboard and the admin screen are not hidden in Settings.
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import Icon from './Icon.jsx'

export default function GymOwnerCard() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  if (!user?.admin) return null
  const items = [
    ['/rececao', 'qr', t('Front desk mode'), t('Read the members’ cards at the door')],
    ['/painel', 'chart', t('Dashboard'), t('Entries, members and trainers')],
    ['/admin', 'gear', t('Admin'), t('Invites, cards and accounts')]
  ]
  return <div className="card go-card">
    <div className="lbl2 go-head">{t('Your gym')}</div>
    <div className="go-grid">
      {items.map(([to, icon, title, sub]) => <button key={to} type="button" className="go-item" onClick={() => nav(to)}>
        <span className="lrow-i go-icon" aria-hidden="true"><Icon name={icon} /></span>
        <span className="go-copy"><span className="go-title">{title}</span><span className="small dim">{sub}</span></span>
      </button>)}
    </div>
  </div>
}
