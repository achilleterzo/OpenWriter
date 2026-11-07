// Icone animate (GIF, WebP animata) del grafo: i fotogrammi si decodificano una volta con ImageDecoder (WebCodecs, c'è in Chromium/Electron), ognuno ritagliato al
// quadrato centrale e ridotto a 128 px, e il fotogramma da mostrare si sceglie dal tempo. Così l'animazione non dipende da come il browser anima le immagini
// (che si ferma con la pagina nascosta e non si può comandare). Senza ImageDecoder, o con un'immagine che non è animata, `decodeAnimatedIcon` dà null.
const SIDE = 128
const MAX_FRAMES = 150
const DEFAULT_DURATION_MS = 100
const MIN_DURATION_MS = 20

/** → { frames: [{ bitmap, duration }], total } oppure null. `url`: data URL dell'immagine. */
export async function decodeAnimatedIcon(url) {
  if (typeof ImageDecoder === 'undefined' || typeof createImageBitmap === 'undefined') return null
  let decoder = null
  const frames = []
  try {
    const type = /^data:([^;,]+)/i.exec(url)?.[1]
    if (!type) return null
    decoder = new ImageDecoder({ data: await (await fetch(url)).arrayBuffer(), type })
    await decoder.tracks.ready
    const count = Math.min(MAX_FRAMES, decoder.tracks.selectedTrack?.frameCount || 0)
    if (count < 2) return null
    const canvas = document.createElement('canvas')
    canvas.width = SIDE
    canvas.height = SIDE
    const context = canvas.getContext('2d')
    for (let index = 0; index < count; index += 1) {
      const { image } = await decoder.decode({ frameIndex: index })
      try {
        const width = image.displayWidth || image.codedWidth
        const height = image.displayHeight || image.codedHeight
        const side = Math.min(width, height)
        context.clearRect(0, 0, SIDE, SIDE)
        context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, SIDE, SIDE)
        frames.push({ bitmap: await createImageBitmap(canvas), duration: Math.max(MIN_DURATION_MS, (image.duration || DEFAULT_DURATION_MS * 1000) / 1000) })
      } finally { image.close() }
    }
    return { frames, total: frames.reduce((sum, frame) => sum + frame.duration, 0) }
  } catch {
    for (const frame of frames) frame.bitmap.close?.()
    return null
  } finally { try { decoder?.close() } catch { /* già chiuso */ } }
}

/** Il fotogramma (bitmap) da mostrare al tempo `ms` (ciclo continuo). */
export function frameAt(animation, ms) {
  let rest = ((ms % animation.total) + animation.total) % animation.total
  for (const frame of animation.frames) {
    if (rest < frame.duration) return frame.bitmap
    rest -= frame.duration
  }
  return animation.frames[animation.frames.length - 1].bitmap
}

export function disposeAnimatedIcon(animation) {
  for (const frame of animation?.frames || []) frame.bitmap.close?.()
}
