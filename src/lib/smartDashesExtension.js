import { Extension, InputRule } from '@tiptap/core'

/**
 * Mentre si scrive nell'editor grafico (non nella vista sorgente), `--` diventa il trattino medio «–», `–-` (cioè un terzo trattino) il lungo «—»
 * e `...` i puntini di sospensione veri «…».
 * Non si converte:
 *  - i trattini a inizio riga, perché `---` serve a creare una linea orizzontale;
 *  - nel codice (in linea o in blocco), dove i trattini vanno lasciati com'erano.
 * Subito dopo la conversione Backspace torna ai trattini scritti (come per le altre regole di scrittura di tiptap).
 */
const inCode = (state, position) => {
  const $position = state.doc.resolve(position)
  return $position.parent.type.spec.code === true || $position.marks().some((mark) => mark.type.spec.code === true)
}

const replaceRule = (find, replacement) => new InputRule({
  find,
  handler: ({ state, range }) => {
    if (inCode(state, range.from)) return null
    state.tr.insertText(replacement, range.from, range.to)
    return undefined
  },
})

export const SmartDashes = Extension.create({
  name: 'smartDashes',
  addInputRules() {
    return [
      // Due trattini dopo almeno un carattere della riga: «parola -- parola» → «parola – parola».
      // Il carattere prima non può essere un trattino: «---» a inizio riga resta la linea orizzontale.
      replaceRule(/(?<=[^-])--$/, '–'),
      // Un trattino subito dopo un trattino medio: «–-» → «—».
      replaceRule(/–-$/, '—'),
      // Tre punti: «e poi...» → «e poi…».
      replaceRule(/\.\.\.$/, '…'),
    ]
  },
})
