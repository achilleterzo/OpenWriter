// Larghezze dei pannelli laterali: valori preferiti dall'utente, salvati tra le sessioni, e minimi/massimi fissi.
const STORAGE_KEY = 'openwriter.layout'

export const ACTIVITY_BAR_WIDTH = 48
// Lo spazio minimo che resta al pannello centrale (il documento): i pannelli laterali non possono toglierglielo.
export const CENTER_MIN = 280
export const PANELS = {
  left: { min: 180, max: 640, default: 256 },
  right: { min: 280, max: 900, default: 384 },
}

const clampToRange = (side, value) => {
  const number = Number(value)
  const { min, max, default: fallback } = PANELS[side]
  return Math.round(Math.min(max, Math.max(min, Number.isFinite(number) ? number : fallback)))
}

export function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return { left: clampToRange('left', saved?.left), right: clampToRange('right', saved?.right) }
  } catch {
    return { left: PANELS.left.default, right: PANELS.right.default }
  }
}

export function saveLayout(layout) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)) } catch { /* storage non disponibile: si usano i predefiniti */ }
}

// Larghezza massima di un pannello, dato lo spazio della finestra e l'altro pannello se è visibile.
export function maxWidthFor(side, { windowWidth, otherWidth, otherVisible }) {
  const room = windowWidth - ACTIVITY_BAR_WIDTH - CENTER_MIN - (otherVisible ? otherWidth : 0)
  return Math.max(PANELS[side].min, Math.min(PANELS[side].max, room))
}

// Larghezza proposta rispettando minimo, massimo fisso e spazio per il pannello centrale.
export function clampWidth(side, value, context) {
  return Math.round(Math.min(maxWidthFor(side, context), Math.max(PANELS[side].min, value)))
}

/**
 * Larghezze effettive da usare ora: se la finestra è troppo stretta per le larghezze preferite si restringono
 * (prima il pannello destro, poi il sinistro) senza scendere sotto i minimi. Le preferenze salvate non cambiano,
 * quindi riallargando la finestra tornano le larghezze scelte.
 */
export function fitLayout(layout, { windowWidth, leftVisible, rightVisible }) {
  let { left, right } = layout
  let over = (leftVisible ? left : 0) + (rightVisible ? right : 0) - (windowWidth - ACTIVITY_BAR_WIDTH - CENTER_MIN)
  if (over > 0 && rightVisible) { const cut = Math.min(over, right - PANELS.right.min); right -= cut; over -= cut }
  if (over > 0 && leftVisible) { const cut = Math.min(over, left - PANELS.left.min); left -= cut }
  return { left, right }
}
