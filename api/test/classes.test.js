import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveClass, schedule, book, myClasses, noShows, skipClass, removeClass, classList, classStart, lisbonDate, isoWeekday } from '../classes.js';

// Monday 9 Nov 2026, 10:00 in Lisbon (UTC+0 in November).
const NOW = Date.parse('2026-11-09T10:00:00Z');
const names = { o: 'Dono', p: 'PT Ana', a: 'Aluno Rui', b: 'Bia' };
const nameOf = uid => names[uid] || null;
const fresh = () => ({ users: [], visits: [] });

test('Lisbon dates and start times, summer and winter', () => {
  assert.equal(lisbonDate(Date.parse('2026-11-08T23:30:00Z')), '2026-11-08');
  assert.equal(lisbonDate(Date.parse('2026-07-08T23:30:00Z')), '2026-07-09');
  assert.equal(classStart('2026-11-09', '18:30'), Date.parse('2026-11-09T18:30:00Z'));
  assert.equal(classStart('2026-07-09', '18:30'), Date.parse('2026-07-09T17:30:00Z'));
  assert.equal(isoWeekday('2026-11-09'), 1);
});

test('the owner sets a class with its PT; members book until it is full', () => {
  const db = fresh();
  assert.equal(saveClass(db, { name: ' ', weekday: 1, starts: '18:30', minutes: 50, capacity: 2 }).error, 'bad name');
  assert.equal(saveClass(db, { name: 'X', weekday: 1, starts: '18:30', minutes: 50, capacity: 2, trainerId: 'a' }, { canTeach: u => u === 'p' }).error, 'not a trainer of this gym');
  const c = saveClass(db, { name: 'Spinning', trainerId: 'p', weekday: 1, starts: '18:30', minutes: 50, capacity: 2, room: 'Sala 1' }, { canTeach: u => u === 'p' }).class;
  assert.equal(classList(db, { nameOf })[0].trainer, 'PT Ana');
  const s = schedule(db, { uid: 'a', days: 7, now: NOW, nameOf });
  assert.equal(s.length, 1);
  assert.deepEqual([s[0].date, s[0].trainer, s[0].booked, s[0].roster], ['2026-11-09', 'PT Ana', 0, null]);
  assert.equal(book(db, { uid: 'a', id: c.id, date: '2026-11-09', on: true, now: NOW }).booked, 1);
  assert.equal(book(db, { uid: 'a', id: c.id, date: '2026-11-09', on: true, now: NOW }).booked, 1, 'twice is one place');
  assert.equal(book(db, { uid: 'b', id: c.id, date: '2026-11-09', on: true, now: NOW }).booked, 2);
  assert.equal(book(db, { uid: 'o', id: c.id, date: '2026-11-09', on: true, now: NOW }).error, 'class full');
  assert.equal(book(db, { uid: 'o', id: c.id, date: '2026-11-10', on: true, now: NOW }).error, 'no such session');
  assert.deepEqual(schedule(db, { uid: 'p', days: 7, now: NOW, nameOf })[0].roster, ['Aluno Rui', 'Bia'], 'the class PT sees who booked');
  assert.equal(myClasses(db, { uid: 'a', now: NOW, nameOf })[0].name, 'Spinning');
  assert.equal(book(db, { uid: 'b', id: c.id, date: '2026-11-09', on: false, now: NOW }).booked, 1, 'cancelling frees the place');
  assert.equal(book(db, { uid: 'a', id: c.id, date: '2026-11-09', on: false, now: Date.parse('2026-11-09T18:31:00Z') }).error, 'class started');
});

test('a called-off session takes no bookings; a removed class leaves the timetable', () => {
  const db = fresh();
  const c = saveClass(db, { name: 'Pilates', weekday: 2, starts: '07:00', minutes: 45, capacity: 10 }).class;
  skipClass(db, c.id, '2026-11-10', true);
  assert.equal(book(db, { uid: 'a', id: c.id, date: '2026-11-10', on: true, now: NOW }).error, 'class called off');
  assert.equal(schedule(db, { uid: 'a', now: NOW })[0].skipped, true);
  skipClass(db, c.id, '2026-11-10', false);
  assert.equal(book(db, { uid: 'a', id: c.id, date: '2026-11-10', on: true, now: NOW }).booked, 1);
  removeClass(db, c.id);
  assert.equal(schedule(db, { uid: 'a', now: NOW }).length, 0);
  assert.equal(myClasses(db, { uid: 'a', now: NOW }).length, 0);
});

test('no-shows: booked, the class is over, and no entry at the desk that day', () => {
  const db = fresh();
  const c = saveClass(db, { name: 'Spinning', weekday: 1, starts: '18:30', minutes: 50, capacity: 10 }).class;
  book(db, { uid: 'a', id: c.id, date: '2026-11-02', on: true, now: Date.parse('2026-11-01T10:00:00Z') });
  book(db, { uid: 'b', id: c.id, date: '2026-11-02', on: true, now: Date.parse('2026-11-01T10:00:00Z') });
  db.visits.push({ uid: 'b', in: '2026-11-02T18:20:00Z' });
  const ns = noShows(db, { days: 30, now: NOW, nameOf });
  assert.deepEqual(ns, [{ id: 'a', name: 'Aluno Rui', misses: 1, kept: 0, last: '2026-11-02', classes: ['Spinning'] }]);
});
