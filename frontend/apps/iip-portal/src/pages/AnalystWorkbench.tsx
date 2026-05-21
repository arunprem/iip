import React, { useState } from 'react'
import { Bot, Send, RefreshCcw, Zap } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

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

    try {
      const { accessToken } = useAuthStore.getState()
      const response = await fetch('/api/v1/ml/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: input }],
          mode: mode
        })
      })

      if (!response.ok) {
        throw new Error('Failed to connect to LLM gateway')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''

      setMessages((m) => [
        ...m,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        },
      ])

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') continue
              
              assistantContent += data
              setMessages((m) => {
                const newMessages = [...m]
                newMessages[newMessages.length - 1].content = assistantContent
                return newMessages
              })
            }
          }
        }
      }
    } catch (error) {
      console.error(error)
      setMessages((m) => [
        ...m,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'ERROR: Failed to connect to local Llama 3.1 inference engine.',
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-iip-bg/50 rounded-2xl border border-iip-border overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-center px-8 py-6 bg-iip-surface border-b border-iip-border">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <div className="p-2 bg-iip-primary/10 rounded-xl border border-iip-primary/20 shadow-inner">
              <Bot size={24} className="text-iip-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-iip-text drop-shadow-sm">
              LLM Analyst Workbench
            </h1>
          </div>
          <p className="text-sm text-iip-text-muted flex items-center gap-2">
            Llama 3.1 · NVIDIA H200 · Run:ai ·
            <span className="font-mono text-[11px] bg-iip-surface-active px-2 py-1 rounded text-iip-primary/90 border border-iip-border-hover">
              standalone-llm.runai-team-arun.keralapolice.gov.in
            </span>
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 p-1 bg-iip-bg rounded-xl border border-iip-border shadow-inner">
          <button
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              mode === 'analyst' 
                ? 'bg-iip-surface-active text-iip-text shadow-sm border border-iip-border-hover' 
                : 'text-iip-text-muted hover:text-iip-text hover:bg-white/5 border border-transparent'
            }`}
            onClick={() => setMode('analyst')}
          >
            Analyst
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 flex items-center gap-2 ${
              mode === 'report_draft' 
                ? 'bg-iip-surface-active text-iip-text shadow-sm border border-iip-border-hover' 
                : 'text-iip-text-muted hover:text-iip-text hover:bg-white/5 border border-transparent'
            }`}
            onClick={() => setMode('report_draft')}
          >
            <FileText size={14} className="opacity-70" />
            Report Draft
          </button>
        </div>
      </div>

      {/* Chat window */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-6 p-8 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-iip-surface/40 via-iip-bg to-iip-bg">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] p-5 text-[15px] leading-relaxed shadow-lg ${
                msg.role === 'user'
                  ? 'bg-iip-primary text-iip-bg rounded-2xl rounded-tr-sm border border-iip-primary-hover shadow-iip-primary/20'
                  : 'bg-iip-surface text-iip-text rounded-2xl rounded-tl-sm border border-iip-border shadow-black/40 backdrop-blur-md'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              <div
                className={`font-mono text-[11px] mt-3 uppercase tracking-wider ${
                  msg.role === 'user' ? 'text-iip-bg/60' : 'text-iip-text-muted/60'
                }`}
              >
                {msg.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex items-center gap-3 p-4 bg-iip-surface-hover border border-iip-border rounded-xl self-start w-fit shadow-md">
            <Zap size={16} className="text-iip-primary animate-pulse" />
            <span className="font-mono text-[12px] text-iip-primary tracking-widest uppercase animate-pulse">
              Generating Inference...
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-6 bg-iip-surface border-t border-iip-border">
        <div className="flex gap-3 max-w-5xl mx-auto">
          <input
            className="flex-1 bg-iip-bg border border-iip-border-hover focus:border-iip-primary text-iip-text text-sm rounded-xl px-5 py-4 outline-none transition-colors shadow-inner placeholder:text-iip-text-muted/50"
            placeholder="Ask the analyst assistant... (RAG queries, case summaries, report drafts)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={isStreaming}
          />
          <button 
            className="bg-iip-primary hover:bg-iip-primary-hover text-iip-bg disabled:opacity-50 disabled:cursor-not-allowed px-6 rounded-xl flex items-center justify-center transition-all shadow-[0_0_15px_rgba(56,189,248,0.2)] hover:shadow-[0_0_20px_rgba(56,189,248,0.4)]" 
            onClick={sendMessage} 
            disabled={isStreaming}
          >
            <Send size={20} className="ml-1" />
          </button>
        </div>
      </div>
    </div>
  )
}

// Needed for lazy import
function FileText({ size }: { size: number }) {
  return <svg width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
}
