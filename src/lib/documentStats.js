/**
 * Statistiche di un documento: lunghezza, tempi di lettura e struttura. Il conteggio delle parole e delle frasi passa da Intl.Segmenter
 * (che conosce le regole della lingua: l'apostrofo di "l'anno", i trattini, le abbreviazioni), non da una divisione per spazi.
 */
const READING_WORDS_PER_MINUTE = 220
const SPEAKING_WORDS_PER_MINUTE = 130
const WORDS_PER_PAGE = 250

export const RATES = { reading: READING_WORDS_PER_MINUTE, speaking: SPEAKING_WORDS_PER_MINUTE, page: WORDS_PER_PAGE }

function segmenter(locale, granularity) {
  try { return new Intl.Segmenter(locale, { granularity }) } catch { return new Intl.Segmenter('en', { granularity }) }
}

const wordsOf = (text, locale) => {
  const found = []
  for (const part of segmenter(locale, 'word').segment(text)) if (part.isWordLike) found.push(part.segment)
  return found
}

/**
 * Conteggi di un testo: parole, caratteri (con e senza spazi), frasi, parole diverse, lunghezza media di parole e frasi, frase più lunga, tempi.
 * `sentenceText` è il testo su cui contare le frasi (di solito la sola prosa: senza titoli, tabelle e codice, che non sono frasi); se manca si usa `text`.
 */
export function textStats(text, locale = 'en', sentenceText = text) {
  const source = String(text ?? '')
  const prose = String(sentenceText ?? '')
  const words = wordsOf(source, locale)
  const unique = new Set(words.map((word) => word.toLocaleLowerCase(locale)))
  const letters = words.reduce((total, word) => total + [...word].length, 0)
  // Gli a capo tra un blocco e l'altro non sono caratteri del testo.
  const flat = source.replace(/\n/g, '')
  let sentences = 0
  let longest = 0
  let proseWords = 0
  if (prose.trim()) {
    for (const part of segmenter(locale, 'sentence').segment(prose)) {
      const inSentence = wordsOf(part.segment, locale).length
      if (inSentence) { sentences += 1; proseWords += inSentence; longest = Math.max(longest, inSentence) }
    }
  }
  return {
    words: words.length,
    characters: [...flat].length,
    charactersNoSpaces: [...flat.replace(/\s/g, '')].length,
    sentences,
    uniqueWords: unique.size,
    averageWordLength: words.length ? letters / words.length : 0,
    averageSentenceLength: sentences ? proseWords / sentences : 0,
    longestSentence: longest,
    readingMinutes: words.length / READING_WORDS_PER_MINUTE,
    speakingMinutes: words.length / SPEAKING_WORDS_PER_MINUTE,
    pages: words.length / WORDS_PER_PAGE,
  }
}

/** Il testo del documento senza il front matter (che non è prosa): i blocchi separati da un a capo, le immagini e gli altri elementi senza testo assenti. */
export function proseOf(doc) {
  const blocks = []
  doc.forEach((child) => {
    if (child.type.name === 'frontMatter') return
    const value = child.textBetween(0, child.content.size, '\n', '')
    if (value.trim()) blocks.push(value)
  })
  return blocks.join('\n')
}

/** La sola prosa del documento: paragrafi ed elenchi, senza titoli, tabelle, codice, formule, note a piè di pagina e front matter. È il testo delle frasi. */
export function sentenceTextOf(doc) {
  const blocks = []
  doc.descendants((node) => {
    if (node.type.name === 'table') return false
    if (node.type.name === 'paragraph' && node.content.size) {
      const value = node.textBetween(0, node.content.size, '\n', '')
      if (value.trim()) blocks.push(value)
    }
    return true
  })
  return blocks.join('\n')
}

/** Struttura del documento: titoli, paragrafi, elenchi, tabelle, immagini, collegamenti, note a piè di pagina, formule. */
export function structureOf(doc) {
  const counts = { headings: 0, paragraphs: 0, listItems: 0, tables: 0, images: 0, links: 0, codeBlocks: 0, footnotes: 0, formulas: 0 }
  doc.descendants((node) => {
    switch (node.type.name) {
      case 'heading': counts.headings += 1; break
      case 'paragraph': if (node.content.size) counts.paragraphs += 1; break
      case 'listItem':
      case 'taskItem': counts.listItems += 1; break
      case 'table': counts.tables += 1; break
      case 'image': counts.images += 1; break
      case 'codeBlock': counts.codeBlocks += 1; break
      case 'footnoteRef': counts.footnotes += 1; break
      case 'mathInline':
      case 'mathBlock': counts.formulas += 1; break
      default: break
    }
    // Un collegamento che attraversa più parti di testo (grassetto dentro un link) conta una volta sola.
    if (node.isTextblock) {
      let previous = null
      node.forEach((child) => {
        const link = child.marks.find((mark) => mark.type.name === 'link')
        if (link && link.attrs.href !== previous) counts.links += 1
        previous = link ? link.attrs.href : null
      })
    }
    return true
  })
  return counts
}

/** Un tempo in minuti come testo breve; `format` dà le parti già tradotte. */
export function durationParts(minutes) {
  if (minutes < 1) return { kind: 'short' }
  const total = Math.round(minutes)
  if (total < 60) return { kind: 'minutes', minutes: total }
  return { kind: 'hours', hours: Math.floor(total / 60), minutes: total % 60 }
}
