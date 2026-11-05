#!/usr/bin/env node
// Hand-written pt-BR for the membership-card strings, where a word swap gets the gender wrong
// ("o ginásio" → "a academia"). Run after admin-pt-br.mjs. Idempotent.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'locales', 'pt-BR.js')
const BR = {
  'Apple Wallet and Google Wallet need the gym’s own developer account; until then, keep this screen on your phone’s home screen.': 'A Apple Wallet e a Google Wallet precisam de uma conta de desenvolvedor da academia; até lá, salve esta tela na tela inicial do celular.',
  'In now': 'Agora na academia',
  'In the gym now': 'Na academia agora',
  'In the gym since {0}': 'Na academia desde as {0}',
  'Not in the gym': 'Fora da academia',
  'in the gym': 'na academia',
  'in the gym now': 'na academia agora',
  'Your gym has not issued you a card yet. Ask at the front desk.': 'Sua academia ainda não criou um cartão para você. Peça na recepção.',
  'Show the QR at the front desk, or use the buttons when you arrive and leave.': 'Mostre o QR na recepção, ou use os botões quando chegar e sair.',
  'tap to check in': 'toque para dar entrada'
}
const raw = readFileSync(path, 'utf8')
const nl = raw.includes('\r\n') ? '\r\n' : '\n'
let n = 0
const out = raw.replace(/\r\n/g, '\n').split('\n').map(line => {
  const m = /^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/.exec(line)
  if (!m) return line
  const k = JSON.parse(m[1])
  if (!(k in BR) || JSON.parse(m[2]) === BR[k]) return line
  n++
  return `  ${m[1]}: ${JSON.stringify(BR[k])},`
}).join('\n')
writeFileSync(path, out.replace(/\n/g, nl))
console.log('pt-BR member strings fixed:', n)
