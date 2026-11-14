const fs = require('node:fs')
const path = require('node:path')

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

const pause = (ms) => {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) } catch { /* senza attesa si riprova subito */ }
}

/**
 * Una sezione critica tra processi: `fn()` gira con il file di blocco `file` in mano, e chi arriva dopo aspetta (le chiamate sono sincrone, come quelle che protegge).
 * Il blocco si prende creando il file in modo esclusivo, con il pid di chi lo tiene. È abbandonato se il pid non esiste più, o se il file è fermo da `staleMs`
 * (un file appena creato e ancora vuoto non lo è: chi lo ha creato lo sta scrivendo). Prima di toglierlo si rilegge il proprietario, così non si butta via
 * il blocco appena preso da un altro. Se non si ottiene entro `timeoutMs` si esegue lo stesso: meglio una scrittura non protetta che un'app che non salva.
 */
function withFileLock(file, fn, { timeoutMs = 3000, staleMs = 10000, pid = process.pid, alive = isAlive } = {}) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }) } catch { /* lo si vedrà sotto */ }
  const deadline = Date.now() + timeoutMs
  let held = false

  while (!held && Date.now() < deadline) {
    try {
      const descriptor = fs.openSync(file, 'wx')
      try { fs.writeSync(descriptor, JSON.stringify({ pid })) } finally { fs.closeSync(descriptor) }
      held = true
    } catch (error) {
      if (error.code !== 'EEXIST') break
      if (abandoned(file, staleMs, alive)) { try { fs.rmSync(file, { force: true }) } catch { /* lo ha tolto un altro */ } }
      else pause(15)
    }
  }

  try { return fn() } finally {
    if (held) { try { fs.rmSync(file, { force: true }) } catch { /* già tolto */ } }
  }
}

function abandoned(file, staleMs, alive) {
  let owner = null
  let modified = 0
  try { modified = fs.statSync(file).mtimeMs } catch { return false }
  try { owner = JSON.parse(fs.readFileSync(file, 'utf8')).pid } catch { /* in scrittura o rovinato */ }
  if (Number.isInteger(owner)) {
    if (!alive(owner)) return reread(file) === owner
    return false
  }
  return Date.now() - modified > staleMs
}

function reread(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')).pid } catch { return null }
}

module.exports = { withFileLock, isAlive }
