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
const SCHEMA_VERSION = 2
const MAX_CHUNK_WORDS = 250
const MAX_QUERY_TERMS = 12
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const DEFAULT_PER_FILE = 3
const SNIPPET_WORDS = 24
const BUSY_TIMEOUT_MS = 5000
const RRF_K = 60 // costante della fusione per rango (Reciprocal Rank Fusion): quanto pesa il primo posto rispetto al decimo
const VECTOR_CANDIDATES = 4 // quanti candidati per risultato chiede la ricerca per significato (poi si fonde e si scarta il resto)

const wordCount = (text) => (text.match(/\S+/g) || []).length

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

  const flush = () => {
    if (!pending.length) return
    chunks.push({ heading, startLine: pending[0].start, endLine: pending[pending.length - 1].end, text: pending.map((item) => item.text).join('\n\n') })
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
          chunks.push({ heading, startLine: start, endLine: end, text: piece })
          piece = ''
        }
        piece = piece ? `${piece} ${sentence}` : sentence
      }
      if (piece) chunks.push({ heading, startLine: start, endLine: end, text: piece })
      return
    }
    if (pendingWords + words > maxWords) flush()
    pending.push({ text, start, end })
    pendingWords += words
  }

  const endBlock = () => {
    if (!block.length) return
    const text = block.map((item) => item.text).join('\n').trim()
    if (text) pushParagraph(text, block[0].line, block[block.length - 1].line)
    block = []
  }

  lines.forEach((raw, index) => {
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
function buildMatchQuery(input, mode = 'and') {
  const terms = []
  const text = String(input ?? '')
  const phrases = []
  const rest = text.replace(/"([^"]+)"/g, (_, phrase) => {
    const words = phrase.match(/[\p{L}\p{N}]+/gu)
    if (words?.length) phrases.push(`"${words.join(' ')}"`)
    return ' '
  })
  const words = rest.match(/[\p{L}\p{N}]+/gu) || []
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
    -- Vettori (ricerca per significato): derivati come tutto il resto. Una riga per testo distinto; vuota finché non si attiva la ricerca semantica.
    create table if not exists embeddings (hash text primary key, vector blob not null);
    create virtual table if not exists chunks_fts using fts5(
      text, heading,
      content='chunks', content_rowid='id',
      tokenize='unicode61 remove_diacritics 2', prefix='2 3'
    );
    create trigger if not exists chunks_ai after insert on chunks begin
      insert into chunks_fts(rowid, text, heading) values (new.id, new.text, new.heading);
    end;
    create trigger if not exists chunks_ad after delete on chunks begin
      insert into chunks_fts(chunks_fts, rowid, text, heading) values ('delete', old.id, old.text, old.heading);
    end;
  `)
}

function dropAll(db) {
  db.exec(`
    drop trigger if exists chunks_ai; drop trigger if exists chunks_ad;
    drop table if exists chunks_fts; drop table if exists chunks; drop table if exists embeddings; drop table if exists files; drop table if exists meta;
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
      if (version !== null && version !== String(SCHEMA_VERSION)) dropAll(db)
      createSchema(db)
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
  function vectorCandidates(projects, queryVector, scope, count) {
    const filter = scope && projects.length === 1 ? "and (f.path = ? or f.path like ? escape '\\')" : ''
    const params = [...projects, ...(filter ? [scope, `${escapeLike(scope)}/%`] : [])]
    const rows = db.prepare(`
      select c.id as id, e.vector as vector
      from embeddings e join chunks c on c.hash = e.hash join files f on f.id = c.file_id
      where f.project in (${projects.map(() => '?').join(',')}) ${filter}
    `).iterate(...params)
    const dimensions = queryVector.length
    const scratch = new Float32Array(dimensions)
    const scratchBytes = new Uint8Array(scratch.buffer)
    const best = [] // [{ id, similarity }] in ordine decrescente, lungo al più `count`
    for (const row of rows) {
      if (row.vector.byteLength !== scratchBytes.byteLength) continue
      scratchBytes.set(row.vector)
      let similarity = 0
      for (let k = 0; k < dimensions; k += 1) similarity += scratch[k] * queryVector[k]
      if (best.length >= count && similarity <= best[best.length - 1].similarity) continue
      let position = best.length
      while (position > 0 && best[position - 1].similarity < similarity) position -= 1
      best.splice(position, 0, { id: row.id, similarity })
      if (best.length > count) best.pop()
    }
    if (!best.length) return []
    const details = new Map(db.prepare(`
      select c.id as id, f.project as project, f.path as path, c.heading as heading, c.start_line as startLine, c.end_line as endLine, c.text as text
      from chunks c join files f on f.id = c.file_id where c.id in (${best.map(() => '?').join(',')})
    `).all(...best.map((item) => item.id)).map((row) => [row.id, row]))
    return best.filter((item) => details.has(item.id)).map((item) => {
      const { text, ...row } = details.get(item.id)
      const words = text.replace(/\s+/g, ' ').trim().split(' ')
      return { ...row, snippet: words.slice(0, SNIPPET_WORDS * 2).join(' ') + (words.length > SNIPPET_WORDS * 2 ? '…' : ''), similarity: item.similarity }
    })
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
    search(projectOrProjects, query, { limit = DEFAULT_LIMIT, folder = '', maxPerFile = DEFAULT_PER_FILE, queryVector = null } = {}) {
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
        const match = buildMatchQuery(query, mode)
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
      let mode = 'and'
      let rows = lexical('and')
      if (!rows.length) { mode = 'or'; rows = lexical('or') }
      if (!queryVector) return { mode, results: finalize(rows) }
      const nearest = vectorCandidates(projects, queryVector, scope, size * perFile * VECTOR_CANDIDATES)
      if (!nearest.length) return { mode, results: finalize(rows) }
      // Con il significato a disposizione, "almeno una parola" non serve più: farebbe salire per una parola comune (di, per, il) frammenti che non c'entrano.
      return { mode: 'hybrid', results: finalize(fuseRanked([mode === 'and' ? rows : [], nearest])) }
    },

    // ----- Ricerca per significato: i vettori sono una cache dei frammenti, mai l'unica copia di qualcosa. -----

    // Cambiato il modello, i vettori vecchi non sono confrontabili con i nuovi: si buttano.
    useEmbeddingModel(model) {
      const current = db.prepare("select value from meta where key = 'embedding_model'").get()?.value
      if (current === model) return false
      transaction(() => {
        db.exec('delete from embeddings')
        db.prepare("insert or replace into meta(key, value) values ('embedding_model', ?)").run(model)
      })
      return true
    },

    // Testi (distinti) dei frammenti dei progetti che non hanno ancora un vettore.
    pendingEmbeddings(projects, limit = 16) {
      const list = [...new Set(projects)]
      if (!list.length) return []
      const rows = db.prepare(`
        select c.hash as hash, min(c.heading) as heading, min(c.text) as text
        from chunks c join files f on f.id = c.file_id
        left join embeddings e on e.hash = c.hash
        where e.hash is null and f.project in (${list.map(() => '?').join(',')})
        group by c.hash limit ?
      `).all(...list, Math.max(1, Math.round(limit)))
      return rows.map((row) => ({ hash: row.hash, text: embeddingText(row.heading, row.text) }))
    },

    // items: [{ hash, vector: Float32Array }]
    storeEmbeddings(items) {
      if (!items.length) return 0
      return transaction(() => {
        const insert = db.prepare('insert or replace into embeddings(hash, vector) values (?, ?)')
        for (const item of items) insert.run(item.hash, new Uint8Array(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength))
        return items.length
      })
    },

    // Toglie i vettori di frammenti che non esistono più (modificati o cancellati).
    pruneEmbeddings() {
      return db.prepare('delete from embeddings where hash not in (select hash from chunks)').run().changes
    },

    clearEmbeddings() { return db.prepare('delete from embeddings').run().changes },

    // Quanti testi distinti hanno i progetti e per quanti c'è già il vettore.
    embeddingStats(projects) {
      const list = [...new Set(projects)]
      if (!list.length) return { total: 0, embedded: 0 }
      const marks = list.map(() => '?').join(',')
      const total = db.prepare(`select count(distinct c.hash) as n from chunks c join files f on f.id = c.file_id where f.project in (${marks})`).get(...list)
      const embedded = db.prepare(`select count(distinct c.hash) as n from chunks c join files f on f.id = c.file_id join embeddings e on e.hash = c.hash where f.project in (${marks})`).get(...list)
      return { total: Number(total.n), embedded: Number(embedded.n) }
    },

    stats(project) {
      const files = db.prepare('select count(*) as files, max(indexed_at) as updatedAt from files where project = ?').get(project)
      const chunks = db.prepare('select count(*) as chunks from chunks c join files f on f.id = c.file_id where f.project = ?').get(project)
      return { files: Number(files.files), chunks: Number(chunks.chunks), updatedAt: files.updatedAt === null ? null : Number(files.updatedAt) }
    },

    close() { db.close() },
  }
}

module.exports = { createKnowledgeIndex, chunkMarkdown, buildMatchQuery, fuseRanked, embeddingText, isAvailable, SCHEMA_VERSION }
