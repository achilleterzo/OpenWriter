const zlib = require('node:zlib')
const pdfParse = require('pdf-parse')

// Immagini troppo piccole (filetti, puntini, sfondi di 1 pixel) non sono figure del documento.
const MIN_SIDE = 24
const MAX_IMAGES = 300
const MARKER = (index) => `\u0001IMG${index}\u0001`

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

// Codifica pixel grezzi (kind di pdf.js: 1 = grigio 1 bit, 2 = RGB, 3 = RGBA) in PNG.
function encodePng({ width, height, kind, data }) {
  const channels = kind === 3 ? 4 : 3
  const stride = width * channels
  let pixels = data
  if (kind === 1) {
    // Grigio a 1 bit (bit più significativo per primo, righe allineate al byte) → RGB.
    pixels = Buffer.alloc(width * height * 3)
    const rowBytes = Math.ceil(width / 8)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const value = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0
        pixels.fill(value, (y * width + x) * 3, (y * width + x) * 3 + 3)
      }
    }
  }
  const rowLength = (kind === 1 ? width * 3 : stride)
  if (pixels.length < rowLength * height) throw new Error('Incomplete image data')
  const raw = Buffer.alloc((rowLength + 1) * height)
  for (let y = 0; y < height; y += 1) Buffer.from(pixels.buffer, pixels.byteOffset + y * rowLength, rowLength).copy(raw, y * (rowLength + 1) + 1)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = kind === 3 ? 6 : 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const multiply = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
]

/**
 * Legge un PDF: restituisce il testo (con un segnaposto dove stava ogni immagine, nell'ordine di lettura della pagina) e le immagini in PNG.
 * `images[i]` corrisponde al segnaposto `MARKER(i)`.
 */
async function parsePdf(buffer) {
  const images = []
  const seen = new Map()

  async function pageRender(page) {
    const textContent = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
    const placed = []
    try {
      const { fnArray, argsArray } = await page.getOperatorList()
      const { OPS } = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js')
      let ctm = [1, 0, 0, 1, 0, 0]
      const stack = []
      for (let index = 0; index < fnArray.length && images.length < MAX_IMAGES; index += 1) {
        const op = fnArray[index]
        const args = argsArray[index]
        if (op === OPS.save) stack.push(ctm)
        else if (op === OPS.restore) ctm = stack.pop() || ctm
        else if (op === OPS.transform) ctm = multiply(args, ctm)
        else if (op === OPS.paintJpegXObject) {
          // I JPEG arrivano come "immagini" del browser: lo shim sotto ne conserva l'indirizzo data:, cioè il file JPEG originale.
          const source = page.objs.isResolved(args[0]) ? page.objs.get(args[0])?.src : null
          const match = typeof source === 'string' ? /^data:image\/jpeg;base64,(.+)$/.exec(source) : null
          if (!match || args[1] < MIN_SIDE || args[2] < MIN_SIDE) continue
          const key = `${args[0]}:jpeg`
          let id = seen.get(key)
          if (id === undefined) {
            images.push({ mime: 'image/jpeg', data: Buffer.from(match[1], 'base64') })
            id = images.length - 1
            seen.set(key, id)
          }
          placed.push({ id, top: ctm[5] + Math.max(ctm[3], 0) })
        } else if (op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject) {
          const image = op === OPS.paintImageXObject ? (page.objs.isResolved(args[0]) ? page.objs.get(args[0]) : null) : args[0]
          if (!image?.data || !(image.kind >= 1 && image.kind <= 3) || image.width < MIN_SIDE || image.height < MIN_SIDE) continue
          const key = op === OPS.paintImageXObject ? `${args[0]}:${image.width}x${image.height}` : null
          let id = key ? seen.get(key) : undefined
          if (id === undefined) {
            try { images.push({ mime: 'image/png', data: encodePng(image) }) } catch { continue }
            id = images.length - 1
            if (key) seen.set(key, id)
          }
          placed.push({ id, top: ctm[5] + Math.max(ctm[3], 0) })
        }
      }
    } catch (error) { if (process.env.OW_DEBUG) console.error("PDFIMG", error) }
    placed.sort((left, right) => right.top - left.top)

    let text = ''
    let lastY
    let next = 0
    const flush = (y) => {
      while (next < placed.length && (y === undefined || placed[next].top >= y)) { text += `\n\n${MARKER(placed[next].id)}\n\n`; next += 1 }
    }
    for (const item of textContent.items) {
      const y = item.transform[5]
      flush(y)
      text += (lastY === y || !lastY) ? item.str : `\n${item.str}`
      lastY = y
    }
    flush(undefined)
    return text
  }

  // pdf.js decodifica i JPEG con `new Image()`, che in Node non esiste: uno shim minimo (e solo per la durata della lettura) basta a evitare l'errore.
  const hadImage = 'Image' in globalThis
  const previousImage = globalThis.Image
  globalThis.Image = class { set src(value) { this._src = value; setTimeout(() => this.onload?.(), 0) } get src() { return this._src } }
  // Senza un DOM i caratteri incorporati non si possono montare: il testo si legge comunque, qui servono solo le immagini.
  const pdfjs = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js')
  pdfjs.disableFontFace = true
  if (globalThis.PDFJS) globalThis.PDFJS.disableFontFace = true
  try {
    const document = await pdfParse(buffer, { pagerender: pageRender })
    return { text: document.text, images }
  } finally {
    if (hadImage) globalThis.Image = previousImage
    else delete globalThis.Image
  }
}

module.exports = { parsePdf, MARKER }
