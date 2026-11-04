// Local development only: replaces the local test accounts in ./data with three simple ones
// (admin / pt / aluno) that skip the 10-character password rule, and gives "aluno" the training
// data of an existing local profile. Never point this at a real DATA_DIR.
//
//   node scripts/dev-seed-accounts.mjs [nameWhoseDataGoesToAluno]
import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../api/password.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(root, 'data')
const dbFile = join(DATA, 'db.json')
const from = process.argv[2] || 'Ricardo1'
const state = id => join(DATA, 'state-' + id + '.json')

const db = JSON.parse(readFileSync(dbFile, 'utf8'))
copyFileSync(dbFile, dbFile + '.before-seed')
const source = db.users.find(u => u.name === from)
const now = new Date().toISOString()
const id = () => randomBytes(12).toString('base64url')
const make = async (name, pw, extra) => ({ id: id(), name, created: now, pw: { h: await hashPassword(pw), set: now }, ...extra })

const admin = await make('admin', 'admin', { admin: true, owner: true })
const pt = await make('pt', 'pt', { trainer: true })
const aluno = await make('aluno', 'aluno', { trainerId: pt.id })

// The student keeps the source profile's plan, workouts, weigh-ins and measurements.
if (source && existsSync(state(source.id))) renameSync(state(source.id), state(aluno.id))
const dropped = db.users.filter(u => ['admin', 'pt', 'aluno', from, 'PT Teste'].includes(u.name)).map(u => u.id)
db.users = db.users.filter(u => !dropped.includes(u.id)).concat([admin, pt, aluno])
db.creds = (db.creds || []).filter(c => !dropped.includes(c.userId))
db.planOffers = (db.planOffers || []).filter(o => !dropped.includes(o.to) && !dropped.includes(o.from))
db.assessments = (db.assessments || []).filter(a => !dropped.includes(a.to) && !dropped.includes(a.from))
for (const u of dropped) if (existsSync(state(u))) renameSync(state(u), state(u) + '.removed')
writeFileSync(dbFile, JSON.stringify(db, null, 2))

writeFileSync(join(DATA, 'DEV-ACCOUNTS.txt'), `Local dev accounts (data/ only, never production)
dono:  admin / admin   (admin + owner)
pt:    pt / pt         (trainer)
aluno: aluno / aluno   (student of pt; has ${from}'s plan and data)
`)
console.log('seeded admin, pt, aluno;', source ? `aluno has ${from}'s data` : `no profile named ${from} found`)
