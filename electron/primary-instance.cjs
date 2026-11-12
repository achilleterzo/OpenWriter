const fs = require('node:fs')
const path = require('node:path')

/**
 * Più finestre dell'app (più processi, vedi «Apri in una nuova finestra») condividono tutto, tranne ciò che non può esistere due volte: il ponte e il server HTTP
 * degli agenti MCP. Li serve una sola istanza, la «principale»: chi ha il file di blocco (`primary-instance.lock` nei dati dell'app, con il suo pid).
 *
 * Le altre riprovano a intervalli: quando la principale si chiude (o muore) il blocco si libera, o il suo pid non esiste più, e un'altra la sostituisce,
 * avviando il ponte e il server HTTP al suo posto. Gli agenti perdono il collegamento per pochi secondi: il file con porta e token del ponte lo riscrive la nuova.
 *
 * `onAcquire()` parte a ogni passaggio di consegne (anche al primo avvio); `onRelease()` quando si perde o si lascia il ruolo.
 */
function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

function createPrimaryLock({ file, onAcquire = () => {}, onRelease = () => {}, intervalMs = 2500, pid = process.pid, alive = isAlive }) {
  let primary = false
  let timer = null

  const readOwner = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).pid } catch { return null } }

  // Il blocco si prende creando il file in modo esclusivo: due istanze che partono insieme non lo ottengono entrambe.
  function tryAcquire() {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const descriptor = fs.openSync(file, 'wx')
        try { fs.writeSync(descriptor, JSON.stringify({ pid, startedAt: new Date().toISOString() })) } finally { fs.closeSync(descriptor) }
        return true
      } catch (error) {
        if (error.code !== 'EEXIST') return false
        const owner = readOwner()
        if (owner === pid) return true
        // Un proprietario vivo lo tiene; un file illeggibile o con un pid che non esiste più è abbandonato: si toglie e si riprova.
        if (owner !== null && alive(owner)) return false
        try { fs.rmSync(file, { force: true }) } catch { return false }
      }
    }
    return false
  }

  function check() {
    if (primary) {
      // Il blocco ci è stato tolto (o preso): il ruolo è perso.
      if (readOwner() !== pid) { primary = false; try { onRelease() } catch (error) { console.error(error) } }
      return
    }
    if (tryAcquire()) { primary = true; try { onAcquire() } catch (error) { console.error(error) } }
  }

  function start() {
    check()
    if (!timer) { timer = setInterval(check, intervalMs); timer.unref?.() }
    return primary
  }

  function release() {
    if (timer) { clearInterval(timer); timer = null }
    if (readOwner() === pid) { try { fs.rmSync(file, { force: true }) } catch { /* già tolto */ } }
    if (primary) { primary = false; try { onRelease() } catch (error) { console.error(error) } }
  }

  return { start, release, check, isPrimary: () => primary }
}

module.exports = { createPrimaryLock, isAlive }
