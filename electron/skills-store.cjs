const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')

const MAX_SKILL_CHARS = 20000
const MAX_SKILLS_PER_FOLDER = 100
const MAX_ACTIONS = 6
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/

/**
 * Skill di scrittura: stile, tono e regole riusabili, un file Markdown ciascuna.
 *   globali:      <userData>/skills/<id>.md
 *   di progetto:  <progetto>/.ow/skills/<id>.md
 * Formato (scrivibile anche a mano):
 *   ---
 *   name: Tono giornalistico
 *   description: Frasi brevi, attacco forte
 *   ---
 *   ## Instructions   testo libero (senza titoli, tutto il corpo vale come istruzioni)
 *   ## Examples       brani di riferimento separati da una riga `---`
 *   ## Actions        - **Etichetta**: prompt   (azioni rapide in chat)
 * A parità di id prevale la skill della `.ow` più vicina al documento, poi quelle delle `.ow` esterne, infine la globale.
 */
const SECTION_NAMES = {
  instructions: 'instructions', istruzioni: 'instructions', rules: 'instructions', regole: 'instructions',
  examples: 'examples', esempi: 'examples', example: 'examples', esempio: 'examples',
  actions: 'actions', azioni: 'actions',
}

function parseSkill(markdown) {
  const text = String(markdown ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_SKILL_CHARS)
  const meta = {}
  let body = text
  const front = /^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text)
  if (front) {
    body = text.slice(front[0].length)
    for (const line of front[1].split('\n')) {
      const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
      if (match) meta[match[1].toLowerCase()] = match[2].trim().replace(/^(["'])(.*)\1$/, '$2')
    }
  }
  const sections = { instructions: [], examples: [], actions: [] }
  let current = 'instructions'
  for (const line of body.split('\n')) {
    const heading = /^##\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading && SECTION_NAMES[heading[1].toLowerCase()]) { current = SECTION_NAMES[heading[1].toLowerCase()]; continue }
    sections[current].push(line)
  }
  const examples = sections.examples.join('\n').split(/^\s*---\s*$/m).map((item) => item.trim()).filter(Boolean)
  const actions = sections.actions
    .map((line) => /^\s*[-*]\s+\*\*(.+?)\*\*\s*:?\s*(.+)$/.exec(line))
    .filter(Boolean)
    .map((match) => ({ label: match[1].trim().slice(0, 60), prompt: match[2].trim().slice(0, 2000) }))
    .slice(0, MAX_ACTIONS)
  return {
    name: String(meta.name || '').slice(0, 120),
    description: String(meta.description || '').slice(0, 300),
    instructions: sections.instructions.join('\n').trim(),
    examples,
    actions,
  }
}

/**
 * Skill da un file Markdown scritto liberamente (es. un elenco di direttive). Il formato delle skill vale anche qui;
 * senza `name` nel front-matter il nome è il primo titolo `# …` (tolto dalle istruzioni) o, in mancanza, il nome del file.
 */
function skillFromMarkdown(markdown, fileName = '') {
  const text = String(markdown ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  if (text.length > MAX_SKILL_CHARS) throw new Error(t('The file is too large to be a skill (max {count} characters)', { count: MAX_SKILL_CHARS }))
  const parsed = parseSkill(text)
  if (!parsed.name) {
    const title = /^#\s+(.+?)\s*#*\s*$/m.exec(parsed.instructions)
    if (title && !parsed.instructions.slice(0, title.index).trim()) {
      parsed.name = title[1].slice(0, 120)
      parsed.instructions = parsed.instructions.slice(title.index + title[0].length).trim()
    } else {
      parsed.name = String(fileName).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 120)
    }
  }
  if (!parsed.instructions && !parsed.examples.length) throw new Error(t('The skill has no instructions or examples'))
  return parsed
}

// Id dal nome: minuscole, senza accenti, solo lettere, cifre e trattini.
function slugify(value) {
  const slug = String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '')
  return slug || 'skill'
}

function createSkillsStore({ getGlobalDirectory }) {
  const projectDirectory = (base) => path.join(base, '.ow', 'skills')
  const directoryFor = (scope, base) => {
    if (scope === 'global') return getGlobalDirectory()
    if (scope !== 'project' || !base) throw new Error(t('Invalid skill location'))
    const resolved = path.resolve(String(base))
    if (!fs.existsSync(path.join(resolved, '.ow'))) throw new Error(t('The project folder no longer exists'))
    return projectDirectory(resolved)
  }
  const fileFor = (directory, id) => {
    if (!ID_PATTERN.test(String(id))) throw new Error(t('Invalid skill identifier'))
    return path.join(directory, `${id}.md`)
  }

  function writeAtomic(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    writeFileAtomic(file, content)
  }

  // Le skill di una cartella; un file illeggibile o vuoto finisce in `problems` senza nascondere le altre.
  function readFolder(directory, scope, owner) {
    const skills = []
    const problems = []
    let names = []
    try { names = fs.readdirSync(directory).filter((name) => /\.md$/i.test(name)).sort((left, right) => left.localeCompare(right)).slice(0, MAX_SKILLS_PER_FOLDER) } catch { return { skills, problems } }
    for (const name of names) {
      const id = name.slice(0, -3)
      try {
        if (!ID_PATTERN.test(id)) throw new Error(t('Invalid file name: use lowercase letters, digits and hyphens'))
        const markdown = fs.readFileSync(path.join(directory, name), 'utf8')
        const parsed = parseSkill(markdown)
        if (!parsed.instructions && !parsed.examples.length) throw new Error(t('The skill has no instructions or examples'))
        skills.push({ id, scope, base: owner?.base || null, owner: owner?.name || '', ...parsed, name: parsed.name || id, size: markdown.length })
      } catch (error) {
        problems.push({ scope, base: owner?.base || null, file: path.join(directory, name), message: error.message })
      }
    }
    return { skills, problems }
  }

  /**
   * Tutte le skill visibili da una catena di progetti (`chain`: [{ base, name }] dalla `.ow` più esterna alla più vicina).
   * Restituisce { skills, problems }; ogni skill ha `shadowed: true` se un'altra con lo stesso id la sostituisce.
   */
  function list(chain = []) {
    const folders = [readFolder(getGlobalDirectory(), 'global', null), ...chain.filter((owner) => owner?.base).map((owner) => readFolder(projectDirectory(owner.base), 'project', owner))]
    const skills = folders.flatMap((folder) => folder.skills)
    const winner = new Map()
    for (const skill of skills) winner.set(skill.id, skill)
    return {
      skills: skills.map((skill) => ({ ...skill, shadowed: winner.get(skill.id) !== skill })),
      problems: folders.flatMap((folder) => folder.problems),
    }
  }

  function get({ scope, base, id }) {
    const file = fileFor(directoryFor(scope, base), id)
    if (!fs.existsSync(file)) throw new Error(t('Skill not found'))
    const markdown = fs.readFileSync(file, 'utf8')
    return { id, scope, base: scope === 'project' ? base : null, markdown, ...parseSkill(markdown) }
  }

  // Senza `id` si crea una skill nuova con un id ricavato dal nome (unico nella cartella); con `id` la si sovrascrive.
  function save({ scope, base, id, markdown }) {
    const text = String(markdown ?? '').replace(/\r\n?/g, '\n')
    if (text.length > MAX_SKILL_CHARS) throw new Error(t('The skill is too long (max {count} characters)', { count: MAX_SKILL_CHARS }))
    const parsed = parseSkill(text)
    if (!parsed.instructions && !parsed.examples.length) throw new Error(t('The skill has no instructions or examples'))
    const directory = directoryFor(scope, base)
    let target = id
    if (!target) {
      const stem = slugify(parsed.name)
      target = stem
      for (let counter = 2; fs.existsSync(fileFor(directory, target)); counter += 1) target = `${stem.slice(0, 55)}-${counter}`
    }
    writeAtomic(fileFor(directory, target), text)
    return get({ scope, base, id: target })
  }

  function remove({ scope, base, id }) {
    fs.rmSync(fileFor(directoryFor(scope, base), id), { force: true })
    return true
  }

  function openFolder(scope, base) {
    const directory = directoryFor(scope, base)
    fs.mkdirSync(directory, { recursive: true })
    return directory
  }

  return { list, get, save, remove, openFolder, parse: parseSkill }
}

module.exports = { createSkillsStore, parseSkill, skillFromMarkdown, slugify, MAX_SKILL_CHARS }
