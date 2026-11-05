// A trainer's check-ins (api/trainer.js), as a gym's assessment sheet: the latest one in full with
// the change since the one before, the classifications beside BMI and body fat, and the earlier
// dates below to open. The trainer and the student read the same component.
import { useState } from 'react'
import { t } from '../lib/i18n.js'
import { fmtDate, fmtNum } from '../lib/format.js'
import { assessmentRows } from '../lib/body-comp.js'
import { MEASUREMENT_FIELDS } from '../lib/measurements.js'

const UNIT = { years: () => t('years'), level: () => t('level') }
const unitText = u => (UNIT[u] ? UNIT[u]() : u)

export default function AssessmentSheet({ list }) {
  const [open, setOpen] = useState(0)
  if (!list || !list.length) return <div className="small dim">{t('No assessments yet.')}</div>
  const a = list[open] || list[0]
  const prev = list[open + 1]
  const prevBy = prev ? Object.fromEntries(assessmentRows(prev).map(r => [r.key, r.v])) : {}
  const rows = assessmentRows(a).filter(r => r.v != null)
  const tape = MEASUREMENT_FIELDS.filter(f => f.key !== 'bodyFat' && a.values && a.values[f.key] > 0)

  return <div className="as-sheet">
    <div className="as-head">
      <div className="ttl">{t('Assessment of {0}', fmtDate(a.date))}</div>
      {a.from && <div className="small dim">{t('By {0}', a.from)}</div>}
    </div>
    {rows.length > 0 && <dl className="as-rows">
      {rows.map(r => {
        const before = prevBy[r.key]
        const delta = before != null && r.key !== 'age' && r.key !== 'height' && r.key !== 'hrMax' ? Math.round((r.v - before) * 10) / 10 : null
        return <div className="as-row" key={r.key}>
          <dt>{t(r.label)}</dt>
          <dd>
            <span className="tnum as-v">{fmtNum(r.v)} <span className="dim">{unitText(r.unit)}</span></span>
            {r.cls && <span className={'as-cls as-' + clsTone(r.cls)}>{t(r.cls)}</span>}
            {delta ? <span className="tnum small dim as-delta">{delta > 0 ? '+' : ''}{fmtNum(delta)}</span> : null}
          </dd>
        </div>
      })}
    </dl>}
    {tape.length > 0 && <>
      <div className="lbl2 as-sub">{t('Circumferences')}</div>
      <dl className="as-rows">
        {tape.map(f => <div className="as-row" key={f.key}><dt>{t(f.label)}</dt><dd><span className="tnum as-v">{fmtNum(a.values[f.key])} <span className="dim">cm</span></span></dd></div>)}
      </dl>
    </>}
    {a.note && <p className="small as-note">{a.note}</p>}
    {list.length > 1 && <div className="as-dates" role="group" aria-label={t('Earlier assessments')}>
      {list.map((x, i) => <button key={x.id} type="button" className={'chip' + (i === open ? ' on' : '')} aria-pressed={i === open} onClick={() => setOpen(i)}>{fmtDate(x.date)}</button>)}
    </div>}
  </div>
}

const clsTone = c => (/Normal|Fit|Athletic|Acceptable/.test(c) ? 'ok' : /Overweight|High$|Underweight|Essential/.test(c) ? 'warn' : 'bad')
