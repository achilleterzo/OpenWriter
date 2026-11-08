import { useEffect, useRef, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { getSearchState, goToMatch, replaceAll, replaceCurrent, setSearch } from '../lib/searchExtension.js'
import FindPanel from './FindPanel.jsx'
import { t } from '../i18n/index.js'

// Barra Trova / Sostituisci in sovraimpressione sul documento (l'aspetto è in FindPanel, condiviso con il lettore testuale).
export default function FindBar({ editor, replaceMode, onReplaceMode, focusToken, onClose }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState({ caseSensitive: false, wholeWord: false, regex: false })
  const findInput = useRef(null)
  const replaceInput = useRef(null)

  const { count, current, error } = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const state = getSearchState(ed)
      return { count: state.matches.length, current: state.current, error: state.error }
    },
  })

  // Aprendo la barra si parte dal testo selezionato (se è su una riga) e si porta il cursore sul campo.
  useEffect(() => {
    const { from, to, empty } = editor.state.selection
    if (!empty) {
      const selected = editor.state.doc.textBetween(from, to, '\n')
      if (selected && !selected.includes('\n')) setQuery(selected)
    }
    findInput.current?.focus()
    findInput.current?.select()
  }, [editor, focusToken])

  useEffect(() => {
    if (replaceMode) replaceInput.current?.focus()
  }, [replaceMode, focusToken])

  useEffect(() => {
    setSearch(editor, { query, ...options })
  }, [editor, query, options])

  // Alla chiusura le evidenziazioni spariscono.
  useEffect(() => () => setSearch(editor, { query: '' }), [editor])

  const toggle = (key) => setOptions((value) => ({ ...value, [key]: !value[key] }))
  const status = !query ? '' : error ? t('Invalid expression') : count ? `${current + 1} di ${count}` : t('No results')
  const replaceCurrentMatch = () => { if (replaceCurrent(editor, replacement)) goToMatch(editor, 0) }

  function onFindKeyDown(event) {
    if (event.key === 'Enter') { event.preventDefault(); goToMatch(editor, event.shiftKey ? -1 : 1) }
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
  }

  function onReplaceKeyDown(event) {
    if (event.key === 'Enter') { event.preventDefault(); replaceCurrentMatch() }
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
  }

  return (
    <FindPanel
      query={query} onQuery={setQuery} replacement={replacement} onReplacement={setReplacement} options={options} onToggle={toggle}
      status={status} error={error} count={count} replaceMode={replaceMode} onReplaceMode={onReplaceMode}
      onFindKeyDown={onFindKeyDown} onReplaceKeyDown={onReplaceKeyDown}
      onPrevious={() => goToMatch(editor, -1)} onNext={() => goToMatch(editor, 1)} onReplace={replaceCurrentMatch} onReplaceAll={() => replaceAll(editor, replacement)}
      onClose={onClose} findRef={findInput} replaceRef={replaceInput}
    />
  )
}
