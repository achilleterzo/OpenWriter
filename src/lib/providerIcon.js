// Icona personalizzata di un provider: un'immagine scelta dall'utente, ridotta a un quadrato di `size` pixel (si mantengono le proporzioni, sfondo
// trasparente) e codificata PNG come data URL, così nelle impostazioni occupa pochi KB e funziona anche con SVG e formati che la lista non ammette.
export function imageToIcon(file, size = 64) {
  return new Promise((resolve, reject) => {
    if (!file || !String(file.type || '').startsWith('image/')) { reject(new Error('Not an image')); return }
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        const ratio = Math.min(size / (image.naturalWidth || size), size / (image.naturalHeight || size))
        const width = Math.max(1, Math.round((image.naturalWidth || size) * ratio))
        const height = Math.max(1, Math.round((image.naturalHeight || size) * ratio))
        context.drawImage(image, Math.round((size - width) / 2), Math.round((size - height) / 2), width, height)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image could not be read')) }
    image.src = url
  })
}
