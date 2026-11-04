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

export function makeAssessment({ trainer, student, date, weight, values, note, now = Date.now(), id }) {
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
  if (clean.weight == null && !Object.keys(vals).length) return { error: 'nothing measured' };
  const n = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE) : '';
  return { assessment: { id, to: student.id, from: trainer.id, date, ...clean, values: vals, ...(n ? { note: n } : {}), at: new Date(now).toISOString() } };
}

export const assessmentsFor = (db, uid) => (db.assessments || []).filter(a => a.to === uid);

export function dropAssessments(db, uid, ids) {
  const set = new Set(ids);
  const before = (db.assessments || []).length;
  db.assessments = (db.assessments || []).filter(a => !(a.to === uid && set.has(a.id)));
  return before - db.assessments.length;
}
