import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  FileText,
  Loader2,
  MessageSquare,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { AdminButton } from '../components/admin/AdminButton';
import { AssistantMessageContent } from '../components/workbench/AssistantMessageContent';
import { useAuthStore } from '../stores/authStore';
import { consumeChatSSEStream } from '../utils/parseChatSSE';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type WorkbenchMode = 'analyst' | 'report_draft';

const INITIAL_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content:
    'Intelligence Analyst Assistant is ready. I can help with case summarization, OSINT review, report drafting, and entity relationship questions. Choose a quick prompt or type your request below.',
  timestamp: new Date(),
};

const QUICK_PROMPTS: { label: string; text: string; modes?: WorkbenchMode[] }[] = [
  {
    label: 'Case summary',
    text: 'Summarize the key facts and open questions for the highest-priority active case in my unit.',
  },
  {
    label: 'OSINT review',
    text: 'Review the latest OSINT indicators and suggest follow-up collection tasks.',
    modes: ['analyst'],
  },
  {
    label: 'Entity links',
    text: 'Map likely relationships between persons, locations, and vehicles mentioned in recent alerts.',
    modes: ['analyst'],
  },
  {
    label: 'Draft brief',
    text: 'Draft a one-page intelligence brief suitable for command review, with BLUF and recommendations.',
    modes: ['report_draft'],
  },
  {
    label: 'Weekly ops',
    text: 'Produce a weekly operations summary template with sections for incidents, arrests, and emerging threats.',
    modes: ['report_draft'],
  },
];

const MODE_META: Record<
  WorkbenchMode,
  { label: string; description: string; icon: typeof MessageSquare }
> = {
  analyst: {
    label: 'Analyst',
    description: 'Q&A, summarization, OSINT, and exploratory analysis.',
    icon: MessageSquare,
  },
  report_draft: {
    label: 'Report draft',
    description: 'Structured briefs and formal intelligence products.',
    icon: FileText,
  },
};

export default function AnalystWorkbench() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<WorkbenchMode>('analyst');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || isStreaming) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((m) => [...m, userMsg]);
    setInput('');
    setIsStreaming(true);

    const assistantId = `assistant-${Date.now()}`;

    try {
      const { accessToken } = useAuthStore.getState();
      const response = await fetch('/api/v1/ml/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content }],
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to connect to LLM gateway');
      }

      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        },
      ]);

      let assistantContent = '';

      if (response.body) {
        await consumeChatSSEStream(response.body, (token) => {
          assistantContent += token;
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content: assistantContent } : msg
            )
          );
        });
      }

      if (!assistantContent.trim()) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? { ...msg, content: 'No response was returned from the model.' }
              : msg
          )
        );
      }
    } catch {
      setMessages((m) => [
        ...m.filter((msg) => msg.id !== assistantId),
        {
          id: assistantId,
          role: 'assistant',
          content:
            'Unable to reach the analyst assistant right now. Please try again in a moment or start a new session.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const resetConversation = () => {
    if (isStreaming) return;
    setMessages([{ ...INITIAL_MESSAGE, timestamp: new Date() }]);
    setInput('');
  };

  const visiblePrompts = QUICK_PROMPTS.filter(
    (p) => !p.modes || p.modes.includes(mode)
  );

  const ModeIcon = MODE_META[mode].icon;

  return (
    <div className="flex flex-col min-h-[calc(100dvh-9.5rem)] max-h-[calc(100dvh-9.5rem)] gap-4">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-iip-primary/10 text-iip-primary shrink-0">
            <Bot size={24} aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-iip-text">Analyst Workbench</h1>
            <p className="text-sm text-iip-text-muted mt-1 max-w-xl">
              RAG-assisted analysis and report drafting for intelligence workflows.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
            Assistant ready
          </span>
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={resetConversation}
            disabled={isStreaming}
            title="Clear conversation"
          >
            <RotateCcw size={15} aria-hidden />
            New session
          </AdminButton>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-4 flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="lg:w-72 shrink-0 flex flex-col gap-4">
          <div className="dashboard-card p-4 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-iip-text-muted">
                Workbench mode
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {(Object.keys(MODE_META) as WorkbenchMode[]).map((key) => {
                  const meta = MODE_META[key];
                  const Icon = meta.icon;
                  const active = mode === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMode(key)}
                      disabled={isStreaming}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'border-iip-primary/40 bg-iip-primary/10 text-iip-text'
                          : 'border-iip-border bg-iip-bg/50 text-iip-text-muted hover:border-iip-border-hover hover:bg-iip-surface-hover'
                      }`}
                    >
                      <Icon
                        size={16}
                        className={`mt-0.5 shrink-0 ${active ? 'text-iip-primary' : ''}`}
                        aria-hidden
                      />
                      <span>
                        <span className="block text-sm font-medium">{meta.label}</span>
                        <span className="block text-xs mt-0.5 opacity-80">{meta.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="dashboard-card p-4 flex-1 min-h-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-iip-text-muted mb-3 flex items-center gap-1.5">
              <Sparkles size={12} aria-hidden />
              Quick prompts
            </p>
            <ul className="space-y-2">
              {visiblePrompts.map((prompt) => (
                <li key={prompt.label}>
                  <button
                    type="button"
                    disabled={isStreaming}
                    onClick={() => void sendMessage(prompt.text)}
                    className="w-full text-left rounded-lg border border-iip-border bg-iip-bg/40 px-3 py-2.5 text-sm text-iip-text hover:border-iip-primary/30 hover:bg-iip-primary/5 transition-colors disabled:opacity-50"
                  >
                    <span className="font-medium block">{prompt.label}</span>
                    <span className="text-xs text-iip-text-muted line-clamp-2 mt-0.5">
                      {prompt.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Chat panel */}
        <section className="dashboard-card flex flex-1 min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-iip-border bg-iip-surface/80 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <ModeIcon size={16} className="text-iip-primary shrink-0" aria-hidden />
              <span className="text-sm font-semibold text-iip-text truncate">
                {MODE_META[mode].label} session
              </span>
              <span className="text-xs text-iip-text-muted hidden sm:inline">
                · {messages.length - 1} messages
              </span>
            </div>
            {isStreaming && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-iip-primary">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Generating…
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-5 bg-gradient-to-b from-iip-bg/30 to-iip-bg">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user'
                      ? 'bg-iip-primary/15 text-iip-primary'
                      : 'bg-iip-surface border border-iip-border text-iip-primary'
                  }`}
                  aria-hidden
                >
                  {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                </div>
                <div
                  className={`max-w-[85%] min-w-0 ${
                    msg.role === 'user' ? 'text-right' : 'text-left'
                  }`}
                >
                  <div
                    className={`inline-block text-left rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                      msg.role === 'user'
                        ? 'bg-iip-primary text-white rounded-tr-md'
                        : 'bg-iip-surface border border-iip-border text-iip-text rounded-tl-md'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      msg.content ? (
                        <AssistantMessageContent
                          content={msg.content}
                          isStreaming={
                            isStreaming && msg.id === messages[messages.length - 1]?.id
                          }
                        />
                      ) : isStreaming ? (
                        <span className="inline-flex items-center gap-2 text-iip-text-muted">
                          <Zap size={14} className="animate-pulse text-iip-primary" />
                          Thinking…
                        </span>
                      ) : null
                    ) : (
                      <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                    )}
                  </div>
                  <p
                    className={`mt-1.5 text-[10px] font-mono uppercase tracking-wide text-iip-text-muted/70 ${
                      msg.role === 'user' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {msg.role === 'user' ? 'You' : 'Assistant'} ·{' '}
                    {msg.timestamp.toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 border-t border-iip-border bg-iip-surface p-4">
            <div className="flex gap-2 items-end max-w-4xl mx-auto w-full">
              <label className="flex-1 min-w-0">
                <span className="sr-only">Message</span>
                <textarea
                  ref={textareaRef}
                  rows={2}
                  className="form-control w-full resize-none py-3 text-sm min-h-[52px] max-h-32"
                  placeholder={
                    mode === 'report_draft'
                      ? 'Describe the report you need (audience, classification, sections)…'
                      : 'Ask about cases, entities, OSINT, or analysis…'
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isStreaming}
                />
              </label>
              <AdminButton
                variant="primary"
                size="sm"
                className="h-[52px] px-4 shrink-0"
                onClick={() => void sendMessage()}
                disabled={isStreaming || !input.trim()}
                aria-label="Send message"
              >
                {isStreaming ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Send size={18} aria-hidden />
                )}
              </AdminButton>
            </div>
            <p className="text-center text-[11px] text-iip-text-muted mt-2 max-w-4xl mx-auto">
              Enter to send · Shift+Enter for new line · Responses may include classified context
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
