// "My machines": the gym's own stations, named by you and tied to the movement they train.
//
//   S.machines = [{ id, name, exId }]
//
// A machine is not an exercise of its own. The lat pulldown on the Gym80 by the window and the one
// on the old cable tower are the same movement in your stats, your muscle map and your volume, but
// not the same numbers: 60 kg on one is not 60 kg on the other. So a workout entry keeps the
// exercise it always had (`entry.id`) and only says which machine it was done on (`entry.mid`).
// Everything that reads "what did you lift last time" — the rows a session opens with, the
// progression line, the "Last time" and Best chips — reads it through machineHistory, which
// narrows that one exercise's history to that one machine. Everything else (stats, PR counts,
// muscle balance) keeps reading the whole history and never hears of machines.
//
// The plan stays generic: a routine says "lat pulldown 4 × 10", not which station. The machine
// you used last time for that exercise comes back on its own (lastMachineFor), and changing it
// for today changes today only.

import { entryRoutineId } from './history.js'

const list = v => (Array.isArray(v) ? v : [])

/** A fresh machine record. The name is trimmed and capped; an empty one is no machine. */
export const MACHINE_NAME_MAX = 60
export function newMachine(name, exId) {
  const n = String(name || '').trim().slice(0, MACHINE_NAME_MAX)
  if (!n || exId == null) return null
  return { id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: n, exId: String(exId) }
}

/** The machine with this id, or null (a deleted machine reads as none). */
export const machineById = (S, mid) => (mid ? list(S?.machines).find(m => m && m.id === mid) || null : null)

/** Your machines for one exercise, in the order you added them. */
export const machinesFor = (S, exId) => list(S?.machines).filter(m => m && m.exId === String(exId))

// The entries of one exercise, newest workout first, as [workout, entry] pairs.
function* entriesNewestFirst(S, exId) {
  const ws = list(S?.workouts)
  for (let i = ws.length - 1; i >= 0; i--) {
    for (const e of list(ws[i]?.entries)) if (e && e.id === exId) yield [ws[i], e]
  }
}

const hasDoneSet = e => list(e?.sets).some(s => s && s.done)

/** Whether any logged set of this exercise was done on this machine. */
export function machineHasHistory(S, exId, mid) {
  if (!mid) return false
  for (const [, e] of entriesNewestFirst(S, exId)) if (e.mid === mid && hasDoneSet(e)) return true
  return false
}

/**
 * The machine you last did this exercise on, if it still exists: in this routine first (the heavy
 * day and the light day may well use different stations), then anywhere. The last session decides,
 * so a session done on no machine in particular answers null rather than an older machine.
 */
export function lastMachineFor(S, exId, rid) {
  const pick = matchRid => {
    for (const [w, e] of entriesNewestFirst(S, exId)) {
      if (!hasDoneSet(e)) continue
      if (matchRid && entryRoutineId(w, e) !== matchRid) continue
      return { found: true, mid: e.mid && machineById(S, e.mid) ? e.mid : null }
    }
    return { found: false, mid: null }
  }
  if (rid) {
    const own = pick(rid)
    if (own.found) return own.mid
  }
  return pick(null).mid
}

// One narrowed copy per (history, exercise, machine): a card re-renders on every tick of the rest
// timer, and the copy is only rebuilt when the workouts themselves change.
const cache = new WeakMap()

/**
 * The history the numbers of one exercise on one machine are read from: S with every entry of that
 * exercise done on another machine (or on none) taken out, and the kept working weight of that
 * exercise dropped, since it may have been lifted anywhere. Other exercises are untouched.
 *
 * A machine with nothing logged yet gets the whole history unchanged: the first time on a new
 * station starts from what you lift on the others, not from an empty bar.
 */
export function machineHistory(S, exId, mid) {
  if (!S || !mid || !machineHasHistory(S, exId, mid)) return S
  const ws = list(S.workouts)
  let byKey = cache.get(ws)
  if (!byKey) { byKey = new Map(); cache.set(ws, byKey) }
  const key = exId + '|' + mid
  let workouts = byKey.get(key)
  if (!workouts) {
    workouts = ws.map(w => {
      const entries = list(w?.entries)
      if (!entries.some(e => e && e.id === exId && e.mid !== mid)) return w
      return { ...w, entries: entries.filter(e => !(e && e.id === exId && e.mid !== mid)) }
    })
    byKey.set(key, workouts)
  }
  const exWeights = { ...(S.exWeights || {}) }
  delete exWeights[exId]
  return { ...S, workouts, exWeights }
}

/**
 * Machines worth offering in place of this exercise: yours for other exercises that train the same
 * target muscle. `exOf` looks an exercise up (exOr in the app), kept as a parameter so this stays a
 * pure helper.
 */
export function otherMachinesFor(S, exId, exOf) {
  const me = exOf(exId)
  const muscle = me && (me.tg || me.bp)
  if (!muscle) return []
  return list(S?.machines).filter(m => {
    if (!m || m.exId === String(exId)) return false
    const ex = exOf(m.exId)
    return !!ex && (ex.tg || ex.bp) === muscle
  })
}
