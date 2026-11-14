const fs = require('node:fs')
const path = require('node:path')
const { withFileLock, isAlive } = require('./file-lock.cjs')

/**
 * Più finestre dell'app (più processi, vedi «Apri in una nuova finestra») condividono tutto, tranne ciò che non può esistere due volte: il ponte e il server HTTP
 * degli agenti MCP. Li serve una sola istanza, la «principale»: chi ha il file di blocco (`primary-instance.lock` nei dati dell'app, con il suo pid).
 *
 * Le altre riprovano a intervalli: quando la principale si chiude (o muore) il blocco si libera, o il suo pid non esiste più, e un'altra la sostituisce,
 * avviando il ponte e il server HTTP al suo posto. Gli agenti perdono il collegamento per pochi secondi: il file con porta e token del ponte lo riscrive la nuova.
 *
 * `onAcquire()` parte a ogni passaggio di consegne (anche al primo avvio); `onRelease()` quando si perde o si lascia il ruolo.
 */
function createPrimaryLock({ file, onAcquire = () => {}, onRelease = () => {}, intervalMs = 2500, pid = process.pid, alive = isAlive }) {
  let primary = false
  let timer = null

  const readOwner = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).pid } catch { return null } }

  // Il file di blocco compare già completo: si scrive in un file a parte e lo si collega al nome del blocco, un passo solo che riesce a una sola istanza.
  // Con una creazione seguita dalla scrittura, un'altra istanza potrebbe leggere il file ancora vuoto, crederlo abbandonato e prendersi il ruolo.
  function publish() {
    const staging = `${file}.${pid}.tmp`
    try {
      fs.writeFileSync(staging, JSON.stringify({ pid, startedAt: new Date().toISOString() }))
      try { fs.linkSync(staging, file); return true } catch (error) {
        if (error.code === 'EEXIST') return false
        // Un file system senza collegamenti fisici: la creazione esclusiva resta la garanzia, con la scrittura subito dopo.
        const descriptor = fs.openSync(file, 'wx')
        try { fs.writeSync(descriptor, fs.readFileSync(staging)) } finally { fs.closeSync(descriptor) }
        return true
      }
    } catch {
      return false
    } finally {
      try { fs.rmSync(staging, { force: true }) } catch { /* già tolto */ }
    }
  }

  function tryAcquire() {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    if (publish()) return true
    const owner = readOwner()
    if (owner === pid) return true
    // Un proprietario vivo lo tiene.
    if (owner !== null && alive(owner)) return false
    // Abbandonato (pid inesistente o file rovinato): lo si toglie sotto un blocco di recupero e solo se è ancora quello letto, altrimenti due istanze che
    // lo trovano abbandonato insieme se lo toglierebbero a vicenda, e la seconda butterebbe via il blocco appena preso dalla prima.
    withFileLock(`${file}.recovery`, () => {
      if (readOwner() === owner) { try { fs.rmSync(file, { force: true }) } catch { /* lo ha tolto un altro */ } }
    }, { pid, alive })
    return publish()
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
