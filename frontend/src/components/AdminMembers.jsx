// In the admin screen: the gym's front desk and its members (api/members.js). Scan a card (camera
// or the member number typed in) to check someone in or out; see who is in now and the entries of
// the last two weeks; issue, reissue, suspend or reactivate cards. The full dashboard, for a desk
// computer, is painel/ beside the app (frontend/public/painel).
import { useEffect, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import CameraScan from './CameraScan.jsx'
import { Button } from './ui.jsx'

const timeOf = iso => new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
const dayOf = d => new Date(d + 'T12:00:00').toLocaleDateString(dateLocale(), { day: 'numeric' })

export default function AdminMembers() {
    const [members, setMembers] = useState(null)
  const [report, setReport] = useState(null)
  const [num, setNum] = useState('')
  const [last, setLast] = useState(null)
  const [err, setErr] = useState('')

  const load = () => {
    // An answer without a list, or a failure, shows as an empty list with the reason: never an
    // endless "Loading…".
    api('/api/admin/cards').then(r => { setMembers(Array.isArray(r && r.members) ? r.members : []); setErr(Array.isArray(r && r.members) ? '' : t('Could not load')) })
      .catch(e => { setMembers([]); setErr(e.message) })
    api('/api/admin/visits?days=14').then(setReport).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const scan = async qr => {
    try {
      const r = await api('/api/admin/scan', { method: 'POST', body: JSON.stringify({ qr }) })
      setLast({ ok: true, ...r })
      setNum('')
      load()
    } catch (e) { setLast({ ok: false, error: e.message }) }
  }
  const camera = () => useUI.getState().openSheet(close => <CameraScan onCancel={close} onFound={code => { close(); scan(code.value) }} />)
  const act = (userId, action) => api('/api/admin/cards', { method: 'POST', body: JSON.stringify({ userId, action }) }).then(load).catch(e => useUI.getState().toast(e.message))

  const max = report ? Math.max(1, ...report.perDay.map(p => p.n)) : 1
  return <>
    <h2 className="sec-h">{t('Front desk')}</h2>
    <div className="card am-desk">
      <div className="row am-scan">
        <Button variant="primary" icon="qr" onClick={camera}>{t('Scan a card')}</Button>
        <form className="row am-num" onSubmit={e => { e.preventDefault(); if (num.trim()) scan(num.trim()) }}>
          <input className="input tnum" aria-label={t('Member number')} placeholder="S-000001" value={num} onChange={e => setNum(e.target.value)} />
          <Button type="submit" variant="tinted" disabled={!num.trim()}>{t('Check in or out')}</Button>
        </form>
      </div>
      {last && <div className={'am-last ' + (last.ok ? 'ok' : 'bad')} role="status">
        {last.ok ? (last.dir === 'in' ? t('{0} checked in at {1}', last.name, timeOf(last.at)) : t('{0} checked out at {1}', last.name, timeOf(last.at))) : last.error}
      </div>}
    </div>

    {report && <>
      <h2 className="sec-h">{t('Entries and exits')}</h2>
      <div className="card">
        <div className="row between am-sum">
          <div><div className="lbl2">{t('In the gym now')}</div><div className="am-big tnum">{report.present.length}</div></div>
          <div><div className="lbl2">{t('Members who came')}</div><div className="am-big tnum">{report.members}</div></div>
          <div><div className="lbl2">{t('Average stay')}</div><div className="am-big tnum">{report.avgMin != null ? t('{0} min', report.avgMin) : '–'}</div></div>
        </div>
        <div className="am-bars" role="img" aria-label={t('Entries per day, last {0} days', report.days)}>
          {report.perDay.map(p => <div key={p.d} className="am-bar" title={p.d + ': ' + p.n}>
            <span className="am-bar-n tnum">{p.n || ''}</span>
            <span className="am-bar-fill" style={{ height: (p.n / max * 100) + '%' }} />
            <span className="am-bar-d">{dayOf(p.d)}</span>
          </div>)}
        </div>
        {report.present.length > 0 && <div className="small am-present">{t('In now')}: {report.present.map(p => p.name + ' (' + timeOf(p.in) + ')').join(', ')}</div>}
        <ul className="am-visits">
          {report.visits.slice(0, 12).map(v => <li key={v.id} className="row between">
            <span>{v.name || '?'}</span>
            <span className="small dim tnum">{new Date(v.in).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} · {timeOf(v.in)} → {v.out ? timeOf(v.out) + (v.auto ? ' ' + t('(auto)') : '') : t('in the gym')}</span>
          </li>)}
        </ul>
      </div>
    </>}

    <h2 className="sec-h">{t('Members and cards')}</h2>
    <div className="card am-list">
      {!members && <div className="small dim">{t('Loading…')}</div>}
      {err && <div className="small dim" role="status">{err}</div>}
      {members && members.map(m => <div key={m.id} className="row between am-mem">
        <div className="grow">
          <div className="ttl">{m.name}{m.inside && <span className="small am-in"> · {t('in the gym')}</span>}</div>
          <div className="small dim tnum">{m.card ? m.card.number + ' · ' + (m.card.status === 'active' ? t('Active') : t('Suspended')) : t('No card')}</div>
        </div>
        <div className="tr-acts">
          {!m.card && <Button size="sm" variant="tinted" onClick={() => act(m.id, 'issue')}>{t('Issue card')}</Button>}
          {m.card && <Button size="sm" variant="ghost" className="dim" onClick={() => { if (window.confirm(t('Make a new QR for {0}? The old one stops working.', m.name))) act(m.id, 'issue') }}>{t('New QR')}</Button>}
          {m.card && m.card.status === 'active' && <Button size="sm" variant="ghost" className="dim" onClick={() => act(m.id, 'suspend')}>{t('Suspend')}</Button>}
          {m.card && m.card.status !== 'active' && <Button size="sm" variant="tinted" onClick={() => act(m.id, 'activate')}>{t('Reactivate')}</Button>}
        </div>
      </div>)}
      {members && <div className="small dim am-foot">{tn('{0} member', '{0} members', members.length)} · <a href="#/painel">{t('Open the full dashboard')}</a></div>}
    </div>
  </>
}
