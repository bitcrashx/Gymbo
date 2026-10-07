// The microphone side of voice logging: the browser's own speech recognizer (Web Speech API),
// asked once per tap for one short phrase. What the phrase means is lib/voice-parse.js.
//
// No dependency and no server of ours: Chrome and Safari ship the recognizer. They do not run it
// on the phone, though. Chrome sends the audio to Google and Safari to Apple to be transcribed,
// which is why the first use asks (Workout.jsx) instead of switching it on quietly. The Android
// app's WebView has no recognizer at all, so there the button simply is not shown.
import { getLang } from './i18n.js'

const Recognizer = () => (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null

export const voiceSupported = () => !!Recognizer()

// The recognizer's language: German and English are what the parser reads; any other app
// language listens in the browser's own, where digits still come through.
const LOCALE = { de: 'de-DE', en: 'en-US' }
export const voiceLocale = () => LOCALE[String(getLang() || '').slice(0, 2)] ||
  (typeof navigator !== 'undefined' && navigator.language) || 'en-US'

/**
 * Listen for one phrase. `onPartial(text)` while you speak, `onResult(alternatives)` with every
 * reading the recognizer offers (best first), `onError(code)` ('no-speech', 'not-allowed', …),
 * `onEnd()` always last. Returns a stop function.
 */
export function listenOnce({ onPartial, onResult, onError, onEnd } = {}) {
  const R = Recognizer()
  if (!R) { onError?.('unsupported'); onEnd?.(); return () => {} }
  const rec = new R()
  rec.lang = voiceLocale()
  rec.interimResults = true
  rec.maxAlternatives = 3
  rec.continuous = false
  // `stopped`: a recognizer told to stop may still deliver what it heard, and a phrase must be
  // logged once (a sheet closed and opened again, React's double effect in development).
  let done = false, stopped = false
  rec.onresult = ev => {
    if (stopped) return
    const res = ev.results[ev.results.length - 1]
    if (!res) return
    if (!res.isFinal) { onPartial?.(res[0]?.transcript || ''); return }
    done = true
    onResult?.(Array.from(res).map(a => a.transcript))
  }
  rec.onerror = ev => { done = true; if (!stopped) onError?.(ev.error || 'error') }
  rec.onend = () => { if (!done && !stopped) onError?.('no-speech'); if (!stopped) onEnd?.() }
  try { rec.start() } catch { onError?.('busy'); onEnd?.() }
  return () => { stopped = true; try { rec.abort() } catch { /* already stopped */ } }
}
