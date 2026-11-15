import { useEffect, useRef, useState } from 'react'

/**
 * Il lavoro dell'assistente su una conversazione, visto da una finestra che non lo sta guidando (vedi docs/design/core-and-windows.md, passo 4).
 *
 * Il ciclo (le chiamate al modello, gli strumenti sull'editor, la coda) gira nella finestra che ha avviato il lavoro. Questa finestra, se mostra la stessa
 * conversazione, lo vede: sa che è al lavoro (`running`), riceve il testo man mano (`live`), e quando la conversazione cambia su disco lo dice a chi usa l'hook.
 *
 *   conversationId  la conversazione mostrata
 *   driving         questa finestra la sta guidando lei: gli eventi degli altri non la riguardano
 *   onChanged(event)  la conversazione (o un'altra del progetto) è cambiata altrove: { conversationId, kind: 'content' | 'queue' | 'deleted', queue? }
 *   onCancel(event)   un'altra finestra chiede di fermare il lavoro che questa guida: { conversationId }
 *
 * → { running, live }: `running` vale solo se un'altra finestra guida il lavoro; `live` è { text, thinking, status } o null.
 */
export default function useSharedChatRun({ api, project, conversationId, driving, onChanged, onCancel }) {
  const runs = api?.chatRuns
  const [remote, setRemote] = useState({ running: false, live: null })
  const latest = useRef({})
  latest.current = { conversationId, driving, onChanged, onCancel }

  // Cambia la conversazione (o il progetto): si chiede chi ci sta lavorando adesso, e con quale testo.
  useEffect(() => {
    setRemote({ running: false, live: null })
    if (!runs || !conversationId) return undefined
    let cancelled = false
    runs.list().then((list) => {
      const run = (list || []).find((item) => item.conversationId === conversationId)
      if (!cancelled && run) setRemote({ running: true, live: run.live || null })
    }).catch(() => { /* senza istantanea si seguono gli eventi */ })
    return () => { cancelled = true }
  }, [runs, conversationId, project])

  useEffect(() => {
    if (!runs) return undefined
    const stops = [
      runs.onState((event) => {
        if (event.conversationId !== latest.current.conversationId) return
        setRemote((previous) => (event.running ? { running: true, live: previous.live } : { running: false, live: null }))
        // A fine lavoro (anche interrotto) si rilegge la conversazione: l'ultimo messaggio è già su disco.
        if (!event.running) latest.current.onChanged?.({ conversationId: event.conversationId, kind: 'content' })
      }),
      runs.onLive((event) => {
        if (event.conversationId !== latest.current.conversationId) return
        setRemote({ running: true, live: event.live || null })
      }),
      runs.onChanged((event) => latest.current.onChanged?.(event)),
      runs.onCancel((event) => { if (latest.current.driving) latest.current.onCancel?.(event) }),
    ]
    return () => { for (const stop of stops) stop() }
  }, [runs])

  return { running: remote.running && !driving, live: driving ? null : remote.live }
}
