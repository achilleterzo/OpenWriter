// Indirizzi web che gli strumenti dell'assistente e degli agenti possono aprire: solo http e https, mai la rete locale o privata.
export function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === '::1') return true
  const parts = host.split('.').map(Number)
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part))) {
    const [a, b] = parts
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  return false
}

// L'indirizzo (testo) come URL, se è una pagina web pubblica; altrimenti un errore che il modello capisce.
export function publicWebAddress(value) {
  let url
  try { url = new URL(String(value ?? '').trim()) } catch { throw new Error('Invalid address') }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https addresses are allowed')
  if (isPrivateHost(url.hostname)) throw new Error('Local and private-network addresses are not allowed')
  return url
}
