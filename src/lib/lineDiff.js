const MAX_MATRIX_CELLS = 4_000_000

// Diff per righe: restituisce [{ type: 'same' | 'add' | 'del', text }].
export function lineDiff(before, after) {
  const a = before.split('\n')
  const b = after.split('\n')

  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1 }

  const head = a.slice(0, start).map((text) => ({ type: 'same', text }))
  const tail = a.slice(endA).map((text) => ({ type: 'same', text }))
  const middleA = a.slice(start, endA)
  const middleB = b.slice(start, endB)

  // Per testi molto diversi e lunghi si evita la matrice LCS e si mostra tutto come sostituito.
  if (middleA.length * middleB.length > MAX_MATRIX_CELLS) {
    return [...head, ...middleA.map((text) => ({ type: 'del', text })), ...middleB.map((text) => ({ type: 'add', text })), ...tail]
  }

  const width = middleB.length + 1
  const lcs = new Uint32Array((middleA.length + 1) * width)
  for (let i = middleA.length - 1; i >= 0; i -= 1) {
    for (let j = middleB.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = middleA[i] === middleB[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const middle = []
  let i = 0
  let j = 0
  while (i < middleA.length && j < middleB.length) {
    if (middleA[i] === middleB[j]) { middle.push({ type: 'same', text: middleA[i] }); i += 1; j += 1 }
    else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) { middle.push({ type: 'del', text: middleA[i] }); i += 1 }
    else { middle.push({ type: 'add', text: middleB[j] }); j += 1 }
  }
  for (; i < middleA.length; i += 1) middle.push({ type: 'del', text: middleA[i] })
  for (; j < middleB.length; j += 1) middle.push({ type: 'add', text: middleB[j] })

  return [...head, ...middle, ...tail]
}

// Raggruppa le righe invariate lunghe in un unico segnaposto, mantenendo `context` righe attorno alle modifiche.
export function collapseDiff(lines, context = 3) {
  const keep = new Array(lines.length).fill(false)
  lines.forEach((line, index) => {
    if (line.type === 'same') return
    for (let k = Math.max(0, index - context); k <= Math.min(lines.length - 1, index + context); k += 1) keep[k] = true
  })
  const result = []
  let hidden = 0
  lines.forEach((line, index) => {
    if (keep[index]) {
      if (hidden) { result.push({ type: 'gap', text: `${hidden} righe invariate` }); hidden = 0 }
      result.push(line)
    } else hidden += 1
  })
  if (hidden) result.push({ type: 'gap', text: `${hidden} righe invariate` })
  return result
}
