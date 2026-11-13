#!/usr/bin/env node
// Série: the Portuguese packs name the app Série (feminine, so the article changes with it) where the
// strings inherited from openGym said openGym. Only the values change; the keys stay the English
// source. Idempotent. Run after adding strings that mention openGym.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'locales')
const PT = [
  [/\bO openGym\b/g, 'A Série'], [/\bo openGym\b/g, 'a Série'],
  [/\bDo openGym\b/g, 'Da Série'], [/\bdo openGym\b/g, 'da Série'],
  [/\bno openGym\b/g, 'na Série'], [/\bao openGym\b/g, 'à Série'], [/\bpelo openGym\b/g, 'pela Série'],
  [/\bum openGym\b/g, 'uma Série'], [/\bseu próprio openGym\b/g, 'sua própria Série'], [/\bteu próprio openGym\b/g, 'tua própria Série'],
  [/\bmeu openGym\b/g, 'minha Série'], [/\bteu openGym\b/g, 'tua Série'], [/\bseu openGym\b/g, 'sua Série'],
  [/openGym/g, 'Série']
]
const LINE = /^(  (?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"): )(.*)$/
for (const f of ['pt.js', 'pt-BR.js']) {
  const path = join(dir, f)
  const raw = readFileSync(path, 'utf8')
  const nl = raw.includes('\r\n') ? '\r\n' : '\n'
  let n = 0
  const out = raw.replace(/\r\n/g, '\n').split('\n').map(line => {
    const m = LINE.exec(line)
    if (!m || !m[2].includes('openGym')) return line
    let v = m[2]
    for (const [re, to] of PT) v = v.replace(re, to)
    n++
    return m[1] + v
  }).join('\n')
  writeFileSync(path, out.replace(/\n/g, nl))
  console.log(f, n)
}
