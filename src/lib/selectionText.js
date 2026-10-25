// Testo della selezione dell'editor, con i blocchi separati da una riga vuota; stringa vuota se non c'è selezione.
export function selectedText(editor) {
  const { from, to, empty } = editor.state.selection
  return empty ? '' : editor.state.doc.textBetween(from, to, '\n\n')
}
