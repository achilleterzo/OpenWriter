import { createContext, memo, useContext, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { t } from '../i18n/index.js'

// Dentro un collegamento un'immagine non può essere a sua volta un collegamento (<a> dentro <a> non è HTML valido): ne resta il testo alternativo.
const InLink = createContext(false)
const linkClass = 'text-accent-400 underline underline-offset-2 hover:text-accent-300'

// react-markdown passa anche `node`: non va inoltrato al DOM.
const styled = (Tag, className) => function Styled({ node: _node, ...props }) {
  return <Tag className={className} {...props} />
}

// Il testo semplice dei figli di un elemento (per copiare un blocco di codice senza i suoi elementi).
const plainText = (node) => (Array.isArray(node) ? node.map(plainText).join('') : typeof node === 'string' ? node : node?.props ? plainText(node.props.children) : '')

// Blocco di codice (```linguaggio … ```): in alto il linguaggio e il pulsante «Copia», che mette negli appunti il testo del blocco, tale e quale.
function CodeBlock({ node: _node, children, ...props }) {
  const [copied, setCopied] = useState(false)
  const code = Array.isArray(children) ? children.find((child) => child?.props) : children
  const language = /language-([\w+#.-]+)/.exec(code?.props?.className || '')?.[1] || ''
  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText(code?.props?.children).replace(/\n$/, ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* appunti non disponibili: resta il testo selezionabile */ }
  }
  return (
    <div className="my-2 overflow-hidden rounded-lg bg-slate-950/70">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 px-3 py-1 text-[11px] text-slate-500">
        <span className="truncate font-mono uppercase tracking-wide">{language}</span>
        <button type="button" aria-label={copied ? t('Copied') : t('Copy')} title={copied ? t('Copied') : t('Copy')} className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-slate-400 transition hover:text-accent-400" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? t('Copied') : t('Copy')}</span>
        </button>
      </div>
      <pre className="whitespace-pre-wrap break-words p-3 text-xs leading-5 [overflow-wrap:anywhere]" {...props}>{children}</pre>
    </div>
  )
}

const components = {
  p: styled('p', 'my-2 first:mt-0 last:mb-0'),
  h1: styled('h3', 'mb-1 mt-3 text-base font-semibold text-slate-50 first:mt-0'),
  h2: styled('h3', 'mb-1 mt-3 text-base font-semibold text-slate-50 first:mt-0'),
  h3: styled('h4', 'mb-1 mt-3 text-sm font-semibold text-slate-50 first:mt-0'),
  h4: styled('h5', 'mb-1 mt-2 text-sm font-semibold text-slate-100 first:mt-0'),
  h5: styled('h5', 'mb-1 mt-2 text-sm font-semibold text-slate-100 first:mt-0'),
  h6: styled('h6', 'mb-1 mt-2 text-sm font-semibold text-slate-100 first:mt-0'),
  ul: styled('ul', 'my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0'),
  ol: styled('ol', 'my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0'),
  li: styled('li', 'pl-0.5'),
  blockquote: styled('blockquote', 'my-2 border-l-2 border-accent-400 pl-3 text-slate-400'),
  hr: styled('hr', 'my-3 border-slate-700'),
  strong: styled('strong', 'font-semibold text-slate-50'),
  pre: CodeBlock,
  th: styled('th', 'border border-slate-700 bg-slate-900/60 px-2 py-1 text-left font-semibold'),
  td: styled('td', 'border border-slate-700 px-2 py-1 align-top'),
  table: ({ node: _node, ...props }) => <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-xs" {...props} /></div>,
  a: ({ node: _node, href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className={linkClass}><InLink.Provider value>{children}</InLink.Provider></a>,
  // Niente immagini remote da una risposta del modello: si mostra il testo alternativo come collegamento (come semplice testo se è già dentro un collegamento).
  img: function Img({ node: _node, src, alt }) {
    const inLink = useContext(InLink)
    return inLink ? <span>{alt || src}</span> : <a href={src} target="_blank" rel="noreferrer noopener" className="text-accent-400 underline underline-offset-2">{alt || src}</a>
  },
  code({ node: _node, className, children, ...props }) {
    const block = /language-/.test(className || '') || String(children).includes('\n')
    return block
      ? <code className={`font-mono ${className || ''}`} {...props}>{children}</code>
      : <code className="rounded bg-slate-950/60 px-1 py-0.5 font-mono text-[0.85em] text-slate-100" {...props}>{children}</code>
  },
}

// Varianti: `onAccent` (testo su fondo colore d'accento: i link restano leggibili), `softBreaks` (gli a capo singoli si vedono, come nel testo scritto
// dall'utente) e `inline` (nessun blocco: per le etichette dentro i pulsanti).
const onAccentComponents = {
  ...components,
  a: ({ node: _node, href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="text-white underline underline-offset-2 hover:opacity-80"><InLink.Provider value>{children}</InLink.Provider></a>,
  strong: styled('strong', 'font-semibold'),
  code({ node: _node, className, children, ...props }) {
    const block = /language-/.test(className || '') || String(children).includes('\n')
    return block ? <code className={`font-mono ${className || ''}`} {...props}>{children}</code> : <code className="rounded bg-black/25 px-1 py-0.5 font-mono text-[0.85em]" {...props}>{children}</code>
  },
}
const withSoftBreaks = (base) => ({ ...base, p: styled('p', 'my-2 whitespace-pre-line first:mt-0 last:mb-0'), li: styled('li', 'pl-0.5 whitespace-pre-line') })
const inlineComponents = (base) => ({ ...base, p: ({ node: _node, children }) => <span className="block">{children}</span> })

// Il testo del modello viene reso come elementi React: l'HTML grezzo non viene interpretato.
export default memo(function MarkdownMessage({ children, onAccent = false, softBreaks = false, inline = false }) {
  let set = onAccent ? onAccentComponents : components
  if (softBreaks) set = withSoftBreaks(set)
  if (inline) set = inlineComponents(set)
  const Wrapper = inline ? 'span' : 'div'
  return (
    <Wrapper className="block min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={set}>{children}</ReactMarkdown>
    </Wrapper>
  )
})
