// The languages this fork offers (lib/i18n-core.js OFFERED_LANGS), as flag buttons. A flag
// stands for a country, not a language, so each one carries the language's own name too. The
// flags come from one SVG sprite (public/flags.svg), shared with the public site.
import { useStore } from '../store/useStore.js'
import { offeredLang } from '../lib/i18n.js'
import { effectiveLang } from '../lib/default-lang.js'
import './lang-flags.css'

const LANGS = [
  { code: 'pt', flag: 'flag-pt', label: 'Português' },
  { code: 'en', flag: 'flag-gb', label: 'English' },
  { code: 'fr', flag: 'flag-fr', label: 'Français' }
]

export default function LangFlags({ className = '' }) {
  const S = useStore(s => s.S)
  const config = useStore(s => s.config)
  const update = useStore(s => s.update)
  const current = offeredLang(effectiveLang(S, config))
  return <div className={'lang-flags ' + className} role="group" aria-label="Idioma / Language">
    {LANGS.map(l => <button key={l.code} type="button" lang={l.code} className={'lang-flag' + (current === l.code ? ' on' : '')}
      aria-pressed={current === l.code} onClick={() => update(s => { s.lang = l.code; s.langAuto = false })}>
      <svg aria-hidden="true" viewBox="0 0 30 20" width="24" height="16"><use href={'flags.svg#' + l.flag} /></svg>
      <span>{l.label}</span>
    </button>)}
  </div>
}
