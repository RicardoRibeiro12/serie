// What a trainer's check-in says about body composition (api/trainer.js BODY_RANGES): the values
// worked out from the measured ones (BMI, lean mass, theoretical maximum heart rate) and the
// classification a gym's assessment sheet prints beside BMI and body fat.
//
// BMI bands are the WHO adult ones. Body-fat bands follow the ACE chart by sex (essential,
// athletes, fitness, average, high, very high); without a sex the band is not guessed.

export const bmi = (weightKg, heightCm) => {
  const w = Number(weightKg), h = Number(heightCm) / 100
  if (!(w > 0) || !(h > 0)) return null
  return Math.round(w / (h * h) * 10) / 10
}

// → a key for t(): 'Underweight', 'Normal weight', 'Overweight', 'Obesity class I' ...
export function bmiClass(v) {
  if (!(v > 0)) return null
  if (v < 18.5) return 'Underweight'
  if (v < 25) return 'Normal weight'
  if (v < 30) return 'Overweight'
  if (v < 35) return 'Obesity class I'
  if (v < 40) return 'Obesity class II'
  return 'Obesity class III'
}

const FAT_BANDS = {
  m: [[6, 'Essential fat'], [14, 'Athletic'], [18, 'Fit'], [25, 'Acceptable'], [30, 'High'], [Infinity, 'Very high']],
  f: [[14, 'Essential fat'], [21, 'Athletic'], [25, 'Fit'], [32, 'Acceptable'], [38, 'High'], [Infinity, 'Very high']]
}
export function fatClass(pct, sex) {
  const bands = FAT_BANDS[sex]
  if (!bands || !(pct > 0)) return null
  return bands.find(([max]) => pct < max)[1]
}

// Fat-free mass: the scale's own reading when there is one, else weight × (1 − body fat).
export const leanMass = (weightKg, fatPct, measured) => {
  if (Number(measured) > 0) return Number(measured)
  const w = Number(weightKg), f = Number(fatPct)
  if (!(w > 0) || !(f > 0) || f >= 100) return null
  return Math.round(w * (1 - f / 100) * 10) / 10
}

// The usual gym-sheet estimate, 220 − age.
export const hrMaxTheoretical = age => (Number(age) > 0 ? Math.round(220 - Number(age)) : null)

// Water as a share of body weight when only the litres were measured (1 l ≈ 1 kg).
export const waterPct = (waterL, weightKg, measured) => {
  if (Number(measured) > 0) return Number(measured)
  const l = Number(waterL), w = Number(weightKg)
  if (!(l > 0) || !(w > 0)) return null
  return Math.round(l / w * 1000) / 10
}

// Every row of an assessment sheet, in order, for one check-in `a` ({ weight, values, body }).
// `v` null means not measured; `cls` is a t() key or null.
export function assessmentRows(a) {
  const b = (a && a.body) || {}
  const w = a && a.weight > 0 ? a.weight : null
  const fat = a && a.values && a.values.bodyFat > 0 ? a.values.bodyFat : null
  const B = bmi(w, b.height)
  return [
    { key: 'age', label: 'Age', v: b.age ?? null, unit: 'years' },
    { key: 'height', label: 'Height', v: b.height ?? null, unit: 'cm' },
    { key: 'weight', label: 'Weight', v: w, unit: 'kg' },
    { key: 'bmi', label: 'BMI', v: B, unit: 'kg/m²', cls: bmiClass(B) },
    { key: 'bodyFat', label: 'Body fat', v: fat, unit: '%', cls: fatClass(fat, b.sex) },
    { key: 'leanKg', label: 'Lean mass', v: leanMass(w, fat, b.leanKg), unit: 'kg' },
    { key: 'restingKcal', label: 'Resting metabolism', v: b.restingKcal ?? null, unit: 'kcal' },
    { key: 'restingVo2', label: 'Resting oxygen uptake', v: b.restingVo2 ?? null, unit: 'ml/kg/min' },
    { key: 'hrRest', label: 'Resting heart rate', v: b.hrRest ?? null, unit: 'bpm' },
    { key: 'hrMax', label: 'Theoretical max heart rate', v: hrMaxTheoretical(b.age), unit: 'bpm' },
    { key: 'visceral', label: 'Visceral fat', v: b.visceral ?? null, unit: 'level' },
    { key: 'waterL', label: 'Total body water', v: b.waterL ?? null, unit: 'l' },
    { key: 'waterPct', label: 'Total body water (%)', v: waterPct(b.waterL, w, b.waterPct), unit: '%' },
    { key: 'ecwL', label: 'Extracellular water', v: b.ecwL ?? null, unit: 'l' },
    { key: 'muscleKg', label: 'Skeletal muscle mass', v: b.muscleKg ?? null, unit: 'kg' }
  ]
}
