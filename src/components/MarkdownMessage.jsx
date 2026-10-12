import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// react-markdown passa anche `node`: non va inoltrato al DOM.
const styled = (Tag, className) => function Styled({ node: _node, ...props }) {
  return <Tag className={className} {...props} />
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
  pre: styled('pre', 'my-2 overflow-x-auto rounded-lg bg-slate-950/70 p-3 text-xs leading-5'),
  th: styled('th', 'border border-slate-700 bg-slate-900/60 px-2 py-1 text-left font-semibold'),
  td: styled('td', 'border border-slate-700 px-2 py-1 align-top'),
  table: ({ node: _node, ...props }) => <div className="my-2 overflow-x-auto"><table className="w-full border-collapse text-xs" {...props} /></div>,
  a: ({ node: _node, href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent-400 underline underline-offset-2 hover:text-accent-300">{children}</a>,
  // Niente immagini remote da una risposta del modello: si mostra il testo alternativo come collegamento.
  img: ({ node: _node, src, alt }) => <a href={src} target="_blank" rel="noreferrer noopener" className="text-accent-400 underline underline-offset-2">{alt || src}</a>,
  code({ node: _node, className, children, ...props }) {
    const block = /language-/.test(className || '') || String(children).includes('\n')
    return block
      ? <code className={`font-mono ${className || ''}`} {...props}>{children}</code>
      : <code className="rounded bg-slate-950/60 px-1 py-0.5 font-mono text-[0.85em] text-slate-100" {...props}>{children}</code>
  },
}

// Il testo del modello viene reso come elementi React: l'HTML grezzo non viene interpretato.
export default function MarkdownMessage({ children }) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
    </div>
  )
}
