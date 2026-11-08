// Group classes for the local server (Série): the same rules as supabase/classes.sql, on db.json.
// The owner sets a weekly timetable (each class with its PT and its places), members book a session
// ahead and can cancel until it starts, and the owner sees who booked and did not come (no entry at
// the front desk that day). Dates and times are Lisbon's.

const TZ = 'Europe/Lisbon';
const DAY = 86400000;

/** "YYYY-MM-DD" in Lisbon for a moment. */
export const lisbonDate = (now = Date.now()) => new Date(now).toLocaleDateString('en-CA', { timeZone: TZ });

// Lisbon's offset from UTC at a moment, in ms.
function offsetAt(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
/** When a session starts: a Lisbon date and "HH:MM", as epoch ms. */
export function classStart(date, starts) {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = starts.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  return guess - offsetAt(guess - offsetAt(guess));
}
/** ISO weekday (1 Monday … 7 Sunday) of a "YYYY-MM-DD" date. */
export const isoWeekday = date => { const w = new Date(date + 'T12:00:00Z').getUTCDay(); return w === 0 ? 7 : w; };
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);

function lists(db) {
  db.gymClasses = db.gymClasses || [];
  db.classBookings = db.classBookings || [];
  db.classSkips = db.classSkips || [];
  return db;
}
const live = (b, id, date) => b.classId === id && b.date === date && !b.cancelled;
const skipped = (db, id, date) => db.classSkips.some(s => s.classId === id && s.date === date);

/** Checks a class; null when it is fine, else what is wrong. */
export function classProblem(c) {
  if (!String(c?.name || '').trim() || String(c.name).trim().length > 60) return 'name';
  if (!(Number.isInteger(c.weekday) && c.weekday >= 1 && c.weekday <= 7)) return 'weekday';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.starts || ''))) return 'starts';
  if (!(Number.isInteger(c.minutes) && c.minutes >= 10 && c.minutes <= 240)) return 'minutes';
  if (!(Number.isInteger(c.capacity) && c.capacity >= 1 && c.capacity <= 500)) return 'capacity';
  if (c.room != null && String(c.room).length > 40) return 'room';
  return null;
}

/** Adds (no id) or changes a class. `canTeach(uid)` says whether that person may give it. */
export function saveClass(db, body, { canTeach = () => true, newId } = {}) {
  lists(db);
  const c = { name: String(body.name || '').trim(), trainerId: body.trainerId || null, weekday: +body.weekday, starts: String(body.starts || ''),
    minutes: +body.minutes, capacity: +body.capacity, room: String(body.room || '').trim() || null };
  const bad = classProblem(c);
  if (bad) return { error: 'bad ' + bad };
  if (c.trainerId && !canTeach(c.trainerId)) return { error: 'not a trainer of this gym' };
  if (body.id) {
    const old = db.gymClasses.find(x => x.id === body.id && x.active);
    if (!old) return { error: 'no such class' };
    Object.assign(old, c);
    return { class: old };
  }
  const row = { id: newId || 'k' + Math.random().toString(36).slice(2, 12), ...c, active: true, created: new Date().toISOString() };
  db.gymClasses.push(row);
  return { class: row };
}

export function removeClass(db, id) {
  const c = lists(db).gymClasses.find(x => x.id === id);
  if (!c) return false;
  c.active = false;
  return true;
}

export function skipClass(db, id, date, skip) {
  lists(db);
  if (!db.gymClasses.some(c => c.id === id)) return false;
  db.classSkips = db.classSkips.filter(s => !(s.classId === id && s.date === date));
  if (skip) db.classSkips.push({ classId: id, date });
  return true;
}

/** The owner's weekly timetable. */
export function classList(db, { nameOf = () => null } = {}) {
  return lists(db).gymClasses.filter(c => c.active)
    .map(c => ({ id: c.id, name: c.name, trainerId: c.trainerId, trainer: c.trainerId ? nameOf(c.trainerId) : null, weekday: c.weekday, starts: c.starts, minutes: c.minutes, capacity: c.capacity, room: c.room }))
    .sort((a, b) => a.weekday - b.weekday || a.starts.localeCompare(b.starts) || a.name.localeCompare(b.name));
}

/** The sessions from today for `days` days. `owner` and the class's PT also get who booked. */
export function schedule(db, { uid, owner = false, days = 7, now = Date.now(), nameOf = () => null }) {
  lists(db);
  const today = lisbonDate(now);
  const out = [];
  for (let i = 0; i < Math.min(Math.max(days, 1), 28); i++) {
    const date = addDays(today, i);
    for (const c of db.gymClasses) {
      if (!c.active || c.weekday !== isoWeekday(date)) continue;
      const start = classStart(date, c.starts);
      if (start + c.minutes * 60000 <= now) continue;
      const booked = db.classBookings.filter(b => live(b, c.id, date)).sort((a, b) => a.at.localeCompare(b.at));
      out.push({ id: c.id, date, name: c.name, room: c.room, starts: c.starts, minutes: c.minutes, capacity: c.capacity,
        trainer: c.trainerId ? nameOf(c.trainerId) : null, trainerId: c.trainerId, weekday: c.weekday,
        booked: booked.length, mine: booked.some(b => b.uid === uid), skipped: skipped(db, c.id, date), started: start <= now,
        roster: owner || (c.trainerId && c.trainerId === uid) ? booked.map(b => nameOf(b.uid)) : null });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.starts.localeCompare(b.starts) || a.name.localeCompare(b.name));
}

/** Books (on) or cancels a place, as book_class does. */
export function book(db, { uid, id, date, on, now = Date.now() }) {
  lists(db);
  const c = db.gymClasses.find(x => x.id === id && x.active);
  if (!c) return { error: 'no such class' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || isoWeekday(date) !== c.weekday || date > addDays(lisbonDate(now), 28)) return { error: 'no such session' };
  if (classStart(date, c.starts) <= now) return { error: 'class started' };
  const mine = db.classBookings.find(b => b.classId === id && b.date === date && b.uid === uid);
  if (on) {
    if (skipped(db, id, date)) return { error: 'class called off' };
    if (!(mine && !mine.cancelled)) {
      if (db.classBookings.filter(b => live(b, id, date)).length >= c.capacity) return { error: 'class full' };
      if (mine) { mine.cancelled = null; mine.at = new Date(now).toISOString(); }
      else db.classBookings.push({ classId: id, date, uid, at: new Date(now).toISOString(), cancelled: null });
    }
  } else if (mine && !mine.cancelled) mine.cancelled = new Date(now).toISOString();
  return { booked: db.classBookings.filter(b => live(b, id, date)).length, mine: !!on };
}

/** The person's bookings still to come. */
export function myClasses(db, { uid, now = Date.now(), nameOf = () => null, gym = null }) {
  lists(db);
  return db.classBookings.filter(b => b.uid === uid && !b.cancelled).map(b => {
    const c = db.gymClasses.find(x => x.id === b.classId);
    if (!c || !c.active || classStart(b.date, c.starts) + c.minutes * 60000 <= now) return null;
    return { id: c.id, date: b.date, name: c.name, starts: c.starts, minutes: c.minutes, room: c.room, trainer: c.trainerId ? nameOf(c.trainerId) : null, gym, skipped: skipped(db, c.id, b.date) };
  }).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.starts.localeCompare(b.starts));
}

/** Who booked in the last `days` days and did not come (no visit that Lisbon day), most misses first. */
export function noShows(db, { days = 30, now = Date.now(), nameOf = () => null }) {
  lists(db);
  const from = addDays(lisbonDate(now), -Math.min(Math.max(days, 1), 365));
  const came = (uid, date) => (db.visits || []).some(v => v.uid === uid && lisbonDate(Date.parse(v.in)) === date);
  const by = new Map();
  for (const b of db.classBookings) {
    if (b.cancelled || b.date < from || skipped(db, b.classId, b.date)) continue;
    const c = db.gymClasses.find(x => x.id === b.classId);
    if (!c || classStart(b.date, c.starts) + c.minutes * 60000 > now) continue;
    const p = by.get(b.uid) || { id: b.uid, name: nameOf(b.uid), misses: 0, kept: 0, last: null, classes: [] };
    if (came(b.uid, b.date)) p.kept++;
    else {
      p.misses++;
      if (!p.last || b.date > p.last) p.last = b.date;
      if (!p.classes.includes(c.name)) p.classes.push(c.name);
    }
    by.set(b.uid, p);
  }
  return [...by.values()].filter(p => p.misses > 0).sort((a, b) => b.misses - a.misses || String(b.last).localeCompare(String(a.last)));
}

/** Everything of a profile, for account deletion. */
export function forgetClasses(db, uid) {
  lists(db);
  db.classBookings = db.classBookings.filter(b => b.uid !== uid);
  for (const c of db.gymClasses) if (c.trainerId === uid) c.trainerId = null;
}
