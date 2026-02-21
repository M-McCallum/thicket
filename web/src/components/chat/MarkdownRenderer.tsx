import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import type { Components } from 'react-markdown'
import type { Plugin } from 'unified'
import type { Text, Parent } from 'mdast'
import { visit } from 'unist-util-visit'
import SpoilerText from './SpoilerText'
import '@/styles/highlight-solarized.css'

interface MarkdownRendererProps {
  content: string
}

// Custom remark plugin for <@uuid> mention syntax
const remarkMentions: Plugin = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (index === undefined || !parent) return

      const mentionRegex = /<@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/g
      const value = node.value
      let match = mentionRegex.exec(value)
      if (!match) return

      const children: (Text | { type: string; value: string; data: { hName: string } })[] = []
      let lastIndex = 0

      mentionRegex.lastIndex = 0
      while ((match = mentionRegex.exec(value)) !== null) {
        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) } as Text)
        }
        children.push({
          type: 'mention',
          value: match[1],
          data: { hName: 'mention' }
        })
        lastIndex = match.index + match[0].length
      }

      if (lastIndex < value.length) {
        children.push({ type: 'text', value: value.slice(lastIndex) } as Text)
      }

      parent.children.splice(index, 1, ...children as any[])
    })
  }
}

// Custom remark plugin for ||spoiler|| syntax
const remarkSpoiler: Plugin = () => {
  return (tree) => {
    visit(tree, 'text', (node: Text, index: number | undefined, parent: Parent | undefined) => {
      if (index === undefined || !parent) return

      const regex = /\|\|(.+?)\|\|/g
      const value = node.value
      let match = regex.exec(value)
      if (!match) return

      const children: (Text | { type: string; value: string; data: { hName: string } })[] = []
      let lastIndex = 0

      regex.lastIndex = 0
      while ((match = regex.exec(value)) !== null) {
        if (match.index > lastIndex) {
          children.push({ type: 'text', value: value.slice(lastIndex, match.index) } as Text)
        }
        children.push({
          type: 'spoiler',
          value: match[1],
          data: { hName: 'spoiler' }
        })
        lastIndex = match.index + match[0].length
      }

      if (lastIndex < value.length) {
        children.push({ type: 'text', value: value.slice(lastIndex) } as Text)
      }

      parent.children.splice(index, 1, ...children as any[])
    })
  }
}

const components: Components = {
  h1({ children }) {
    return <h1 className="text-xl font-bold text-sol-text-primary mt-2 mb-1">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="text-lg font-bold text-sol-text-primary mt-2 mb-1">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="text-base font-semibold text-sol-text-primary mt-1.5 mb-0.5">{children}</h3>
  },
  h4({ children }) {
    return <h4 className="text-sm font-semibold text-sol-text-primary mt-1 mb-0.5">{children}</h4>
  },
  h5({ children }) {
    return <h5 className="text-sm font-medium text-sol-text-secondary mt-1 mb-0.5">{children}</h5>
  },
  h6({ children }) {
    return <h6 className="text-xs font-medium text-sol-text-muted mt-1 mb-0.5">{children}</h6>
  },
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const isInline = !match && !className
    if (isInline) {
      return (
        <code className="bg-tertiary/60 text-accent-coral px-1 py-0.5 rounded text-[0.85em]" {...props}>
          {children}
        </code>
      )
    }
    return (
      <code className={`${className || ''} text-sm`} {...props}>
        {children}
      </code>
    )
  },
  pre({ children }) {
    return (
      <pre className="bg-[#002b36] rounded-md p-3 my-1 overflow-x-auto text-sm">
        {children}
      </pre>
    )
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-accent-amber/50 pl-3 my-1 text-secondary italic">
        {children}
      </blockquote>
    )
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-1">
        <table className="border-collapse border border-primary text-sm w-full">
          {children}
        </table>
      </div>
    )
  },
  th({ children }) {
    return (
      <th className="border border-primary bg-tertiary/40 px-3 py-1.5 text-left text-primary font-semibold">
        {children}
      </th>
    )
  },
  td({ children }) {
    return (
      <td className="border border-primary px-3 py-1.5 text-secondary">
        {children}
      </td>
    )
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-blue hover:underline"
      >
        {children}
      </a>
    )
  },
  p({ children }) {
    return <p className="my-0 leading-relaxed">{children}</p>
  },
  ul({ children }) {
    return <ul className="list-disc pl-5 my-1">{children}</ul>
  },
  ol({ children }) {
    return <ol className="list-decimal pl-5 my-1">{children}</ol>
  },
  // Handle mention custom element
  // @ts-expect-error custom element
  mention({ value }: { value: string }) {
    return (
      <span className="text-sol-amber bg-sol-amber/10 rounded px-0.5 cursor-pointer hover:bg-sol-amber/20">
        @{value.slice(0, 8)}...
      </span>
    )
  },
  // Handle spoiler custom element
  spoiler({ value }: { value: string }) {
    return <SpoilerText>{value}</SpoilerText>
  }
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="markdown-content whitespace-pre-wrap break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMentions, remarkSpoiler]}
        rehypePlugins={[rehypeHighlight]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
