// For a PT or the gym's owner (Série): brings the exercises shared in the gym into their own library
// (lib/gym-exercises.js), when the app opens and when it comes back to the screen. Renders nothing.
import { useEffect } from 'react'
import { create } from 'zustand'
import { useStore } from '../store/useStore.js'
import { api } from '../lib/api.js'
import { mergeGymExercises, shareable } from '../lib/gym-exercises.js'

// The ids this person shares with the gym, for the switch on their exercise (sheets.jsx CustomExForm).
export const useGymShared = create(() => ({ mine: new Set(), ready: false }))

export const canShareExercises = (user, config) => !!(config?.shared_exercises && user && (user.trainer || user.admin))

export async function refreshGymExercises() {
  const r = await api('/api/gym/exercises')
  const rows = Array.isArray(r?.exercises) ? r.exercises : []
  useGymShared.setState({ mine: new Set(rows.filter(x => x.mine).map(x => x.ex?.id)), ready: true })
  const st = useStore.getState()
  const next = mergeGymExercises(st.S.customEx, rows)
  if (next !== st.S.customEx) st.update(s => { s.customEx = next })
}

/** Shares (on) or takes back (off) one of the person's exercises. */
export async function shareExercise(ex, on) {
  const def = shareable(ex)
  if (!def) return
  await api('/api/gym/exercises/share', { method: 'POST', body: JSON.stringify({ ex: def, on }) })
  useGymShared.setState(s => { const mine = new Set(s.mine); if (on) mine.add(def.id); else mine.delete(def.id); return { mine } })
}

export default function GymExerciseSync() {
  const user = useStore(s => s.user)
  const config = useStore(s => s.config)
  const on = canShareExercises(user, config)
  useEffect(() => {
    if (!on) return
    const run = () => { if (!document.hidden) refreshGymExercises().catch(() => {}) }
    run()
    document.addEventListener('visibilitychange', run)
    return () => document.removeEventListener('visibilitychange', run)
  }, [on, user?.id])
  return null
}
