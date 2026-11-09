const test = require('node:test')
const assert = require('node:assert/strict')
const { isSameOrInside, samePath } = require('../electron/path-compare.cjs')
const os = require('node:os')
const path = require('node:path')
const { parentProjects } = require('../electron/project-graph.cjs')

test('parentProjects: il padre di un sotto-progetto è il progetto più interno che lo contiene', () => {
  const root = path.join(os.tmpdir(), 'ow-parents')
  const paths = [path.join(root, 'IGD'), path.join(root, 'IGD', 'igd-game-database'), path.join(root, 'IGD', 'igd-game-database', 'sub'), path.join(root, 'BDSM'), path.join(root, 'IGD2')]
  const parents = parentProjects(paths.map((path) => ({ path })), { isSameOrInside, samePath })
  assert.equal(parents.get(paths[0]), null)
  assert.equal(parents.get(paths[1]), paths[0])
  assert.equal(parents.get(paths[2]), paths[1])
  assert.equal(parents.get(paths[3]), null)
  assert.equal(parents.get(paths[4]), null, 'IGD2 non sta dentro IGD')
})

test('parentProjects: i progetti mancanti non sono né padri né figli', () => {
  const root = path.join(os.tmpdir(), 'ow-parents')
  const [a, ab, cd, c] = [path.join(root, 'a'), path.join(root, 'a', 'b'), path.join(root, 'c', 'd'), path.join(root, 'c')]
  const parents = parentProjects([{ path: a, missing: true }, { path: ab }, { path: cd, missing: true }, { path: c }], { isSameOrInside, samePath })
  assert.equal(parents.get(ab), null)
  assert.equal(parents.get(cd), null)
})
