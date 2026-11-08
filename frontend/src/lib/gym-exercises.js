// Exercises shared within a gym (Série, supabase/app.sql share_exercise and gym_exercise_list): a PT
// or the owner switches "Available to every PT in the gym" on their own exercise, and every PT there
// gets a copy in their own library (S.customEx), so it works everywhere a custom exercise does.
// A plan sent to a student carries the custom exercises it uses (planCustomEx), so the student's
// app knows them too.

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v)

// What goes to the gym: the definition, never the uploaded media (it lives on one person's account).
export function shareable(ex) {
  if (!isObj(ex) || ex.id == null || !String(ex.n || '').trim()) return null
  const { media, _ts, ...rest } = ex
  return { ...rest, custom: true }
}

/**
 * Merges the gym's shared exercises into a library (S.customEx). Adds the ones it does not have and
 * updates the copies that came from the gym (`gym: true`) when the shared one changed; never
 * touches an exercise the person made themselves. Returns the same array when nothing changed.
 */
export function mergeGymExercises(mine, shared) {
  const list = Array.isArray(mine) ? mine : []
  const byId = new Map(list.map((c, i) => [c?.id, i]))
  let out = list
  for (const row of Array.isArray(shared) ? shared : []) {
    const ex = shareable(row?.ex)
    if (!ex || row.mine) continue
    const copy = { ...ex, gym: true, ...(row.by ? { gymBy: row.by } : {}) }
    const i = byId.get(ex.id)
    if (i === undefined) {
      if (out === list) out = [...list]
      byId.set(ex.id, out.length)
      out.push(copy)
    } else if (out[i]?.gym === true && JSON.stringify({ ...out[i], _ts: undefined }) !== JSON.stringify({ ...copy, _ts: undefined })) {
      if (out === list) out = [...list]
      out[i] = { ...copy, ...(out[i]._ts ? { _ts: out[i]._ts } : {}) }
    }
  }
  return out
}

/** The custom exercises a plan uses, as a plan file carries them (customEx), from the library. */
export function planCustomEx(routines, library) {
  const used = new Set((routines || []).flatMap(r => (r.ex || []).map(e => e.id)))
  return (Array.isArray(library) ? library : []).filter(c => c && used.has(c.id)).map(shareable).filter(Boolean)
}
