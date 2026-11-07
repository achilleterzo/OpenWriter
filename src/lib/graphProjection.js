/**
 * Proiezione prospettica della rete dei progetti. La rete è nello spazio (x, y, z): si può girare intorno all'asse verticale (`yaw`, Y) e a quello orizzontale
 * (`pitch`, X) e guardare da `depth` pixel di distanza. Codice puro (nessun DOM): lo usano il disegno e il puntatore in ProjectGraph.jsx.
 *
 *   project(x, y, z = 0)      → { x, y, z, scale }  posizione sullo schermo (origine al centro), profondità (positiva = più lontano) e fattore di scala della prospettiva.
 *   unproject(px, py, z = 0)  → { x, y }            il punto del piano di profondità `z` che finisce in (px, py): serve a trascinare una bolla alla sua profondità.
 */
export function createProjection({ yaw = 0, pitch = 0, depth = 1300 } = {}) {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  return {
    project(x, y, z = 0) {
      const z1 = -x * sy + z * cy
      const depthed = y * sp + z1 * cp
      const scale = depth / (depth + depthed)
      return { x: (x * cy + z * sy) * scale, y: (y * cp - z1 * sp) * scale, z: depthed, scale }
    },
    unproject(px, py, z = 0) {
      // px·(D + z') = D·x'  e  py·(D + z') = D·y' sono due equazioni lineari in (x, y), con z' = y·sp − x·sy·cp + z·cy·cp.
      const a1 = -px * sy * cp - depth * cy
      const b1 = px * sp
      const c1 = depth * z * sy - px * (depth + z * cy * cp)
      const a2 = -py * sy * cp - depth * sy * sp
      const b2 = py * sp - depth * cp
      const c2 = -depth * z * cy * sp - py * (depth + z * cy * cp)
      const det = a1 * b2 - a2 * b1
      if (Math.abs(det) < 1e-9) return { x: px, y: py }
      return { x: (c1 * b2 - c2 * b1) / det, y: (a1 * c2 - a2 * c1) / det }
    },
  }
}
