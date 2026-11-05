// schema.sql + app.sql (each twice) on PGlite, then the app's flows as three people: the first
// sign-up becomes owner, a trainer and a student join by invite, sync with conflicts, plan library,
// assessments, cards, desk scans, the end-of-day check-out, and what each one may not read.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'

const dir = process.argv[2]
const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, aud text, role text, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
  grant usage on schema auth, public, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`)
for (const f of ['schema.sql', 'schema.sql', 'app.sql', 'app.sql']) await db.exec(readFileSync(dir + '/' + f, 'utf8'))
console.log('schema.sql + app.sql applied twice: OK')

const ids = { owner: '11111111-1111-1111-1111-111111111111', pt: '22222222-2222-2222-2222-222222222222', aluno: '33333333-3333-3333-3333-333333333333', other: '44444444-4444-4444-4444-444444444444', desk: '55555555-5555-5555-5555-555555555555' }
for (const id of Object.values(ids)) await db.query('insert into auth.users (id) values ($1)', [id])
let fails = 0, n = 0
const ok = (cond, label) => { n++; if (!cond) { fails++; console.log('FAIL', label) } }
async function as(who, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: ids[who] })}', false); set role authenticated;`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
async function err(who, sql, params = []) { try { await as(who, sql, params); return null } catch (e) { return e.message } }

const me = (await as('owner', "select public.app_join('Dono', null, 'Ginásio Central') j"))[0].j
ok(me.admin && me.owner && me.gyms[0].name === 'Ginásio Central', 'first sign-up owns the first gym')
const gym = me.gyms[0].id
const ptInv = (await as('owner', "select (public.create_invite('trainer', $1)).code c", [gym]))[0].c
const ptMe = (await as('pt', 'select public.app_join($1, $2) j', ['PT Ana', ptInv]))[0].j
ok(ptMe.trainer && !ptMe.admin, 'trainer invite makes a trainer')
const stInv = (await as('pt', "select (public.create_invite('student', $1)).code c", [gym]))[0].c
const stMe = (await as('aluno', 'select public.app_join($1, $2) j', ['Aluno Rui', stInv]))[0].j
ok(!stMe.trainer && stMe.gyms[0].role === 'student', 'student invite makes a student')
await as('other', "select public.app_join('Outro', null)")

// sync
let r = (await as('aluno', "select public.put_state($1::jsonb, 0, null) r", [JSON.stringify({ unit: 'kg', routines: [], workouts: [{ id: 'w1', d: '2026-11-04', entries: [] }], bodyweight: [{ d: '2026-11-04', w: 80 }], active: { x: 1 } })]))[0].r
ok(r.ok && r.rev === 1 && r.wid, 'first write is rev 1')
const wid1 = r.wid
r = (await as('aluno', "select public.put_state($1::jsonb, 0, null) r", [JSON.stringify({ unit: 'kg' })]))[0].r
ok(r.conflict && r.rev === 1 && r.state._rev === 1 && !('active' in r.state), 'stale base answers 409 with the stored document (no active)')
r = (await as('aluno', "select public.put_state($1::jsonb, 1, $2) r", [JSON.stringify({ unit: 'kg', routines: [], workouts: [{ id: 'w1', d: '2026-11-04', entries: [] }, { id: 'w2', d: '2026-11-05', entries: [] }], bodyweight: [{ d: '2026-11-04', w: 80 }] }), wid1]))[0].r
ok(r.ok && r.rev === 2, 'matching base writes rev 2')
const doc = (await as('aluno', 'select doc from user_state'))[0].doc
ok(doc._wids && doc._wids[0] === wid1, 'ancestors kept in _wids')
ok((await err('aluno', "select public.put_state('{}'::jsonb, 2, null)")) !== null, 'empty document refused')

// trainer overview and plans
const list = (await as('pt', 'select public.trainer_students() s'))[0].s
ok(list.length === 1 && list[0].name === 'Aluno Rui' && list[0].workouts === 2, 'trainer sees the student with 2 workouts')
ok((await as('other', 'select public.trainer_students() s'))[0].s.length === 0, 'stranger sees no students')
const planId = (await as('pt', "select public.save_student_plan($1, null, 'Hipertrofia', $2::jsonb) id", [ids.aluno, JSON.stringify({ opengym_plan: 1, routines: [{ id: 'r', name: 'A', ex: [{ id: '0025', sets: 3 }] }], week: { 1: ['r'] } })]))[0].id
const plans = await as('aluno', 'select name, plan from student_plans')
ok(plans.length === 1 && JSON.stringify(plans[0].plan.week) === '{}', 'student reads the plan, without weekdays')
ok((await err('other', "select public.save_student_plan($1, null, 'x', $2::jsonb)", [ids.aluno, JSON.stringify({ routines: [{}] })])) !== null, 'stranger cannot write a plan')
await as('pt', "select public.save_student_plan($1, $2, 'Hipertrofia 2', $3::jsonb)", [ids.aluno, planId, JSON.stringify({ routines: [{ id: 'r', name: 'A', ex: [] }] })])
ok((await as('aluno', 'select count(*)::int c from student_plans'))[0].c === 1, 'same id updates, no duplicate')

// consent (RGPD): no assessment without the student's health consent
const noConsent = await err('pt', "select public.record_assessment($1, current_date, 80, '{}'::jsonb, '{}'::jsonb, null)", [ids.aluno])
ok(noConsent && /no health consent/.test(noConsent), 'no assessment without health consent')
let meC = (await as('aluno', "select public.set_consent(true, true, '2026-11') m"))[0].m
ok(meC.consentTerms && meC.consentHealth && meC.consentVersion === '2026-11', 'consent recorded with its version')
ok((await as('pt', 'select public.trainer_students() s'))[0].s[0].healthConsent === true, 'trainer sees that the student consented')

// assessments
const aId = (await as('pt', "select public.record_assessment($1, current_date, 108.4, '{\"bodyFat\":33.1}'::jsonb, '{\"age\":38,\"height\":176,\"sex\":\"m\"}'::jsonb, 'teste') id", [ids.aluno]))[0].id
const mine = await as('aluno', 'select id, body, merged from assessments')
ok(mine.length === 1 && mine[0].body.age === 38 && !mine[0].merged, 'student reads the assessment with body')
ok((await as('pt', 'select count(*)::int c from assessments'))[0].c === 1, 'trainer reads it at once')
ok((await as('aluno', 'select public.assessments_merged(array[$1]::uuid[]) n', [aId]))[0].n === 1, 'student marks it merged')
ok((await as('other', 'select count(*)::int c from assessments'))[0].c === 0, 'stranger reads no assessments')
meC = (await as('aluno', 'select public.set_consent(null, false, null) m'))[0].m
ok(meC.consentTerms && !meC.consentHealth, 'health consent withdrawn, privacy acceptance kept')
ok((await err('pt', "select public.record_assessment($1, current_date, 80, '{}'::jsonb, '{}'::jsonb, null)", [ids.aluno])) !== null, 'no new assessment after withdrawal')
ok((await as('aluno', 'select public.delete_my_assessments() n'))[0].n === 1, 'student erases their assessments')
ok((await as('pt', 'select count(*)::int c from assessments'))[0].c === 0, 'trainer no longer sees them')
await as('aluno', "select public.set_consent(null, true, '2026-11')")

// cards and visits
ok((await err('pt', 'select public.issue_card($1, $2)', [gym, ids.aluno])) !== null, 'a trainer cannot issue cards')
ok((await err('owner', 'select public.issue_card($1, $2)', [gym, ids.other])) !== null, 'no card for someone outside the gym')
const card = (await as('owner', 'select public.issue_card($1, $2) c', [gym, ids.aluno]))[0].c
ok(/^S-\d{6}$/.test(card.number), 'card number')
const my = (await as('aluno', 'select public.my_card() c'))[0].c
ok(my.card.gym === 'Ginásio Central' && my.card.qr.startsWith('SERIE1:') && my.inside === null, 'student sees the card with the gym name')
let s = (await as('owner', 'select public.desk_scan($1, $2) s', [gym, my.card.qr]))[0].s
ok(s.dir === 'in' && s.name === 'Aluno Rui', 'desk scan checks in')
s = (await as('owner', 'select public.desk_scan($1, $2) s', [gym, card.number]))[0].s
ok(s.dir === 'out', 'typing the number checks out')
ok((await err('pt', 'select public.desk_scan($1, $2)', [gym, card.number])) !== null, 'a trainer cannot use the desk')
ok((await err('owner', "select public.desk_scan($1, 'SERIE1:nope')", [gym])) !== null, 'unknown QR refused')
await as('owner', 'select public.desk_scan($1, $2)', [gym, card.number])
await db.exec("update visits set in_at = now() - interval '2 days' where out_at is null")
await db.query('select public.close_stale_visits($1)', [gym])
ok((await err('owner', 'select public.close_stale_visits($1)', [gym])) !== null, 'close_stale_visits is internal')
const v = (await db.query('select out_at, auto from visits order by in_at limit 1')).rows[0]
ok(v.auto === true && v.out_at, 'yesterday\'s open visit closed at the end of that day')
ok((await as('other', 'select count(*)::int c from visits'))[0].c === 0, 'stranger reads no visits')
const people = (await as('owner', 'select public.gym_people($1) p', [gym]))[0].p
ok(people.length === 3 && people.some(p => p.card && p.card.number === card.number), 'owner lists the gym people with cards')

// front desk account: reads cards and the count inside, nothing else
ok((await err('pt', "select public.create_invite('desk', $1)", [gym])) !== null, 'a trainer cannot invite a desk account')
const deskInv = (await as('owner', "select (public.create_invite('desk', $1)).code c", [gym]))[0].c
const deskMe = (await as('desk', 'select public.app_join($1, $2) j', ['Receção', deskInv]))[0].j
ok(deskMe.desk === true && !deskMe.admin && !deskMe.trainer, 'the desk invite makes a desk account')
const st0 = (await as('desk', 'select public.desk_status($1) s', [gym]))[0].s
ok(st0.gym === 'Ginásio Central' && typeof st0.present === 'number', 'desk sees the gym name and the count inside')
const ds = (await as('desk', 'select public.desk_scan($1, $2) s', [gym, card.number]))[0].s
ok(ds.dir === 'in' && ds.name === 'Aluno Rui', 'desk checks a member in')
ok((await as('desk', 'select public.desk_status($1) s', [gym]))[0].s.present === st0.present + 1, 'the count follows')
await as('desk', 'select public.desk_scan($1, $2)', [gym, card.number])
ok((await err('desk', 'select public.gym_people($1)', [gym])) !== null, 'desk cannot list the members')
ok((await err('desk', 'select public.issue_card($1, $2)', [gym, ids.aluno])) !== null, 'desk cannot issue cards')
ok((await as('desk', 'select count(*)::int c from visits'))[0].c === 0, 'desk reads no visit rows')
ok((await as('desk', 'select count(*)::int c from member_cards'))[0].c === 0, 'desk reads no cards')
ok((await as('desk', 'select count(*)::int c from assessments'))[0].c === 0, 'desk reads no assessments')
ok((await as('desk', 'select count(*)::int c from user_state'))[0].c === 0, 'desk reads no training')
ok((await err('other', 'select public.desk_status($1)', [gym])) !== null, 'a stranger has no desk status')
ok((await as('owner', 'select public.desk_status($1) s', [gym]))[0].s.gym === 'Ginásio Central', 'the owner can use the desk too')

await as('owner', "select public.set_card_status($1, $2, 'suspended')", [gym, ids.aluno])
ok((await err('owner', 'select public.desk_scan($1, $2)', [gym, card.number])) !== null, 'suspended card refused')
ok((await err('aluno', 'select public.gym_people($1)', [gym])) !== null, 'student cannot list the gym')

// right to erasure: the person deletes their account; an owner cannot while they own a gym
ok((await err('aluno', "select public.delete_my_account('someone else')")) !== null, 'delete needs the name typed back')
ok((await err('owner', "select public.delete_my_account('Dono')")) !== null, 'an owner hands the gym on first')
ok((await as('aluno', "select public.delete_my_account('aluno rui') d"))[0].d === true, 'student deletes their account (name in any case)')
ok((await db.query('select count(*)::int c from profiles where id = $1', [ids.aluno])).rows[0].c === 0, 'profile gone')
ok((await db.query('select count(*)::int c from member_cards where user_id = $1', [ids.aluno])).rows[0].c === 0, 'card gone')
ok((await db.query('select count(*)::int c from student_plans where to_id = $1', [ids.aluno])).rows[0].c === 0, 'plans gone')

console.log(`${n} checks, ${fails} failed`)
process.exit(fails ? 1 : 0)
