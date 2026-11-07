// Icone SVG nel grafo. Un SVG senza `width` e `height` (solo `viewBox`) non ha una misura propria: per il canvas `naturalWidth` vale 0 o la misura predefinita di 300x150,
// e il ritaglio quadrato centrato dell'atlante (graphRenderer.js, drawCell) prenderebbe la parte sbagliata, ingrandita. L'`<img>` dell'elenco invece lo adatta al riquadro.
// Qui si dà all'SVG una misura esplicita con il suo rapporto d'aspetto (dal `viewBox` o da width/height), così il ritaglio dà lo stesso risultato dell'elenco.

/** Il testo di un SVG con `width` e `height` espliciti (lato maggiore = `side`) e un `viewBox`, nel rapporto d'aspetto dell'originale. Un testo che non è un SVG resta com'è. */
export function sizedSvg(text, side = 256) {
  const match = /<svg\b[^>]*>/i.exec(String(text))
  if (!match) return text
  const tag = match[0]
  const attribute = (name) => {
    const found = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
    return found ? (found[1] ?? found[2]) : null
  }
  const length = (value) => {
    const found = /^\s*([0-9]*\.?[0-9]+)\s*(?:px)?\s*$/i.exec(value || '')
    return found ? Number(found[1]) : null
  }
  let width = length(attribute('width'))
  let height = length(attribute('height'))
  const box = (attribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
  const hasBox = box.length === 4 && box.every(Number.isFinite) && box[2] > 0 && box[3] > 0
  if (hasBox && (!width || !height)) { width = box[2]; height = box[3] }
  const ratio = width && height ? width / height : 1
  const outWidth = Math.round(ratio >= 1 ? side : side * ratio)
  const outHeight = Math.round(ratio >= 1 ? side / ratio : side)
  const stripped = tag.replace(/\s(?:width|height)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
  const closing = stripped.endsWith('/>') ? '/>' : '>'
  const open = stripped.slice(0, stripped.length - closing.length).replace(/\s+$/, '')
  // Senza viewBox ma con una misura, il viewBox la riprende (altrimenti ridimensionare ritaglierebbe).
  const viewBox = !hasBox && width && height ? ` viewBox="0 0 ${width} ${height}"` : ''
  return text.replace(tag, `${open} width="${outWidth}" height="${outHeight}"${viewBox}${closing}`)
}

/** L'URL (data URL) di un SVG con la misura esplicita; ogni altro URL, o un errore, lascia l'originale. */
export async function sizedSvgUrl(url) {
  if (!/^data:image\/svg\+xml/i.test(String(url))) return url
  try {
    const text = await (await fetch(url)).text()
    const sized = sizedSvg(text)
    return sized === text ? url : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`
  } catch { return url }
}
