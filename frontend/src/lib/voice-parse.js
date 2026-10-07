// Voice logging: what you said after a set, read as that set.
//
//   "60 Kilo 10 Wiederholungen"   → 60 kg × 10
//   "zehn mit zweiundsechzig komma fünf" → 62.5 × 10
//   "10 at 60, RIR 2"             → 60 × 10, 2 in reserve
//   "nochmal" / "same again"      → the set as it stands
//   "Gym80 Fenster, 50 Kilo 12"   → that machine, 50 × 12
//
// Pure and synchronous: the speech recognizer hands over a transcript and this decides what it
// means, so every phrase can be tested without a microphone. German and English, the two
// languages the recognizer is asked for (lib/voice.js); a recognizer that already wrote the numbers
// as digits — most do — skips the word tables entirely.
//
// Two bare numbers ("60 10") carry no unit to tell weight from reps. They are matched against what
// the set already holds (`expect`, the prefilled row): the one nearer today's weight is the weight.

const ONES_DE = { null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 }
const TEENS_DE = { zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 }
const TENS_DE = { zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 }
const ONES_EN = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 }
const TEENS_EN = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 }
const TENS_EN = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 }

// One German number word, compounds included: "zweiundsechzig", "hundertzwanzig", "einhundertfünf".
function germanWord(w) {
  if (w in ONES_DE) return ONES_DE[w]
  if (w in TEENS_DE) return TEENS_DE[w]
  if (w in TENS_DE) return TENS_DE[w]
  const h = w.match(/^(ein|zwei|drei)?hundert(.*)$/)
  if (h) {
    const base = (h[1] ? ONES_DE[h[1]] : 1) * 100
    if (!h[2]) return base
    const rest = germanWord(h[2].replace(/^und/, ''))
    return rest == null ? null : base + rest
  }
  const c = w.match(/^(.+?)und(.+)$/)
  if (c && c[1] in ONES_DE && c[2] in TENS_DE) return TENS_DE[c[2]] + ONES_DE[c[1]]
  return null
}

const englishWord = w => (w in ONES_EN ? ONES_EN[w] : w in TEENS_EN ? TEENS_EN[w] : w in TENS_EN ? TENS_EN[w] : null)

// Words to digits, "komma"/"point" and "einhalb"/"and a half" to decimals.
function numbersToDigits(text) {
  const words = text.split(/\s+/).filter(Boolean)
  const out = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    let n = germanWord(w)
    if (n == null) {
      n = englishWord(w)
      // "sixty two", "one hundred twenty", "hundred and five"
      if (n != null || w === 'hundred') {
        if (w === 'hundred') n = 100
        if (words[i + 1] === 'hundred') { n *= 100; i++ }
        if (words[i + 1] === 'and' && englishWord(words[i + 2] || '') != null && n >= 100) i++
        const next = englishWord(words[i + 1] || '')
        if (next != null && ((n >= 20 && n % 10 === 0 && n < 100 && next < 10) || (n >= 100 && next < 100))) { n += next; i++ }
      }
    }
    out.push(n != null ? String(n) : w)
  }
  return out.join(' ')
    .replace(/(\d+)\s*(?:komma|point|punkt|,)\s*(\d+)/g, '$1.$2')
    .replace(/(\d+)\s*(?:einhalb|and a half|½)/g, (_, a) => String(Number(a) + 0.5))
}

const WEIGHT_UNIT = '(?:kg|kilo|kilos|kilogramm|kilogram|kilograms|lbs?|pfund|pounds?)'
const REPS_UNIT = '(?:reps?|wiederholungen|wiederholung|wdh|wh)'
const SEC_UNIT = '(?:s|sek|sekunden|sekunde|sec|secs|seconds?)'
const NUM = '(\\d+(?:\\.\\d+)?)'

const REPEAT = /\b(nochmal|noch mal|nochmals|wieder|gleich|gleiche|dasselbe|selbe|wie vorher|wie eben|same|again|repeat|same again|as before|done|fertig|geschafft|erledigt)\b/

// Lower case, "62,5" as "62.5", and every other comma or full stop a pause: "fünf, RIR 2".
const norm = s => String(s || '').toLowerCase().normalize('NFC')
  .replace(/(\d),(\d)/g, '$1.$2').replace(/[,!?;:]+|\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim()

/** Your machine named in what you said, longest name first ("Gym80" loses to "Gym80 Fenster"). */
function findMachine(text, machines) {
  const named = (machines || []).filter(m => m && m.name).map(m => ({ m, n: norm(m.name) })).filter(x => x.n.length >= 2)
  named.sort((a, b) => b.n.length - a.n.length)
  // Spaces are optional: "Gym80" is heard as "gym 80" as often as not.
  const esc = c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const { m, n } of named) {
    const re = new RegExp([...n.replace(/\s+/g, '')].map(esc).join('\\s*'))
    const hit = text.match(re)
    if (hit) return { id: m.id, rest: (text.slice(0, hit.index) + ' ' + text.slice(hit.index + hit[0].length)).trim() }
  }
  return null
}

const distance = (n, ref) => (ref > 0 && n > 0 ? Math.abs(Math.log(n / ref)) : Infinity)

/**
 * @param {string} transcript what the recognizer heard
 * @param {{ mode?: 'reps'|'time'|'cardio', expect?: { w?: number, r?: number, sec?: number }, machines?: {id,name}[] }} ctx
 *   the exercise's mode, the row about to be logged (its prefilled numbers), your machines for it
 * @returns {null | { action: 'repeat', machineId?: string } | { action: 'log', w?: number, r?: number, sec?: number, rir?: number, machineId?: string }}
 */
export function parseVoice(transcript, { mode = 'reps', expect = {}, machines = [] } = {}) {
  let text = norm(transcript)
  if (!text) return null
  // The machine first: "Gym80" holds a number that is not a weight.
  const machine = findMachine(text, machines)
  if (machine) text = machine.rest
  const extra = machine ? { machineId: machine.id } : {}
  text = numbersToDigits(text)
    .replace(/(\d)\s*(kg|lbs?)\b/g, '$1 $2')
    .replace(/(\d)\s*x\s*(\d)/g, '$1 x $2')

  const out = {}
  const take = (re, key) => {
    const m = text.match(re)
    if (!m) return
    out[key] = Number(m[1])
    text = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).trim()
  }
  // Reps in reserve / RPE first, so their number is not read as weight or reps.
  take(new RegExp(`\\b(?:rir|reserve)\\s*${NUM}`), 'rir')
  take(new RegExp(`${NUM}\\s*(?:in reserve|im tank|in the tank|übrig|left)\\b`), 'rir')
  take(new RegExp(`\\bnoch\\s*${NUM}\\b(?!\\s*${WEIGHT_UNIT})`), 'rir')
  if (out.rir == null) {
    const rpe = text.match(new RegExp(`\\brpe\\s*${NUM}`))
    if (rpe) { out.rir = Math.max(0, 10 - Number(rpe[1])); text = text.replace(rpe[0], ' ') }
  }
  take(new RegExp(`${NUM}\\s*${WEIGHT_UNIT}\\b`), 'w')
  take(new RegExp(`${NUM}\\s*${REPS_UNIT}\\b`), 'r')
  take(new RegExp(`${NUM}\\s*${SEC_UNIT}\\b`), 'sec')
  // "10 at 60", "10 mit 60", "10 @ 60": reps, then the weight they were done with.
  const at = text.match(new RegExp(`${NUM}\\s*(?:at|mit|bei|@|auf)\\s*${NUM}`))
  if (at) {
    if (out.r == null) out.r = Number(at[1])
    if (out.w == null) out.w = Number(at[2])
    text = text.replace(at[0], ' ')
  }
  // "with 60", "mit 60": a weight.
  if (out.w == null) take(new RegExp(`\\b(?:with|mit|bei|at|@)\\s*${NUM}`), 'w')
  // "for 8", "für 8": reps.
  if (out.r == null) take(new RegExp(`\\b(?:for|für)\\s*${NUM}`), 'r')

  // What is left is bare numbers: matched against the row being logged.
  const bare = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  for (const n of bare) {
    if (mode === 'time') { if (out.sec == null) out.sec = n; else if (out.w == null) out.w = n; continue }
    if (mode === 'cardio') continue
    const wFree = out.w == null, rFree = out.r == null
    if (wFree && rFree) {
      const dw = distance(n, expect.w), dr = distance(n, expect.r)
      if (dw === Infinity && dr === Infinity) {
        if (!(expect.w > 0) && expect.r > 0) out.r = n
        else if (n % 1 !== 0 || n > 30) out.w = n
        else out.r = n
      } else if (dw < dr) out.w = n
      else out.r = n
    } else if (wFree) out.w = n
    else if (rFree) out.r = n
  }
  // A whole-number rep count and a sensible weight; anything else was misheard.
  if (out.r != null && (out.r % 1 !== 0 || out.r <= 0 || out.r > 200)) delete out.r
  if (out.w != null && (out.w < 0 || out.w > 1000)) delete out.w
  if (out.rir != null && (out.rir % 1 !== 0 || out.rir > 10)) delete out.rir
  if (out.sec != null && (out.sec <= 0 || out.sec > 3600)) delete out.sec

  if (Object.keys(out).length) return { action: 'log', ...out, ...extra }
  if (REPEAT.test(text) || machine) return { action: 'repeat', ...extra }
  return null
}

/** The set as one line for the confirmation: "60 kg × 10 · RIR 2". */
export function voiceSummary(p, unit = 'kg') {
  if (!p) return ''
  const parts = []
  if (p.w != null && p.r != null) parts.push(`${p.w} ${unit} × ${p.r}`)
  else if (p.w != null) parts.push(`${p.w} ${unit}`)
  else if (p.r != null) parts.push(`× ${p.r}`)
  if (p.sec != null) parts.push(`${p.sec} s`)
  if (p.rir != null) parts.push(`RIR ${p.rir}`)
  return parts.join(' · ')
}
