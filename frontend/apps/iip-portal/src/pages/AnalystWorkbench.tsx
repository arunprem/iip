import React, { useState } from 'react'
import { Bot, Send, RefreshCcw, Zap } from 'lucide-react'

/**
 * LLM Analyst Workbench
 * Stitch Screen: b12fdfdaa79448e59160663193b94909
 *
 * RAG-powered chat interface for intelligence analysis, report drafting,
 * and classified document summarization. Connects to ml-gateway-svc
 * which routes to Llama 3.1 at:
 *   http://standalone-llm.runai-team-arun.keralapolice.gov.in
 */

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function AnalystWorkbench() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content:
        'Intelligence Analyst Assistant online. I am connected to the Llama 3.1 inference engine (H200 · Run:ai). How can I assist with your analysis today? I can help with case summarization, OSINT analysis, report drafting, and entity relationship queries.',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [mode, setMode] = useState<'analyst' | 'report_draft'>('analyst')

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setIsStreaming(true)

    // TODO: Replace with actual SSE stream from /api/v1/ml/chat/stream
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `[Llama 3.1 · Run:ai] Received query: "${userMsg.content}". Full RAG pipeline integration with Elasticsearch and Neo4j is pending deployment. This response is a placeholder.`,
          timestamp: new Date(),
        },
      ])
      setIsStreaming(false)
    }, 1200)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--space-4)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
            <Bot size={22} color="var(--color-secondary)" />
            <h1 className="text-headline-lg">LLM Analyst Workbench</h1>
          </div>
          <p className="text-body-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Llama 3.1 · NVIDIA H200 · Run:ai ·{' '}
            <span className="text-label-mono" style={{ color: 'var(--color-secondary)' }}>
              standalone-llm.runai-team-arun.keralapolice.gov.in
            </span>
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className={`btn ${mode === 'analyst' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('analyst')}
          >
            Analyst
          </button>
          <button
            className={`btn ${mode === 'report_draft' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('report_draft')}
          >
            <FileText size={14} />
            Report Draft
          </button>
        </div>
      </div>

      {/* Chat window */}
      <div
        className="card"
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          padding: 'var(--space-6)',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                maxWidth: '75%',
                background:
                  msg.role === 'user'
                    ? 'var(--color-primary-container)'
                    : 'var(--color-surface-highest)',
                color: msg.role === 'user' ? '#ffffff' : 'var(--color-on-surface)',
                borderRadius: msg.role === 'user'
                  ? 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)'
                  : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
                padding: 'var(--space-3) var(--space-4)',
                fontSize: '14px',
                lineHeight: '22px',
              }}
            >
              {msg.content}
              <div
                className="text-label-mono"
                style={{ color: 'rgba(255,255,255,0.5)', marginTop: 'var(--space-1)', fontSize: '11px' }}
              >
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            <Zap size={14} color="var(--color-secondary)" />
            <span className="text-label-mono" style={{ color: 'var(--color-secondary)' }}>
              Llama 3.1 generating...
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <input
          className="input-field"
          placeholder="Ask the analyst assistant... (RAG queries, case summaries, report drafts)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          disabled={isStreaming}
        />
        <button className="btn btn-primary" onClick={sendMessage} disabled={isStreaming}>
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}

// Needed for lazy import
function FileText({ size }: { size: number }) {
  return <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
}
