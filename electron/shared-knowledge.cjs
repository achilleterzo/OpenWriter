const path = require('node:path')
const { isSameOrInside, samePath } = require('./path-compare.cjs')
const { cleanName } = require('./project-references.cjs')

/**
 * Conoscenza condivisa tra i progetti: la ricerca per rilevanza di un progetto vede anche gli altri progetti dell'utente (quelli dell'elenco
 * di OpenWriter), salvo quelli che hanno scelto di restarne fuori. Ogni altro progetto si indica all'assistente come `@sigla/…`, in sola lettura,
 * esattamente come una cartella di riferimento.
 *
 * `sharedProjects` sceglie quali progetti: tutti quelli dell'elenco che esistono e hanno acceso l'indice e la condivisione (`isShared`),
 * tranne il progetto aperto, quelli che lo contengono o stanno dentro di esso (si indicizzerebbero due volte lo stesso file) e quelli già
 * collegati come cartella di riferimento. La sigla ricava dal nome della cartella, unica rispetto ai riferimenti e agli altri progetti.
 */
function sharedProjects({ current, projects, references = [], isShared }) {
  // 'web' è la sigla riservata alle pagine salvate del progetto aperto: nessun progetto la prende.
  const taken = new Set([...references.map((item) => item.name.toLowerCase()), 'web'])
  const chosen = []
  for (const project of projects) {
    if (project.missing || !project.path) continue
    if (current && (samePath(project.path, current) || isSameOrInside(project.path, current) || isSameOrInside(current, project.path))) continue
    if (references.some((item) => samePath(item.path, project.path))) continue
    if (chosen.some((item) => samePath(item.path, project.path))) continue
    let ok = false
    try { ok = Boolean(isShared(project.path)) } catch { ok = false }
    if (!ok) continue
    // La sigla viene dal nome del progetto (quello scelto nelle impostazioni, se c'è: l'elenco lo dà già così), altrimenti dalla cartella.
    const base = cleanName(project.name || path.basename(project.path))
    let name = base
    for (let counter = 2; taken.has(name.toLowerCase()); counter += 1) name = `${base}-${counter}`
    taken.add(name.toLowerCase())
    chosen.push({ name, path: path.resolve(project.path) })
  }
  return chosen
}

// Tutto ciò che sta fuori dal progetto e si cerca insieme ad esso: le cartelle di riferimento (non mancanti) e gli altri progetti che condividono.
// Ogni voce { name, path } ha la sigla con cui si indica (`@name/…`); `project: true` per un altro progetto.
// `webFolderOf(directory)`: la cartella delle pagine web salvate di un progetto (`.ow/web`) se ne ha, altrimenti null (vedi web-references.cjs). Quelle del progetto da cui si cerca
// sono `@web`, quelle degli altri progetti `@nome-web`: la conoscenza è una sola e le pagine salvate ne fanno parte.
function outsideFolders({ current, references = [], projects = [], isShared, webFolderOf = () => null }) {
  const available = references.filter((item) => !item.missing).map(({ name, path: folder }) => ({ name, path: folder }))
  const taken = new Set(available.map((item) => item.name.toLowerCase()))
  const result = [...available]
  const web = current ? webFolderOf(current) : null
  if (web && !taken.has('web')) { taken.add('web'); result.push({ name: 'web', path: web, web: true }) }
  for (const project of sharedProjects({ current, projects, references: available, isShared })) {
    let projectName = project.name
    for (let counter = 2; taken.has(projectName.toLowerCase()); counter += 1) projectName = `${project.name}-${counter}`
    const item = { ...project, name: projectName }
    taken.add(item.name.toLowerCase())
    result.push({ ...item, project: true })
    const folder = webFolderOf(item.path)
    let name = `${item.name}-web`
    for (let counter = 2; taken.has(name.toLowerCase()); counter += 1) name = `${item.name}-web-${counter}`
    if (folder) { taken.add(name.toLowerCase()); result.push({ name, path: folder, web: true }) }
  }
  return result
}

/**
 * L'elenco di progetti limitato ai membri di uno spazio di lavoro (workspace-store.cjs): `members` null = nessun filtro (lo spazio «Tutti»); `extra`: altri percorsi concessi
 * a chi chiede (i progetti che un agente ha aperto da sé). Si applica all'elenco che `sharedProjects` e `outsideFolders` ricevono: è il punto unico in cui un filtro agisce
 * sulla conoscenza che l'assistente e gli agenti raggiungono.
 */
function limitToMembers(projects, members, extra = []) {
  if (!members) return projects
  const allowed = [...members, ...extra]
  return projects.filter((item) => item && typeof item.path === 'string' && allowed.some((known) => samePath(known, item.path)))
}

module.exports = { sharedProjects, outsideFolders, limitToMembers }
