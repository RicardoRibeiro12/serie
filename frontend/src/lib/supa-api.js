// Série on Supabase: answers the app's /api/... requests from Supabase Auth and Postgres, so every
// screen keeps calling api('/api/...') exactly as it did against the openGym server. lib/api.js
// hands a request here when the build has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (both
// public: the anon key only reaches what the row-level security in supabase/*.sql allows).
//
// Plain fetch to Auth (/auth/v1) and PostgREST (/rest/v1), no SDK. The session (access and refresh
// token) lives in localStorage, like Supabase's own client keeps it. What the old server did that
// has no place here (passkeys, the AI Coach, push, watches, integrations, photo uploads) answers
// 404, and /api/config tells the app those features are off.
import { progressOf } from '../../../api/trainer.js'
import { visitReport } from '../../../api/members.js'
import { t } from './i18n-core.js'

const ENV = import.meta.env || {}
const URL_ = String(ENV.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const KEY = String(ENV.VITE_SUPABASE_ANON_KEY || '')
export const SUPA = !!(URL_ && KEY)
// People sign in with a name or an e-mail. Supabase Auth needs an e-mail, so a profile made
// without one gets an address under this domain that nothing is ever sent to (sign-up
// confirmations are off for the project).
const NAME_DOMAIN = 'users.serie-treino.app'
const SESSION_KEY = 'serie_sb_session'

const fail = (message, status, data) => Object.assign(new Error(message), { status, data: data || { error: message } })

// ---- session
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') } catch { return null } }
const writeSession = s => { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY) } catch { /* private mode */ } }
const keep = r => ({ access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600), uid: r.user && r.user.id })

async function authCall(path, body, token) {
  const r = await fetch(URL_ + '/auth/v1/' + path, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body || {})
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw fail(authMessage(j), r.status === 400 ? 401 : r.status, { ...j, code: authCode(j) })
  return j
}
// The codes the sign-in screens translate (components/PasswordAuth.jsx passwordError).
const authCode = j => {
  const c = j.error_code || j.code || ''
  const msg = String(j.msg || j.error_description || j.message || '')
  if (c === 'invalid_credentials' || /invalid login/i.test(msg)) return 'bad-credentials'
  if (c === 'user_already_exists' || /already registered/i.test(msg)) return 'name-taken'
  if (c === 'weak_password') return 'too-short'
  if (c === 'email_address_invalid') return 'email-invalid'
  if (c === 'over_request_rate_limit' || c === 'over_email_send_rate_limit') return 'busy'
  return c || undefined
}
const authMessage = j => {
  const code = j.error_code || j.code || ''
  if (code === 'invalid_credentials' || /invalid login/i.test(j.msg || j.error_description || '')) return 'wrong name or password'
  if (code === 'user_already_exists' || /already registered/i.test(j.msg || '')) return 'that name is taken'
  if (code === 'weak_password') return 'the password is too weak'
  if (code === 'email_address_invalid') return 'that e-mail address is not accepted'
  return j.msg || j.error_description || j.message || 'sign-in failed'
}

let refreshing = null
async function token() {
  const s = readSession()
  if (!s) return null
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token
  if (!refreshing) refreshing = authCall('token?grant_type=refresh_token', { refresh_token: s.refresh_token })
    .then(r => { const k = keep(r); writeSession(k); return k.access_token })
    .catch(e => { if (e.status === 401) writeSession(null); throw e })
    .finally(() => { refreshing = null })
  return refreshing
}
const uid = () => (readSession() || {}).uid

// ---- PostgREST
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const tk = await token()
  if (!tk) throw fail('not signed in', 401)
  const r = await fetch(URL_ + '/rest/v1/' + path, {
    method, headers: { apikey: KEY, Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
  const text = await r.text()
  let j = null
  try { j = text ? JSON.parse(text) : null } catch { j = null }
  if (!r.ok) throw dbError(r.status, j)
  return j
}
const rpc = (name, args) => rest('rpc/' + name, { method: 'POST', body: args || {} })
// Postgres error codes (raised in the SQL) to the HTTP statuses the screens already handle.
const STATUS = { 28000: 401, 42501: 403, P0002: 404, 22023: 400, 23505: 409, 54000: 413, PGRST301: 401, PGRST303: 401 }
function dbError(status, j) {
  const code = j && j.code
  const st = STATUS[code] || (status === 401 || status === 403 ? 401 : status)
  const msg = (j && (j.message || j.hint)) || 'HTTP ' + status
  // A code the screens can say in words: the student has not consented to health data (RGPD).
  return fail(msg, st, { ...(j || {}), ...(/no health consent/.test(msg) ? { code: 'no-health-consent' } : {}) })
}

// ---- the person
let meCache = null
async function me(fresh) {
  if (meCache && !fresh) return meCache
  const m = await rpc('app_me')
  if (!m || !m.id) throw fail('not signed in', 401)
  meCache = m
  return m
}
// The gym whose front desk this person may run: one they own, or one they are the desk account of.
const deskGym = async () => {
  const m = await me()
  const g = (m.gyms || []).find(x => x.role === 'owner') || (m.gyms || []).find(x => x.role === 'desk')
  if (!g) throw fail('forbidden', 403)
  return g
}
const ownGym = async () => {
  const m = await me()
  const g = (m.gyms || []).find(x => x.role === 'owner')
  if (!g) throw fail('forbidden', 403)
  return g
}
// consentTerms / consentHealth: when the person accepted the privacy policy and, separately, gave the
// health-data consent (RGPD art. 9); null when not. components/Consent.jsx asks for what is missing.
const userOf = m => ({ id: m.id, name: m.name, admin: !!m.admin, ...(m.owner ? { owner: true } : {}), ...(m.trainer ? { trainer: true } : {}), ...(m.desk ? { desk: true } : {}), consentTerms: m.consentTerms || null, consentHealth: m.consentHealth || null })
// The privacy policy the consent refers to (landing/pages.mjs /privacidade/); bump it when the text changes.
export const CONSENT_VERSION = '2026-11'
const emailFor = name => {
  const n = String(name || '').trim()
  if (n.includes('@')) return n.toLowerCase()
  const slug = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
  return (slug || 'utilizador') + '@' + NAME_DOMAIN
}

async function signIn(name, password) {
  const r = await authCall('token?grant_type=password', { email: emailFor(name), password })
  writeSession(keep(r))
  meCache = null
  try { return userOf(await me(true)) }
  catch (e) {
    // Signed up, but the profile step did not finish (closed tab): finish it now.
    if (e.status !== 401) throw e
    return userOf(await rpc('app_join', { p_name: (r.user && r.user.user_metadata && r.user.user_metadata.name) || name, p_code: null }))
  }
}

async function signUp({ name, password, code, email, consentTerms, consentHealth }) {
  const n = String(name || '').trim().slice(0, 40)
  if (!n) throw fail('name required', 400)
  if (code) {
    const ok = await fetch(URL_ + '/rest/v1/rpc/check_invite', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: code }) }).then(r => r.json()).catch(() => null)
    if (!ok) throw fail('wrong or already-used invite code', 403, { error: 'wrong or already-used invite code', code: 'invite' })
  }
  const r = await authCall('signup', { email: email ? String(email).trim().toLowerCase() : emailFor(n), password, data: { name: n } })
  if (!r.access_token) throw fail('the account was created but needs confirming; ask the gym to switch e-mail confirmation off', 400)
  writeSession(keep(r))
  meCache = await rpc('app_join', { p_name: n, p_code: code || null })
  if (consentTerms) meCache = await rpc('set_consent', { p_terms: true, p_health: !!consentHealth, p_version: CONSENT_VERSION })
  return userOf(meCache)
}

// ---- shapes the screens read
const assessmentOut = names => a => ({ id: a.id, date: a.day, weight: a.weight == null ? null : Number(a.weight), values: a.values || {}, body: a.body || {}, note: a.note || null, from: names[a.author_id] || null, merged: !!a.merged })
async function namesOf(ids) {
  const list = [...new Set(ids.filter(Boolean))]
  if (!list.length) return {}
  const rows = await rest('profiles?select=id,name&id=in.(' + list.join(',') + ')')
  return Object.fromEntries((rows || []).map(p => [p.id, p.name]))
}
const records = v => (Array.isArray(v) ? v.filter(x => x && typeof x === 'object') : [])
const q = (path, key) => new URLSearchParams(path.split('?')[1] || '').get(key)
const ok = { ok: true }

// ---- routes: 'METHOD /path' (no query) → (body, path) => answer
const ROUTES = {
  'GET /api/health': () => ({ ok: true }),
  'GET /api/config': () => ({ invite_only: false, allow_guest: false, password_login: true, passkeys: false, invite_field: true, consent: true, shared_exercises: true, backend: 'supabase' }),
  // Exercises shared with the gym's PTs (supabase/app.sql, lib/gym-exercises.js).
  'GET /api/gym/exercises': async () => ({ exercises: (await rpc('gym_exercise_list')) || [] }),
  'POST /api/gym/exercises/share': async b => ({ ok: true, gyms: await rpc('share_exercise', { p_ex: b.ex, p_on: b.on === true }) }),
  // The person's consent (components/Consent.jsx, views/DataConsent.jsx).
  'POST /api/consent': async b => {
    meCache = await rpc('set_consent', { p_terms: b.terms === true ? true : null, p_health: typeof b.health === 'boolean' ? b.health : null, p_version: CONSENT_VERSION })
    return { user: userOf(meCache) }
  },
  'POST /api/assessments/delete-mine': async () => ({ ok: true, removed: await rpc('delete_my_assessments') }),
  // Right to erasure: the account and everything of the person's (supabase/app.sql delete_my_account).
  'GET /api/account/passkeys': () => ({ passkeys: [], password: true }),
  'POST /api/account/delete': async b => {
    // The current password proves it is the person (components/DeleteAccount.jsx ProveOwner).
    const tk = await token()
    const who = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: KEY, Authorization: 'Bearer ' + tk } }).then(r => r.json()).catch(() => null)
    if (!who || !who.email) throw fail('not signed in', 401)
    try { await authCall('token?grant_type=password', { email: who.email, password: b.current || '' }) }
    catch { throw fail('wrong current password', 400, { error: 'wrong current password', code: 'current-wrong' }) }
    try { await rpc('delete_my_account', { p_name: b.name || '' }) }
    catch (e) {
      if (/owns a gym/.test(e.message)) throw fail(t('You own a gym. Hand it to someone else before deleting your account.'), 403)
      if (/name does not match/.test(e.message)) throw fail(t('Type your profile name exactly as it is.'), 400)
      throw e
    }
    writeSession(null); meCache = null
    return { ok: true }
  },
  'GET /api/me': async () => ({ user: userOf(await me(true)) }),
  'POST /api/login/password': async b => ({ user: await signIn(b.name, b.password) }),
  'POST /api/register/password': async b => ({ user: await signUp(b) }),
  'POST /api/logout': async () => { const tk = readSession() && readSession().access_token; writeSession(null); meCache = null; if (tk) await authCall('logout?scope=local', {}, tk).catch(() => {}); return ok },
  'POST /api/logout/all': async () => { const tk = await token().catch(() => null); writeSession(null); meCache = null; if (tk) await authCall('logout?scope=global', {}, tk).catch(() => {}); return ok },
  'POST /api/activity': () => ok,

  // sync: the whole openGym document in user_state, with its revision (supabase/app.sql put_state)
  'GET /api/data': async () => {
    const rows = await rest('user_state?select=doc,rev&user_id=eq.' + uid())
    const row = rows && rows[0]
    return { state: row && row.doc && Object.keys(row.doc).length ? row.doc : null, rev: row ? Number(row.rev) : 0 }
  },
  'GET /api/data/rev': async () => {
    const rows = await rest('user_state?select=rev,wid:doc->>_wid&user_id=eq.' + uid())
    const row = rows && rows[0]
    return { rev: row ? Number(row.rev) : 0, ...(row && row.wid ? { wid: row.wid } : {}) }
  },
  'PUT /api/data': async b => {
    if (!b.state || typeof b.state !== 'object' || Array.isArray(b.state)) throw fail('state required', 400)
    const r = await rpc('put_state', { p_doc: b.state, p_base_rev: b.baseRev == null ? null : b.baseRev, p_base_wid: typeof b.baseWid === 'string' ? b.baseWid : null })
    if (r.conflict) throw fail('conflict', 409, { error: 'conflict', rev: r.rev, state: r.state })
    return { ok: true, ts: r.ts || null, rev: r.rev, wid: r.wid }
  },

  // trainer
  'GET /api/trainer/students': async () => ({ students: (await rpc('trainer_students')) || [] }),
  'POST /api/trainer/invites/new': async () => {
    const m = await me()
    const g = (m.gyms || []).find(x => x.role === 'trainer') || (m.gyms || []).find(x => x.role === 'owner')
    if (!g) throw fail('forbidden', 403)
    const inv = await rpc('create_invite', { p_role: 'student', p_gym: g.id, p_trainer: null, p_gym_name: null })
    return { invite: { code: inv.code } }
  },
  'GET /api/trainer/student': async (b, path) => {
    const id = q(path, 'id')
    const students = (await rpc('trainer_students')) || []
    const s = students.find(x => x.id === id)
    if (!s) throw fail('not your student', 404)
    const [state, assess, plans] = await Promise.all([
      rest('user_state?select=doc&user_id=eq.' + id),
      rest('assessments?select=*&student_id=eq.' + id + '&order=day.desc,created_at.desc'),
      rest('student_plans?select=*&to_id=eq.' + id + '&order=updated_at.desc')
    ])
    const names = await namesOf((assess || []).map(a => a.author_id))
    return {
      id, name: s.name, healthConsent: s.healthConsent !== false,
      progress: progressOf((state && state[0] && state[0].doc) || {}, records),
      assessments: (assess || []).map(assessmentOut(names)),
      plans: (plans || []).map(p => ({ id: p.id, name: p.name, at: p.created_at, updated: p.updated_at, mine: p.from_id === uid(), plan: p.plan }))
    }
  },
  'POST /api/trainer/plans': async b => {
    const isUuid = typeof b.id === 'string' && /^[0-9a-f-]{36}$/i.test(b.id)
    const id = await rpc('save_student_plan', { p_student: b.studentId, p_id: isUuid ? b.id : null, p_name: b.name || '', p_plan: b.plan })
    return { ok: true, id }
  },
  'POST /api/trainer/plans/delete': async b => { await rest('student_plans?id=eq.' + b.id + '&to_id=eq.' + b.studentId, { method: 'DELETE' }); return ok },
  'POST /api/trainer/assessment': async b => {
    const id = await rpc('record_assessment', { p_student: b.studentId, p_day: b.date, p_weight: b.weight == null ? null : b.weight, p_values: b.values || {}, p_body: b.body || {}, p_note: b.note || null })
    return { ok: true, id }
  },

  // student
  'GET /api/assessments': async (b, path) => {
    const all = q(path, 'all') === '1'
    const rows = await rest('assessments?select=*&student_id=eq.' + uid() + (all ? '' : '&merged=eq.false') + '&order=day.desc,created_at.desc')
    const names = await namesOf((rows || []).map(a => a.author_id))
    return { assessments: (rows || []).map(assessmentOut(names)) }
  },
  'POST /api/assessments/done': async b => ({ ok: true, removed: await rpc('assessments_merged', { p_ids: (b.ids || []).slice(0, 100) }) }),
  'GET /api/my-plans': async () => {
    const rows = await rest('student_plans?select=*&to_id=eq.' + uid() + '&order=updated_at.desc')
    const names = await namesOf((rows || []).map(p => p.from_id))
    return { plans: (rows || []).map(p => ({ id: p.id, name: p.name, at: p.created_at, updated: p.updated_at, from: names[p.from_id] || null, plan: p.plan })) }
  },
  'GET /api/plan-offer': () => ({ offer: null }),
  'POST /api/plan-offer/done': () => ok,
  'GET /api/card': async () => rpc('my_card'),

  // the gym's owner (the app's admin screen and the painel)
  'GET /api/admin/users': async () => {
    const g = await ownGym()
    const people = (await rpc('gym_people', { p_gym: g.id })) || []
    return { users: people.map(p => ({ id: p.id, name: p.name, admin: !!p.admin, ...(p.owner ? { owner: true } : {}), ...(p.trainer ? { trainer: true } : {}), ...(p.desk ? { desk: true } : {}), trainerId: p.trainerId || null, workouts: p.workouts, lastWorkout: p.lastWorkout, lastSync: p.lastSync ? Date.parse(p.lastSync) : null, live: null })), invite_only: false, gym: g.name }
  },
  'GET /api/admin/user': async (b, path) => {
    const g = await ownGym()
    const id = q(path, 'id')
    const p = ((await rpc('gym_people', { p_gym: g.id })) || []).find(x => x.id === id)
    if (!p) throw fail('no such profile', 404)
    // Their document, for the counts the sheet shows (the owner may read a member's; a row the
    // policies hide is simply empty). The sheet reads every one of these lists, so each is a list.
    const rows = await rest('user_state?select=doc&user_id=eq.' + id).catch(() => [])
    const doc = (rows && rows[0] && rows[0].doc) || {}
    // password: a boolean tells the screen this instance has passwords, which shows "Reset password".
    return {
      user: { id: p.id, name: p.name, admin: !!p.admin, owner: !!p.owner, trainer: !!p.trainer, trainerId: p.trainerId || null, lastSync: p.lastSync ? Date.parse(p.lastSync) : null, password: true, credentials: [] },
      lastSync: p.lastSync ? Date.parse(p.lastSync) : null,
      workouts: records(doc.workouts), bodyweight: records(doc.bodyweight), measurements: records(doc.measurements), routines: records(doc.routines), trainers: []
    }
  },
  'POST /api/admin/user/trainer': async b => {
    const g = await ownGym()
    if (b.trainer !== undefined) await rpc('set_member_role', { p_gym: g.id, p_user: b.id, p_role: b.trainer ? 'trainer' : 'student' })
    if (b.trainerId !== undefined) await rpc('set_student_trainer', { p_gym: g.id, p_student: b.id, p_trainer: b.trainerId })
    return { ok: true, id: b.id }
  },
  // A one-time code the owner hands over (supabase/reset.sql); the person sets a new password with it.
  'POST /api/admin/user/password-reset': async b => {
    const r = await rpc('create_reset_code', { p_user: b.id })
    return { ok: true, name: r.name, code: r.code, expires: Date.parse(r.expires) }
  },
  'POST /api/login/password-reset': async b => {
    const who = b.identifier || b.name || b.email
    const r = await fetch(URL_ + '/rest/v1/rpc/redeem_reset_code', {
      method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_email: emailFor(who), p_code: b.code, p_password: b.next })
    })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw /too-short/.test((j && j.message) || '') ? fail('too-short', 400, { error: 'too-short', code: 'too-short' }) : dbError(r.status, j)
    if (j !== true) {
      // An invite code typed here by mistake (a PT's or the gym's): say where it goes instead.
      const inv = await fetch(URL_ + '/rest/v1/rpc/check_invite', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: b.code }) }).then(x => x.json()).catch(() => null)
      if (inv) throw fail('that is an invite code', 400, { error: 'that is an invite code', code: 'is-invite' })
      throw fail('wrong or expired reset code', 404, { error: 'wrong or expired reset code', code: 'reset-invalid' })
    }
    return { user: await signIn(who, b.next) }
  },
  'POST /api/admin/user/delete': async b => { const g = await ownGym(); await rpc('remove_member', { p_gym: g.id, p_user: b.id }); return ok },
  'GET /api/admin/invites': async () => {
    const g = await ownGym()
    const rows = await rest('invites?select=code,role,used_by,created_at&gym_id=eq.' + g.id + '&order=created_at.desc')
    const names = await namesOf((rows || []).map(i => i.used_by))
    return { invites: (rows || []).map(i => ({ code: i.code, note: i.role, created: i.created_at, usedBy: i.used_by || null, usedByName: names[i.used_by] || null })) }
  },
  'POST /api/admin/invites/new': async b => {
    const g = await ownGym()
    const inv = await rpc('create_invite', { p_role: b.role === 'trainer' || b.role === 'desk' ? b.role : 'student', p_gym: g.id, p_trainer: null, p_gym_name: null })
    return { invite: { code: inv.code } }
  },
  'POST /api/admin/invites/revoke': async b => { await rest('invites?code=eq.' + encodeURIComponent(b.code), { method: 'DELETE' }); return ok },
  'GET /api/admin/audit': () => ({ enabled: false, events: [] }),
  'GET /api/admin/cards': async () => {
    const g = await ownGym()
    const people = (await rpc('gym_people', { p_gym: g.id })) || []
    return { gym: g.name, members: people.map(p => ({ id: p.id, name: p.name, disabled: false, card: p.card || null, inside: p.inside || null })) }
  },
  'POST /api/admin/cards': async b => {
    const g = await ownGym()
    const card = b.action === 'issue' ? await rpc('issue_card', { p_gym: g.id, p_user: b.userId })
      : await rpc('set_card_status', { p_gym: g.id, p_user: b.userId, p_status: b.action === 'suspend' ? 'suspended' : 'active' })
    return { ok: true, card }
  },
  'POST /api/admin/scan': async b => { const g = await deskGym(); return rpc('desk_scan', { p_gym: g.id, p_text: b.qr }) },
  // The front desk screen (views/Rececao.jsx): the gym's name and how many are inside.
  'GET /api/desk/status': async () => { const g = await deskGym(); return rpc('desk_status', { p_gym: g.id }) },
  'GET /api/admin/visits': async (b, path) => {
    const g = await ownGym()
    const days = Math.max(1, Math.min(90, Number(q(path, 'days')) || 14))
    const since = new Date(Date.now() - days * 86400000).toISOString()
    const [rows, people] = await Promise.all([
      rest('visits?select=*&gym_id=eq.' + g.id + '&in_at=gte.' + encodeURIComponent(since) + '&order=in_at.desc&limit=2000'),
      rpc('gym_people', { p_gym: g.id })
    ])
    const names = Object.fromEntries((people || []).map(p => [p.id, p.name]))
    const db = { visits: (rows || []).map(v => ({ id: v.id, uid: v.user_id, in: new Date(v.in_at).toISOString(), out: v.out_at ? new Date(v.out_at).toISOString() : null, auto: v.auto, by: v.by_desk ? 'desk' : 'self' })) }
    return { gym: g.name, days, ...visitReport(db, { days, nameOf: id => names[id] || null }) }
  }
}

export async function supaApi(path, init) {
  const method = String((init && init.method) || 'GET').toUpperCase()
  const route = ROUTES[method + ' ' + path.split('?')[0]]
  if (!route) throw fail('not available', 404)
  let body = {}
  if (init && init.body) { try { body = JSON.parse(init.body) } catch { body = {} } }
  try { return await route(body, path) }
  catch (e) {
    if (e && e.status === 401) { meCache = null }
    if (e && e.status != null) throw e
    throw Object.assign(new Error(navigator.onLine === false ? 'offline' : (e && e.message) || 'network error'), { code: 'network' })
  }
}
