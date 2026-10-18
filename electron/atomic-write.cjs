const fs = require('node:fs')

// Su Windows rinominare un file sopra un altro può fallire (EPERM, EBUSY, EACCES) se in quel momento un altro processo lo tiene aperto:
// antivirus, indicizzatore, sincronizzazione cloud, o il watcher di un server di sviluppo. Di solito dura un attimo.
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RETRY_DELAYS_MS = [20, 40, 80, 160, 320]

const pause = (milliseconds) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)

function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(from, to)
      return
    } catch (error) {
      if (!RETRYABLE.has(error.code) || attempt >= RETRY_DELAYS_MS.length) throw error
      pause(RETRY_DELAYS_MS[attempt])
    }
  }
}

/**
 * Scrittura atomica: il contenuto va prima in `<file>.tmp` e poi sostituisce il file, così un crash a metà non lascia un file troncato.
 * Se la sostituzione resta bloccata dopo i tentativi, come ultima risorsa si scrive sul posto (non atomico, ma il lavoro non va perso).
 */
function writeFileAtomic(file, content) {
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, content)
  try {
    renameWithRetry(temporary, file)
  } catch (error) {
    if (!RETRYABLE.has(error.code)) throw error
    fs.writeFileSync(file, content)
    try { fs.rmSync(temporary, { force: true }) } catch { /* resta un .tmp innocuo */ }
  }
}

module.exports = { writeFileAtomic }
