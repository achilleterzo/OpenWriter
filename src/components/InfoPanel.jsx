import { useEffect, useRef, useState } from 'react'
import { RATES, durationParts, proseOf, sentenceTextOf, structureOf, textStats } from '../lib/documentStats.js'
import { formatDateTime, formatNumber, intlLocale, t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const REFRESH_MS = 300
const RELATIVE_TICK_MS = 30000

const formatSize = (bytes) => (bytes >= 1048576 ? `${formatNumber(Math.round(bytes / 10485.76) / 100)} MB` : bytes >= 1024 ? `${formatNumber(Math.round(bytes / 102.4) / 10)} KB` : `${formatNumber(bytes)} B`)
const formatDecimal = (value) => formatNumber(Math.round(value * 10) / 10)

function formatDuration(minutes) {
  const parts = durationParts(minutes)
  if (parts.kind === 'short') return t('less than a minute')
  if (parts.kind === 'minutes') return t('{count} min', { count: parts.minutes })
  return t('{hours} h {minutes} min', { hours: parts.hours, minutes: parts.minutes })
}

// "3 ore fa", "ieri", "adesso": dalla data all'istante attuale, nella lingua dell'interfaccia.
function relativeTime(value, now) {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000)
  const formatter = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' })
  const absolute = Math.abs(seconds)
  if (absolute < 45) return formatter.format(0, 'second')
  if (absolute < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (absolute < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  if (absolute < 86400 * 30) return formatter.format(Math.round(seconds / 86400), 'day')
  if (absolute < 86400 * 365) return formatter.format(Math.round(seconds / (86400 * 30)), 'month')
  return formatter.format(Math.round(seconds / (86400 * 365)), 'year')
}

function Section({ title, children }) {
  return (
    <section className="px-3 py-2">
      <h3 className="pb-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{title}</h3>
      <dl className="grid gap-1 text-sm">{children}</dl>
    </section>
  )
}

function Row({ label, value, hint }) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={hint}>
      <dt className="text-slate-400">{label}</dt>
      <dd className="text-right tabular-nums text-slate-100">{value}</dd>
    </div>
  )
}

// Campo a righe sovrapposte (etichetta sopra, valore sotto, allineato a sinistra): per testi lunghi come il nome e il percorso, che se troppo lunghi si
// troncano alla fine (con i puntini) come si legge, e hanno il testo intero nel suggerimento.
function Field({ label, children, title, muted = false }) {
  return (
    <div className="min-w-0" title={title}>
      {label && <dt className="text-slate-400">{label}</dt>}
      <dd className={`truncate text-left ${muted ? 'text-xs text-slate-500' : 'text-slate-100'}`}>{children}</dd>
    </div>
  )
}

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <div className="text-xl font-semibold tabular-nums text-slate-50">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}

/**
 * Scheda "Info": le statistiche del documento in primo piano. Parte dall'ultimo salvataggio (data del file su disco) e poi dà parole, caratteri,
 * frasi, tempi di lettura e di lettura ad alta voce, struttura (titoli, elenchi, tabelle, immagini, collegamenti) e, con del testo selezionato, i numeri della selezione.
 * Si aggiorna mentre si scrive (con un breve ritardo, per non rallentare documenti lunghi).
 */
export default function InfoPanel({ tab, editor, project, historyVersion, openNotes = 0, bookmarkCount = 0 }) {
  const [data, setData] = useState(null)
  const [selection, setSelection] = useState(null)
  const [file, setFile] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const timer = useRef(null)

  useEffect(() => {
    if (!editor || editor.isDestroyed) return undefined
    const locale = intlLocale()
    const compute = () => {
      if (editor.isDestroyed) return
      setData({ stats: textStats(proseOf(editor.state.doc), locale, sentenceTextOf(editor.state.doc)), structure: structureOf(editor.state.doc) })
    }
    const pick = () => {
      if (editor.isDestroyed) return
      const { from, to, empty } = editor.state.selection
      const text = empty ? '' : editor.state.doc.textBetween(from, to, '\n', '')
      setSelection(text.trim() ? textStats(text, locale) : null)
    }
    compute()
    pick()
    const onUpdate = () => { clearTimeout(timer.current); timer.current = setTimeout(() => { compute(); pick() }, REFRESH_MS) }
    editor.on('update', onUpdate)
    editor.on('selectionUpdate', pick)
    return () => { clearTimeout(timer.current); editor.off('update', onUpdate); editor.off('selectionUpdate', pick) }
  }, [editor])

  // Data e peso del file su disco: si rileggono a ogni salvataggio. Un documento fuori dal progetto (collegato) o mai salvato non ne ha.
  useEffect(() => {
    let cancelled = false
    setFile(null)
    if (!tab?.filePath) return undefined
    electronAPI.getFileInfo(tab.filePath).then((value) => { if (!cancelled) setFile(value) }).catch(() => { if (!cancelled) setFile(null) })
    return () => { cancelled = true }
  }, [tab?.filePath, tab?.dirty, historyVersion])

  // "3 minuti fa" resta vero col passare del tempo.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), RELATIVE_TICK_MS)
    return () => clearInterval(tick)
  }, [])

  if (!editor || !tab) return <p className="px-3 py-3 text-xs text-slate-500">{t('No document open.')}</p>
  if (!data) return null
  const { stats, structure } = data
  const relativePath = tab.filePath && project ? tab.filePath.replace(/\\/g, '/').replace(`${String(project).replace(/\\/g, '/')}/`, '') : tab.filePath

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-3">
      <Section title={t('Document')}>
        <Field label={t('Name')} title={tab.filePath || tab.title}>{tab.title}</Field>
        {relativePath && relativePath !== tab.title && <Field label={t('Path')} title={tab.filePath || relativePath} muted>{relativePath}</Field>}
        <Field label={t('Last saved')} title={file ? formatDateTime(file.modified, { dateStyle: 'full', timeStyle: 'medium' }) : undefined}>
          {file ? formatDateTime(file.modified, { dateStyle: 'medium', timeStyle: 'short' }) : t('Not saved yet')}
        </Field>
        {file && <Field label="" muted>{relativeTime(file.modified, now)}</Field>}
        {tab.dirty && <p className="text-xs text-amber-300">{t('Unsaved changes in the editor')}</p>}
        {file && <Row label={t('Size')} value={formatSize(file.size)} />}
      </Section>

      <div className="grid grid-cols-2 gap-2 px-3 py-2">
        <Tile label={t('Words')} value={formatNumber(stats.words)} />
        <Tile label={t('Characters')} value={formatNumber(stats.characters)} />
      </div>

      {selection && (
        <Section title={t('Selection')}>
          <Row label={t('Words')} value={formatNumber(selection.words)} />
          <Row label={t('Characters')} value={formatNumber(selection.characters)} />
          <Row label={t('Characters without spaces')} value={formatNumber(selection.charactersNoSpaces)} />
          <Row label={t('Reading time')} value={formatDuration(selection.readingMinutes)} />
        </Section>
      )}

      <Section title={t('Length')}>
        <Row label={t('Characters without spaces')} value={formatNumber(stats.charactersNoSpaces)} />
        <Row label={t('Sentences')} value={formatNumber(stats.sentences)} />
        <Row label={t('Paragraphs')} value={formatNumber(structure.paragraphs)} />
        <Row label={t('Unique words')} value={formatNumber(stats.uniqueWords)} />
        <Row label={t('Pages')} value={formatDecimal(stats.pages)} hint={t('At {count} words per page', { count: RATES.page })} />
      </Section>

      <Section title={t('Time')}>
        <Row label={t('Reading time')} value={formatDuration(stats.readingMinutes)} hint={t('At about {count} words per minute', { count: RATES.reading })} />
        <Row label={t('Speaking time')} value={formatDuration(stats.speakingMinutes)} hint={t('At about {count} words per minute', { count: RATES.speaking })} />
      </Section>

      <Section title={t('Style')}>
        <Row label={t('Average word length')} value={t('{count} letters', { count: formatDecimal(stats.averageWordLength) })} />
        <Row label={t('Average sentence length')} value={t('{count} words', { count: formatDecimal(stats.averageSentenceLength) })} />
        <Row label={t('Longest sentence')} value={t('{count} words', { count: formatNumber(stats.longestSentence) })} />
      </Section>

      <Section title={t('Structure')}>
        <Row label={t('Headings')} value={formatNumber(structure.headings)} />
        <Row label={t('List items')} value={formatNumber(structure.listItems)} />
        <Row label={t('Tables')} value={formatNumber(structure.tables)} />
        <Row label={t('Images')} value={formatNumber(structure.images)} />
        <Row label={t('Links')} value={formatNumber(structure.links)} />
        <Row label={t('Code blocks')} value={formatNumber(structure.codeBlocks)} />
        <Row label={t('Footnotes')} value={formatNumber(structure.footnotes)} />
        <Row label={t('Formulas')} value={formatNumber(structure.formulas)} />
      </Section>

      <Section title={t('Review')}>
        <Row label={t('Open notes')} value={formatNumber(openNotes)} />
        <Row label={t('Bookmarks')} value={formatNumber(bookmarkCount)} />
      </Section>
    </div>
  )
}
