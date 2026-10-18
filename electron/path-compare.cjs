const path = require('node:path')

/**
 * Confronto dei percorsi, in un solo posto. Su Windows e macOS (file system normalmente insensibili alle maiuscole) due percorsi che differiscono
 * solo per il case sono lo stesso file; su Linux no: lì "Docs" e "docs" sono cartelle diverse e confonderle significherebbe autorizzare, o
 * spostare, il file sbagliato. Si usa ovunque si decide se due percorsi coincidono o se uno sta dentro l'altro (progetto, collegamenti,
 * immagini, autorizzazioni), invece di `toLowerCase()` sparsi nel codice.
 */
const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin'

// Forma confrontabile: assoluta, normalizzata e, dove serve, in minuscolo.
function pathKey(value) {
  const resolved = path.resolve(String(value ?? ''))
  return CASE_INSENSITIVE ? resolved.toLowerCase() : resolved
}

const samePath = (left, right) => Boolean(left) && Boolean(right) && pathKey(left) === pathKey(right)

// `target` coincide con `root` o sta sotto di esso.
function isSameOrInside(root, target) {
  if (!root || !target) return false
  const relative = path.relative(pathKey(root), pathKey(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

module.exports = { CASE_INSENSITIVE, pathKey, samePath, isSameOrInside }
