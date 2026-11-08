import { useEffect, useMemo, useRef, useState } from 'react'
import { findMatches, replaceAll, replaceOne } from '../lib/textSearch.js'
import FindPanel from './FindPanel.jsx'
import { t } from '../i18n/index.js'

/**
 * Trova / Sostituisci del lettore testuale: stessa barra dell'editor dei documenti (FindPanel), ma la ricerca lavora sul testo (textSearch.js).
 * Le corrispondenze si evidenziano dietro il campo di testo (`onMarks`), e quella corrente si porta in vista (`onReveal`). `onText` riceve il testo dopo una sostituzione.
 */
export default function TextFindBar({ text, onText, onMarks, onReveal, replaceMode, onReplaceMode, focusToken, initialQuery, onClose }) {
  const [query, setQuery] = useState(initialQuery || '')
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState({ caseSensitive: false, wholeWord: false, regex: false })
  const [current, setCurrent] = useState(0)
  const findInput = useRef(null)
  const replaceInput = useRef(null)

  const { matches, error, truncated } = useMemo(() => findMatches(text, { query, ...options }), [text, query, options])
  const count = matches.length
  const index = count ? Math.min(current, count - 1) : 0

  // Una ricerca nuova riparte dalla prima corrispondenza.
  useEffect(() => { setCurrent(0) }, [query, options])

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery)
    findInput.current?.focus()
    findInput.current?.select()
  }, [focusToken]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (replaceMode) replaceInput.current?.focus() }, [replaceMode, focusToken])

  // Le evidenziazioni seguono le corrispondenze e la corrente; alla chiusura spariscono.
  useEffect(() => { onMarks(matches.map((match, position) => ({ from: match.from, to: match.to, current: position === index }))) }, [matches, index]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onMarks(null), []) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (step) => {
    if (!count) return
    const next = (index + step + count) % count
    setCurrent(next)
    onReveal(matches[next].from)
  }

  // La corrente appena trovata (digitando) si porta in vista: così si vede subito dove sta.
  useEffect(() => { if (count) onReveal(matches[index].from) }, [query, options]) // eslint-disable-line react-hooks/exhaustive-deps

  const replaceCurrent = () => {
    if (!count) return
    onText(replaceOne(text, matches[index], replacement).text)
  }
  const replaceEverything = () => {
    if (!count) return
    onText(replaceAll(text, matches, replacement).text)
  }

  const toggle = (key) => setOptions((value) => ({ ...value, [key]: !value[key] }))
  const status = !query ? '' : error ? t('Invalid expression') : count ? `${index + 1} di ${count}${truncated ? '+' : ''}` : t('No results')

  return (
    <FindPanel
      query={query} onQuery={setQuery} replacement={replacement} onReplacement={setReplacement} options={options} onToggle={toggle}
      status={status} error={error} count={count} replaceMode={replaceMode} onReplaceMode={onReplaceMode}
      onFindKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); go(event.shiftKey ? -1 : 1) }
        if (event.key === 'Escape') { event.preventDefault(); onClose() }
      }}
      onReplaceKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); replaceCurrent() }
        if (event.key === 'Escape') { event.preventDefault(); onClose() }
      }}
      onPrevious={() => go(-1)} onNext={() => go(1)} onReplace={replaceCurrent} onReplaceAll={replaceEverything}
      onClose={onClose} findRef={findInput} replaceRef={replaceInput}
    />
  )
}
