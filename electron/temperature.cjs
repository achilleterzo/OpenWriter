/**
 * Temperatura di campionamento. Vuota ('') significa "nessuna scelta": vale quella del provider (che a sua volta può essere
 * vuota, cioè il predefinito del modello). Quella del progetto, se c'è, sostituisce quella del provider.
 */
const TEMPERATURE_MIN = 0
const TEMPERATURE_MAX = 2

function cleanTemperature(value) {
  if (value === '' || value == null) return ''
  const number = Number(value)
  return Number.isFinite(number) ? Math.round(Math.min(TEMPERATURE_MAX, Math.max(TEMPERATURE_MIN, number)) * 100) / 100 : ''
}

// Le CLI (Claude, Codex) non accettano la temperatura: nelle fasce estreme la si rende come indicazione di stile nel prompt.
// Nelle fasce intermedie non si aggiunge nulla.
const LOW_LIMIT = 0.35
const HIGH_LIMIT = 1.4
const STYLE_LOW = 'Style: write with maximum precision and consistency. Stay close to the source text, prefer the most predictable wording and do not introduce variations nobody asked for. This only concerns the prose you write, never the format of tool calls.'
const STYLE_HIGH = 'Style: write with more freedom and variety. Explore unusual wording and structures and take creative risks when the task allows it, never at the cost of facts or of the instructions above. This only concerns the prose you write, never the format of tool calls.'

function styleHint(value) {
  const temperature = cleanTemperature(value)
  if (temperature === '') return ''
  if (temperature < LOW_LIMIT) return STYLE_LOW
  if (temperature >= HIGH_LIMIT) return STYLE_HIGH
  return ''
}

module.exports = { TEMPERATURE_MIN, TEMPERATURE_MAX, cleanTemperature, styleHint }
