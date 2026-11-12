const crypto = require('node:crypto')
const fs = require('node:fs')

/**
 * Indice di ricerca per rilevanza (SQLite FTS5) sui documenti dei progetti. È solo un indice derivato: la verità sono i file, e se il database è
 * corrotto o di una versione diversa si cancella e si rifà. L'unico punto che conosce SQLite è questo modulo (`node:sqlite` è ancora sperimentale).
 *
 * Un documento si divide in frammenti lungo le intestazioni Markdown (e, se una sezione è lunga, per paragrafo); ogni frammento conserva il
 * percorso delle intestazioni e le righe del file, così chi cerca può citarlo e leggerlo con `read_file`. I percorsi dei file sono relativi alla
 * radice del progetto, con `/`.
 */
const SCHEMA_VERSION = 3
const MAX_CHUNK_WORDS = 250
const MAX_QUERY_TERMS = 12
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const DEFAULT_PER_FILE = 3
const SNIPPET_WORDS = 24
const BUSY_TIMEOUT_MS = 5000
const RRF_K = 60 // costante della fusione per rango (Reciprocal Rank Fusion): quanto pesa il primo posto rispetto al decimo
const VECTOR_CANDIDATES = 4 // quanti candidati per risultato chiede la ricerca per significato (poi si fonde e si scarta il resto)
// Quanto un passaggio deve somigliare alla domanda per contare "per significato". I modelli di testo (e5) danno somiglianze in un intervallo stretto (0,75-0,90):
// anche una domanda senza risposta ha i suoi "più vicini" a 0,83, quindi una soglia fissa non regge. Si misura invece quanto un passaggio si stacca dagli altri
// per QUELLA domanda: il suo punteggio z (scostamenti standard sopra la media delle somiglianze con tutti i passaggi cercati).
const Z_STRONG = 4 // un gruppo si stacca se almeno MIN_STRONG passaggi stanno sopra z 4: senza, i "vicini" sono rumore (anche se una parola compare per caso in un passaggio)
const MIN_STRONG = 3
const Z_WITH_WORDS = 3 // dato il gruppo, se anche le parole trovano qualcosa i vicini per significato si aggiungono da z 3…
const Z_ALONE = 3.5 // …senza parole in comune da z 3,5
const REL_FLOOR = 2 // fattore di pertinenza mostrato: 0 a z 2 (un passaggio qualunque), 1 a z 6 (un passaggio che si stacca nettamente)
const REL_CEIL = 6
const MIN_POPULATION = 60 // con meno vettori la media e la deviazione non dicono nulla: si tiene tutto come prima

const wordCount = (text) => (text.match(/\S+/g) || []).length

// Un frammento senza una lettera né una cifra (`###`, `---`, `***`, righe di tabella vuote…) non dice nulla e, ereditando i titoli, sale nei risultati: non si indicizza.
const HAS_CONTENT = /[\p{L}\p{N}]/u
// Versione del modo di dividere i documenti: se cambia, all'apertura i file si rileggono (i vettori dei frammenti rimasti uguali si riusano, sono legati al testo).
const CHUNKER_VERSION = '3'

// Immagini incorporate (`data:image/png;base64,…`, spesso centinaia di migliaia di caratteri su una riga, tipiche delle definizioni `[image1]: <data:…>` dei
// documenti esportati): non sono testo, non si cercano e fanno solo massa. Si sostituiscono con `…`, le righe restano le stesse.
const DATA_URI = /(data:[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+;base64,)[A-Za-z0-9+\/=]{64,}/g
const stripEmbeddedData = (line) => (line.length > 200 ? line.replace(DATA_URI, '$1…') : line)

// Il testo che si trasforma in vettore per un frammento (il percorso delle intestazioni aiuta a capirne l'argomento). La sua impronta è la chiave
// del vettore: un frammento che non cambia tra due indicizzazioni non si ricalcola.
const embeddingText = (heading, text) => (heading ? `${heading}
${text}` : text)
const embeddingHash = (heading, text) => crypto.createHash('sha1').update(embeddingText(heading, text)).digest('hex')

function isAvailable() {
  try { require('node:sqlite'); return true } catch { return false }
}

// Divide un testo Markdown in frammenti { heading, startLine, endLine, text }. Le righe sono 1-based. Le intestazioni dentro un blocco di codice
// (``` o ~~~) non contano. Una sezione senza testo non produce frammenti (il suo titolo vive nel percorso dei frammenti figli).
function chunkMarkdown(source, { maxWords = MAX_CHUNK_WORDS } = {}) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')
  const chunks = []
  const stack = []
  let fence = null
  let block = []
  let pending = []
  let pendingWords = 0
  let heading = ''

  const keep = (chunk) => { if (HAS_CONTENT.test(chunk.text)) chunks.push(chunk) }

  const flush = () => {
    if (!pending.length) return
    keep({ heading, startLine: pending[0].start, endLine: pending[pending.length - 1].end, text: pending.map((item) => item.text).join('\n\n') })
    pending = []
    pendingWords = 0
  }

  // Un paragrafo più lungo del massimo si spezza per frasi (stesse righe per tutti i pezzi).
  const pushParagraph = (text, start, end) => {
    const words = wordCount(text)
    if (words > maxWords) {
      flush()
      let piece = ''
      for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
        if (piece && wordCount(piece) + wordCount(sentence) > maxWords) {
          keep({ heading, startLine: start, endLine: end, text: piece })
          piece = ''
        }
        piece = piece ? `${piece} ${sentence}` : sentence
      }
      if (piece) keep({ heading, startLine: start, endLine: end, text: piece })
      return
    }
    if (pendingWords + words > maxWords) flush()
    pending.push({ text, start, end })
    pendingWords += words
  }

  const endBlock = () => {
    if (!block.length) return
    const text = block.map((item) => item.text).join('\n').trim()
    if (text && HAS_CONTENT.test(text)) pushParagraph(text, block[0].line, block[block.length - 1].line)
    block = []
  }

  // L'intestazione YAML in testa al file (tra due righe `---`, per esempio quella delle pagine web salvate) è metadato, non testo: non si indicizza (le righe restano quelle).
  let frontmatterEnd = -1
  if (lines[0]?.trim() === '---') {
    for (let index = 1; index < Math.min(lines.length, 80); index += 1) {
      if (lines[index].trim() === '---') { frontmatterEnd = index; break }
    }
  }

  lines.forEach((original, index) => {
    if (index <= frontmatterEnd) return
    const raw = stripEmbeddedData(original)
    const line = index + 1
    const fenceMark = /^\s{0,3}(`{3,}|~{3,})/.exec(raw)
    if (fenceMark) {
      if (!fence) fence = fenceMark[1][0]
      else if (fenceMark[1][0] === fence) fence = null
      block.push({ text: raw, line })
      return
    }
    const atx = !fence && /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(raw)
    if (atx) {
      endBlock()
      flush()
      const level = atx[1].length
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
      stack.push({ level, title: atx[2].trim() })
      heading = stack.map((item) => item.title).join(' › ')
      return
    }
    if (!fence && !raw.trim()) { endBlock(); return }
    block.push({ text: raw, line })
  })
  endBlock()
  flush()
  return chunks
}

// Parole cercate → espressione per MATCH. Ogni parola va tra virgolette (punteggiatura e operatori di FTS5 non devono mai arrivare alla sintassi) e
// l'ultima è un prefisso (si cerca mentre si scrive). Una frase tra virgolette resta una frase. `mode`: 'and' (tutte) o 'or' (almeno una).
const STOPWORDS = new Set(`
a ad al alla alle allo agli ai all anche che chi ci col come con contro cui da dal dalla dalle dallo dai dagli dei del della delle dello degli di dove e ed era gli ha ho i il in io la le lei lo loro lui ma mi mia
miei mio ne nel nella nelle nello nei negli noi non o per più se si sono su sul sulla sulle sullo sui sugli tra fra tu tua tuo un una uno vi voi
the of and to in is it that for on with as by at an be this from or are was were not but have has had
el la los las un una unos unas de del y o que en con por para se su sus al lo como pero más
le la les un une des du de et ou que qui dans pour par sur avec au aux ce ces son sa ses est sont pas mais plus
der die das ein eine einen und oder dass nicht mit von zu im am auf für ist sind den dem des
o os as um uma uns umas do dos da das no nos na nas em com para por
`.split(/\s+/).filter(Boolean))

// `mode` 'or': le parole funzionali (di, della, the…) non contano: "almeno una parola" con "di" trova qualsiasi cosa. Se la domanda è fatta solo di quelle, restano.
function buildMatchQuery(input, mode = 'and', { exact = false } = {}) {
  const terms = []
  const text = String(input ?? '')
  // «Parole intere»: tutta la domanda è una sola frase, parole intere nell'ordine scritto (nessuna parola ridotta a prefisso, nessuna "almeno una").
  if (exact) {
    const words = (text.match(/[\p{L}\p{N}]+/gu) || []).slice(0, MAX_QUERY_TERMS * 4)
    return words.length ? `"${words.join(' ')}"` : ''
  }
  const phrases = []
  const rest = text.replace(/"([^"]+)"/g, (_, phrase) => {
    const words = phrase.match(/[\p{L}\p{N}]+/gu)
    if (words?.length) phrases.push(`"${words.join(' ')}"`)
    return ' '
  })
  let words = rest.match(/[\p{L}\p{N}]+/gu) || []
  if (mode === 'or') {
    const meaningful = words.filter((word) => !STOPWORDS.has(word.toLowerCase()))
    if (meaningful.length) words = meaningful
  }
  for (const [index, word] of words.entries()) terms.push(index === words.length - 1 && !phrases.length && word.length >= 2 ? `"${word}"*` : `"${word}"`)
  const all = [...phrases, ...terms].slice(0, MAX_QUERY_TERMS)
  return all.join(mode === 'or' ? ' OR ' : ' ')
}

const escapeLike = (value) => value.replace(/[\\%_]/g, (character) => `\\${character}`)

function configure(db, file) {
  db.exec(`pragma busy_timeout=${BUSY_TIMEOUT_MS}`)
  if (file !== ':memory:') db.exec('pragma journal_mode=wal; pragma synchronous=normal')
}

function createSchema(db) {
  db.exec(`
    create table if not exists meta (key text primary key, value text);
    create table if not exists files (
      id integer primary key,
      project text not null,
      path text not null,
      mtime_ms real,
      size integer,
      hash text not null,
      indexed_at integer not null,
      unique (project, path)
    );
    create table if not exists chunks (
      id integer primary key,
      file_id integer not null,
      ord integer not null,
      heading text not null,
      start_line integer not null,
      end_line integer not null,
      text text not null,
      hash text not null
    );
    create index if not exists chunks_file on chunks (file_id);
    create index if not exists chunks_hash on chunks (hash);
    -- Vettori (ricerca per significato): derivati come tutto il resto. Una riga per modello e per testo distinto: due modelli (CPU e GPU) convivono, e passare
    -- dall'uno all'altro calcola solo ciò che manca. Vuota finché non si attiva la ricerca semantica.
    create table if not exists embeddings (model text not null, hash text not null, vector blob not null, primary key (model, hash));
    -- Vettori delle parole del vocabolario (le parole che compaiono nei testi): servono a trovare i sinonimi nei propri testi, senza modello linguistico.
    create table if not exists word_embeddings (model text not null, word text not null, vector blob not null, primary key (model, word));
    create virtual table if not exists chunks_fts using fts5(
      text, heading,
      content='chunks', content_rowid='id',
      tokenize='unicode61 remove_diacritics 2', prefix='2 3'
    );
    -- Il vocabolario: le parole (già senza maiuscole né accenti) con quante volte compaiono.
    create virtual table if not exists chunks_vocab using fts5vocab(chunks_fts, 'row');
    create trigger if not exists chunks_ai after insert on chunks begin
      insert into chunks_fts(rowid, text, heading) values (new.id, new.text, new.heading);
    end;
    create trigger if not exists chunks_ad after delete on chunks begin
      insert into chunks_fts(chunks_fts, rowid, text, heading) values ('delete', old.id, old.text, old.heading);
    end;
  `)
}

// Versione 2: `embeddings (hash, vector)` e il modello in `meta`. Si rinomina la tabella vecchia; createSchema crea la nuova; finishMigrationFrom2 copia.
function migrateFrom2(db) {
  try { db.exec('alter table embeddings rename to embeddings_v2'); return true } catch { return false }
}

function finishMigrationFrom2(db) {
  const model = db.prepare("select value from meta where key = 'embedding_model'").get()?.value || 'multilingual-e5-small-q8'
  db.prepare('insert or ignore into embeddings(model, hash, vector) select ?, hash, vector from embeddings_v2').run(model)
  db.exec("drop table embeddings_v2; delete from meta where key = 'embedding_model'")
}

function dropAll(db) {
  db.exec(`
    drop trigger if exists chunks_ai; drop trigger if exists chunks_ad;
    drop table if exists chunks_vocab; drop table if exists word_embeddings;
    drop table if exists chunks_fts; drop table if exists chunks; drop table if exists embeddings; drop table if exists embeddings_v2; drop table if exists files; drop table if exists meta;
  `)
}

// Chi legge soltanto (il server MCP, mentre l'app scrive) non crea, non rifà e non cancella nulla: se il file manca o è di un'altra versione, errore.
function openReadOnly(file) {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    db.exec(`pragma busy_timeout=${BUSY_TIMEOUT_MS}`)
    const version = db.prepare("select value from meta where key = 'schema'").get()?.value
    if (version !== String(SCHEMA_VERSION)) throw new Error('The search index is of another version: open the project in OpenWriter to rebuild it')
    return db
  } catch (error) {
    try { db.close() } catch { /* già chiuso */ }
    throw error
  }
}

// Apre il database; se è di un'altra versione si rifà, se è illeggibile si cancella il file e si ricomincia (è solo un indice).
function openIndex(file, readOnly = false) {
  if (readOnly) return openReadOnly(file)
  const attempt = () => {
    const { DatabaseSync } = require('node:sqlite')
    const db = new DatabaseSync(file)
    try {
      configure(db, file)
      let version = null
      try { version = db.prepare("select value from meta where key = 'schema'").get()?.value } catch { /* tabella assente: database nuovo */ }
      // Dalla versione 2 non si butta nulla: i vettori (costano minuti) passano sotto l'identificativo del modello con cui erano stati calcolati.
      const migrated = version === '2' ? migrateFrom2(db) : false
      if (version !== null && version !== String(SCHEMA_VERSION) && !migrated) dropAll(db)
      createSchema(db)
      if (migrated) finishMigrationFrom2(db)
      // Un chunker diverso: i file si rileggono alla prossima scansione (hash e data azzerati); i vettori dei frammenti identici restano.
      if (db.prepare("select value from meta where key = 'chunker'").get()?.value !== CHUNKER_VERSION) {
        db.exec("update files set hash = '', mtime_ms = null")
        db.prepare("insert or replace into meta(key, value) values ('chunker', ?)").run(CHUNKER_VERSION)
      }
      db.prepare("insert or replace into meta(key, value) values ('schema', ?)").run(String(SCHEMA_VERSION))
      db.exec('pragma quick_check')
      return db
    } catch (error) {
      // Il file va chiuso prima di poterlo cancellare (su Windows resta bloccato).
      try { db.close() } catch { /* già chiuso */ }
      throw error
    }
  }
  try { return attempt() } catch (error) {
    if (file === ':memory:') throw error
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true })
    return attempt()
  }
}

/**
 * Fonde più elenchi già ordinati per rilevanza (Reciprocal Rank Fusion): un frammento vale la somma di 1/(RRF_K + posto) in ogni elenco, quindi
 * chi sta in alto in entrambi vince e nessuna scala di punteggi (BM25, somiglianza) va confrontata con l'altra. Di un frammento presente in più
 * elenchi si tiene la prima riga (quella per parole, con l'evidenziazione).
 */
function fuseRanked(lists) {
  const merged = new Map()
  lists.forEach((rows, listIndex) => {
    rows.forEach((row, position) => {
      const entry = merged.get(row.id) || { row, score: 0, via: new Set() }
      entry.score += 1 / (RRF_K + position + 1)
      entry.via.add(listIndex)
      merged.set(row.id, entry)
    })
  })
  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ row, score, via }) => ({ ...row, score, via: via.size > 1 ? 'both' : via.has(0) ? 'words' : 'meaning' }))
}

/**
 * Quali vicini "per significato" sono davvero pertinenti. `items`: [{ similarity }] dal più vicino; `stats`: { population, mean, std } delle somiglianze della domanda
 * con tutti i passaggi cercati; `hasWords`: le parole della domanda hanno già trovato dei passaggi. Una domanda senza risposta ("Tardigrado") non dà passaggi:
 * meglio nessun risultato che dieci a caso. Ogni elemento tenuto riceve `z`.
 */
function relevantNeighbors(items, stats, hasWords) {
  if (!stats || stats.population < MIN_POPULATION || !(stats.std > 1e-6)) return items
  const scored = items.map((item) => ({ ...item, z: (item.similarity - stats.mean) / stats.std }))
  // Il gruppo che si stacca serve sempre: una sola parola trovata per caso non rende pertinenti i passaggi "vicini" a essa.
  if (scored.filter((item) => item.z >= Z_STRONG).length < MIN_STRONG) return []
  return scored.filter((item) => item.z >= (hasWords ? Z_WITH_WORDS : Z_ALONE))
}

// Il fattore di pertinenza (0-1) di un passaggio, da z.
const relevanceOf = (z) => Math.max(0, Math.min(1, (z - REL_FLOOR) / (REL_CEIL - REL_FLOOR)))

/**
 * `file`: percorso del database (o ':memory:' nei test); `readOnly`: solo ricerca, senza mai toccare il file (vedi openReadOnly). Ogni funzione prende il progetto (la sua radice, una stringa qualsiasi purché sempre la
 * stessa) e percorsi relativi con `/`.
 */
function createKnowledgeIndex({ file, readOnly = false }) {
  const db = openIndex(file, readOnly)

  const transaction = (work) => {
    db.exec('begin immediate')
    try { const result = work(); db.exec('commit'); return result } catch (error) { db.exec('rollback'); throw error }
  }
  const fileRow = (project, relative) => db.prepare('select id, hash, mtime_ms, size from files where project = ? and path = ?').get(project, relative)
  const deleteChunks = (fileId) => db.prepare('delete from chunks where file_id = ?').run(fileId)

  // I frammenti più vicini al vettore della domanda (prodotto scalare: i vettori sono normalizzati), dal più vicino. Il confronto è esaustivo, come
  // in qualsiasi indice vettoriale a questa scala: per migliaia di frammenti costa pochi millisecondi.
  function vectorCandidates(projects, queryVector, scope, count, model) {
    const filter = scope && projects.length === 1 ? "and (f.path = ? or f.path like ? escape '\\')" : ''
    const params = [model, ...projects, ...(filter ? [scope, `${escapeLike(scope)}/%`] : [])]
    const rows = db.prepare(`
      select c.id as id, e.vector as vector
      from embeddings e join chunks c on c.hash = e.hash join files f on f.id = c.file_id
      where e.model = ? and f.project in (${projects.map(() => '?').join(',')}) ${filter}
    `).iterate(...params)
    const dimensions = queryVector.length
    const scratch = new Float32Array(dimensions)
    const scratchBytes = new Uint8Array(scratch.buffer)
    const best = [] // [{ id, similarity }] in ordine decrescente, lungo al più `count`
    // Media e deviazione di tutte le somiglianze (Welford): il confronto è già esaustivo, la statistica non costa nulla in più.
    const stats = { population: 0, mean: 0, std: 0 }
    let spread = 0
    for (const row of rows) {
      if (row.vector.byteLength !== scratchBytes.byteLength) continue
      scratchBytes.set(row.vector)
      let similarity = 0
      for (let k = 0; k < dimensions; k += 1) similarity += scratch[k] * queryVector[k]
      stats.population += 1
      const delta = similarity - stats.mean
      stats.mean += delta / stats.population
      spread += delta * (similarity - stats.mean)
      if (best.length >= count && similarity <= best[best.length - 1].similarity) continue
      let position = best.length
      while (position > 0 && best[position - 1].similarity < similarity) position -= 1
      best.splice(position, 0, { id: row.id, similarity })
      if (best.length > count) best.pop()
    }
    stats.std = stats.population > 1 ? Math.sqrt(spread / stats.population) : 0
    if (!best.length) return { items: [], stats }
    const details = new Map(db.prepare(`
      select c.id as id, f.project as project, f.path as path, c.heading as heading, c.start_line as startLine, c.end_line as endLine, c.text as text
      from chunks c join files f on f.id = c.file_id where c.id in (${best.map(() => '?').join(',')})
    `).all(...best.map((item) => item.id)).map((row) => [row.id, row]))
    const items = best.filter((item) => details.has(item.id)).map((item) => {
      const { text, ...row } = details.get(item.id)
      const words = text.replace(/\s+/g, ' ').trim().split(' ')
      return { ...row, snippet: words.slice(0, SNIPPET_WORDS * 2).join(' ') + (words.length > SNIPPET_WORDS * 2 ? '…' : ''), similarity: item.similarity }
    })
    return { items, stats }
  }

  return {
    // Indicizza (o reindicizza) un documento. Se il testo non è cambiato non fa nulla, salvo aggiornare data e dimensione.
    indexFile(project, relative, text, { mtimeMs = null, size = null } = {}) {
      const hash = crypto.createHash('sha1').update(String(text)).digest('hex')
      return transaction(() => {
        const existing = fileRow(project, relative)
        if (existing?.hash === hash) {
          db.prepare('update files set mtime_ms = ?, size = ?, indexed_at = ? where id = ?').run(mtimeMs, size, Date.now(), existing.id)
          return { changed: false }
        }
        let fileId = existing?.id
        if (fileId) {
          deleteChunks(fileId)
          db.prepare('update files set mtime_ms = ?, size = ?, hash = ?, indexed_at = ? where id = ?').run(mtimeMs, size, hash, Date.now(), fileId)
        } else {
          fileId = Number(db.prepare('insert into files(project, path, mtime_ms, size, hash, indexed_at) values (?, ?, ?, ?, ?, ?)').run(project, relative, mtimeMs, size, hash, Date.now()).lastInsertRowid)
        }
        const insert = db.prepare('insert into chunks(file_id, ord, heading, start_line, end_line, text, hash) values (?, ?, ?, ?, ?, ?, ?)')
        const chunks = chunkMarkdown(text)
        chunks.forEach((chunk, order) => insert.run(fileId, order, chunk.heading, chunk.startLine, chunk.endLine, chunk.text, embeddingHash(chunk.heading, chunk.text)))
        return { changed: true, chunks: chunks.length }
      })
    },

    removeFile(project, relative) {
      return transaction(() => {
        const existing = fileRow(project, relative)
        if (!existing) return false
        deleteChunks(existing.id)
        db.prepare('delete from files where id = ?').run(existing.id)
        return true
      })
    },

    // Elimina una cartella (e tutto ciò che contiene) o un file.
    removePath(project, relative) {
      return transaction(() => {
        const rows = db.prepare("select id from files where project = ? and (path = ? or path like ? escape '\\')").all(project, relative, `${escapeLike(relative)}/%`)
        for (const row of rows) { deleteChunks(row.id); db.prepare('delete from files where id = ?').run(row.id) }
        return rows.length
      })
    },

    // Un file o una cartella è stato rinominato o spostato: i frammenti restano, cambia solo il percorso. Ciò che c'era già a destinazione si scarta.
    movePath(project, from, to) {
      return transaction(() => {
        const rows = db.prepare("select id, path from files where project = ? and (path = ? or path like ? escape '\\')").all(project, from, `${escapeLike(from)}/%`)
        for (const row of rows) {
          const target = to + row.path.slice(from.length)
          const clash = fileRow(project, target)
          if (clash) { deleteChunks(clash.id); db.prepare('delete from files where id = ?').run(clash.id) }
          db.prepare('update files set path = ? where id = ?').run(target, row.id)
        }
        return rows.length
      })
    },

    // File già indicizzati con data e dimensione, per decidere cosa rileggere dopo una scansione.
    listFiles(project) {
      return new Map(db.prepare('select path, mtime_ms, size from files where project = ?').all(project).map((row) => [row.path, { mtimeMs: row.mtime_ms, size: row.size }]))
    },

    clearProject(project) {
      return transaction(() => {
        for (const row of db.prepare('select id from files where project = ?').all(project)) deleteChunks(row.id)
        return db.prepare('delete from files where project = ?').run(project).changes
      })
    },

    /**
     * Cerca per rilevanza. Prima tutte le parole (l'ultima come prefisso), poi, se non esce nulla, almeno una. `folder` limita a una cartella o
     * a un file; `maxPerFile` evita che un solo documento riempia l'elenco. Con `queryVector` (il vettore della domanda, vedi
     * semantic-embedder.cjs) la ricerca per parole si fonde con quella per significato: stessa lista, ordinata per rango in entrambe.
     * → { mode: 'and' | 'or' | 'hybrid', results: [{ id, project, path, heading, startLine, endLine, snippet, score }] }
     */
    search(projectOrProjects, query, { limit = DEFAULT_LIMIT, folder = '', maxPerFile = DEFAULT_PER_FILE, queryVector = null, model = '', includeWeak = false, exact = false } = {}) {
      const size = Math.min(MAX_LIMIT, Math.max(1, Math.round(Number(limit)) || DEFAULT_LIMIT))
      const perFile = Math.max(1, Math.round(Number(maxPerFile)) || DEFAULT_PER_FILE)
      const scope = String(folder || '').replace(/^\/+|\/+$/g, '')
      // Più progetti insieme (il progetto e le cartelle di riferimento): ogni risultato dice da quale viene; `folder` vale solo con un progetto.
      const projects = [...new Set(Array.isArray(projectOrProjects) ? projectOrProjects : [projectOrProjects])]
      if (!projects.length) return { mode: 'and', results: [] }
      const folderFilter = () => (scope && projects.length === 1
        ? { sql: "and (f.path = ? or f.path like ? escape '\\')", params: [scope, `${escapeLike(scope)}/%`] }
        : { sql: '', params: [] })
      // I candidati per parole, in ordine di rilevanza e senza ancora il limite per file.
      const lexical = (mode) => {
        const match = buildMatchQuery(query, mode, { exact })
        if (!match) return []
        const filter = folderFilter()
        return db.prepare(`
          select c.id as id, f.project as project, f.path as path, c.heading as heading, c.start_line as startLine, c.end_line as endLine,
                 snippet(chunks_fts, 0, '«', '»', '…', ${SNIPPET_WORDS}) as snippet, bm25(chunks_fts, 1.0, 5.0) as score
          from chunks_fts
          join chunks c on c.id = chunks_fts.rowid
          join files f on f.id = c.file_id
          where chunks_fts match ? and f.project in (${projects.map(() => '?').join(',')}) ${filter.sql}
          order by score
          limit ?
        `).all(match, ...projects, ...filter.params, size * perFile * 4)
      }
      const finalize = (rows) => {
        const taken = new Map()
        const results = []
        for (const row of rows) {
          const key = `${row.project}\u0000${row.path}`
          const count = taken.get(key) || 0
          if (count >= perFile) continue
          taken.set(key, count + 1)
          results.push({ ...row })
          if (results.length >= size) break
        }
        return results
      }
      // A ogni risultato (anche a quelli trovati dalle parole) si dà il fattore di pertinenza 0-1: il maggiore tra la vicinanza di significato (dal punteggio z, con
      // somiglianza e z) e quella delle parole (un passaggio che contiene tutte le parole vale almeno 0,6; uno che ne contiene solo alcune, 0,25).
      const annotate = (results, stats) => {
        if (!results.length) return results
        const usable = Boolean(stats) && stats.population >= MIN_POPULATION && stats.std > 1e-6
        const missing = usable ? results.filter((row) => row.similarity === undefined).map((row) => row.id) : []
        const known = new Map()
        if (missing.length) {
          const found = db.prepare(`
            select c.id as id, e.vector as vector from chunks c join embeddings e on e.hash = c.hash and e.model = ?
            where c.id in (${missing.map(() => '?').join(',')})
          `).all(model, ...missing)
          for (const entry of found) {
            if (entry.vector.byteLength !== queryVector.length * 4) continue
            const copy = new Float32Array(queryVector.length)
            new Uint8Array(copy.buffer).set(entry.vector)
            let similarity = 0
            for (let k = 0; k < copy.length; k += 1) similarity += copy[k] * queryVector[k]
            known.set(entry.id, similarity)
          }
        }
        const wordsFloor = mode === 'and' ? 0.6 : 0.25
        return results.map((row) => {
          const byWords = row.via === undefined || row.via !== 'meaning'
          const similarity = usable ? (row.similarity ?? known.get(row.id)) : undefined
          const z = similarity === undefined ? undefined : (similarity - stats.mean) / stats.std
          const semantic = z === undefined ? 0 : relevanceOf(z)
          if (z === undefined && !byWords) return row
          return { ...row, ...(z === undefined ? {} : { similarity, z }), relevance: Math.max(semantic, byWords ? wordsFloor : 0) }
        })
      }
      let mode = 'and'
      let rows = lexical('and')
      // Frase intera trovata: è la risposta esatta (pertinenza piena); niente "almeno una parola" né significato.
      if (exact) return { mode, weakCount: 0, results: finalize(rows).map((row) => ({ ...row, via: 'words', relevance: 1 })) }
      if (!rows.length) { mode = 'or'; rows = lexical('or') }
      if (!queryVector || !model) return { mode, results: finalize(rows) }
      const near = vectorCandidates(projects, queryVector, scope, size * perFile * VECTOR_CANDIDATES, model)
      // Solo i vicini che si staccano davvero dagli altri; se nessuno lo fa, resta la ricerca per parole (anche vuota).
      const nearest = relevantNeighbors(near.items, near.stats, rows.length > 0)
      // I vicini scartati dal filtro sono i "meno pertinenti": si contano sempre (`weakCount`) e, con `includeWeak`, si aggiungono ai risultati con `weak: true`.
      // Allora tutto si ordina per pertinenza (il fattore 0-1 di `annotate`), dal più al meno pertinente.
      const keptIds = new Set(nearest.map((item) => item.id))
      const filtering = Boolean(near.stats) && near.stats.population >= MIN_POPULATION && near.stats.std > 1e-6
      const weakItems = filtering ? near.items.filter((item) => !keptIds.has(item.id)) : []
      const weakCount = weakItems.length
      const partial = mode === 'or' && rows.length > 0
      if (includeWeak && weakCount) {
        const pool = fuseRanked([rows, [...nearest, ...weakItems.map((item) => ({ ...item, weak: true }))]])
        const ranked = annotate(pool, near.stats).sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0))
        return { mode: nearest.length || rows.length ? 'hybrid' : mode, partial, weakCount, results: finalize(ranked) }
      }
      if (!nearest.length) return { mode, weakCount, results: annotate(finalize(rows), near.stats) }
      // Le parole parziali ("almeno una", senza le parole funzionali) si fondono con il significato; `partial`: nessun passaggio le ha tutte.
      return { mode: 'hybrid', partial, weakCount, results: annotate(finalize(fuseRanked([rows, nearest])), near.stats) }
    },

    // ----- Ricerca per significato: i vettori sono una cache dei frammenti, mai l'unica copia di qualcosa. -----


    // Testi (distinti) dei frammenti dei progetti che non hanno ancora il vettore di questo modello.
    pendingEmbeddings(projects, model, limit = 16) {
      const list = [...new Set(projects)]
      if (!list.length || !model) return []
      const rows = db.prepare(`
        select c.hash as hash, min(c.heading) as heading, min(c.text) as text
        from chunks c join files f on f.id = c.file_id
        left join embeddings e on e.hash = c.hash and e.model = ?
        where e.hash is null and f.project in (${list.map(() => '?').join(',')})
        group by c.hash limit ?
      `).all(model, ...list, Math.max(1, Math.round(limit)))
      return rows.map((row) => ({ hash: row.hash, text: embeddingText(row.heading, row.text) }))
    },

    // items: [{ hash, vector: Float32Array }]
    storeEmbeddings(model, items) {
      if (!items.length || !model) return 0
      return transaction(() => {
        const insert = db.prepare('insert or replace into embeddings(model, hash, vector) values (?, ?, ?)')
        for (const item of items) insert.run(model, item.hash, new Uint8Array(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength))
        return items.length
      })
    },

    // Toglie i vettori di frammenti che non esistono più (modificati o cancellati), di qualsiasi modello.
    pruneEmbeddings() {
      return db.prepare('delete from embeddings where hash not in (select hash from chunks)').run().changes
    },

    // Senza modello butta tutti i vettori; con un modello solo i suoi (si toglie il modello, non gli altri).
    clearEmbeddings(model = null) {
      if (model) { db.prepare('delete from word_embeddings where model = ?').run(model); return db.prepare('delete from embeddings where model = ?').run(model).changes }
      db.exec('delete from word_embeddings')
      return db.prepare('delete from embeddings').run().changes
    },

    // ----- Sinonimi dai propri testi: il vocabolario (parole di 4-24 lettere, senza cifre) con il vettore di ogni parola. -----

    // Parole del vocabolario senza il vettore di questo modello, le più frequenti per prime.
    pendingWords(model, limit = 32) {
      if (!model) return []
      return db.prepare(`
        select v.term as word from chunks_vocab v
        left join word_embeddings w on w.word = v.term and w.model = ?
        where w.word is null and length(v.term) between 4 and 24 and v.term not glob '*[0-9_]*'
        order by v.cnt desc, v.term limit ?
      `).all(model, Math.max(1, Math.round(limit))).map((row) => row.word)
    },

    // items: [{ word, vector: Float32Array }]
    storeWordVectors(model, items) {
      if (!items.length || !model) return 0
      return transaction(() => {
        const insert = db.prepare('insert or replace into word_embeddings(model, word, vector) values (?, ?, ?)')
        for (const item of items) insert.run(model, item.word, new Uint8Array(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength))
        return items.length
      })
    },

    wordCount(model) {
      return model ? Number(db.prepare('select count(*) as n from word_embeddings where model = ?').get(model).n) : 0
    },

    // Toglie i vettori di parole che non compaiono più in nessun testo.
    pruneWords() {
      return db.prepare('delete from word_embeddings where word not in (select term from chunks_vocab)').run().changes
    },

    // Le parole del vocabolario più vicine a un vettore (il vettore di una parola cercata), con la somiglianza e il punteggio z rispetto a tutte le altre:
    // → [{ word, similarity, z }] dal più vicino, al più `count`, senza le parole di `exclude`. Senza vettori di parole, [].
    nearestWords(model, vector, { count = 6, exclude = [] } = {}) {
      if (!model || !vector || !vector.length) return []
      const skip = new Set(exclude)
      const scratch = new Float32Array(vector.length)
      const best = []
      let n = 0
      let mean = 0
      let m2 = 0
      for (const row of db.prepare('select word, vector from word_embeddings where model = ?').iterate(model)) {
        if (row.vector.byteLength !== vector.length * 4) continue
        new Uint8Array(scratch.buffer).set(row.vector)
        let dot = 0
        for (let k = 0; k < vector.length; k += 1) dot += scratch[k] * vector[k]
        n += 1
        const delta = dot - mean
        mean += delta / n
        m2 += delta * (dot - mean)
        if (skip.has(row.word)) continue
        if (best.length < count || dot > best[best.length - 1].similarity) {
          best.push({ word: row.word, similarity: dot })
          best.sort((a, b) => b.similarity - a.similarity)
          if (best.length > count) best.pop()
        }
      }
      const std = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0
      return best.map((item) => ({ word: item.word, similarity: item.similarity, z: std > 1e-9 ? (item.similarity - mean) / std : 0 }))
    },

    // Quanti testi distinti hanno i progetti e per quanti c'è già il vettore di questo modello.
    embeddingStats(projects, model) {
      const list = [...new Set(projects)]
      if (!list.length || !model) return { total: 0, embedded: 0 }
      const marks = list.map(() => '?').join(',')
      const total = db.prepare(`select count(distinct c.hash) as n from chunks c join files f on f.id = c.file_id where f.project in (${marks})`).get(...list)
      const embedded = db.prepare(`select count(distinct c.hash) as n from chunks c join files f on f.id = c.file_id join embeddings e on e.hash = c.hash and e.model = ? where f.project in (${marks})`).get(model, ...list)
      return { total: Number(total.n), embedded: Number(embedded.n) }
    },

    // Il "centro" semantico di ogni progetto: la media normalizzata dei vettori dei suoi frammenti (per il grafo dei progetti).
    // → { [project]: { count, vector: Float32Array } }; un progetto senza vettori di questo modello non compare.
    projectCentroids(projects, model) {
      const list = [...new Set(projects)]
      const result = {}
      if (!list.length || !model) return result
      const sums = new Map()
      const rows = db.prepare(`
        select f.project as project, e.vector as vector
        from embeddings e join chunks c on c.hash = e.hash join files f on f.id = c.file_id
        where e.model = ? and f.project in (${list.map(() => '?').join(',')})
      `).iterate(model, ...list)
      const scratch = new Float32Array(1024)
      for (const row of rows) {
        const dimensions = row.vector.byteLength / 4
        if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > scratch.length) continue
        new Uint8Array(scratch.buffer).set(row.vector)
        let entry = sums.get(row.project)
        if (!entry) { entry = { count: 0, sum: new Float64Array(dimensions) }; sums.set(row.project, entry) }
        if (entry.sum.length !== dimensions) continue
        for (let k = 0; k < dimensions; k += 1) entry.sum[k] += scratch[k]
        entry.count += 1
      }
      for (const [project, { count, sum }] of sums) {
        let norm = 0
        for (let k = 0; k < sum.length; k += 1) norm += sum[k] * sum[k]
        norm = Math.sqrt(norm) || 1
        const vector = new Float32Array(sum.length)
        for (let k = 0; k < sum.length; k += 1) vector[k] = sum[k] / norm
        result[project] = { count, vector }
      }
      return result
    },

    stats(project) {
      const files = db.prepare('select count(*) as files, max(indexed_at) as updatedAt from files where project = ?').get(project)
      const chunks = db.prepare('select count(*) as chunks from chunks c join files f on f.id = c.file_id where f.project = ?').get(project)
      return { files: Number(files.files), chunks: Number(chunks.chunks), updatedAt: files.updatedAt === null ? null : Number(files.updatedAt) }
    },

    close() { db.close() },
  }
}

module.exports = { createKnowledgeIndex, chunkMarkdown, buildMatchQuery, fuseRanked, relevantNeighbors, embeddingText, isAvailable, STOPWORDS, SCHEMA_VERSION }
