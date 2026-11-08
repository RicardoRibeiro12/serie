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
  'tap to check in': 'toque para dar entrada',
  'show it at the front desk': 'mostre na recepção',
  'QR for the front desk': 'QR para a recepção',
  'Front desk mode': 'Modo recepção',
  'Code for the front desk': 'Código para recepção',
  'Only the gym’s owner or front desk sees this page.': 'Só o dono da academia ou a recepção veem esta página.',
  'Read the members’ cards at the door': 'Ler os cartões dos sócios na entrada',
  'front desk': 'recepção',
  'Your gym': 'Sua academia',
  'Send them to the front desk.': 'Encaminhe para a recepção.',
  'Show your card’s QR': 'Mostre o QR do seu cartão',
  'This card is not from this gym, or it has a new QR.': 'Este cartão não é desta academia, ou tem um QR novo.',
  'Use the camera': 'Usar a câmera',
  'No PT': 'Sem personal',
  '{0} now trains with {1}': '{0} agora treina com {1}',
  '{0} has no PT now': '{0} ficou sem personal',
  'No trainers in this gym yet. Make someone a trainer, or invite one with “Code for a PT”.': 'Ainda não há personais nesta academia. Torne alguém personal, ou convide um com “Código para PT”.',
  'That is an invite code, not a reset code. To make your account, go back, tap “Create new profile” and enter it in the gym or trainer code.': 'Isso é um código de convite, não de redefinição. Para criar sua conta, volte, toque em “Criar novo perfil” e digite-o no código da academia ou do personal.',
  'In the gym': 'Na academia',
  'No trainers in this gym yet.': 'Ainda não há personais nesta academia.',
  'Only the gym’s owner sees this page.': 'Só o dono da academia vê esta página.',
  'Back to the app': 'Voltar ao app',
  'Workouts logged': 'Treinos registrados',
  'Personal trainers': 'Personal trainers',
  'Gym or trainer code (optional)': 'Código da academia ou do personal (opcional)',
  'If your gym or your trainer gave you a code, it puts you in their gym.': 'Se a academia ou o seu personal te deu um código, ele coloca você na academia.',
  'Front desk mode, the dashboard and Admin are on Home, under Your gym.': 'O Modo recepção, o painel e a Administração estão no Início, em Sua academia.',
  'Your students are in Settings (the gear on Home) → Students. Open one to build their plan.': 'Seus alunos estão nas Configurações (a engrenagem no Início) → Alunos. Abra um para montar o plano dele.',
  'Your membership card is on Home. Show its QR at the front desk on the way in and out.': 'Seu cartão de sócio está no Início. Mostre o QR na recepção na entrada e na saída.',
  'Plans from your PT show up on Home and in Plan.': 'Os planos do seu personal aparecem no Início e no Plano.',
  'You can train here yourself too, like any member.': 'Você também pode treinar aqui, como qualquer aluno.',
  'Available to every PT in the gym': 'Disponível para todos os personais da academia',
  'They find it in their exercises and can put it in their students’ plans.': 'Aparece nos exercícios deles, e eles podem colocá-lo nos planos dos alunos.',
  'Shared in the gym by {0}': 'Compartilhado na academia por {0}',
  'Shared in the gym': 'Compartilhado na academia',
  'Show the QR at the front desk when you arrive and when you leave. If you forget on the way out, you are checked out at the end of the day.': 'Mostre o QR na recepção quando chegar e quando sair. Se esquecer na saída, ela fica registrada no fim do dia.'
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
