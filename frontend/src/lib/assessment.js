// A check-in a trainer measured (api/trainer.js makeAssessment), folded into the student's own
// history: the weight as a weigh-in of that day, the rest into that day's measurement entry.
// Values arrive in canonical units (kg, cm, %). Applying the same check-in twice changes nothing:
// the weigh-in's id comes from the check-in's, and a measurement only fills the day's fields.
import { addWeighIn, hashId, readingsOf } from './weigh-ins.js'
import { MEASUREMENT_KEYS, DEFAULT_MEASUREMENT_KEYS, normalizeMeasurementEntry, normalizeMeasurementsState } from './measurements.js'
import { convertWeight } from './units.js'

export function applyAssessment(S, a, now = Date.now()) {
  if (!a || !/^\d{4}-\d{2}-\d{2}$/.test(a.date || '')) return S
  if (Number(a.weight) > 0) {
    const id = 'pt' + hashId(String(a.id))
    const day = (S.bodyweight || []).find(e => e.d === a.date)
    if (!day || !readingsOf(day).some(r => r.id === id)) {
      const w = S.unit === 'lb' ? Math.round(convertWeight(Number(a.weight), 'kg', 'lb') * 10) / 10 : Number(a.weight)
      addWeighIn(S, { d: a.date, at: null, w, t: now, id })
    }
  }
  const values = Object.fromEntries(Object.entries(a.values || {}).filter(([k, v]) => MEASUREMENT_KEYS.includes(k) && Number(v) > 0))
  if (Object.keys(values).length) {
    const list = Array.isArray(S.measurements) ? S.measurements : []
    const i = list.findIndex(e => e.d === a.date)
    const entry = normalizeMeasurementEntry({ ...(i >= 0 ? list[i] : { d: a.date }), ...values, t: now }, S.customMeasurements || [])
    S.measurements = i >= 0 ? list.map((e, j) => j === i ? entry : e) : [...list, entry]
    // A field the trainer measured is shown, even if the student had it switched off.
    const on = new Set(Array.isArray(S.measurementEnabled) ? S.measurementEnabled : DEFAULT_MEASUREMENT_KEYS)
    S.measurementEnabled = [...on, ...Object.keys(values).filter(k => !on.has(k))]
    normalizeMeasurementsState(S)
  }
  return S
}
