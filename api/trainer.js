// Trainers (PT) and the plans they send to their students.
//
// A trainer is an ordinary profile with `trainer: true` (an admin grants it). A student is a
// profile whose `trainerId` names one: set when they sign up with a trainer's invite, or by an
// admin. The trainer builds the plan in their own app, exactly like any other plan, and sends
// it as the plan file openGym already shares between friends (frontend lib/plan-share.js). The
// server only holds it as an offer in db.json until the student accepts or dismisses it; the
// student's app parses and merges it, so nothing on the server ever writes a state document.

// A plan file is small: routines, a week schedule and the custom exercises they use.
export const MAX_PLAN_BYTES = 256 * 1024;
export const MAX_NAME = 80;

export const isTrainer = u => !!u && u.trainer === true && !u.disabled;

export const studentsOf = (db, trainer) =>
  db.users.filter(u => u.trainerId === trainer.id && u.id !== trainer.id);

export const offerFor = (db, uid) => (db.planOffers || []).find(o => o.to === uid) || null;

// Checks what a trainer sends and returns the offer to store, or { error }.
// The plan is kept as the file's JSON text: the student's app is what parses it.
export function makeOffer({ trainer, student, plan, name, now = Date.now(), id }) {
  if (!student || student.trainerId !== trainer.id) return { error: 'not your student' };
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return { error: 'plan must be a plan file' };
  if (!Array.isArray(plan.routines) || !plan.routines.length) return { error: 'the plan has no routines' };
  const raw = JSON.stringify(plan);
  if (Buffer.byteLength(raw) > MAX_PLAN_BYTES) return { error: 'the plan is too large' };
  const title = (typeof name === 'string' ? name : '').trim().slice(0, MAX_NAME) || 'Plano';
  return { offer: { id, to: student.id, from: trainer.id, name: title, plan: raw, at: new Date(now).toISOString() } };
}

// One pending offer per student: a new plan replaces one they have not opened yet.
export function putOffer(db, offer) {
  db.planOffers = (db.planOffers || []).filter(o => o.to !== offer.to);
  db.planOffers.push(offer);
}

export function dropOffer(db, uid, id) {
  const before = (db.planOffers || []).length;
  db.planOffers = (db.planOffers || []).filter(o => !(o.to === uid && o.id === id));
  return db.planOffers.length !== before;
}

// A profile leaving takes its offers and its students' links with it.
export function forgetUser(db, uid) {
  db.planOffers = (db.planOffers || []).filter(o => o.to !== uid && o.from !== uid);
  db.assessments = (db.assessments || []).filter(a => a.to !== uid);
  db.studentPlans = (db.studentPlans || []).filter(p => p.to !== uid && p.from !== uid);
  for (const u of db.users) if (u.trainerId === uid) delete u.trainerId;
}

// ---- assessments: what a trainer measured at a check-in, for the student's own history.
// Canonical units, as the app stores them: kg, cm, body fat in %. The keys are the app's built-in
// measurement fields (frontend lib/measurements.js MEASUREMENT_KEYS): kept in step by hand.
export const ASSESSMENT_KEYS = ['neck', 'shoulders', 'chest', 'waist', 'hips', 'abdomen', 'upperArmLeft', 'upperArmRight',
  'forearmLeft', 'forearmRight', 'wristLeft', 'wristRight', 'thighLeft', 'thighRight', 'calfLeft', 'calfRight',
  'ankleLeft', 'ankleRight', 'bodyFat'];
const MAX_NOTE = 500;
const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function makeAssessment({ trainer, student, date, weight, values, body, note, now = Date.now(), id }) {
  if (!student || student.trainerId !== trainer.id) return { error: 'not your student' };
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T12:00:00Z'))) return { error: 'date must be YYYY-MM-DD' };
  if (Date.parse(date + 'T00:00:00Z') > now + 86400000) return { error: 'the date is in the future' };
  const clean = {};
  if (weight != null) {
    if (!inRange(weight, 20, 400)) return { error: 'weight must be between 20 and 400 kg' };
    clean.weight = Math.round(weight * 10) / 10;
  }
  const vals = {};
  if (values != null && (typeof values !== 'object' || Array.isArray(values))) return { error: 'values must be an object' };
  for (const [k, v] of Object.entries(values || {})) {
    if (!ASSESSMENT_KEYS.includes(k)) return { error: 'unknown measurement: ' + k };
    if (v == null || v === '') continue;
    if (k === 'bodyFat' ? !inRange(v, 1, 75) : !inRange(v, 5, 250)) return { error: 'out of range: ' + k };
    vals[k] = Math.round(v * 10) / 10;
  }
  const b = cleanBody(body);
  if (b.error) return { error: b.error };
  const hasBody = Object.keys(b.body).some(k => k !== 'sex');
  if (clean.weight == null && !Object.keys(vals).length && !hasBody) return { error: 'nothing measured' };
  const n = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE) : '';
  return { assessment: { id, to: student.id, from: trainer.id, date, ...clean, values: vals, ...(Object.keys(b.body).length ? { body: b.body } : {}), ...(n ? { note: n } : {}), at: new Date(now).toISOString() } };
}

// Waiting for the student's app to fold weight and body fat into their own history.
export const assessmentsFor = (db, uid) => (db.assessments || []).filter(a => a.to === uid && !a.merged);
// Every check-in of a student, newest first: what the trainer and the student both read back.
export const assessmentHistory = (db, uid) => (db.assessments || []).filter(a => a.to === uid)
  .sort((a, b) => (b.date === a.date ? String(b.at).localeCompare(String(a.at)) : b.date.localeCompare(a.date)));

// The app merged them: they stay as the student's assessment history, only no longer pending.
export function dropAssessments(db, uid, ids) {
  const set = new Set(ids);
  let n = 0;
  for (const a of db.assessments || []) if (a.to === uid && set.has(a.id) && !a.merged) { a.merged = true; n++; }
  return n;
}

// A student keeps at most this many check-ins; the oldest merged ones go first.
export const MAX_HISTORY = 300;
export function addAssessment(db, a) {
  db.assessments = db.assessments || [];
  db.assessments.push(a);
  const mine = assessmentHistory(db, a.to);
  if (mine.length > MAX_HISTORY) {
    const drop = new Set(mine.filter(x => x.merged).slice(MAX_HISTORY - mine.length).map(x => x.id));
    db.assessments = db.assessments.filter(x => !(x.to === a.to && drop.has(x.id)));
  }
}

// The body-composition reading of a check-in (bioimpedance scale, tape, heart rate). Canonical
// units: years, cm, kcal, ml/kg/min, bpm, level, litres, %, kg. BMI, lean mass and the theoretical
// maximum heart rate are worked out from these when shown (frontend lib/body-comp.js).
export const BODY_RANGES = {
  age: [10, 100], height: [100, 230], restingKcal: [500, 5000], restingVo2: [1, 20], hrRest: [25, 140],
  visceral: [1, 60], waterL: [10, 90], waterPct: [25, 80], ecwL: [3, 45], muscleKg: [5, 90], leanKg: [10, 160]
};
function cleanBody(body) {
  if (body == null) return { body: {} };
  if (typeof body !== 'object' || Array.isArray(body)) return { error: 'body must be an object' };
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (v == null || v === '') continue;
    if (k === 'sex') { if (v !== 'm' && v !== 'f') return { error: 'sex must be m or f' }; out.sex = v; continue; }
    const r = BODY_RANGES[k];
    if (!r) return { error: 'unknown body value: ' + k };
    if (!inRange(v, r[0], r[1])) return { error: 'out of range: ' + k };
    out[k] = Math.round(v * 10) / 10;
  }
  return { body: out };
}

// ---- the trainer's plan library for one student. The trainer writes the routines; the student
// chooses which one to train on a day, or puts them on their own week. So a library plan never
// carries a schedule: the week and the programmes (which hold weekdays) are taken out here.
export const MAX_LIBRARY = 30;
export const plansFor = (db, uid) => (db.studentPlans || []).filter(p => p.to === uid)
  .sort((a, b) => String(b.updated || b.at).localeCompare(String(a.updated || a.at)));

export function makeLibraryPlan({ trainer, student, plan, name, id, now = Date.now() }) {
  const made = makeOffer({ trainer, student, plan, name, now, id });
  if (made.error) return made;
  const p = JSON.parse(made.offer.plan);
  p.week = {};
  delete p.programmes; delete p.programme_fmt;
  return { plan: { ...made.offer, plan: JSON.stringify(p), updated: made.offer.at } };
}

// Adds a plan or replaces one the same trainer wrote (same id). Returns an error string or null.
export function putLibraryPlan(db, entry) {
  db.studentPlans = db.studentPlans || [];
  const i = db.studentPlans.findIndex(p => p.id === entry.id && p.to === entry.to);
  if (i >= 0) {
    if (db.studentPlans[i].from !== entry.from) return 'not your plan';
    db.studentPlans[i] = { ...entry, at: db.studentPlans[i].at };
    return null;
  }
  if (plansFor(db, entry.to).length >= MAX_LIBRARY) return 'this student already has ' + MAX_LIBRARY + ' plans';
  db.studentPlans.push(entry);
  return null;
}

export function dropLibraryPlan(db, { trainerId, studentId, id }) {
  const before = (db.studentPlans || []).length;
  db.studentPlans = (db.studentPlans || []).filter(p => !(p.id === id && p.to === studentId && p.from === trainerId));
  return db.studentPlans.length !== before;
}

// What the trainer reads about a student's training: the latest sessions, newest first, and the
// weigh-ins. Only totals, never the notes the student wrote for themself.
export function progressOf(S, records, { sessions = 30 } = {}) {
  const ws = records(S.workouts).filter(w => w && w.d).sort((a, b) => (a.d === b.d ? (a.start || 0) - (b.start || 0) : a.d < b.d ? -1 : 1));
  const recent = ws.slice(-sessions).reverse().map(w => {
    const entries = Array.isArray(w.entries) ? w.entries : [];
    let sets = 0, volume = 0;
    for (const e of entries) for (const s of Array.isArray(e && e.sets) ? e.sets : []) {
      if (!s || s.done === false) continue;
      sets++;
      if (Number(s.w) > 0 && Number(s.r) > 0) volume += Number(s.w) * Number(s.r);
    }
    const min = w.start && w.end && w.end > w.start ? Math.round((w.end - w.start) / 60000) : null;
    return { d: w.d, name: typeof w.name === 'string' ? w.name.slice(0, 80) : '', exercises: entries.length, sets, volume: Math.round(volume), min };
  });
  const weights = records(S.bodyweight).filter(e => e && e.d && Number(e.w) > 0).sort((a, b) => a.d.localeCompare(b.d)).slice(-60).map(e => ({ d: e.d, w: Number(e.w) }));
  const since = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  return { total: ws.length, last28: ws.filter(w => w.d >= since).length, recent, weights, unit: S.unit === 'lb' ? 'lb' : 'kg' };
}
