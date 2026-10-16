/**
 * Differenze fini tra due testi, per parole: servono a mostrare, in una modifica dell'assistente da rivedere, solo ciò che è davvero cambiato
 * invece dell'intero paragrafo sostituito.
 */
const TOKEN = /\s+|[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}_]+)*|[^\s\p{L}\p{N}_]/gu
const MAX_CELLS = 1_500_000

export function tokenize(text) {
  const tokens = []
  for (const match of String(text).matchAll(TOKEN)) tokens.push({ text: match[0], start: match.index, end: match.index + match[0].length, space: /^\s/.test(match[0]) })
  return tokens
}

// Somiglianza 0–1 tra due testi (parole in comune, senza tener conto dell'ordine): per decidere quali paragrafi vecchi e nuovi si corrispondono.
export function similarity(before, after) {
  const words = (text) => tokenize(text).filter((token) => !token.space).map((token) => token.text)
  const a = words(before)
  const b = words(after)
  if (!a.length && !b.length) return before === after ? 1 : 0
  if (!a.length || !b.length) return 0
  const counts = new Map()
  for (const word of a) counts.set(word, (counts.get(word) || 0) + 1)
  let common = 0
  for (const word of b) { const left = counts.get(word) || 0; if (left > 0) { counts.set(word, left - 1); common += 1 } }
  return (2 * common) / (a.length + b.length)
}

// Unisce gli intervalli vicini (anche separati solo da spazi, già inclusi come "cambiati") in intervalli [da, a) sul testo.
function toRanges(tokens, changed) {
  const ranges = []
  tokens.forEach((token, index) => {
    if (!changed[index]) return
    const last = ranges.at(-1)
    if (last && last[1] === token.start) last[1] = token.end
    else ranges.push([token.start, token.end])
  })
  return ranges
}

/**
 * Confronta `before` e `after`: restituisce gli intervalli di caratteri cambiati in ciascuno, `{ removed, added }`.
 * Uno spazio fra due parole cambiate conta come cambiato (così "due parole" diventa un solo intervallo); gli spazi ai bordi no.
 */
export function diffText(before, after) {
  const a = tokenize(before)
  const b = tokenize(after)
  let start = 0
  while (start < a.length && start < b.length && a[start].text === b[start].text) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1].text === b[endB - 1].text) { endA -= 1; endB -= 1 }

  const changedA = new Array(a.length).fill(false)
  const changedB = new Array(b.length).fill(false)
  const n = endA - start
  const m = endB - start
  if (n * m > MAX_CELLS) {
    for (let i = start; i < endA; i += 1) changedA[i] = true
    for (let j = start; j < endB; j += 1) changedB[j] = true
  } else if (n || m) {
    const width = m + 1
    const lcs = new Uint32Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        lcs[i * width + j] = a[start + i].text === b[start + j].text ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i].text === b[start + j].text) { i += 1; j += 1 }
      else if (j >= m || (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) { changedA[start + i] = true; i += 1 }
      else { changedB[start + j] = true; j += 1 }
    }
  }

  // Lo spazio in comune fra due tratti cambiati vicini si include nel cambiamento: un intervallo solo.
  const bridge = (tokens, changed) => {
    for (let index = 1; index < tokens.length - 1; index += 1) {
      if (!changed[index] && tokens[index].space && changed[index - 1] && changed[index + 1]) changed[index] = true
    }
  }
  bridge(a, changedA)
  bridge(b, changedB)
  return { removed: toRanges(a, changedA), added: toRanges(b, changedB) }
}

/**
 * Abbina i blocchi di testo vecchi e nuovi (liste di { text, type }): restituisce, per ogni blocco nuovo, l'indice del vecchio corrispondente o -1.
 * Due blocchi si corrispondono se sono dello stesso tipo e abbastanza simili; l'abbinamento mantiene l'ordine e massimizza la somiglianza totale.
 */
export function alignBlocks(oldBlocks, newBlocks, threshold = 0.35) {
  const p = oldBlocks.length
  const q = newBlocks.length
  const result = new Array(q).fill(-1)
  if (!p || !q) return result
  if (p * q > 40_000) {
    // Troppi blocchi per confrontarli tutti: si abbinano per posizione solo se sono altrettanti.
    if (p === q) for (let index = 0; index < q; index += 1) if (oldBlocks[index].type === newBlocks[index].type) result[index] = index
    return result
  }
  const score = Array.from({ length: p }, (_, i) => Array.from({ length: q }, (_, j) => {
    if (oldBlocks[i].type !== newBlocks[j].type) return -1
    if (oldBlocks[i].text === newBlocks[j].text) return 1
    const value = similarity(oldBlocks[i].text, newBlocks[j].text)
    return value >= threshold ? value : -1
  }))
  const dp = Array.from({ length: p + 1 }, () => new Float64Array(q + 1))
  for (let i = p - 1; i >= 0; i -= 1) {
    for (let j = q - 1; j >= 0; j -= 1) {
      const take = score[i][j] >= 0 ? score[i][j] + dp[i + 1][j + 1] : -Infinity
      dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1], take)
    }
  }
  let i = 0
  let j = 0
  while (i < p && j < q) {
    const take = score[i][j] >= 0 ? score[i][j] + dp[i + 1][j + 1] : -Infinity
    if (take >= dp[i + 1][j] && take >= dp[i][j + 1] && take > -Infinity && take === dp[i][j]) { result[j] = i; i += 1; j += 1 }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1
    else j += 1
  }
  return result
}
