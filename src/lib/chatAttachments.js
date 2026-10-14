// Allegati dell'utente in chat e conteggio dei token: funzioni pure o di sola conversione, senza stato del pannello.

const api = typeof window !== 'undefined' ? window.electronAPI : null

// Allegati per messaggio e quanti degli allegati dell'utente si rimandano al modello (i più recenti).
export const MAX_PENDING_ATTACHMENTS = 10
export const MAX_MODEL_USER_IMAGES = 8
export const MAX_MODEL_USER_PDFS = 4

// Contenuto base64 di un Blob o File (senza il prefisso data:).
export const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(blob)
})

// Immagine che Electron non decodifica (WebP, GIF…): la decodifica il browser e la si ricodifica in PNG.
async function convertToPng(mime, data) {
  const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG conversion failed')
  return blobToBase64(blob)
}

// Immagine in base64 normalizzata dal processo principale; se il formato non è decodificabile lì, passa prima dal browser.
export async function prepareImage(mime, data) {
  try {
    return await api.ai.prepareImage(data)
  } catch (error) {
    if (mime === 'image/png') throw error
    return api.ai.prepareImage(await convertToPng(mime, data))
  }
}

// Legge un file scelto o trascinato: { kind: 'image' | 'pdf', mime, data, label, size }.
export async function readAttachmentFile(filePath) {
  const result = await api.ai.readAttachment(filePath)
  if (result.kind !== 'raw-image') return result
  const prepared = await prepareImage(result.mime, result.data)
  return { kind: 'image', mime: prepared.mime, data: prepared.data, label: result.label, size: result.size }
}

// Il modello attivo legge questo tipo di allegato in modo nativo?
export const canAttach = (capabilities, kind) => Boolean(kind === 'pdf' ? capabilities?.pdf : capabilities?.vision)

// 1234 → "1.2k", 2500000 → "2.5M".
export function formatTokens(value) {
  const number = Number(value) || 0
  if (number >= 1e6) return `${(number / 1e6).toFixed(number >= 1e7 ? 0 : 1)}M`
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}k`
  return String(number)
}

export function formatBytes(value) {
  const number = Number(value) || 0
  if (number >= 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(number / 1024))} KB`
}

// Somma dei token di tutte le risposte di una conversazione.
export const totalUsage = (messages) => messages.reduce((sum, message) => ({
  input: sum.input + (message.usage?.input || 0),
  output: sum.output + (message.usage?.output || 0),
}), { input: 0, output: 0 })
