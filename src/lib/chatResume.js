/**
 * Ripresa di un turno dell'assistente interrotto. Ogni passo (risposta, chiamata di uno strumento, risultato) viene salvato nella conversazione appena arriva, quindi
 * il registro dice sempre fin dove si era arrivati: la ripresa riparte da lì invece che dal messaggio dell'utente, e non rifà ciò che è già fatto.
 *
 * Un turno è incompleto, e quindi riprendibile, se l'ultimo messaggio è:
 *   - dell'utente (la richiesta non ha avuto risposta);
 *   - una risposta fallita (`error`) o interrotta dall'utente (`interrupted`);
 *   - una risposta con una chiamata di strumento senza risultato (stop o chiusura dell'app mentre lo strumento lavorava);
 *   - il risultato di uno strumento a cui il modello non ha ancora risposto.
 */
export const INTERRUPTED_RESULT = 'Interrupted: it is not known whether this step finished. Check the current state (re-read the document or the file) before repeating it.'
export const RESUME_NOTE = 'The previous attempt was interrupted. Continue from the last result above: do not redo the steps that are already done, and check the current state before repeating a step that may not have finished.'

const failed = (message) => message.role === 'assistant' && Boolean(message.error || message.interrupted)

// → true se il turno si può riprendere da qui.
export function canResumeMessages(messages) {
  const last = Array.isArray(messages) ? messages[messages.length - 1] : null
  if (!last) return false
  if (last.role === 'user' || last.role === 'tool') return true
  return last.role === 'assistant' && Boolean(last.error || last.interrupted || last.toolCall)
}

/**
 * I messaggi da cui riprendere: si scartano in coda le risposte fallite o interrotte (il testo parziale si rigenera), e una chiamata di strumento senza risultato riceve un
 * risultato che dice che l'esito è ignoto, così il modello controlla lo stato prima di ripetere (una modifica può essere già stata fatta).
 * → { messages, note }: `note` è vero se il turno era già avviato (c'è del lavoro fatto) e al modello va ricordato di proseguire senza rifarlo.
 */
export function prepareResume(messages, now = () => new Date().toISOString()) {
  const base = [...messages]
  while (base.length && failed(base[base.length - 1])) base.pop()
  const last = base[base.length - 1]
  if (last?.role === 'assistant' && last.toolCall) base.push({ role: 'tool', name: last.toolCall.name, content: INTERRUPTED_RESULT, error: true, at: now() })
  return { messages: base, note: base.length > 0 && base[base.length - 1].role !== 'user' }
}
