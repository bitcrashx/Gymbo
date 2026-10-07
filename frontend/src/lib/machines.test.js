import { describe, expect, it } from 'vitest'
import { newMachine, machinesFor, machineHasHistory, lastMachineFor, machineHistory, otherMachinesFor } from './machines.js'
import { lastEntryFor } from './history.js'

const set = (w, r, done = true) => ({ w, r, done })
const entry = (id, w, extra = {}) => ({ id, target: { sets: 1, reps: 10, weight: w }, sets: [set(w, 10)], ...extra })
const workout = (d, entries, extra = {}) => ({ id: 'w' + d, d, start: 0, routineIds: ['r1'], entries, ...extra })

const machines = [
  { id: 'mA', name: 'Gym80 window', exId: '0150' },
  { id: 'mB', name: 'Old cable tower', exId: '0150' },
  { id: 'mC', name: 'Row machine', exId: '0200' },
]
const state = workouts => ({ machines, workouts, exWeights: { '0150': { w: 80 } } })

describe('newMachine', () => {
  it('trims the name and links the exercise', () => {
    const m = newMachine('  Gym80 window  ', '0150')
    expect(m.name).toBe('Gym80 window')
    expect(m.exId).toBe('0150')
    expect(m.id).toMatch(/^m/)
  })
  it('an empty name or no exercise is no machine', () => {
    expect(newMachine('   ', '0150')).toBeNull()
    expect(newMachine('Rack', null)).toBeNull()
  })
})

describe('machinesFor', () => {
  it('lists only the machines of that exercise', () => {
    expect(machinesFor({ machines }, '0150').map(m => m.id)).toEqual(['mA', 'mB'])
    expect(machinesFor({}, '0150')).toEqual([])
  })
})

describe('machineHistory', () => {
  const S = state([
    workout('2026-10-01', [entry('0150', 60, { mid: 'mA' }), entry('0200', 50)]),
    workout('2026-10-03', [entry('0150', 75, { mid: 'mB' })]),
    workout('2026-10-05', [entry('0150', 70)]),
  ])

  it('"last time" on a machine is that machine’s own last session', () => {
    expect(lastEntryFor(S, '0150').sets[0].w).toBe(70)
    expect(lastEntryFor(machineHistory(S, '0150', 'mA'), '0150').sets[0].w).toBe(60)
    expect(lastEntryFor(machineHistory(S, '0150', 'mB'), '0150').sets[0].w).toBe(75)
  })

  it('leaves other exercises and the original state alone', () => {
    const H = machineHistory(S, '0150', 'mA')
    expect(lastEntryFor(H, '0200').sets[0].w).toBe(50)
    expect(S.workouts[2].entries).toHaveLength(1)
    expect(S.exWeights['0150'].w).toBe(80)
  })

  it('drops the kept working weight of that exercise, which may come from any machine', () => {
    expect(machineHistory(S, '0150', 'mA').exWeights['0150']).toBeUndefined()
  })

  it('a machine with nothing logged yet starts from the whole history', () => {
    expect(machineHistory(S, '0150', 'mNew')).toBe(S)
    expect(machineHistory(S, '0150', null)).toBe(S)
  })

  it('returns the same narrowed workouts while the history is unchanged', () => {
    expect(machineHistory(S, '0150', 'mA').workouts).toBe(machineHistory(S, '0150', 'mA').workouts)
  })
})

describe('machineHasHistory', () => {
  it('counts only done sets', () => {
    const S = state([workout('2026-10-01', [{ id: '0150', mid: 'mA', sets: [set(60, 10, false)] }])])
    expect(machineHasHistory(S, '0150', 'mA')).toBe(false)
  })
})

describe('lastMachineFor', () => {
  it('brings back the machine used last time', () => {
    const S = state([
      workout('2026-10-01', [entry('0150', 60, { mid: 'mA' })]),
      workout('2026-10-03', [entry('0150', 75, { mid: 'mB' })]),
    ])
    expect(lastMachineFor(S, '0150')).toBe('mB')
  })

  it('prefers the routine’s own last session', () => {
    const S = state([
      workout('2026-10-01', [entry('0150', 60, { mid: 'mA', rid: 'heavy' })]),
      workout('2026-10-03', [entry('0150', 75, { mid: 'mB', rid: 'light' })]),
    ])
    expect(lastMachineFor(S, '0150', 'heavy')).toBe('mA')
    expect(lastMachineFor(S, '0150', 'other')).toBe('mB')
  })

  it('a last session on no machine, or on a deleted one, answers null', () => {
    const S = state([
      workout('2026-10-01', [entry('0150', 60, { mid: 'mA' })]),
      workout('2026-10-03', [entry('0150', 75)]),
    ])
    expect(lastMachineFor(S, '0150')).toBeNull()
    const gone = state([workout('2026-10-01', [entry('0150', 60, { mid: 'mGone' })])])
    expect(lastMachineFor(gone, '0150')).toBeNull()
  })
})

describe('otherMachinesFor', () => {
  const ex = { '0150': { tg: 'lats' }, '0200': { tg: 'lats' }, '0300': { tg: 'quads' } }
  const exOf = id => ex[id] || null
  it('offers machines of other exercises for the same muscle', () => {
    expect(otherMachinesFor({ machines }, '0150', exOf).map(m => m.id)).toEqual(['mC'])
    expect(otherMachinesFor({ machines }, '0300', exOf)).toEqual([])
  })
})

describe('a finished workout keeps the machine', () => {
  it('buildCompletedWorkout writes entry.mid, and only when set', async () => {
    const { buildCompletedWorkout } = await import('./finish-workout.js')
    const active = { id: 'a', d: '2026-10-07', start: 0, entries: [entry('0150', 60, { mid: 'mA' }), entry('0200', 50)] }
    const w = buildCompletedWorkout(active, { end: 1 })
    expect(w.entries[0].mid).toBe('mA')
    expect('mid' in w.entries[1]).toBe(false)
  })
})

describe('session start brings back the last machine', () => {
  it('buildSessionEntries tags the entry and reads that machine’s numbers', async () => {
    const { buildSessionEntries } = await import('./session-start.js')
    const S = { ...state([
      workout('2026-10-01', [entry('0150', 60, { mid: 'mA', rid: 'r1' })]),
      workout('2026-10-03', [entry('0150', 75, { mid: 'mB', rid: 'r2' })]),
    ]), unit: 'kg', routines: [] }
    const routine = { id: 'r1', name: 'A', ex: [{ id: '0150', sets: 1, reps: 10, weight: 40, prog: 'linear' }] }
    const [e] = buildSessionEntries(S, routine)
    expect(e.mid).toBe('mA')
    // Linear progression from this machine's 60 (all reps hit), not from the other machine's 75.
    expect(e.sets[0].w).toBeGreaterThanOrEqual(60)
    expect(e.sets[0].w).toBeLessThan(75)
  })
})
