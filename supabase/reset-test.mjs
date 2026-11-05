// reset.sql on PGlite (with schema.sql + app.sql): the owner makes a code for a member, a stranger
// cannot, a wrong code counts a try and changes nothing, the right one sets the password and ends
// the sessions, and a code dies after 5 wrong tries.   node supabase/reset-test.mjs supabase
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'

const dir = process.argv[2] || 'supabase'
const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create schema extensions;
  create table auth.users (id uuid primary key, aud text, role text, email text, encrypted_password text, updated_at timestamptz);
  create table auth.refresh_tokens (id serial primary key, user_id varchar(255));
  create table auth.sessions (id serial primary key, user_id uuid);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
  grant usage on schema auth, public, extensions to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`)
for (const f of ['schema.sql', 'app.sql', 'reset.sql', 'reset.sql']) await db.exec(readFileSync(dir + '/' + f, 'utf8'))
const ids = { owner: '11111111-1111-1111-1111-111111111111', aluno: '33333333-3333-3333-3333-333333333333', other: '44444444-4444-4444-4444-444444444444' }
for (const [k, id] of Object.entries(ids)) await db.query("insert into auth.users (id, email, encrypted_password) values ($1, $2, 'old')", [id, k + '@users.serie-treino.app'])
await db.query("insert into auth.sessions (user_id) values ($1)", [ids.aluno])
let n = 0, fails = 0
const ok = (c, l) => { n++; if (!c) { fails++; console.log('FAIL', l) } }
async function as(who, sql, params = []) {
  const claims = who ? JSON.stringify({ sub: ids[who] }) : ''
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role ${who ? 'authenticated' : 'anon'};`)
  try { return (await db.query(sql, params)).rows } finally { await db.exec('reset role') }
}
const err = async (...a) => { try { await as(...a); return null } catch (e) { return e.message } }

const gym = (await as('owner', "select public.app_join('Dono', null, 'G') j"))[0].j.gyms[0].id
const inv = (await as('owner', "select (public.create_invite('student', $1)).code c", [gym]))[0].c
await as('aluno', 'select public.app_join($1, $2)', ['aluno', inv])
await as('other', "select public.app_join('outro', null)")

ok((await err('other', 'select public.create_reset_code($1)', [ids.aluno])) !== null, 'a stranger cannot make a code')
const r = (await as('owner', 'select public.create_reset_code($1) r', [ids.aluno]))[0].r
ok(/^[0-9A-F]{12}$/.test(r.code) && r.name === 'aluno', 'owner gets a code for the member')
ok((await err(null, 'select public.redeem_reset_code($1, $2, $3)', ['aluno@users.serie-treino.app', r.code, 'short'])) !== null, 'short password refused')
ok((await as(null, 'select public.redeem_reset_code($1, $2, $3) v', ['aluno@users.serie-treino.app', 'WRONG', 'newpassword1']))[0].v === false, 'wrong code: false')
ok((await db.query('select tries from password_resets')).rows[0].tries === 1, 'wrong code counted')
ok((await db.query('select encrypted_password from auth.users where id = $1', [ids.aluno])).rows[0].encrypted_password === 'old', 'nothing changed yet')
ok((await as(null, 'select public.redeem_reset_code($1, $2, $3) v', ['ALUNO@users.serie-treino.app', r.code.toLowerCase(), 'newpassword1']))[0].v === true, 'right code works (any case)')
const pw = (await db.query('select encrypted_password from auth.users where id = $1', [ids.aluno])).rows[0].encrypted_password
ok(pw.startsWith('$2') && (await db.query("select extensions.crypt('newpassword1', $1) = $1 m", [pw])).rows[0].m, 'password stored as bcrypt and matches')
ok((await db.query('select count(*)::int c from auth.sessions')).rows[0].c === 0, 'sessions ended')
ok((await as(null, 'select public.redeem_reset_code($1, $2, $3) v', ['aluno@users.serie-treino.app', r.code, 'newpassword2']))[0].v === false, 'a code works once')
const r2 = (await as('owner', 'select public.create_reset_code($1) r', [ids.aluno]))[0].r
for (let i = 0; i < 5; i++) await as(null, 'select public.redeem_reset_code($1, $2, $3)', ['aluno@users.serie-treino.app', 'BAD' + i, 'newpassword3'])
ok((await as(null, 'select public.redeem_reset_code($1, $2, $3) v', ['aluno@users.serie-treino.app', r2.code, 'newpassword3']))[0].v === false, 'dead after 5 wrong tries')
ok((await err('aluno', 'select * from password_resets')) !== null, 'nobody reads the codes table')
console.log(`${n} checks, ${fails} failed`)
process.exit(fails ? 1 : 0)
