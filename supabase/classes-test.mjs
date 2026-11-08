// classes.sql on PGlite: the owner sets the timetable with a PT per class, members book and cancel,
// places run out, a session called off takes no bookings, and the owner sees who booked and did not come.
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
for (const f of ['schema.sql', 'app.sql', 'classes.sql', 'app.sql', 'classes.sql']) await db.exec(readFileSync(dir + '/' + f, 'utf8'))
console.log('schema.sql, app.sql and classes.sql applied (twice): OK')

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


// a timetable: a class tomorrow (Lisbon), with 2 places
const tomorrow = (await db.query("select to_char(public.lisbon_today() + 1, 'YYYY-MM-DD') d, extract(isodow from public.lisbon_today() + 1)::int w")).rows[0]
const day = tomorrow.d
const save = (who, id, name, trainer, cap, w = tomorrow.w) => as(who, "select public.save_class($1, $2, $3, $4, $5, '18:30', 50, $6, 'Sala 1') id", [gym, id, name, trainer, w, cap])
ok((await err('pt', "select public.save_class($1, null, 'X', null, 1, '18:30', 50, 5, null)", [gym])) !== null, 'a PT cannot set the timetable')
ok((await err('owner', "select public.save_class($1, null, 'X', $2, 1, '18:30', 50, 5, null)", [gym, ids.aluno])) !== null, 'the PT has to be a trainer of the gym')
const cls = (await save('owner', null, 'Spinning', ids.pt, 2))[0].id
ok(!!cls, 'the owner adds a class with its PT')
await save('owner', cls, 'Spinning', ids.pt, 2)
await as('owner', "select public.save_class($1, null, 'Pilates', $2, 1, '07:00', 45, 10, null)", [gym, ids.owner])
let sch = (await as('aluno', 'select public.class_schedule($1, 7) s', [gym]))[0].s
const sess = sch.find(x => x.id === cls)
ok(sess && sess.date === day && sess.trainer === 'PT Ana' && sess.capacity === 2 && sess.booked === 0 && sess.mine === false && sess.roster === null, 'a member sees the session, its PT and places, but not who booked')
ok(sch.some(x => x.name === 'Pilates'), 'the owner can give a class themselves')
const tt = (await as('owner', 'select public.gym_class_list($1) l', [gym]))[0].l
ok(tt.length === 2 && tt.some(c => c.name === 'Spinning' && c.trainer === 'PT Ana' && c.starts === '18:30' && c.room === 'Sala 1'), 'the owner reads the weekly timetable')
ok((await err('pt', 'select public.gym_class_list($1)', [gym])) !== null, 'only the owner edits it')
ok((await err('other', 'select public.class_schedule($1, 7)', [gym])) !== null, 'another gym sees nothing')

// booking
const book = (who, on) => as(who, 'select public.book_class($1, $2, $3) r', [cls, day, on])
ok((await book('aluno', true))[0].r.booked === 1, 'a member books')
ok((await book('aluno', true))[0].r.booked === 1, 'booking twice keeps one place')
ok((await book('pt', true))[0].r.booked === 2, 'a PT can book too')
ok((await err('owner', 'select public.book_class($1, $2, true)', [cls, day])) !== null, 'no place left')
ok((await err('other', 'select public.book_class($1, $2, true)', [cls, day])) !== null, 'a stranger cannot book')
ok((await err('aluno', 'select public.book_class($1, public.lisbon_today() + 2, true)', [cls])) !== null, 'not on a day without the class')
const deskInv = (await as('owner', "select (public.create_invite('desk', $1)).code c", [gym]))[0].c
await as('desk', 'select public.app_join($1, $2)', ['Receção', deskInv])
ok((await err('desk', 'select public.book_class($1, $2, true)', [cls, day])) !== null, 'the front desk account does not book')
sch = (await as('pt', 'select public.class_schedule($1, 7) s', [gym]))[0].s
ok(JSON.stringify(sch.find(x => x.id === cls).roster) === JSON.stringify(['Aluno Rui', 'PT Ana']), 'the class PT sees who booked')
ok((await as('aluno', 'select public.my_classes() m'))[0].m[0].name === 'Spinning', 'the member sees their booking')
ok((await book('pt', false))[0].r.booked === 1, 'cancelling frees the place')
ok((await book('owner', true))[0].r.booked === 2, 'and someone else takes it')
ok((await err('aluno', 'select count(*)::int c from class_bookings')) !== null, 'the tables are read only through the functions')

// a session called off takes no bookings
await save('owner', cls, 'Spinning', ids.pt, 10)
await as('owner', 'select public.skip_class($1, $2, true)', [cls, day])
ok((await err('pt', 'select public.book_class($1, $2, true)', [cls, day])) !== null, 'a called-off session takes no bookings')
ok((await as('aluno', 'select public.class_schedule($1, 7) s', [gym]))[0].s.find(x => x.id === cls).skipped === true, 'members see it is called off')
ok((await err('aluno', 'select public.skip_class($1, $2, true)', [cls, day])) !== null, 'only the owner calls one off')
await as('owner', 'select public.skip_class($1, $2, false)', [cls, day])
ok((await as('pt', 'select public.book_class($1, $2, true) r', [cls, day]))[0].r.booked === 3, 'back on, it takes bookings again')

// no-shows: last week the student booked and did not come, the PT booked and came
const past = (await db.query("select to_char(public.lisbon_today() - 7, 'YYYY-MM-DD') d")).rows[0].d
await db.query('insert into class_bookings (class_id, on_date, user_id) values ($1, $2, $3), ($1, $2, $4)', [cls, past, ids.aluno, ids.pt])
await db.query("insert into visits (gym_id, user_id, in_at, out_at) values ($1, $2, (($3::date + time '18:20') at time zone 'Europe/Lisbon'), (($3::date + time '19:40') at time zone 'Europe/Lisbon'))", [gym, ids.pt, past])
const ns = (await as('owner', 'select public.class_no_shows($1, 30) n', [gym]))[0].n
ok(ns.length === 1 && ns[0].name === 'Aluno Rui' && ns[0].misses === 1 && ns[0].last === past && ns[0].classes[0] === 'Spinning', 'the owner sees who booked and did not come')
ok((await err('pt', 'select public.class_no_shows($1, 30)', [gym])) !== null, 'only the owner sees the no-shows')

// a class taken off the timetable
await as('owner', 'select public.remove_class($1, $2)', [gym, cls])
ok(!(await as('aluno', 'select public.class_schedule($1, 7) s', [gym]))[0].s.some(x => x.id === cls), 'a removed class leaves the timetable')
ok((await as('aluno', 'select public.my_classes() m'))[0].m.length === 0, 'and the bookings list')
ok((await as('owner', 'select public.class_no_shows($1, 30) n', [gym]))[0].n.length === 1, 'its past no-shows stay')

console.log(`${n} checks, ${fails} failed`)
process.exit(fails ? 1 : 0)
