#!/usr/bin/env node
// Adds a batch of this fork's strings to every locale pack: Portuguese and French get their own
// text, every other pack the English source (as check-locales expects every key everywhere);
// pt-BR gets an explicit override so nothing pt-PT-only is inherited unreviewed. Keys a pack
// already has are left alone, whichever quotes it uses.
//
//   node scripts/i18n/add-strings.mjs scripts/i18n/admin-strings.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'locales')
const batch = JSON.parse(readFileSync(process.argv[2], 'utf8'))   // { key: [pt, fr] }

for (const f of readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const path = join(dir, f)
  const raw = readFileSync(path, 'utf8')
  const nl = raw.includes('\r\n') ? '\r\n' : '\n'
  let src = raw.replace(/\r\n/g, '\n')
  const { default: pack } = await import('file://' + path.replace(/\\/g, '/') + '?t=' + Date.now())
  const lang = f.replace(/\.js$/, '')
  const add = []
  for (const [key, [pt, fr]] of Object.entries(batch)) {
    if (lang === 'pt-BR') {
      if (src.includes('\n  ' + JSON.stringify(key) + ':')) continue
      add.push(`  ${JSON.stringify(key)}: ${JSON.stringify(pt)},`)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(pack, key)) continue
    const value = lang === 'pt' ? pt : lang === 'fr' ? fr : key
    add.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
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
