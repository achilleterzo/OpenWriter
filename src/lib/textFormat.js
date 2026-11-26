import { t } from '../i18n/index.js'

// Gli stili Unicode del lettore testuale, come si leggono nel menu (gli identificatori sono quelli di electron/unicode-text.cjs, che dà anche l'elenco e l'ordine).
export function styleName(id) {
  return {
    sansBold: t('Bold (sans-serif)'),
    sansItalic: t('Italic (sans-serif)'),
    sansBoldItalic: t('Bold italic (sans-serif)'),
    monospace: t('Monospace'),
    underline: t('Underline'),
    strike: t('Strikethrough'),
    bold: t('Bold (serif)'),
    italic: t('Italic (serif)'),
    boldItalic: t('Bold italic (serif)'),
    script: t('Script'),
    boldScript: t('Bold script'),
    fraktur: t('Fraktur'),
    boldFraktur: t('Bold fraktur'),
    doubleStruck: t('Double-struck'),
    circled: t('Circled'),
    fullwidth: t('Fullwidth'),
    smallCaps: t('Small capitals'),
    squared: t('Squared (capitals)'),
    negativeSquared: t('Negative squared (capitals)'),
    sans: t('Sans-serif'),
  }[id] || id
}

// Cosa una conversione non ha potuto portare con sé (i codici di `lost` in unicode-text.cjs), in parole.
export function describeLoss(ids) {
  const names = {
    'heading-level': t('heading levels'),
    'code-language': t('code languages'),
    image: t('images'),
    table: t('tables'),
    html: t('HTML'),
    footnote: t('footnotes'),
    math: t('formulas'),
    'front-matter': t('the front matter'),
    'style-unavailable': t('styles on letters that have none'),
    indentation: t('indentation'),
    'link-title': t('link titles'),
  }
  return [...new Set(ids)].map((id) => names[id] || (id.startsWith('style:') ? styleName(id.slice(6)) : id)).join(', ')
}

/**
 * Sostituisce il tratto [from, to) di un campo di testo con `replacement` come se lo scrivesse l'utente, così Ctrl+Z lo annulla (un'assegnazione al valore
 * cancellerebbe la cronologia), e lascia selezionato il testo nuovo. Restituisce falso se il browser non lo permette: il chiamante cambia il testo da sé.
 */
export function replaceInTextarea(textarea, from, to, replacement) {
  textarea.focus()
  textarea.setSelectionRange(from, to)
  let done = false
  try { done = Boolean(document.execCommand?.('insertText', false, replacement)) } catch { done = false }
  if (done) textarea.setSelectionRange(from, from + replacement.length)
  return done
}
