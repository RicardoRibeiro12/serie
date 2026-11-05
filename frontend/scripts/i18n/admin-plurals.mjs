#!/usr/bin/env node
// The admin screen's tn() keys: pt and fr text, real one/few/many forms in ru, uk and pl (#365),
// the English source everywhere else, and pt-BR overrides. Idempotent.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'locales')
// [one key, many key, pt one, pt many, fr one, fr many, ru, uk, pl]  (ru/uk/pl: [one, few, many])
const KEYS = [
  ['{0} user', '{0} users', '{0} utilizador', '{0} utilizadores', '{0} utilisateur', '{0} utilisateurs',
    ['{0} пользователь', '{0} пользователя', '{0} пользователей'], ['{0} користувач', '{0} користувачі', '{0} користувачів'], ['{0} użytkownik', '{0} użytkowników', '{0} użytkowników']],
  ['{0} active this week', '{0} active this week', '{0} ativo esta semana', '{0} ativos esta semana', '{0} actif cette semaine', '{0} actifs cette semaine',
    ['{0} активен на этой неделе', '{0} активны на этой неделе', '{0} активны на этой неделе'], ['{0} активний цього тижня', '{0} активні цього тижня', '{0} активних цього тижня'], ['{0} aktywny w tym tygodniu', '{0} aktywnych w tym tygodniu', '{0} aktywnych w tym tygodniu']],
  ['{0} event', '{0} events', '{0} evento', '{0} eventos', '{0} événement', '{0} événements',
    ['{0} событие', '{0} события', '{0} событий'], ['{0} подія', '{0} події', '{0} подій'], ['{0} zdarzenie', '{0} zdarzenia', '{0} zdarzeń']],
  ['kept for {0} day', 'kept for {0} days', 'guardados {0} dia', 'guardados {0} dias', 'conservés {0} jour', 'conservés {0} jours',
    ['хранятся {0} день', 'хранятся {0} дня', 'хранятся {0} дней'], ['зберігаються {0} день', 'зберігаються {0} дні', 'зберігаються {0} днів'], ['przechowywane {0} dzień', 'przechowywane {0} dni', 'przechowywane {0} dni']],
  ['{0} PR', '{0} PRs', '{0} recorde', '{0} recordes', '{0} record', '{0} records',
    ['{0} рекорд', '{0} рекорда', '{0} рекордов'], ['{0} рекорд', '{0} рекорди', '{0} рекордів'], ['{0} rekord', '{0} rekordy', '{0} rekordów']],
]
const BR = { 'guardados': 'mantidos', 'utilizador': 'usuário', 'utilizadores': 'usuários' }
const br = s => s.replace(/utilizadores|utilizador|guardados/g, m => BR[m])

for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const path = join(dir, f)
  const raw = readFileSync(path, 'utf8')
  const nl = raw.includes('\r\n') ? '\r\n' : '\n'
  let src = raw.replace(/\r\n/g, '\n')
  const { default: pack } = await import('file://' + path.replace(/\\/g, '/') + '?t=' + Date.now())
  const lang = f.replace(/\.js$/, '')
  const add = []
  const put = (k, v) => add.push(`  ${JSON.stringify(k)}: ${typeof v === 'string' ? JSON.stringify(v) : `{ one: ${JSON.stringify(v[0])}, few: ${JSON.stringify(v[1])}, many: ${JSON.stringify(v[2])} }`},`)
  for (const [one, many, pt1, ptN, fr1, frN, ru, uk, pl] of KEYS) {
    const have = k => Object.prototype.hasOwnProperty.call(pack, k)
    if (lang === 'pt-BR') {
      if (!src.includes('\n  ' + JSON.stringify(one) + ':')) put(one, br(pt1))
      if (one !== many && !src.includes('\n  ' + JSON.stringify(many) + ':')) put(many, br(ptN))
      continue
    }
    const forms = { ru, uk, pl }[lang]
    if (forms) {
      if (!have(one)) put(one, forms[0])
      if (one !== many && !have(many)) put(many, forms)
      else if (one === many && typeof pack[one] !== 'object') { src = src.replace(new RegExp('\\n  ' + JSON.stringify(one).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':[^\\n]*'), ''); put(one, forms) }
      continue
    }
    const [v1, vN] = lang === 'pt' ? [pt1, ptN] : lang === 'fr' ? [fr1, frN] : [one, many]
    if (!have(one)) put(one, v1)
    if (one !== many && !have(many)) put(many, vN)
  }
  if (!add.length) continue
  if (lang === 'pt-BR') {
    const head = 'export const PT_BR_OVERRIDES = {\n'
    src = src.replace(head, head + add.join('\n') + '\n')
  } else {
    const end = src.lastIndexOf('}')
    src = src.slice(0, end).replace(/\n*$/, '\n') + add.join('\n') + '\n' + src.slice(end)
  }
  writeFileSync(path, src.replace(/\n/g, nl))
  console.log(f, '+' + add.length)
}
