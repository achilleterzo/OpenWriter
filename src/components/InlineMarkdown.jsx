import { Fragment } from 'react'

/**
 * Markdown in linea (**grassetto**, *corsivo*, ~~barrato~~, `codice`, [link](url)) disegnato con i suoi stili: per mostrare nelle note il testo
 * citato e quello proposto com'è formattato nel documento, invece che senza stili o con gli asterischi.
 */
const TOKEN = /\\([\\`*_{}[\]()#+\-.!|>~])|`([^`]+)`|\[([^\]]+)\]\(([^)]*)\)|(\*\*|__)(?=\S)(.+?)\5|~~(.+?)~~|(?<![*\w])\*(?!\s)(.+?)\*(?![*\w])|(?<![_\w])_(?!\s)(.+?)_(?![_\w])/gs

function parse(value, keyPrefix) {
  const out = []
  let last = 0
  let index = 0
  for (const match of value.matchAll(TOKEN)) {
    if (match.index > last) out.push(value.slice(last, match.index))
    const key = `${keyPrefix}${index += 1}`
    if (match[1] !== undefined) out.push(match[1])
    else if (match[2] !== undefined) out.push(<code key={key} className="rounded bg-slate-800 px-1 font-mono">{match[2]}</code>)
    else if (match[3] !== undefined) out.push(<span key={key} className="underline decoration-dotted">{parse(match[3], `${key}.`)}</span>)
    else if (match[6] !== undefined) out.push(<strong key={key} className="font-bold">{parse(match[6], `${key}.`)}</strong>)
    else if (match[7] !== undefined) out.push(<s key={key}>{parse(match[7], `${key}.`)}</s>)
    else out.push(<em key={key} className="italic">{parse(match[8] ?? match[9], `${key}.`)}</em>)
    last = match.index + match[0].length
  }
  if (last < value.length) out.push(value.slice(last))
  return out
}

export default function InlineMarkdown({ value }) {
  return <Fragment>{parse(String(value ?? ''), 'm')}</Fragment>
}
