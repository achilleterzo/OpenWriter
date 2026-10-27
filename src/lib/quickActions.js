import { t } from '../i18n/index.js'

// Azioni rapide della chat (i "pill" sopra il campo del messaggio).
// Le azioni di default hanno un id fisso: non si possono eliminare, solo modificare e ripristinare. Nelle impostazioni si salva solo
// ciò che l'utente ha cambiato (ordine, testi modificati, azioni sue): un testo non toccato segue la lingua dell'interfaccia
// e gli aggiornamenti dell'app. `settings.quickActions` assente = tutto di default.
export const MAX_CUSTOM_QUICK_ACTIONS = 12
export const MAX_QUICK_LABEL = 40
export const MAX_QUICK_PROMPT = 2000

export const DEFAULT_QUICK_IDS = ['proofread', 'rewrite', 'summarize', 'lengthen', 'review']

const defaultTexts = () => ({
  proofread: { label: t('Proofread'), prompt: t('Fix spelling, grammar and punctuation. Keep the meaning, the tone and the wording as they are: change only what is wrong.') },
  rewrite: { label: t('Rewrite'), prompt: t('Rewrite the text to be clearer and more fluent, keeping the meaning, the tone and roughly the same length.') },
  summarize: { label: t('Summarize'), prompt: t('Summarize the text in a few key points, keeping the essential information.') },
  lengthen: { label: t('Lengthen'), prompt: t('Expand the text: develop the ideas with more detail, examples and transitions, keeping the tone and the style. Do not invent facts.') },
  review: { label: t('Review'), prompt: t('Review the text and put your remarks in the document notes, anchored to the passages concerned: the most relevant issues of style, clarity and consistency, each with a concrete suggestion (as a proposed replacement when it is a rewording). Do not change the text yourself, and do not list the remarks in the chat: reply only with a short summary of the notes you added.') },
})

// Testo originale di un'azione di default ({ label, prompt }), o null per un'azione dell'utente.
export const defaultTextOf = (id) => defaultTexts()[id] || null

export const newCustomId = () => `custom-${Math.random().toString(36).slice(2, 10)}`

// Azioni da mostrare, nell'ordine scelto: [{ id, label, prompt, isDefault, modified }]. Le azioni di default mancanti
// (non dovrebbe succedere) si aggiungono in fondo.
export function resolveQuickActions(entries) {
  const defaults = defaultTexts()
  const list = Array.isArray(entries) ? entries : DEFAULT_QUICK_IDS.map((id) => ({ id }))
  const seen = new Set()
  const result = []
  for (const entry of list) {
    if (!entry?.id || seen.has(entry.id)) continue
    seen.add(entry.id)
    const base = defaults[entry.id]
    if (base) {
      const label = entry.label || base.label
      const prompt = entry.prompt || base.prompt
      result.push({ id: entry.id, label, prompt, isDefault: true, modified: label !== base.label || prompt !== base.prompt })
    } else if (entry.label && entry.prompt) {
      result.push({ id: entry.id, label: entry.label, prompt: entry.prompt, isDefault: false, modified: false })
    }
  }
  for (const id of DEFAULT_QUICK_IDS) if (!seen.has(id)) result.push({ id, ...defaults[id], isDefault: true, modified: false })
  return result
}

// Da azione mostrata a voce da salvare: per un'azione di default solo i testi cambiati.
export function toEntry(action) {
  const base = defaultTexts()[action.id]
  if (!base) return { id: action.id, label: action.label, prompt: action.prompt }
  return { id: action.id, ...(action.label !== base.label ? { label: action.label } : {}), ...(action.prompt !== base.prompt ? { prompt: action.prompt } : {}) }
}

export const quickActionsOf = (settings) => resolveQuickActions(settings?.quickActions)

// Azioni specifiche del progetto (project.json → quickActions): [{ id, label, prompt, isProject: true }] e se mostrare anche quelle generali.
export const MAX_PROJECT_QUICK_ACTIONS = 12
export const newProjectActionId = () => `project-${Math.random().toString(36).slice(2, 10)}`
export const projectActionsOf = (projectSettings) => (projectSettings?.quickActions?.actions || []).map((action) => ({ id: action.id, label: action.label, prompt: action.prompt, isProject: true }))

// Quelle da mostrare nella chat: prima quelle del progetto, poi (salvo scelta contraria) le generali.
export function quickActionsFor(settings, projectSettings) {
  const project = projectActionsOf(projectSettings)
  if (project.length && projectSettings?.quickActions?.general === false) return project
  return [...project, ...quickActionsOf(settings)]
}
