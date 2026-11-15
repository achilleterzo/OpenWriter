/**
 * Gli stadi di una ricerca che arriva a poco a poco (vedi `projects:search` in electron/main.cjs): uno stadio può contenere meno di quello che si sta già guardando
 * (la ricerca per sole parole non ha i passaggi trovati per sinonimo o per significato), e sostituire l'elenco con quello li farebbe sparire per poi farli tornare.
 * Uno stadio si mostra solo se non toglie nulla di ciò che è già sull'elenco; la risposta finale, invece, sostituisce sempre.
 */
export const hitKey = (hit) => `${hit.project}|${hit.file}|${hit.startLine}`

// → true se ogni passaggio mostrato c'è ancora in `next` (che può averne altri e metterli in un altro ordine).
export function keepsHits(shown, next) {
  if (!shown?.length) return true
  const keys = new Set((next || []).map(hitKey))
  return shown.every((hit) => keys.has(hitKey(hit)))
}
