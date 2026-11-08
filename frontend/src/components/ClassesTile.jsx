// On Home (Série): the way to the group classes (views/Aulas.jsx), with the next one booked.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { fmtDate, todayISO } from '../lib/format.js'
import Icon from './Icon.jsx'

export default function ClassesTile() {
  const nav = useNavigate()
  const user = useStore(s => s.user)
  const on = useStore(s => !!s.config?.classes)
  const inGym = !!user && (user.admin || user.trainer || !user.desk)
  const [mine, setMine] = useState(null)
  useEffect(() => {
    if (!on || !inGym) return
    let live = true
    api('/api/classes/mine').then(r => { if (live) setMine(r.mine || []) }).catch(() => { if (live) setMine([]) })
    return () => { live = false }
  }, [on, inGym, user?.id])
  if (!on || !inGym || mine === null) return null
  const next = mine.find(c => !c.skipped) || mine[0]
  const when = next ? (next.date === todayISO() ? t('Today') : fmtDate(next.date, true)) + ' · ' + next.starts : ''
  return <button type="button" className="card lrow mc-tile" onClick={() => nav('/aulas')}>
    <span className="lrow-i" style={{ background: 'var(--indigo, #5856d6)', color: '#fff' }} aria-hidden="true"><Icon name="calendar" /></span>
    <span className="grow mc-tile-copy">
      <span className="ttl">{t('Classes')}</span>
      <span className="small dim">{next ? (next.skipped ? t('{0} was called off', next.name) : (next.trainer ? t('Next: {0} with {1}, {2}', next.name, next.trainer, when) : t('Next: {0}, {1}', next.name, when))) : t('See the timetable and book a place')}</span>
    </span>
    <Icon name="chevronRight" className="dim" />
  </button>
}
