import { describe, expect, it } from 'vitest'
import { parseVoice, voiceSummary } from './voice-parse.js'

const reps = { mode: 'reps', expect: { w: 60, r: 10 } }

describe('parseVoice, German', () => {
  it.each([
    ['60 Kilo 10 Wiederholungen', { w: 60, r: 10 }],
    ['60 kg 10', { w: 60, r: 10 }],
    ['10 Wiederholungen mit 62,5 Kilo', { w: 62.5, r: 10 }],
    ['sechzig Kilo zehn Wiederholungen', { w: 60, r: 10 }],
    ['zweiundsechzig komma fünf Kilo acht', { w: 62.5, r: 8 }],
    ['zehn mit siebzig', { w: 70, r: 10 }],
    ['hundertzwanzig kilo fünf', { w: 120, r: 5 }],
    ['62 einhalb kilo 8', { w: 62.5, r: 8 }],
    ['60 Kilo 10 RIR 2', { w: 60, r: 10, rir: 2 }],
    ['60 Kilo 10, noch 2 im Tank', { w: 60, r: 10, rir: 2 }],
    ['zehn mit zweiundsechzig komma fünf, RIR 2', { w: 62.5, r: 10, rir: 2 }],
    ['Zehn Wiederholungen mit 60 Kilo.', { w: 60, r: 10 }],
    ['acht Wiederholungen', { r: 8 }],
    ['65 Kilo', { w: 65 }],
  ])('%s', (said, want) => {
    expect(parseVoice(said, reps)).toEqual({ action: 'log', ...want })
  })

  it('"nochmal" logs the set as it stands', () => {
    expect(parseVoice('nochmal', reps)).toEqual({ action: 'repeat' })
    expect(parseVoice('fertig', reps)).toEqual({ action: 'repeat' })
  })
})

describe('parseVoice, English', () => {
  it.each([
    ['60 kilos 10 reps', { w: 60, r: 10 }],
    ['10 at 60', { w: 60, r: 10 }],
    ['ten reps at sixty', { w: 60, r: 10 }],
    ['sixty two point five kilos for eight', { w: 62.5, r: 8 }],
    ['one hundred and five kilos five reps', { w: 105, r: 5 }],
    ['135 pounds 8 reps rpe 8', { w: 135, r: 8, rir: 2 }],
    ['60 10 2 in reserve', { w: 60, r: 10, rir: 2 }],
  ])('%s', (said, want) => {
    expect(parseVoice(said, reps)).toEqual({ action: 'log', ...want })
  })

  it('"same again" logs the set as it stands', () => {
    expect(parseVoice('same again', reps)).toEqual({ action: 'repeat' })
  })
})

describe('bare numbers are matched against the row being logged', () => {
  it('two numbers: the one nearer today’s weight is the weight', () => {
    expect(parseVoice('60 10', reps)).toEqual({ action: 'log', w: 60, r: 10 })
    expect(parseVoice('10 60', reps)).toEqual({ action: 'log', w: 60, r: 10 })
    expect(parseVoice('12 x 55', reps)).toEqual({ action: 'log', w: 55, r: 12 })
  })
  it('one number: weight or reps, whichever it is nearer', () => {
    expect(parseVoice('12', reps)).toEqual({ action: 'log', r: 12 })
    expect(parseVoice('62.5', reps)).toEqual({ action: 'log', w: 62.5 })
  })
  it('body weight (nothing on the bar): a bare number is reps', () => {
    expect(parseVoice('15', { mode: 'reps', expect: { w: 0, r: 10 } })).toEqual({ action: 'log', r: 15 })
  })
  it('a timed hold: a bare number is seconds', () => {
    expect(parseVoice('45', { mode: 'time', expect: { sec: 30 } })).toEqual({ action: 'log', sec: 45 })
    expect(parseVoice('45 Sekunden', { mode: 'time' })).toEqual({ action: 'log', sec: 45 })
  })
})

describe('machines', () => {
  const machines = [{ id: 'm1', name: 'Gym80' }, { id: 'm2', name: 'Gym80 Fenster' }]
  it('a machine named in the sentence is picked, and its number is not a weight', () => {
    expect(parseVoice('Gym80 Fenster 50 Kilo 12', { ...reps, machines })).toEqual({ action: 'log', w: 50, r: 12, machineId: 'm2' })
    expect(parseVoice('gym 80 50 kilo 12', { ...reps, machines })).toEqual({ action: 'log', w: 50, r: 12, machineId: 'm1' })
  })
  it('only the machine: switch and log the set as it stands', () => {
    expect(parseVoice('gym80', { ...reps, machines })).toEqual({ action: 'repeat', machineId: 'm1' })
  })
})

describe('misheard input', () => {
  it('nothing usable is null', () => {
    expect(parseVoice('', reps)).toBeNull()
    expect(parseVoice('hallo', reps)).toBeNull()
  })
  it('impossible values are dropped', () => {
    expect(parseVoice('5000 kilo 10', reps)).toEqual({ action: 'log', r: 10 })
    expect(parseVoice('60 kilo 2.5 reps', reps)).toEqual({ action: 'log', w: 60 })
  })
})

describe('voiceSummary', () => {
  it('reads back what will be logged', () => {
    expect(voiceSummary({ w: 60, r: 10, rir: 2 }, 'kg')).toBe('60 kg × 10 · RIR 2')
    expect(voiceSummary({ sec: 45 })).toBe('45 s')
  })
})
