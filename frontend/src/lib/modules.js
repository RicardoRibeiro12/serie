// Modules (v1.4.4, Settings → Modules): whole feature areas switched on and off, so the app can
// be just a training log or the whole thing. Discord (seals187, Shadowbyte): "it's important not
// to overload the app with 1000 functions and settings", "like a plugin system where you can
// enable, disable plugins". These are built-in parts of the app, not third-party plugins.
//
// THE RULES
//   - One source of truth: every view asks isOn(S, id), never S.modules directly.
//   - S.modules is { [id]: boolean }, only the choices someone made. A missing key is on, so a
//     profile from before 1.4.4 keeps every surface it had. The one exception is the gym check-in,
//     which had a switch of its own before (S.checkIn): until Modules decides, that one does.
//   - Off hides the module's surfaces (cards, Stats parts, Settings pages and rows, search hits,
//     notifications, widget fields) and pauses what it would send (health sync, the watch, the
//     webhooks, scheduled Coach reviews). It never deletes anything: switched back on, it is all
//     there, and the paused syncs catch up.
//   - The Coach and the MCP server read the data whatever the modules say: hiding is about the
//     screen, the data is the same (docs/MODULES.md).
//   - S.modules syncs per key (lib/sync-merge.js PER_KEY and api/sync-stamps.js), so switching
//     Body off on the phone and Seasonal off on the laptop keeps both.
//
// The core (logging, plans, history, the exercise library, the basic stats) is not a module.
// Pure: no imports, so lib/ helpers such as history.js effortOf can use it without a cycle.

/* `title` and `desc` are English keys, translated where they are shown. Order is the page's. */
export const MODULES = [
  { id: 'effort', group: 'training', icon: 'gauge', tint: 'var(--purple)', title: 'Effort',
    desc: 'Rate each set in RIR or RPE, and see in Stats how hard you really push.' },
  { id: 'plates', group: 'training', icon: 'plate', tint: 'var(--orange)', title: 'Plates and warm-ups',
    desc: 'The plates to load under every set, and warm-ups that build themselves.' },
  { id: 'strength', group: 'training', icon: 'medal', tint: 'var(--yellow)', title: 'Strength levels',
    desc: 'Beginner to Elite for your main lifts, measured against your body weight.' },
  { id: 'videos', group: 'training', icon: 'camera', tint: 'var(--teal)', title: 'Form videos',
    desc: 'Film a set and watch it back right under the row.' },
  { id: 'watch', group: 'training', icon: 'watch', tint: 'var(--grey)', title: 'Watch',
    desc: 'Log sets from your wrist on an Apple Watch, Wear OS or Zepp watch.' },
  { id: 'checkin', group: 'training', icon: 'qr', tint: 'var(--blue)', title: 'Gym check-in',
    desc: 'Your membership codes on Home, and NFC stickers that start a workout.' },
  { id: 'body', group: 'body', icon: 'scale', tint: 'var(--teal)', title: 'Body',
    desc: 'Weigh-ins, measurements, progress photos and your weight goal.' },
  { id: 'health', group: 'body', icon: 'heart', tint: 'var(--red)', title: 'Health',
    desc: 'Apple Health or Health Connect, heart rate and recovery tips.' },
  { id: 'motivation', group: 'extras', icon: 'flame', tint: 'var(--orange)', title: 'Motivation',
    desc: 'Streaks, challenges, badges, recaps and your year in openGym.' },
  { id: 'coach', group: 'extras', icon: 'sparkles', tint: 'var(--green)', title: 'AI Coach',
    desc: 'Reviews your training and suggests changes. You still say yes or no.' },
  { id: 'integrations', group: 'extras', icon: 'webhook', tint: 'var(--indigo)', title: 'Integrations',
    desc: 'Webhooks for Home Assistant and friends, and the MCP server.' },
  { id: 'seasonal', group: 'extras', icon: 'pumpkin', tint: 'var(--orange)', title: 'Seasonal themes',
    desc: 'Halloween, Christmas and the advent calendar. Spooky, festive, optional.' },
]
export const MODULE_IDS = MODULES.map(m => m.id)
export const MODULE = Object.fromEntries(MODULES.map(m => [m.id, m]))

export const GROUPS = [
  { id: 'training', title: 'Training' },
  { id: 'body', title: 'Body and health' },
  { id: 'extras', title: 'Extras' },
]

/* The presets, smallest first. Each names the modules it turns on; every other one is off. */
const TRAINING = ['effort', 'plates', 'watch']
export const PRESETS = [
  { id: 'training', title: 'Just training', desc: 'Log, plan, progress. Nothing else on the screen.', on: TRAINING },
  { id: 'body', title: 'Training and body', desc: 'Plus weigh-ins, measurements and progress photos.', on: [...TRAINING, 'strength', 'body', 'health'] },
  // Série: 'everything' leaves out the openGym gym check-in, which is off unless switched on (isOn).
  { id: 'all', title: 'Everything', desc: 'Streaks, the Coach, themes, the lot.', on: MODULE_IDS.filter(id => id !== 'checkin') },
]
export const PRESET = Object.fromEntries(PRESETS.map(p => [p.id, p]))

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)

// Retired in Série: the openGym gym check-in (another gym's barcode, NFC stickers). The gym issues its
// own card with a QR (views/MemberCard.jsx) that the front desk scans, so this module is off for every
// profile, whatever it chose before, and the Modules page leaves it out.
// Also retired in Série: the watches (Apple Watch, Wear OS, Zepp), the phone's health apps and the
// integrations (webhooks, Hevy, MCP). The app leans on openGym's own exercise media and charts instead.
// Left on under the test runner, so openGym's own tests of those screens keep checking them.
export const SERIE_OFF = ['watch', 'health', 'integrations']
export const RETIRED = new Set(['checkin', ...(import.meta.env?.MODE === 'test' ? [] : SERIE_OFF)])

/** Whether module `id` is on for this profile. Unknown ids are on (a newer client's module). */
export function isOn(S, id) {
  if (RETIRED.has(id)) return false
  const v = isMap(S?.modules) ? S.modules[id] : undefined
  if (typeof v === 'boolean') return v
  // Before 1.4.4 the check-in had its own switch in Look & Home; it decides until Modules does.
  // Série: off unless switched on. The gym issues its own card with a QR (views/MemberCard.jsx), so
  // the openGym check-in (another gym's barcode, NFC stickers) is not on a member's Home by default.
  if (id === 'checkin') return S?.checkIn === true
  return true
}

/** { [id]: boolean } for every module, as this profile has them now. */
export function moduleStates(S) {
  return Object.fromEntries(MODULE_IDS.map(id => [id, isOn(S, id)]))
}

/** The full modules map a preset stands for. */
export function presetModules(presetId) {
  const p = PRESET[presetId]
  if (!p) return null
  const on = new Set(p.on)
  return Object.fromEntries(MODULE_IDS.map(id => [id, on.has(id) && !RETIRED.has(id)]))
}

/** 'training' | 'body' | 'all' when the modules match a preset exactly, else 'custom'. */
export function presetOf(S) {
  const now = moduleStates(S)
  for (const p of PRESETS) {
    const want = presetModules(p.id)
    if (MODULE_IDS.every(id => now[id] === want[id])) return p.id
  }
  return 'custom'
}

/** How many modules are on. */
export const onCount = S => MODULE_IDS.filter(id => isOn(S, id)).length

/**
 * Writes a preset or one module into a draft state (useStore update). Every key is written
 * explicitly, so the choice syncs per module and an older default never decides later.
 */
export function applyPreset(s, presetId) {
  const m = presetModules(presetId)
  if (!m) return
  s.modules = { ...(isMap(s.modules) ? s.modules : {}), ...m }
}
export function setModule(s, id, on) {
  if (!MODULE[id]) return
  s.modules = { ...(isMap(s.modules) ? s.modules : {}), [id]: !!on }
}

/** The modules a change from `S` to `next` (a modules map) switches off. */
export function turnedOff(S, next) {
  return MODULE_IDS.filter(id => isOn(S, id) && next[id] === false)
}
