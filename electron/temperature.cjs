/**
 * Temperatura di progetto e di conversazione: un livello da 0 a 1, uguale per tutti i provider. Ogni provider lo converte nel
 * proprio intervallo (livello × massimo). Vuoto ('') significa "nessuna scelta": vale il livello più in alto
 * (conversazione → progetto) e, in mancanza, la temperatura generale del provider (che resta nei suoi gradi, vuota = predefinito del modello).
 * Le fasce e il massimo vanno tenuti allineati con src/lib/temperature.js.
 */
const LEVEL_MIN = 0
const LEVEL_MAX = 1

// Temperatura massima accettata da ciascun provider. Le CLI (Claude, Codex) non ne hanno: il livello arriva loro come indicazione di stile.
const PROVIDER_MAX = { ollama: 4, 'ollama-cloud': 2, openrouter: 2, gemini: 2 }

function cleanTemperature(value) {
  if (value === '' || value == null) return ''
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, number)) * 100) / 100 : ''
}

// Il livello nei gradi del provider ('' se non ne ha o se non c'è livello).
function nativeTemperature(provider, level) {
  const max = PROVIDER_MAX[provider]
  const clean = cleanTemperature(level)
  return max && clean !== '' ? Math.round(clean * max * 100) / 100 : ''
}

// Nelle fasce estreme (la prima e l'ultima) si rende il livello come indicazione di stile nel prompt; nelle altre non si aggiunge nulla.
const LOW_LIMIT = 0.2
const HIGH_LIMIT = 0.8
const STYLE_LOW = 'Style: write with maximum precision and consistency. Stay close to the source text, prefer the most predictable wording and do not introduce variations nobody asked for. This only concerns the prose you write, never the format of tool calls.'
const STYLE_HIGH = 'Style: write with more freedom and variety. Explore unusual wording and structures and take creative risks when the task allows it, never at the cost of facts or of the instructions above. This only concerns the prose you write, never the format of tool calls.'

function styleHint(level) {
  const clean = cleanTemperature(level)
  if (clean === '') return ''
  if (clean < LOW_LIMIT) return STYLE_LOW
  if (clean >= HIGH_LIMIT) return STYLE_HIGH
  return ''
}

module.exports = { PROVIDER_MAX, cleanTemperature, nativeTemperature, styleHint }
