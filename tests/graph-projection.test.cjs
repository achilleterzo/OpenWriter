const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/graphProjection.js')

test('senza rotazione la proiezione è l\'identità', async () => {
  const { createProjection } = await load()
  const projection = createProjection()
  const point = projection.project(120, -80)
  assert.ok(Math.abs(point.x - 120) < 1e-9 && Math.abs(point.y + 80) < 1e-9 && point.scale === 1 && point.z === 0)
  const back = projection.unproject(120, -80)
  assert.ok(Math.abs(back.x - 120) < 1e-9 && Math.abs(back.y + 80) < 1e-9)
})

test('unproject rifà il cammino di project, per ogni inclinazione', async () => {
  const { createProjection } = await load()
  for (const [yaw, pitch] of [[0.6, 0], [0, -0.7], [-0.9, 0.5], [1.2, 1.1]]) {
    const projection = createProjection({ yaw, pitch })
    for (const [x, y] of [[0, 0], [250, -130], [-400, 300], [75, 410]]) {
      const shown = projection.project(x, y)
      const back = projection.unproject(shown.x, shown.y)
      assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6, `yaw ${yaw} pitch ${pitch} (${x}, ${y}) → (${back.x}, ${back.y})`)
    }
  }
})

test('con la profondità: unproject alla z giusta ritrova il punto, e una bolla più vicina appare più grande', async () => {
  const { createProjection } = await load()
  for (const [yaw, pitch] of [[0, 0], [0.5, -0.4], [-1, 0.8]]) {
    const projection = createProjection({ yaw, pitch })
    for (const [x, y, z] of [[0, 0, 120], [250, -130, -200], [-400, 300, 90], [75, 410, -30]]) {
      const shown = projection.project(x, y, z)
      const back = projection.unproject(shown.x, shown.y, z)
      assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6, `yaw ${yaw} pitch ${pitch} (${x}, ${y}, ${z}) → (${back.x}, ${back.y})`)
    }
  }
  const projection = createProjection()
  assert.ok(projection.project(0, 0, -200).scale > 1 && projection.project(0, 0, 200).scale < 1)
})

test('girando sull\'asse Y un lato si allontana e l\'altro si avvicina, e la prospettiva li rimpicciolisce o ingrandisce', async () => {
  const { createProjection } = await load()
  const projection = createProjection({ yaw: -0.6 })
  const right = projection.project(300, 0)
  const left = projection.project(-300, 0)
  assert.ok(right.z > 0 && left.z < 0)
  assert.ok(right.scale < 1 && left.scale > 1)
  assert.ok(Math.abs(projection.project(0, 0).x) < 1e-9)
})

test('girando sull\'asse X il lato in basso si allontana con il beccheggio positivo', async () => {
  const { createProjection } = await load()
  const projection = createProjection({ pitch: 0.5 })
  assert.ok(projection.project(0, 300).z > 0)
  assert.ok(projection.project(0, -300).z < 0)
})
