// Immagini incorporate nel Markdown (data: URI in base64): righe da milioni di caratteri che non servono a chi legge il testo.
// Nella vista sorgente e nel contesto dell'assistente si mostrano abbreviate; il documento le conserva intere.
const EMBEDDED = /(data:[a-z]+\/[a-z0-9.+-]+;base64,)([A-Za-z0-9+/=]{1500,})/gi
const PLACEHOLDER = /⟦[^⟧\n]*#(\d+)⟧/g

const size = (length) => (length >= 1048576 ? `${(length / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(length / 1024))} KB`)

/** Sostituisce i dati base64 lunghi con un segnaposto numerato; `blobs` serve a rimetterli (vedi expandEmbeddedImages). */
export function collapseEmbeddedImages(text) {
  const blobs = []
  const collapsed = String(text).replace(EMBEDDED, (_all, prefix, data) => {
    blobs.push(data)
    return `${prefix}⟦image data, ${size(data.length)} #${blobs.length}⟧`
  })
  return { text: collapsed, blobs }
}

/** Rimette i dati originali al posto dei segnaposto; un segnaposto sconosciuto (o modificato a mano) resta com'è. */
export function expandEmbeddedImages(text, blobs) {
  if (!blobs.length) return text
  return String(text).replace(PLACEHOLDER, (all, index) => blobs[Number(index) - 1] ?? all)
}

/** Per l'assistente: i dati dell'immagine non servono e riempirebbero il contesto. */
export function abbreviateEmbeddedImages(text) {
  return String(text).replace(EMBEDDED, (_all, prefix, data) => `${prefix}[${size(data.length)} of image data omitted]`)
}
