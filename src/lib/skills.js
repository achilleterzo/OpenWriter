// Skill di scrittura lato interfaccia: serializzazione nel formato .md (il parser sta in electron/skills-store.cjs),
// calcolo delle skill attive in una conversazione, blocco per il prompt di sistema e generazione con l'AI.
import { visibleText } from './aiTools.js'

const MAX_SKILLS_PROMPT_CHARS = 30000
const MAX_SOURCE_CHARS = 30000

const oneLine = (value) => String(value || '').replace(/\s+/g, ' ').trim()

export const emptySkill = () => ({ name: '', description: '', instructions: '', examples: [], actions: [] })

// Campi dell'editor → file Markdown con frontmatter. Le sezioni vuote si omettono.
export function serializeSkill({ name, description, instructions, examples = [], actions = [] }) {
  const usedExamples = examples.map((example) => String(example || '').trim()).filter(Boolean)
  const usedActions = actions.map((action) => ({ label: oneLine(action.label).replace(/\*/g, ''), prompt: oneLine(action.prompt) })).filter((action) => action.label && action.prompt)
  return [
    `---\nname: ${oneLine(name)}\n${oneLine(description) ? `description: ${oneLine(description)}\n` : ''}---`,
    `## Instructions\n${String(instructions || '').trim()}`,
    usedExamples.length && `## Examples\n${usedExamples.join('\n\n---\n\n')}`,
    usedActions.length && `## Actions\n${usedActions.map((action) => `- **${action.label}**: ${action.prompt}`).join('\n')}`,
  ].filter(Boolean).join('\n\n') + '\n'
}

// Skill attive in una conversazione: quelle di default dei progetti (∪ aggiunte in chat) − tolte in chat, solo se esistono ancora.
export function activeSkillIds(defaults = [], overrides = {}, available = []) {
  const existing = new Set(available.filter((skill) => !skill.shadowed).map((skill) => skill.id))
  const removed = new Set(overrides.remove || [])
  return [...new Set([...defaults, ...(overrides.add || [])])].filter((id) => existing.has(id) && !removed.has(id))
}

// Blocco del prompt di sistema con le skill attive (istruzioni ed esempi), nell'ordine in cui sono state attivate.
export function skillsPromptText(skills) {
  if (!skills.length) return ''
  const blocks = skills.map((skill) => [
    `### ${skill.name}${skill.description ? ` — ${skill.description}` : ''}`,
    skill.instructions,
    skill.examples.length && `Examples of the target style (imitate the style, never copy the content):\n${skill.examples.map((example, index) => `Example ${index + 1}:\n"""\n${example}\n"""`).join('\n')}`,
  ].filter(Boolean).join('\n'))
  return `Writing skills active in this conversation. Apply them to every text you write for the documents (style, tone, rules); if they conflict with each other, the later one prevails:\n---\n${blocks.join('\n\n').slice(0, MAX_SKILLS_PROMPT_CHARS)}\n---`
}

const FORMAT_SPEC = `Reply ONLY with the skill file, in this exact Markdown format and nothing else (no preamble, no code fences):
---
name: <short name, max 5 words>
description: <one line: when to use it>
---
## Instructions
<concrete, reusable rules as a bullet list: tone, register, sentence length and rhythm, vocabulary, point of view, structure, formatting, things to avoid>

## Examples
<1 or 2 short passages (max 120 words each) that show the style; separate them with a line containing only --->

## Actions
- **<button label, 2-4 words>**: <instruction the user would send to apply the skill to the selected text>
(1 to 3 actions)`

/**
 * Messaggi per far generare una skill all'AI.
 * `source: 'text'`: estrae lo stile di un testo d'esempio. `source: 'conversation'`: codifica le preferenze espresse dall'utente
 * in una conversazione (correzioni, richieste di tono, testi approvati). `language`: lingua in cui scrivere la skill.
 */
export function skillGenerationMessages({ source, text, language, hint = '' }) {
  const material = String(text || '').slice(-MAX_SOURCE_CHARS)
  const task = source === 'conversation'
    ? 'Below is a conversation between a writer and their writing assistant. Turn the writer\'s preferences into a reusable writing skill: the corrections they asked for, the tone and style they requested, what they liked or rejected, and the style of the texts they approved. Write general rules that will work on future texts, not notes about this specific document.'
    : 'Below is a sample text. Analyse its writing style and turn it into a reusable writing skill that lets a writer produce new texts in the same style on any topic. Describe the style, not the content.'
  return [
    { role: 'system', content: `You design "writing skills" for OpenWriter, a Markdown editor: reusable packs of style, tone and rules that are given to a writing assistant.\n${task}\nWrite the skill (name, description, instructions, examples and action labels) in ${language}.\n${FORMAT_SPEC}` },
    { role: 'user', content: `${hint.trim() ? `Focus: ${hint.trim()}\n\n` : ''}${source === 'conversation' ? 'Conversation' : 'Sample text'}:\n"""\n${material}\n"""` },
  ]
}

// Pulisce la risposta del modello: niente ragionamento visibile, niente recinti di codice attorno al file.
export function cleanGeneratedSkill(reply) {
  let text = visibleText(String(reply || '')).text.trim()
  const fenced = /```[\w-]*\n([\s\S]*?)\n```/.exec(text)
  if (fenced) text = fenced[1].trim()
  const start = text.indexOf('---\n')
  return start > 0 && start < 200 ? text.slice(start) : text
}
