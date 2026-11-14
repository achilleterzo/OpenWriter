import { prepareImage } from './chatAttachments.js'

/**
 * Rasterizza un SVG (base64) in un PNG per la chat: i modelli leggono immagini a pixel, non vettoriali. Si carica come immagine (così gli script e le risorse
 * esterne dell'SVG non girano), si disegna su un canvas con fondo bianco (un disegno scuro con sfondo trasparente resterebbe illeggibile) e si porta a un lato
 * di almeno `minSide` pixel (icone piccole) e non oltre `maxSide`. Restituisce { mime, data, width, height } come ogni allegato della chat.
 */
export async function rasterizeSvg(base64, { minSide = 768, maxSide = 1600 } = {}) {
  const image = new Image()
  image.decoding = 'async'
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('The SVG could not be read'))
    image.src = `data:image/svg+xml;base64,${base64}`
  })
  const width = image.naturalWidth || 300
  const height = image.naturalHeight || 150
  const longest = Math.max(width, height)
  const scale = Math.min(maxSide / longest, Math.max(1, minSide / longest))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The SVG could not be converted')
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
  return prepareImage('image/png', data)
}
