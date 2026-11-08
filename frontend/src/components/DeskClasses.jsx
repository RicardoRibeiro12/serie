// Front desk mode (views/Rececao.jsx): today's classes, for a PT who comes to the desk computer to see
// how many booked and who. Read-only, so the reader keeps working underneath; it refreshes itself.
import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { endTime } from '../lib/classes.js'
import { todayISO } from '../lib/format.js'
import Icon from './Icon.jsx'

export default function DeskClasses({ onClose }) {
  const [sessions, setSessions] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    let live = true
    const load = () => api('/api/classes?days=1')
      .then(r => { if (live) { setSessions((r.sessions || []).filter(s => s.date === todayISO())); setErr(null) } })
      .catch(e => { if (live) setErr(e.message) })
    load()
    const iv = setInterval(load, 30000)
    return () => { live = false; clearInterval(iv) }
  }, [])
  return <aside className="rc-classes" aria-label={t('Today’s classes')}>
    <div className="rc-classes-head">
      <h2>{t('Today’s classes')}</h2>
      <button type="button" className="rc-btn" onClick={onClose} aria-label={t('Close')}><Icon name="xmark" /></button>
    </div>
    {err && <p className="rc-classes-dim" role="alert">{err}</p>}
    {sessions && !sessions.length && <p className="rc-classes-dim">{t('No more classes today.')}</p>}
    <ol className="rc-classes-list">
      {(sessions || []).map(s => <li key={s.id} className={'rc-class' + (s.skipped ? ' off' : '') + (s.started ? ' now' : '')}>
        <div className="rc-class-top">
          <span className="rc-class-time">{s.starts}–{endTime(s.starts, s.minutes)}</span>
          <span className="rc-class-count" aria-label={t('{0} of {1} places taken', s.booked, s.capacity)}><b>{s.booked}</b>/{s.capacity}</span>
        </div>
        <div className="rc-class-name">{s.name}{s.skipped && <span className="rc-class-tag">{t('Called off')}</span>}{s.started && !s.skipped && <span className="rc-class-tag now">{t('On now')}</span>}</div>
        <div className="rc-classes-dim">{[s.trainer && t('With {0}', s.trainer), s.room].filter(Boolean).join(' · ')}</div>
        {Array.isArray(s.roster) && (s.roster.length
          ? <ol className="rc-class-roster">{s.roster.map((n, i) => <li key={i}>{n}</li>)}</ol>
          : <div className="rc-classes-dim">{tn('{0} person booked', '{0} booked', 0)}</div>)}
      </li>)}
    </ol>
  </aside>
}
