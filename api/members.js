// Membership cards and gym entries/exits (check-in / check-out).
//
// An admin (the gym's owner or staff) issues a card to a profile. The card has a short member
// number people can read ("S-000042") and a random code that only lives in the QR: the desk scans
// the QR and the server looks the code up, so a number copied off someone's card opens nothing.
// Reissuing a card gives it a new code; the old QR stops working at once.
//
// A visit is one entry and, later, its exit, both made by the front desk scanning the card (a scan
// toggles: in if they are out, out if they are in). Whoever is still in when the day ends is checked
// out at its last minute, marked `auto`: nobody stays "in the gym" overnight because they walked
// out past the desk. Days are the server's local days (TZ, Europe/Lisbon for a Portuguese gym).
export const KEEP_DAYS = 400;
export const STATUSES = ['active', 'suspended'];

export const cardOf = (db, uid) => (db.memberCards || []).find(c => c.uid === uid) || null;
export const cardByCode = (db, code) => (typeof code === 'string' && code ? (db.memberCards || []).find(c => c.code === code) : null) || null;

// The QR's text: a prefix so the desk can tell our cards from any other code it is shown.
export const QR_PREFIX = 'SERIE1:';
export const qrText = card => QR_PREFIX + card.code;
export const codeFromQr = text => (typeof text === 'string' && text.startsWith(QR_PREFIX) ? text.slice(QR_PREFIX.length).trim() : '');

export function issueCard(db, { uid, code, now = Date.now() }) {
  db.memberCards = db.memberCards || [];
  const existing = cardOf(db, uid);
  if (existing) {
    existing.code = code;
    existing.reissued = new Date(now).toISOString();
    return existing;
  }
  db.cardSeq = (db.cardSeq || 0) + 1;
  const card = { id: 'c' + db.cardSeq, uid, number: 'S-' + String(db.cardSeq).padStart(6, '0'), code, status: 'active', created: new Date(now).toISOString() };
  db.memberCards.push(card);
  return card;
}

export function setCardStatus(db, uid, status) {
  if (!STATUSES.includes(status)) return { error: 'status must be active or suspended' };
  const card = cardOf(db, uid);
  if (!card) return { error: 'no card' };
  card.status = status;
  return { card };
}

// The last moment of the local day ms falls in.
export const endOfDay = ms => { const d = new Date(ms); d.setHours(23, 59, 59, 0); return d.getTime(); };

// Visits, with the ones left open on an earlier day closed. Mutates db.visits; returns true when
// something changed.
export function closeStale(db, now = Date.now()) {
  let changed = false;
  for (const v of db.visits || []) {
    const end = endOfDay(Date.parse(v.in));
    if (!v.out && now > end) {
      v.out = new Date(end).toISOString();
      v.auto = true;
      changed = true;
    }
  }
  const cut = new Date(now - KEEP_DAYS * 86400000).toISOString();
  const before = (db.visits || []).length;
  db.visits = (db.visits || []).filter(v => v.in >= cut);
  return changed || db.visits.length !== before;
}

export const openVisit = (db, uid) => (db.visits || []).find(v => v.uid === uid && !v.out) || null;

// dir: 'in', 'out' or 'toggle' (the desk). Refuses a suspended card, and a double check-in.
export function checkInOut(db, { uid, dir, by, now = Date.now(), id }) {
  const card = cardOf(db, uid);
  if (!card) return { error: 'no card' };
  if (card.status !== 'active') return { error: 'card suspended' };
  closeStale(db, now);
  const open = openVisit(db, uid);
  const want = dir === 'toggle' ? (open ? 'out' : 'in') : dir;
  if (want === 'in') {
    if (open) return { error: 'already checked in', visit: open };
    const visit = { id, uid, in: new Date(now).toISOString(), by };
    db.visits = db.visits || [];
    db.visits.push(visit);
    return { visit, dir: 'in' };
  }
  if (want === 'out') {
    if (!open) return { error: 'not checked in' };
    open.out = new Date(now).toISOString();
    if (by !== open.by) open.outBy = by;
    return { visit: open, dir: 'out' };
  }
  return { error: 'dir must be in, out or toggle' };
}

// The admin's view: who is in now, the visits of the last `days` days (newest first) and the
// entries per day, for the chart. Names come from `nameOf`.
export function visitReport(db, { days = 14, now = Date.now(), nameOf = () => null } = {}) {
  closeStale(db, now);
  const since = new Date(now - days * 86400000).toISOString();
  const list = (db.visits || []).filter(v => v.in >= since).sort((a, b) => b.in.localeCompare(a.in));
  const perDay = {};
  for (let i = days - 1; i >= 0; i--) perDay[new Date(now - i * 86400000).toISOString().slice(0, 10)] = 0;
  for (const v of list) { const d = v.in.slice(0, 10); if (d in perDay) perDay[d]++; }
  const mins = list.filter(v => v.out && !v.auto).map(v => (Date.parse(v.out) - Date.parse(v.in)) / 60000);
  return {
    present: list.filter(v => !v.out).map(v => ({ uid: v.uid, name: nameOf(v.uid), in: v.in })),
    visits: list.slice(0, 500).map(v => ({ id: v.id, uid: v.uid, name: nameOf(v.uid), in: v.in, out: v.out || null, auto: !!v.auto, by: v.by })),
    perDay: Object.entries(perDay).map(([d, n]) => ({ d, n })),
    members: new Set(list.map(v => v.uid)).size,
    avgMin: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null
  };
}

export function forgetMember(db, uid) {
  db.memberCards = (db.memberCards || []).filter(c => c.uid !== uid);
  db.visits = (db.visits || []).filter(v => v.uid !== uid);
}
