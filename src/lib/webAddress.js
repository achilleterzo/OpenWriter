import { isPrivateHost } from '../../electron/private-address.mjs'

// Indirizzi web che gli strumenti dell'assistente e degli agenti possono aprire: solo http e https, mai la rete locale o privata.
// La regola (IPv4 e IPv6 in ogni forma, indirizzi mappati, «localhost.») sta in electron/private-address.mjs, la stessa che il processo principale applica agli
// indirizzi risolti dal DNS e ai reindirizzamenti.
export { isPrivateHost }

// L'indirizzo (testo) come URL, se è una pagina web pubblica; altrimenti un errore che il modello capisce.
export function publicWebAddress(value) {
  let url
  try { url = new URL(String(value ?? '').trim()) } catch { throw new Error('Invalid address') }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http and https addresses are allowed')
  if (isPrivateHost(url.hostname)) throw new Error('Local and private-network addresses are not allowed')
  return url
}
