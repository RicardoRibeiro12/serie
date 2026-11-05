// Front desk mode (/rececao): a full-screen page for the computer or tablet at the gym's door,
// made for a QR reader that types like a keyboard (USB or Bluetooth "keyboard wedge" scanners
// write the code and press Enter). The input keeps the focus whatever happens on the page, every
// read checks the member in or out (api/members.js or supabase/app.sql desk_scan), and the answer
// fills the screen for a few seconds in green or red, with a sound, so the desk sees it from afar.
// A tablet without a reader can use its camera instead.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { api } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { dateLocale } from '../lib/i18n-core.js'
import CameraScan from '../components/CameraScan.jsx'
import Icon from '../components/Icon.jsx'
import '../rececao.css'

const SHOW_MS = 3500
const hm = iso => new Date(iso).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

// Short tones from the Web Audio API: rising for in, falling for out, low for a refusal.
let audio = null
function tone(kind) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)()
    const notes = kind === 'in' ? [660, 880] : kind === 'out' ? [880, 660] : [220, 220]
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain()
      o.type = kind === 'bad' ? 'square' : 'sine'
      o.frequency.value = f
      const t0 = audio.currentTime + i * 0.14
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13)
      o.connect(g).connect(audio.destination)
      o.start(t0); o.stop(t0 + 0.14)
    })
  } catch { /* no sound on this device */ }
}

export default function Rececao() {
  const nav = useNavigate()
  const me = useStore(s => s.user)
  const [value, setValue] = useState('')
  const [result, setResult] = useState(null)      // { kind: 'in' | 'out' | 'bad', title, sub }
  const [present, setPresent] = useState(null)
  const [gym, setGym] = useState('')
  const [sound, setSound] = useState(true)
  const input = useRef(null)
  const timer = useRef(null)
  const busy = useRef(false)

  const allowed = !!(me?.admin || me?.desk)
  const refresh = () => api('/api/desk/status').then(r => { setPresent(r.present); setGym(r.gym || '') }).catch(() => {})
  useEffect(() => { if (allowed) refresh(); const iv = setInterval(refresh, 30000); return () => clearInterval(iv) }, [allowed])

  // The reader types into whatever has the focus: keep it on the input, always.
  useEffect(() => {
    const focus = () => { if (input.current && document.activeElement !== input.current) input.current.focus({ preventScroll: true }) }
    focus()
    const iv = setInterval(focus, 1000)
    window.addEventListener('click', focus)
    window.addEventListener('focus', focus)
    return () => { clearInterval(iv); window.removeEventListener('click', focus); window.removeEventListener('focus', focus) }
  }, [])

  const show = r => {
    setResult(r)
    if (sound) tone(r.kind)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setResult(null), SHOW_MS)
  }

  const read = async text => {
    const code = String(text || '').trim()
    if (!code || busy.current) return
    busy.current = true
    try {
      const r = await api('/api/admin/scan', { method: 'POST', body: JSON.stringify({ qr: code }) })
      show({ kind: r.dir === 'in' ? 'in' : 'out', title: r.dir === 'in' ? t('Welcome, {0}', r.name) : t('See you soon, {0}', r.name), sub: (r.dir === 'in' ? t('Entry') : t('Exit')) + ' · ' + hm(r.at) + (r.number ? ' · ' + r.number : '') })
      refresh()
    } catch (e) {
      const msg = String(e.message || '')
      show({ kind: 'bad', title: /suspend/i.test(msg) ? t('Card suspended') : /unknown/i.test(msg) ? t('Card not recognised') : t('Could not read the card'), sub: /suspend/i.test(msg) ? t('Send them to the front desk.') : /unknown/i.test(msg) ? t('This card is not from this gym, or it has a new QR.') : msg })
    } finally { busy.current = false; setValue('') }
  }

  const camera = () => useUI.getState().openSheet(close => <CameraScan onCancel={close} onFound={c => { close(); read(c.value) }} />)

  // The gym's owner, or its front desk account (supabase/app.sql 'desk'), which sees only this page.
  if (!allowed) return <div className="rc rc-gate"><h1>{t('Front desk mode')}</h1><p>{t('Only the gym’s owner or front desk sees this page.')}</p></div>

  return <div className={'rc' + (result ? ' rc-' + result.kind : '')}>
    <header className="rc-bar">
      <div className="rc-gym"><span className="rc-mark" aria-hidden="true" />{gym || t('Front desk')}</div>
      <div className="rc-tools">
        <button type="button" className="rc-btn" onClick={() => setSound(s => !s)} aria-pressed={sound}>{sound ? t('Sound on') : t('Sound off')}</button>
        <button type="button" className="rc-btn" onClick={camera}><Icon name="qr" /> {t('Use the camera')}</button>
        {me.admin && <button type="button" className="rc-btn" onClick={() => nav('/painel')}>{t('Dashboard')}</button>}
        {!me.admin && <button type="button" className="rc-btn" onClick={() => useStore.getState().signOut()}>{t('Sign out')}</button>}
      </div>
    </header>

    <main className="rc-main" aria-live="assertive">
      {result
        ? <div className="rc-result">
          <div className="rc-icon" aria-hidden="true"><Icon name={result.kind === 'bad' ? 'xmark' : 'check'} /></div>
          <div className="rc-title">{result.title}</div>
          <div className="rc-sub">{result.sub}</div>
        </div>
        : <div className="rc-idle">
          <div className="rc-qr" aria-hidden="true"><Icon name="qr" /></div>
          <div className="rc-title">{t('Show your card’s QR')}</div>
          <div className="rc-sub">{t('On the way in and on the way out.')}</div>
        </div>}
    </main>

    <footer className="rc-foot">
      <div><span className="rc-count">{present ?? '–'}</span> {t('in the gym now')}</div>
      <form onSubmit={e => { e.preventDefault(); read(value) }} className="rc-form">
        <label htmlFor="rc-input" className="rc-label">{t('Reader or member number')}</label>
        <input id="rc-input" ref={input} className="rc-input" value={value} onChange={e => setValue(e.target.value)}
          autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} placeholder="S-000001" />
      </form>
    </footer>
  </div>
}
