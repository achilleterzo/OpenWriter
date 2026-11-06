// Indirizzi che un assistente o un agente non può raggiungere con il browser dell'app: rete locale, privata, di servizio. Un'unica regola per l'interfaccia
// (src/lib/webAddress.js, che la importa) e per il processo principale (che controlla gli indirizzi risolti dal DNS e i reindirizzamenti).
// Il modulo è ES perché lo legge anche Vite; il processo principale lo carica con import().

const toNumbers = (text) => text.split('.').map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN))

// IPv4 in notazione puntata (a.b.c.d) → true se non è un indirizzo pubblico. Chi non è un IPv4 valido → null.
function privateIPv4(text) {
  const parts = toNumbers(text)
  if (parts.length !== 4 || parts.some((part) => !(part >= 0 && part <= 255))) return null
  const [a, b, c] = parts
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127) // CGNAT
    || (a === 169 && b === 254) // link-local, anche i metadati dei servizi cloud
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 0) // protocolli IETF
    || (a === 198 && (b === 18 || b === 19)) // prove di prestazioni
    || a >= 224 // multicast e riservati, broadcast compreso
}

// IPv6 (anche con un IPv4 in fondo) → otto gruppi da 16 bit, oppure null.
function parseIPv6(text) {
  let value = text.toLowerCase()
  const zone = value.indexOf('%')
  if (zone >= 0) value = value.slice(0, zone)
  if (!value.includes(':')) return null
  const tail = value.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (tail) {
    const v4 = toNumbers(tail[1])
    if (v4.some((part) => !(part >= 0 && part <= 255))) return null
    value = `${value.slice(0, -tail[1].length)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`
  }
  const halves = value.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - rest.length).fill('0'), ...rest] : head
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => parseInt(group, 16))
}

const v4Of = (high, low) => `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`

function privateIPv6(groups) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups
  if (groups.every((group) => group === 0)) return true // ::
  if (groups.slice(0, 7).every((group) => group === 0) && g7 === 1) return true // ::1
  // Indirizzi che contengono un IPv4: vale quello (mappato ::ffff:a.b.c.d, compatibile ::a.b.c.d, NAT64 64:ff9b::/96, 6to4 2002:ab:cd::).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && (g5 === 0xffff || g5 === 0)) return privateIPv4(v4Of(g6, g7)) !== false
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return privateIPv4(v4Of(g6, g7)) !== false
  if (g0 === 0x2002) return privateIPv4(v4Of(g1, g2)) !== false
  return (g0 & 0xfe00) === 0xfc00 // fc00::/7 unique local
    || (g0 & 0xffc0) === 0xfe80 // fe80::/10 link-local
    || (g0 & 0xffc0) === 0xfec0 // fec0::/10 site-local (obsoleto)
    || (g0 & 0xff00) === 0xff00 // multicast
}

/** Un indirizzo IP (IPv4 o IPv6, scritto in qualunque forma) non pubblico. Un testo che non è un IP → false. */
export function isPrivateAddress(address) {
  const text = String(address || '').trim().replace(/^\[|\]$/g, '')
  const v6 = parseIPv6(text)
  if (v6) return privateIPv6(v6)
  return privateIPv4(text) === true
}

/** Il nome di un host (come in `URL.hostname`) di una rete non pubblica: «localhost» e simili, oppure un IP privato. I nomi che solo il DNS può risolvere si controllano a parte. */
export function isPrivateHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localdomain') || host.endsWith('.home.arpa')) return true
  return isPrivateAddress(host)
}
