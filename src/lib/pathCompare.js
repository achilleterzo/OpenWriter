/**
 * Confronto dei percorsi nell'interfaccia (stessa regola di electron/path-compare.cjs): su Windows e macOS le maiuscole non contano,
 * su Linux sì. I percorsi arrivano con "\" o "/" e si confrontano con "/".
 */
export const CASE_INSENSITIVE = typeof navigator !== 'undefined' && /Win|Mac/i.test(navigator.platform || navigator.userAgent || '')

export const normalizeSeparators = (value) => String(value ?? '').replace(/\\/g, '/')

// Forma confrontabile: separatori "/" e, dove serve, minuscolo.
export const pathKey = (value) => {
  const normalized = normalizeSeparators(value)
  return CASE_INSENSITIVE ? normalized.toLowerCase() : normalized
}

export const samePath = (left, right) => Boolean(left) && Boolean(right) && pathKey(left) === pathKey(right)

// `target` sta sotto `root` (non coincide con esso).
export function isInsidePath(target, root) {
  if (!root || !target) return false
  const base = pathKey(root).replace(/\/$/, '')
  return pathKey(target).startsWith(`${base}/`)
}
