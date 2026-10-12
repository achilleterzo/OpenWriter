const dns = require('node:dns').promises
const net = require('node:net')
const { nativeImage } = require('electron')

const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024
const MAX_SIDE = 1568
const PNG_LIMIT_BYTES = 1_500_000
const MAX_REDIRECTS = 3
const FETCH_TIMEOUT_MS = 15000

// Indirizzi non pubblici: loopback, reti private, link-local, CGNAT, IPv6 locali e IPv4 "mappati".
function isPrivateAddress(address) {
  const ip = String(address).toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)
  if (mapped) return isPrivateAddress(mapped[1])
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number)
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  }
  if (net.isIPv6(ip)) return ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')
  return true
}

// Il controllo si fa sugli indirizzi risolti dal DNS, non solo sul nome: così "localtest.me" o un DNS ostile non aggirano il blocco.
async function assertPublicUrl(urlString) {
  let url
  try { url = new URL(urlString) } catch { throw new Error('Indirizzo non valido') }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Sono ammessi solo indirizzi http e https')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((entry) => entry.address)
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('Gli indirizzi locali e di rete privata non sono ammessi')
  return url
}

// Normalizza qualsiasi immagine: la rimpicciolisce se enorme e la ricodifica in PNG (o JPEG se pesante), formati accettati da tutti i modelli.
function prepareImage(image) {
  if (!image || image.isEmpty()) throw new Error('Immagine vuota o formato non supportato')
  let current = image
  const { width, height } = current.getSize()
  const longest = Math.max(width, height)
  if (longest > MAX_SIDE) current = current.resize({ width: Math.round((width * MAX_SIDE) / longest), height: Math.round((height * MAX_SIDE) / longest), quality: 'best' })
  const size = current.getSize()
  const png = current.toPNG()
  if (png.length <= PNG_LIMIT_BYTES) return { mime: 'image/png', data: png.toString('base64'), width: size.width, height: size.height }
  return { mime: 'image/jpeg', data: current.toJPEG(85).toString('base64'), width: size.width, height: size.height }
}

const prepareBuffer = (buffer) => prepareImage(nativeImage.createFromBuffer(buffer))

function decodeDataUrl(urlString) {
  const match = /^data:image\/([a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(urlString)
  if (!match) throw new Error('Immagine incorporata non valida')
  if (/svg/i.test(match[1])) throw new Error('Le immagini SVG non sono supportate')
  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error('Immagine troppo grande')
  return buffer
}

async function readLimited(response) {
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    total += chunk.length
    if (total > MAX_DOWNLOAD_BYTES) throw new Error('Immagine troppo grande (oltre 8 MB)')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** Scarica un'immagine http(s) o decodifica una data: URL, controllando a ogni reindirizzamento che l'indirizzo sia pubblico. */
async function fetchImage(urlString) {
  if (/^data:/i.test(urlString)) return prepareBuffer(decodeDataUrl(urlString))
  let current = urlString
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(current)
    const response = await fetch(current, { redirect: 'manual', headers: { Accept: 'image/*', 'User-Agent': 'OpenWriter' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location'), current).href
      continue
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const type = String(response.headers.get('content-type') || '').toLowerCase()
    if (!type.startsWith('image/')) throw new Error(`Il collegamento non è un'immagine (${type || 'tipo sconosciuto'})`)
    if (type.includes('svg')) throw new Error('Le immagini SVG non sono supportate')
    return prepareBuffer(await readLimited(response))
  }
  throw new Error('Troppi reindirizzamenti')
}

module.exports = { fetchImage, prepareImage, prepareBuffer, assertPublicUrl, isPrivateAddress, MAX_DOWNLOAD_BYTES }
