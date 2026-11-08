// The gym owner's dashboard (/painel): a desktop page of its own, outside the app's tab bar, for
// the computer at the front desk or the office. Who is in now, how many came and when (entries
// per day, a weekday × hour heat map), who has stopped coming, how each PT's students are doing,
// every member with their card, and the desk itself. It reads the same admin routes as the app's
// Admin screen (api/members.js locally, lib/supa-api.js on Supabase), so it works on both.
//
// Ideas from SparkyFitness's reports (its workout heat map), none of its code: its licence is
// non-commercial only.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { t, tn } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import Icon from '../components/Icon.jsx'
import '../painel.css'

const DAY = 86400000
const AWAY_DAYS = 14
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6)   // 06:00 to 22:00
const hm = iso => new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
const dm = ms => new Date(ms).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })
const ms = v => { const n = typeof v === 'number' ? v : Date.parse(v); return Number.isFinite(n) ? n : 0 }
// Mon..Sun, three letters: some locales' 'short' weekday is the whole word (pt: segunda-feira → segunda).
const weekdayNames = () => Array.from({ length: 7 }, (_, i) => { const w = new Date(2026, 10, 2 + i).toLocaleDateString(dateLocale(), { weekday: 'short' }).replace(/\.$/, ''); return (w.charAt(0).toUpperCase() + w.slice(1)).slice(0, 3) })

export default function Painel() {
  const nav = useNavigate()
  const me = useStore(s => s.user)
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'name', dir: 1 })
  const [desk, setDesk] = useState('')
  const [deskOut, setDeskOut] = useState(null)
  const [tip, setTip] = useState(null)
  // Group classes (supabase/classes.sql): who booked and did not come, to have a word with them.
  const classesOn = useStore(s => !!s.config?.classes)
  const [noShows, setNoShows] = useState(null)

  const load = () => Promise.all([
    api('/api/admin/visits?days=90'), api('/api/admin/cards'), api('/api/admin/users').catch(() => ({ users: [] }))
  ]).then(([v, c, u]) => { setData({ report: v, members: c.members || [], users: u.users || [], gym: v.gym || c.gym || '' }); setErr('') })
    .catch(e => setErr(e.message))
  useEffect(() => {
    if (!me?.admin || !classesOn) return
    api('/api/admin/classes/no-shows?days=30').then(r => setNoShows(r.people || [])).catch(() => setNoShows(null))
  }, [me?.admin, classesOn])
  useEffect(() => {
    if (!me?.admin) return
    load()
    const iv = setInterval(() => { if (!document.hidden) load() }, 60000)
    return () => clearInterval(iv)
  }, [me?.admin])

  const view = useMemo(() => data && summarise(data, days), [data, days])

  if (!me?.admin) return <div className="pn"><div className="pn-gate"><h1>{t('Dashboard')}</h1><p>{t('Only the gym’s owner sees this page.')}</p></div></div>

  const scan = async e => {
    e.preventDefault()
    if (!desk.trim()) return
    try {
      const r = await api('/api/admin/scan', { method: 'POST', body: JSON.stringify({ qr: desk.trim() }) })
      setDeskOut({ ok: true, text: r.dir === 'in' ? t('{0} checked in at {1}', r.name, hm(r.at)) : t('{0} checked out at {1}', r.name, hm(r.at)) })
      setDesk(''); load()
    } catch (e2) { setDeskOut({ ok: false, text: e2.message }) }
  }
  const cardAct = (userId, action) => api('/api/admin/cards', { method: 'POST', body: JSON.stringify({ userId, action }) }).then(load).catch(e => setErr(e.message))
  const csv = () => {
    const rows = [[t('Member'), t('Date'), t('Entry'), t('Exit'), t('Duration')]].concat(view.visits.map(v => [v.name || '', v.in.slice(0, 10), hm(v.in), v.out ? hm(v.out) : '', v.out ? Math.round((ms(v.out) - ms(v.in)) / 60000) : '']))
    const text = rows.map(r => r.map(c => { c = String(c); return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c }).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
    a.download = 'entradas-' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const showTip = (e, text) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.left + r.width / 2, y: r.top, text }) }
  const hideTip = () => setTip(null)

  return <div className="pn">
    <header className="pn-bar">
      <div className="pn-title">
        <span className="pn-mark" aria-hidden="true" />
        <div><h1>{t('Dashboard')}</h1><div className="pn-gym">{data ? data.gym : ' '}</div></div>
      </div>
      <div className="pn-tools">
        <div className="pn-seg" role="group" aria-label={t('Period')}>
          {[7, 30, 90].map(d => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{tn('{0} day', '{0} days', d)}</button>)}
        </div>
        <button type="button" className="pn-btn" onClick={load}><Icon name="reset" /> {t('Refresh')}</button>
        <button type="button" className="pn-btn" onClick={() => nav('/rececao')}>{t('Front desk mode')}</button>
        <button type="button" className="pn-btn ghost" onClick={() => nav('/admin')}>{t('Back to the app')}</button>
      </div>
    </header>

    {err && <div className="pn-err" role="alert">{err}</div>}
    {!view && !err && <div className="pn-loading" aria-live="polite">{t('Loading…')}</div>}

    {view && <main className="pn-main">
      <section className="pn-kpis" aria-label={t('Summary')}>
        <Kpi label={t('In the gym now')} value={view.present.length} note={view.present.length ? view.present.slice(0, 3).map(p => p.name).join(', ') + (view.present.length > 3 ? '…' : '') : t('Nobody right now.')} live />
        <Kpi label={t('Entries')} value={view.entries} delta={view.prevEntries != null ? view.entries - view.prevEntries : null} note={view.prevEntries != null ? t('{0} in the {1} days before', view.prevEntries, days) : tn('last {0} day', 'last {0} days', days)} />
        <Kpi label={t('Members who came')} value={view.came} note={t('of {0} with a card', view.withCard)} />
        <Kpi label={t('Average stay')} value={view.avgMin != null ? view.avgMin : '–'} unit={view.avgMin != null ? 'min' : ''} note={t('closed visits only')} />
      </section>

      <section className="pn-row pn-charts">
        <div className="pn-panel pn-wide">
          <div className="pn-head"><h2>{t('Entries per day')}</h2><span className="pn-sub">{tn('last {0} day', 'last {0} days', days)}</span></div>
          <div className="pn-bars" role="img" aria-label={t('Entries per day') + ': ' + view.perDay.map(p => dm(p.d) + ' ' + p.n).join(', ')}>
            {view.perDay.map((p, i) => <div key={p.d} className="pn-bcol" onMouseEnter={e => showTip(e, dm(p.d) + ' · ' + tn('{0} entry', '{0} entries', p.n))} onMouseLeave={hideTip}>
              <span className="pn-bfill" style={{ height: (p.n / view.maxDay * 100) + '%' }} />
              <span className="pn-bx">{labelEvery(view.perDay.length, i) ? new Date(p.d).getDate() : ''}</span>
            </div>)}
          </div>
        </div>
        <div className="pn-panel">
          <div className="pn-head"><h2>{t('Busiest times')}</h2><span className="pn-sub">{t('entries by weekday and hour')}</span></div>
          <div className="pn-heat" role="table" aria-label={t('Busiest times')}>
            <div role="row" className="pn-hrow pn-hhead"><span />{HOURS.map(h => <span key={h} role="columnheader">{h % 3 === 0 ? h : ''}</span>)}</div>
            {weekdayNames().map((w, d) => <div role="row" className="pn-hrow" key={w}>
              <span role="rowheader" className="pn-hday">{w}</span>
              {HOURS.map(h => { const n = view.heat[d][h] || 0; return <span role="cell" key={h} className="pn-cell" aria-label={w + ' ' + h + ':00, ' + n}
                style={{ '--v': n / view.maxHeat }} data-zero={n ? undefined : ''}
                onMouseEnter={e => showTip(e, w + ' ' + String(h).padStart(2, '0') + ':00 · ' + tn('{0} entry', '{0} entries', n))} onMouseLeave={hideTip} /> })}
            </div>)}
            <div className="pn-scale" aria-hidden="true"><span>{t('fewer')}</span><i /><span>{t('more')}</span></div>
          </div>
        </div>
      </section>

      <section className="pn-row">
        <div className="pn-panel">
          <div className="pn-head"><h2>{t('Not seen for {0} days', AWAY_DAYS)}</h2><span className="pn-sub">{view.away.length}</span></div>
          {view.away.length ? <ul className="pn-list">
            {view.away.slice(0, 12).map(m => <li key={m.id}><span>{m.name}</span><span className="pn-dim">{m.last ? t('last {0}', dm(m.last)) : t('never came')}</span></li>)}
          </ul> : <p className="pn-dim">{t('Everyone with a card came in the last {0} days.', AWAY_DAYS)}</p>}
        </div>
        <div className="pn-panel">
          <div className="pn-head"><h2>{t('Personal trainers')}</h2><span className="pn-sub">{view.pts.length}</span></div>
          {view.pts.length ? <table className="pn-table compact">
            <thead><tr><th>{t('Trainer')}</th><th className="num">{t('Students')}</th><th className="num">{t('Came')}</th></tr></thead>
            <tbody>{view.pts.map(p => <tr key={p.id}><td>{p.name}</td><td className="num">{p.students}</td><td className="num">{p.came}</td></tr>)}</tbody>
          </table> : <p className="pn-dim">{t('No trainers in this gym yet.')}</p>}
        </div>
        <div className="pn-panel">
          <div className="pn-head"><h2>{t('Front desk')}</h2></div>
          <form className="pn-desk" onSubmit={scan}>
            <label htmlFor="pn-desk">{t('Member number or QR text')}</label>
            <div className="pn-inline"><input id="pn-desk" autoComplete="off" placeholder="S-000001" value={desk} onChange={e => setDesk(e.target.value)} /><button type="submit" className="pn-btn">{t('Check in or out')}</button></div>
            {deskOut && <div className={'pn-deskout ' + (deskOut.ok ? 'ok' : 'bad')} role="status">{deskOut.text}</div>}
          </form>
          <ul className="pn-list pn-present">{view.present.map(p => <li key={p.uid}><span>{p.name}</span><span className="pn-dim">{hm(p.in)}</span></li>)}</ul>
        </div>
      </section>

      {classesOn && <section className="pn-panel pn-noshow">
        <div className="pn-head"><h2>{t('Booked a class and did not come')}</h2><span className="pn-sub">{t('last {0} days, no entry at the front desk that day', 30)}</span>
          <button type="button" className="pn-btn pn-btn-ghost" onClick={() => nav('/aulas')}>{t('Classes')}</button></div>
        {noShows === null ? <p className="pn-dim">…</p> : noShows.length ? <table className="pn-table compact">
          <thead><tr><th>{t('Member')}</th><th className="num">{t('Missed')}</th><th className="num">{t('Showed up')}</th><th>{t('Last missed')}</th><th>{t('Classes')}</th></tr></thead>
          <tbody>{noShows.map(p => <tr key={p.id}><td>{p.name}</td><td className="num">{p.misses}</td><td className="num">{p.kept}</td><td>{p.last ? dm(Date.parse(p.last + 'T12:00:00')) : ''}</td><td className="pn-dim">{(p.classes || []).join(', ')}</td></tr>)}</tbody>
        </table> : <p className="pn-dim">{t('Everyone who booked a class came.')}</p>}
      </section>}

      <section className="pn-panel">
        <div className="pn-head pn-tablehead">
          <h2>{t('Members')}</h2>
          <div className="pn-filters">
            {[['all', t('All')], ['inside', t('In the gym')], ['away', t('Not seen lately')], ['nocard', t('No card')]].map(([k, l]) =>
              <button key={k} type="button" className="pn-chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
            <input type="search" className="pn-search" placeholder={t('Search by name')} aria-label={t('Search by name')} value={q} onChange={e => setQ(e.target.value)} />
            <button type="button" className="pn-btn ghost" onClick={csv}>{t('Export entries (CSV)')}</button>
          </div>
        </div>
        <div className="pn-scroll">
          <table className="pn-table">
            <thead><tr>
              {[['name', t('Member')], ['role', t('Role')], ['pt', t('Trainer')], ['card', t('Card')], ['visits', t('Visits')], ['last', t('Last visit')], ['workouts', t('Workouts logged')]].map(([k, l]) =>
                <th key={k} className={['visits', 'workouts'].includes(k) ? 'num' : ''} aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => setSort(s => ({ key: k, dir: s.key === k ? -s.dir : 1 }))}>{l}{sort.key === k ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</button>
                </th>)}
              <th><span className="sr">{t('Actions')}</span></th>
            </tr></thead>
            <tbody>{rowsOf(view.rows, { q, filter, sort }).map(m => <tr key={m.id}>
              <td>{m.name}{m.inside && <span className="pn-pill on">{t('in the gym')}</span>}</td>
              <td>{m.owner ? t('Owner') : m.trainer ? t('Trainer') : m.desk ? t('Front desk') : t('Member')}</td>
              <td className="pn-dim">{m.ptName || '–'}</td>
              <td>{m.card ? <><span className="num">{m.card.number}</span> <span className={'pn-pill ' + (m.card.status === 'active' ? 'ok' : 'bad')}>{m.card.status === 'active' ? t('Active') : t('Suspended')}</span></> : <span className="pn-dim">{t('No card')}</span>}</td>
              <td className="num">{m.visits}</td>
              <td className="pn-dim">{m.last ? dm(m.last) : '–'}</td>
              <td className="num">{m.workouts ?? '–'}</td>
              <td className="pn-acts">
                {!m.card && <button type="button" className="pn-btn sm" onClick={() => cardAct(m.id, 'issue')}>{t('Issue card')}</button>}
                {m.card && m.card.status === 'active' && <button type="button" className="pn-btn sm ghost" onClick={() => cardAct(m.id, 'suspend')}>{t('Suspend')}</button>}
                {m.card && m.card.status !== 'active' && <button type="button" className="pn-btn sm" onClick={() => cardAct(m.id, 'activate')}>{t('Reactivate')}</button>}
              </td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>}

    {tip && <div className="pn-tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
  </div>
}

function Kpi({ label, value, unit, delta, note, live }) {
  return <div className="pn-kpi">
    <div className="pn-klabel">{live && <span className="pn-live" aria-hidden="true" />}{label}</div>
    <div className="pn-kvalue">{value}{unit && <span className="pn-kunit">{unit}</span>}
      {delta != null && delta !== 0 && <span className={'pn-delta ' + (delta > 0 ? 'up' : 'down')}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</span>}</div>
    {note && <div className="pn-knote">{note}</div>}
  </div>
}

const labelEvery = (n, i) => n <= 14 || i % Math.ceil(n / 12) === 0

// Everything the page shows, worked out once from the three answers.
export function summarise({ report, members, users }, days, now = Date.now()) {
  const all = (report.visits || []).map(v => ({ ...v, t: ms(v.in) }))
  const since = now - days * DAY
  const visits = all.filter(v => v.t >= since)
  const prev = days <= 45 ? all.filter(v => v.t >= since - days * DAY && v.t < since).length : null
  const perDay = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY); d.setHours(12, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    perDay.push({ d: d.getTime(), key, n: 0 })
  }
  const dayIdx = Object.fromEntries(perDay.map((p, i) => [new Date(p.d).toDateString(), i]))
  const heat = Array.from({ length: 7 }, () => ({}))
  for (const v of visits) {
    const d = new Date(v.t)
    const i = dayIdx[d.toDateString()]
    if (i != null) perDay[i].n++
    const wd = (d.getDay() + 6) % 7
    heat[wd][d.getHours()] = (heat[wd][d.getHours()] || 0) + 1
  }
  const lastOf = {}, countOf = {}
  for (const v of all) lastOf[v.uid] = Math.max(lastOf[v.uid] || 0, v.t)
  for (const v of visits) countOf[v.uid] = (countOf[v.uid] || 0) + 1
  const userById = Object.fromEntries(users.map(u => [u.id, u]))
  const rows = members.map(m => {
    const u = userById[m.id] || {}
    return { id: m.id, name: m.name, card: m.card, inside: !!m.inside, owner: !!u.owner, trainer: !!u.trainer, desk: !!u.desk, trainerId: u.trainerId || null,
      ptName: u.trainerId && userById[u.trainerId] ? userById[u.trainerId].name : '', visits: countOf[m.id] || 0, last: lastOf[m.id] || 0, workouts: u.workouts ?? null }
  })
  const withCard = rows.filter(r => r.card && r.card.status === 'active')
  const awayCut = now - AWAY_DAYS * DAY
  const pts = rows.filter(r => r.trainer).map(p => {
    const students = rows.filter(r => r.trainerId === p.id)
    return { id: p.id, name: p.name, students: students.length, came: students.filter(s => countOf[s.id]).length }
  })
  const closed = visits.filter(v => v.out && !v.auto).map(v => (ms(v.out) - v.t) / 60000)
  return {
    visits, perDay, heat, rows, pts,
    present: report.present || [],
    entries: visits.length, prevEntries: prev,
    came: new Set(visits.map(v => v.uid)).size, withCard: withCard.length,
    avgMin: closed.length ? Math.round(closed.reduce((a, b) => a + b, 0) / closed.length) : null,
    away: withCard.filter(r => !r.last || r.last < awayCut).sort((a, b) => (a.last || 0) - (b.last || 0)),
    maxDay: Math.max(1, ...perDay.map(p => p.n)),
    maxHeat: Math.max(1, ...heat.flatMap(h => Object.values(h)))
  }
}

function rowsOf(rows, { q, filter, sort }) {
  const needle = q.trim().toLowerCase()
  const awayCut = Date.now() - AWAY_DAYS * DAY
  const pick = rows.filter(r => (!needle || r.name.toLowerCase().includes(needle)) &&
    (filter === 'all' || (filter === 'inside' && r.inside) || (filter === 'nocard' && !r.card) || (filter === 'away' && r.card && (!r.last || r.last < awayCut))))
  const val = r => sort.key === 'role' ? (r.owner ? 0 : r.trainer ? 1 : 2) : sort.key === 'pt' ? r.ptName : sort.key === 'card' ? (r.card ? r.card.number : '~') : sort.key === 'visits' ? r.visits : sort.key === 'last' ? r.last : sort.key === 'workouts' ? (r.workouts ?? -1) : r.name.toLowerCase()
  return pick.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir })
}
