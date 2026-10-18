import { useEffect, useState } from 'react'

// Icone dei progetti (data URL, o null se non ne hanno): lette una volta per cartella e tenute in memoria finché non cambiano.
const electronAPI = window.electronAPI
const cache = new Map()
const listeners = new Set()
const keyOf = (directory) => String(directory || '').replace(/\\/g, '/').toLowerCase()

const ICON_SIDE = 128
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif' }

// Decodifica l'immagine con il browser (legge anche GIF, WebP, BMP, ICO) e la restituisce come PNG di al più 128 px, in base64.
// Una GIF animata dà il primo fotogramma.
async function rasterToPng({ extension, data }) {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME[extension] || 'image/png' }))
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('decode'))
      element.src = url
    })
    const width = image.naturalWidth
    const height = image.naturalHeight
    if (!width || !height) throw new Error('decode')
    const scale = Math.min(1, ICON_SIDE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png').split(',')[1]
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Una GIF o una WebP con più fotogrammi si tiene com'è, per non perdere l'animazione.
function isAnimated({ extension, data }) {
  const bytes = Uint8Array.from(atob(data.slice(0, 1_400_000)), (char) => char.charCodeAt(0))
  if (extension === 'webp') {
    // RIFF....WEBP, poi un blocco VP8X con il bit 0x02 (animazione) tra i flag.
    const text = (from, to) => String.fromCharCode(...bytes.subarray(from, to))
    return bytes.length > 21 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP' && text(12, 16) === 'VP8X' && (bytes[20] & 0x02) !== 0
  }
  if (extension === 'gif') {
    // Ogni fotogramma ha un blocco di controllo grafico (21 F9 04): più d'uno = animata.
    let frames = 0
    for (let index = 0; index + 2 < bytes.length && frames < 2; index += 1) {
      if (bytes[index] === 0x21 && bytes[index + 1] === 0xf9 && bytes[index + 2] === 0x04) frames += 1
    }
    return frames > 1
  }
  return false
}

// Sceglie un'immagine (finestra di sistema) e la salva come icona del progetto. Restituisce false se l'utente annulla.
export async function chooseProjectIcon(directory, { unreadable }) {
  const picked = await electronAPI.pickProjectIcon()
  if (!picked) return false
  let request
  if (picked.extension === 'svg') request = { directory, kind: 'svg', data: picked.data }
  else if (isAnimated(picked)) request = { directory, kind: picked.extension, data: picked.data }
  else {
    let png
    try { png = await rasterToPng(picked) } catch { throw new Error(unreadable) }
    request = { directory, kind: 'png', data: png }
  }
  await electronAPI.saveProjectIcon(request)
  invalidateProjectIcon(directory)
  return true
}

// Da chiamare quando l'icona di un progetto è cambiata (scelta o tolta): chi la mostra la rilegge.
export function invalidateProjectIcon(directory) {
  cache.delete(keyOf(directory))
  listeners.forEach((listener) => listener())
}

export function useProjectIcon(directory) {
  const key = keyOf(directory)
  // Cambia a ogni invalidazione e a ogni lettura finita: serve a rifare il rendering e, con la cache svuotata, a rileggere l'icona.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const listener = () => setVersion((value) => value + 1)
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  useEffect(() => {
    if (!directory || cache.has(key) || !electronAPI?.getProjectIcon) return undefined
    let cancelled = false
    electronAPI.getProjectIcon(directory)
      .then((icon) => { cache.set(key, icon || null); if (!cancelled) setVersion((value) => value + 1) })
      .catch(() => { cache.set(key, null) })
    return () => { cancelled = true }
  }, [directory, key, version])

  return directory ? cache.get(key) || null : null
}
