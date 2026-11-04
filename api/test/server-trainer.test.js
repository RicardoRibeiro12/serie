/* Trainers (trainer.js): an admin makes a profile a trainer, the trainer's invite makes its
   profile their student, the trainer sends a plan file, and the student fetches it once and
   clears it. Nobody else sees or sends anything. Same harness as server-email.test.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boundPort } from './helpers.mjs';
import { makeOffer, putOffer, dropOffer, forgetUser, MAX_PLAN_BYTES } from '../trainer.js';

const API = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = crypto.randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:8080';

const mintSession = (uid, sv = 0) => {
  const payload = `${uid}:${Date.now() + 86400000}:${sv}`;
  return 'gymsid=' + payload + '.' + crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
};

async function startServer(t, { users = [] } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-pt-'));
  fs.writeFileSync(path.join(dataDir, 'secret'), SECRET, { mode: 0o600 });
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ users, creds: [], subs: [], invites: [] }));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: API, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '0', DATA_DIR: dataDir, ORIGIN, RP_ID: 'localhost', PASSWORD_LOGIN: '1', TRUST_PROXY: '1', INVITE_ONLY: '', ADMIN_UIDS: '' }
  });
  const h = { log: '' };
  child.stdout.on('data', d => h.log += d);
  child.stderr.on('data', d => h.log += d);
  t.after(() => { child.kill('SIGKILL'); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const api = `http://127.0.0.1:${await boundPort(child, () => h.log)}`;
  h.req = async (method, p, { body, as } = {}) => {
    const r = await fetch(api + p, {
      method,
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', ...(as ? { Cookie: mintSession(as) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: r.status, body: await r.json() };
  };
  h.db = () => JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  return h;
}

const user = (id, name, extra = {}) => ({ id, name, created: new Date().toISOString(), ...extra });
const PLAN = { app: 'opengym', fmt: 1, unit: 'kg', routines: [{ id: 'r1', name: 'Treino A', exercises: [] }], days: {} };

test('makeOffer only takes a plan file for the trainer\'s own student, within the size cap', () => {
  const trainer = { id: 't' };
  const student = { id: 's', trainerId: 't' };
  assert.equal(makeOffer({ trainer, student: { id: 'x' }, plan: PLAN, id: '1' }).error, 'not your student');
  assert.equal(makeOffer({ trainer, student, plan: [], id: '1' }).error, 'plan must be a plan file');
  assert.equal(makeOffer({ trainer, student, plan: { routines: [] }, id: '1' }).error, 'the plan has no routines');
  const big = { routines: [{ name: 'x'.repeat(MAX_PLAN_BYTES) }] };
  assert.equal(makeOffer({ trainer, student, plan: big, id: '1' }).error, 'the plan is too large');
  const { offer } = makeOffer({ trainer, student, plan: PLAN, name: '  Hipertrofia  ', id: '1', now: 0 });
  assert.deepEqual(offer, { id: '1', to: 's', from: 't', name: 'Hipertrofia', plan: JSON.stringify(PLAN), at: '1970-01-01T00:00:00.000Z' });
});

test('one offer per student; dropping and forgetting clean up', () => {
  const db = { users: [{ id: 't', trainer: true }, { id: 's', trainerId: 't' }] };
  putOffer(db, { id: '1', to: 's', from: 't' });
  putOffer(db, { id: '2', to: 's', from: 't' });
  assert.deepEqual(db.planOffers.map(o => o.id), ['2']);
  assert.equal(dropOffer(db, 'other', '2'), false);
  assert.equal(dropOffer(db, 's', '2'), true);
  putOffer(db, { id: '3', to: 's', from: 't' });
  forgetUser(db, 't');
  assert.deepEqual(db.planOffers, []);
  assert.equal(db.users[1].trainerId, undefined);
});

test('a trainer invites a student, sends a plan, and the student takes it', async t => {
  const h = await startServer(t, { users: [user('adm', 'Admin', { admin: true, owner: true }), user('pt', 'Pat'), user('other', 'Other')] });

  // Not a trainer yet: refused.
  assert.equal((await h.req('GET', '/api/trainer/students', { as: 'pt' })).status, 403);
  // Only an admin grants the role.
  assert.equal((await h.req('POST', '/api/admin/user/trainer', { as: 'other', body: { id: 'pt', trainer: true } })).status, 403);
  const grant = await h.req('POST', '/api/admin/user/trainer', { as: 'adm', body: { id: 'pt', trainer: true } });
  assert.equal(grant.status, 200);
  assert.equal(grant.body.trainer, true);
  assert.equal((await h.req('GET', '/api/me', { as: 'pt' })).body.user.trainer, true);

  // The trainer's invite links whoever signs up with it.
  const inv = await h.req('POST', '/api/trainer/invites/new', { as: 'pt', body: { note: 'Ricardo' } });
  assert.equal(inv.status, 200);
  const signup = await h.req('POST', '/api/register/password', { body: { name: 'Ricardo1', password: 'a long enough password', code: inv.body.invite.code } });
  assert.equal(signup.status, 200, JSON.stringify(signup.body));
  const ricardo = h.db().users.find(u => u.name === 'Ricardo1');
  assert.equal(ricardo.trainerId, 'pt');

  const list = await h.req('GET', '/api/trainer/students', { as: 'pt' });
  assert.deepEqual(list.body.students.map(s => s.name), ['Ricardo1']);

  // Not their student: refused. Their student: stored.
  assert.equal((await h.req('POST', '/api/trainer/plan', { as: 'pt', body: { studentId: 'other', plan: PLAN } })).status, 404);
  const sent = await h.req('POST', '/api/trainer/plan', { as: 'pt', body: { studentId: ricardo.id, plan: PLAN, name: 'Hipertrofia' } });
  assert.equal(sent.status, 200);
  assert.equal((await h.req('GET', '/api/trainer/students', { as: 'pt' })).body.students[0].pending.name, 'Hipertrofia');

  // Someone else sees nothing; the student sees the plan, then clears it.
  assert.equal((await h.req('GET', '/api/plan-offer', { as: 'other' })).body.offer, null);
  const got = await h.req('GET', '/api/plan-offer', { as: ricardo.id });
  assert.equal(got.body.offer.from, 'Pat');
  assert.deepEqual(got.body.offer.plan, PLAN);
  assert.equal((await h.req('POST', '/api/plan-offer/done', { as: 'other', body: { id: sent.body.id } })).status, 404);
  assert.equal((await h.req('POST', '/api/plan-offer/done', { as: ricardo.id, body: { id: sent.body.id } })).status, 200);
  assert.equal((await h.req('GET', '/api/plan-offer', { as: ricardo.id })).body.offer, null);
});

test('makeAssessment takes canonical numbers for the trainer\'s own student and nothing else', async () => {
  const { makeAssessment } = await import('../trainer.js');
  const trainer = { id: 't' }, student = { id: 's', trainerId: 't' }, now = Date.parse('2026-11-04T10:00:00Z');
  const ok = makeAssessment({ trainer, student, date: '2026-11-03', weight: 78.44, values: { waist: 84, bodyFat: 18.2, chest: '' }, note: ' ok ', now, id: 'a' });
  assert.deepEqual(ok.assessment, { id: 'a', to: 's', from: 't', date: '2026-11-03', weight: 78.4, values: { waist: 84, bodyFat: 18.2 }, note: 'ok', at: '2026-11-04T10:00:00.000Z' });
  assert.equal(makeAssessment({ trainer, student: { id: 'x' }, date: '2026-11-03', weight: 80, now }).error, 'not your student');
  assert.equal(makeAssessment({ trainer, student, date: '2026-13-40', weight: 80, now }).error, 'date must be YYYY-MM-DD');
  assert.equal(makeAssessment({ trainer, student, date: '2027-01-01', weight: 80, now }).error, 'the date is in the future');
  assert.equal(makeAssessment({ trainer, student, date: '2026-11-03', weight: '80', now }).error, 'weight must be between 20 and 400 kg');
  assert.equal(makeAssessment({ trainer, student, date: '2026-11-03', values: { __proto__: null, constructor: 5 }, now }).error, 'unknown measurement: constructor');
  assert.equal(makeAssessment({ trainer, student, date: '2026-11-03', values: { bodyFat: 90 }, now }).error, 'out of range: bodyFat');
  assert.equal(makeAssessment({ trainer, student, date: '2026-11-03', now }).error, 'nothing measured');
});

test('a trainer records a check-in and only that student\'s app receives it, once', async t => {
  const h = await startServer(t, { users: [user('pt', 'Pat', { trainer: true }), user('s1', 'Sam', { trainerId: 'pt' }), user('o', 'Other')] });
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await h.req('POST', '/api/trainer/assessment', { as: 'o', body: { studentId: 's1', date: today, weight: 80 } })).status, 403);
  assert.equal((await h.req('POST', '/api/trainer/assessment', { as: 'pt', body: { studentId: 'o', date: today, weight: 80 } })).status, 404);
  const sent = await h.req('POST', '/api/trainer/assessment', { as: 'pt', body: { studentId: 's1', date: today, weight: 80, values: { waist: 82 } } });
  assert.equal(sent.status, 200);
  assert.equal((await h.req('GET', '/api/trainer/students', { as: 'pt' })).body.students[0].pendingAssessments, 1);
  assert.deepEqual((await h.req('GET', '/api/assessments', { as: 'o' })).body.assessments, []);
  const got = await h.req('GET', '/api/assessments', { as: 's1' });
  assert.equal(got.body.assessments[0].from, 'Pat');
  assert.equal((await h.req('POST', '/api/assessments/done', { as: 'o', body: { ids: [sent.body.id] } })).body.removed, 0);
  assert.equal((await h.req('POST', '/api/assessments/done', { as: 's1', body: { ids: [sent.body.id] } })).body.removed, 1);
  assert.deepEqual((await h.req('GET', '/api/assessments', { as: 's1' })).body.assessments, []);
});
