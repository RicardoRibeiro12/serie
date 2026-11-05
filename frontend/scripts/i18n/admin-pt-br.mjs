#!/usr/bin/env node
// pt-BR wording for the admin strings added with add-strings.mjs (which seeds pt-BR with the
// pt-PT text): Brazilian terms and “” quotes instead of the European ones. Idempotent.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const path = join(here, '..', '..', 'src', 'locales', 'pt-BR.js')
const files = process.argv.slice(2).length ? process.argv.slice(2) : [join(here, 'admin-strings.json')]
const keys = new Set(files.flatMap(f => Object.keys(JSON.parse(readFileSync(f, 'utf8')))))
const SWAPS = [
  [/«/g, '“'], [/»/g, '”'],
  [/\bRegisto\b/g, 'Registro'], [/\bregisto\b/g, 'registro'],
  [/\bregistados\b/g, 'registrados'], [/\bregistadas\b/g, 'registradas'],
  [/\bregistado\b/g, 'registrado'], [/\bregistada\b/g, 'registrada'], [/\bregistam\b/g, 'registram'],
  [/\becrã\b/g, 'tela'], [/palavra-passe/g, 'senha'], [/\bpassword\b/g, 'senha'], [/\bpasswords\b/g, 'senhas'],
  [/\butilizadores\b/g, 'usuários'], [/\butilizador\b/g, 'usuário'], [/\bUtilizadores\b/g, 'Usuários'], [/\bUtilizador\b/g, 'Usuário'],
  [/telemóvel/g, 'celular'], [/\bregistou\b/g, 'registrou'], [/palavras-passe/g, 'senhas'], [/\bcódigo de reposição\b/g, 'código de redefinição'], [/\bcódigos de reposição\b/g, 'códigos de redefinição'], [/\bteu Plano\b/g, 'seu Plano'], [/Escolhe o dia/g, 'Escolha o dia'], [/começa um quando quiseres/g, 'comece um quando quiser'], [/As tuas avaliações/g, 'Suas avaliações'], [/Dá um nome/g, 'Dê um nome'], [/Adiciona pelo menos/g, 'Adicione pelo menos'], [/procura por/g, 'busque por'], [/organiza-os na sua semana/g, 'organiza na semana dele'], [/oxigénio/g, 'oxigênio'], [/\bGuardar\b/g, 'Salvar'], [/Receção/g, 'Recepção'], [/receção/g, 'recepção'], [/conta de programador do ginásio; até lá, guarda este ecrã no ecrã principal do telemóvel/g, 'conta de desenvolvedor da academia; até lá, salve esta tela na tela inicial do celular'], [/Mostra o QR na recepção, ou usa os botões quando chegas e sais/g, 'Mostre o QR na recepção, ou use os botões quando chegar e sair'], [/O teu ginásio ainda não te criou um cartão. Pede/g, 'Sua academia ainda não criou um cartão para você. Peça'], [/toca para dar entrada/g, 'toque para dar entrada'], [/ginásio/g, 'academia'], [/\bDescarregar\b/g, 'Baixar'], [/\bdescarrega\b/g, 'baixe'], [/\bDescarrega\b/g, 'Baixe'],
]
const raw = readFileSync(path, 'utf8')
const nl = raw.includes('\r\n') ? '\r\n' : '\n'
let n = 0
const out = raw.replace(/\r\n/g, '\n').split('\n').map(line => {
  const m = /^  ("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/.exec(line)
  if (!m || !keys.has(JSON.parse(m[1]))) return line
  let v = JSON.parse(m[2])
  const before = v
  for (const [re, to] of SWAPS) v = v.replace(re, to)
  if (v !== before) n++
  return `  ${m[1]}: ${JSON.stringify(v)},`
}).join('\n')
writeFileSync(path, out.replace(/\n/g, nl))
console.log('pt-BR admin strings adjusted:', n)
