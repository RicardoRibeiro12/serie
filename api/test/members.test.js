import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueCard, cardByCode, setCardStatus, checkInOut, visitReport, closeStale, qrText, codeFromQr, MAX_VISIT_MS } from '../members.js';

const fresh = () => ({ users: [], memberCards: [], visits: [] });
const T0 = Date.parse('2026-11-05T08:00:00Z');

test('a card gets a readable number and a QR code; reissuing changes only the code', () => {
  const db = fresh();
  const c = issueCard(db, { uid: 'u1', code: 'abc', now: T0 });
  assert.equal(c.number, 'S-000001');
  assert.equal(codeFromQr(qrText(c)), 'abc');
  issueCard(db, { uid: 'u1', code: 'xyz', now: T0 });
  assert.equal(db.memberCards.length, 1);
  assert.equal(cardByCode(db, 'abc'), null);
  assert.equal(cardByCode(db, 'xyz').uid, 'u1');
  assert.equal(codeFromQr('some other code'), '');
});

test('check-in, no double entry, check-out; the desk toggles', () => {
  const db = fresh();
  issueCard(db, { uid: 'u1', code: 'a', now: T0 });
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'in', by: 'self', now: T0, id: 'v1' }).dir, 'in');
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'in', by: 'self', now: T0 + 1000, id: 'v2' }).error, 'already checked in');
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'toggle', by: 'desk', now: T0 + 3600000 }).dir, 'out');
  assert.equal(db.visits[0].outBy, 'desk');
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'out', by: 'self', now: T0 + 3700000 }).error, 'not checked in');
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'toggle', by: 'desk', now: T0 + 7200000, id: 'v3' }).dir, 'in');
});

test('a suspended card or no card opens nothing', () => {
  const db = fresh();
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'in', by: 'self', now: T0 }).error, 'no card');
  issueCard(db, { uid: 'u1', code: 'a', now: T0 });
  setCardStatus(db, 'u1', 'suspended');
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'in', by: 'self', now: T0 }).error, 'card suspended');
  assert.ok(setCardStatus(db, 'u1', 'bogus').error);
});

test('a forgotten check-out closes itself after the limit', () => {
  const db = fresh();
  issueCard(db, { uid: 'u1', code: 'a', now: T0 });
  checkInOut(db, { uid: 'u1', dir: 'in', by: 'self', now: T0, id: 'v1' });
  assert.equal(closeStale(db, T0 + MAX_VISIT_MS + 1), true);
  assert.equal(db.visits[0].auto, true);
  assert.equal(checkInOut(db, { uid: 'u1', dir: 'in', by: 'self', now: T0 + MAX_VISIT_MS + 2, id: 'v2' }).dir, 'in');
});

test('the report counts entries per day, who is in, and the average stay', () => {
  const db = fresh();
  issueCard(db, { uid: 'u1', code: 'a', now: T0 });
  issueCard(db, { uid: 'u2', code: 'b', now: T0 });
  checkInOut(db, { uid: 'u1', dir: 'in', by: 'self', now: T0, id: 'v1' });
  checkInOut(db, { uid: 'u1', dir: 'out', by: 'self', now: T0 + 90 * 60000 });
  checkInOut(db, { uid: 'u2', dir: 'in', by: 'desk', now: T0 + 60000, id: 'v2' });
  const r = visitReport(db, { days: 7, now: T0 + 2 * 3600000, nameOf: u => u.toUpperCase() });
  assert.equal(r.perDay.length, 7);
  assert.equal(r.perDay.at(-1).n, 2);
  assert.deepEqual(r.present.map(p => p.name), ['U2']);
  assert.equal(r.avgMin, 90);
  assert.equal(r.members, 2);
});
