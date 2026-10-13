const https = require('node:https')

// Controllo della nuova versione tramite le release pubbliche di GitHub (l'app non si aggiorna da sola: si apre la pagina del download).
const REPOSITORY = 'achilleterzo/OpenWriter'

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'OpenWriter', Accept: 'application/vnd.github+json' }, timeout: 15000 }, (response) => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { data += chunk })
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`GitHub release check failed (HTTP ${response.statusCode})`))
        try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid GitHub release response')) }
      })
    })
    request.on('timeout', () => request.destroy(new Error('GitHub release check timed out')))
    request.on('error', reject)
  })
}

const releaseVersion = (value) => String(value || '').replace(/^v/i, '').match(/^\d+(?:\.\d+){0,2}/)?.[0] || ''

function compareVersions(left, right) {
  const a = releaseVersion(left).split('.').map(Number)
  const b = releaseVersion(right).split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0)
    if (difference) return difference
  }
  return 0
}

// Ultima release pubblicata (non bozza) che abbia davvero un pacchetto scaricabile.
async function fetchLatestRelease() {
  const releases = await fetchJson(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`)
  const candidates = (Array.isArray(releases) ? releases : [releases]).filter((release) => {
    if (release.draft || !release.tag_name || !releaseVersion(release.tag_name)) return false
    const assets = Array.isArray(release.assets) ? release.assets : []
    return assets.some((asset) => asset.state === 'uploaded' && Number(asset.size) > 0 && asset.browser_download_url && /\.(exe|msi|dmg|appimage|deb|zip)$/i.test(asset.name || ''))
  })
  const release = candidates.sort((left, right) => compareVersions(right.tag_name, left.tag_name))[0]
  // Nessuna release pubblicata (ancora): non è un errore, semplicemente non c'è nulla da scaricare.
  if (!release) return null
  return { version: releaseVersion(release.tag_name), tag: release.tag_name, url: release.html_url, name: release.name || release.tag_name, notes: release.body || '' }
}

module.exports = { fetchLatestRelease, compareVersions, REPOSITORY }
