#!/usr/bin/env node
// Hand-written pt-BR for the RGPD consent strings (scripts/i18n/consent-strings.json). Idempotent.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const path = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'locales', 'pt-BR.js')
const BR = {
  'Accepted on {0}.': 'Aceita em {0}.',
  'You own a gym. Hand it to someone else before deleting your account.': 'Você é dono de uma academia. Passe-a para outra pessoa antes de apagar a conta.',
  'Type your profile name exactly as it is.': 'Digite o nome do perfil exatamente como está.',
  'Assessments by your PT': 'Avaliações do seu personal',
  'Before you go on: Série keeps your training, and, if you allow it, the assessments your PT records. Your gym and your PT only see what concerns them.': 'Antes de continuar: a Série guarda seus treinos e, se você autorizar, as avaliações que seu personal registra. A academia e o personal só veem o que diz respeito a eles.',
  'Done. Your PT can no longer record assessments.': 'Pronto. Seu personal não pode mais registrar avaliações.',
  'Erase all your assessments?': 'Apagar todas as suas avaliações?',
  'Every assessment your PT recorded about you is deleted, for you and for your PT. The weigh-ins already in your own history stay. This cannot be undone.': 'Todas as avaliações que seu personal registrou sobre você são apagadas, para você e para o personal. As pesagens que já estão no seu histórico ficam. Não dá para desfazer.',
  'I allow my PT to record assessments about me: weight, body composition and heart rate. These are health data; I can withdraw this and erase them in Settings at any time.': 'Autorizo meu personal a registrar avaliações sobre mim: peso, composição corporal e frequência cardíaca. São dados de saúde; posso retirar esta autorização e apagá-los nas Configurações a qualquer momento.',
  'Not accepted yet.': 'Ainda não aceita.',
  'To take all your data with you, use Export in Settings. To leave for good, delete the account there.': 'Para levar todos os seus dados, use Exportar nas Configurações. Para sair de vez, apague a conta lá.',
  'To use the app, accept the privacy policy.': 'Para usar o app, aceite a política de privacidade.',
  'Weight, body composition and heart rate are health data. Your PT records them only with your permission, and you can change your mind at any time.': 'Peso, composição corporal e frequência cardíaca são dados de saúde. Seu personal só os registra com sua autorização, e você pode mudar de ideia quando quiser.',
  'Your PT may not record assessments.': 'Seu personal não pode registrar avaliações.',
  'Your PT may record assessments again.': 'Seu personal pode voltar a registrar avaliações.',
  'Your PT may record assessments.': 'Seu personal pode registrar avaliações.',
  'Your data, your choice': 'Seus dados, sua escolha',
  '{0} has not allowed assessments yet. They can allow them in Settings, Privacy and health data.': '{0} ainda não autorizou avaliações. Dá para autorizar em Configurações, Privacidade e dados de saúde.'
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
console.log('pt-BR consent strings fixed:', n)
