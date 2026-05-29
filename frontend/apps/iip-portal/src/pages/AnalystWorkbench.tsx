import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  FileText,
  ImagePlus,
  Loader2,
  MessageSquare,
  RotateCcw,
  ScanFace,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminButton } from '../components/admin/AdminButton';
import { WorkbenchChatThread, type WorkbenchChatMessage } from '../components/workbench/WorkbenchChatThread';
import {
  analyzePhotoAgainstSuspects,
  buildFollowUpIntroPrompt,
  buildFollowUpNoTargetPrompt,
  buildPhotoSearchIntroPrompt,
  buildSuspectBriefPrompt,
  buildTextSearchIntroPrompt,
  suspectCardsFromPhotoResult,
  suspectCardsFromTextDossiers,
  searchSuspectsByQuery,
  type WorkbenchSuspectCard,
} from '../api/workbenchPhotoSearch';
import {
  buildConversationSummary,
  collectSessionSuspectCards,
  isFollowUpQuestion,
  refreshSuspectCardsFromDb,
  resolveFollowUpTargets,
} from '../api/workbenchSession';
import { extractSearchQueryFromQuestion } from '../api/workbenchSearchUtils';
import { fileToSuspectPhotoPreviewDataUrl } from '../api/suspectFaces';
import { listSuspectDossiers } from '../api/suspectDossiers';
import { useAuthStore } from '../stores/authStore';
import { consumeChatSSEStream } from '../utils/parseChatSSE';

type WorkbenchMode = 'analyst' | 'report_draft' | 'photo_suspect';

const PHOTO_WELCOME: WorkbenchChatMessage = {
  id: 'welcome-photo',
  role: 'assistant',
  content:
    'Upload a suspect photo or ask in plain language — e.g. *"Who lives in Kalliyoor?"*, *"Son of Antony in Kochi"*, *"Relative named Rajan"*, or *"Phone 9495205259"*. After results appear, ask follow-ups in the same chat.',
  timestamp: new Date(),
};

const ANALYST_WELCOME: WorkbenchChatMessage = {
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
  {
    label: 'Name lookup',
    text: 'Tell me everything in the dossier about Sijo T Antony.',
    modes: ['photo_suspect'],
  },
  {
    label: 'Address lookup',
    text: 'Any suspect who lives in Kalliyoor area?',
    modes: ['photo_suspect'],
  },
  {
    label: 'Father name',
    text: 'Find suspects whose father name is Antony.',
    modes: ['photo_suspect'],
  },
  {
    label: 'Relative lookup',
    text: 'Any suspect with a relative named Rajan?',
    modes: ['photo_suspect'],
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
  photo_suspect: {
    label: 'Suspect search',
    description: 'Photo FRS or name/address chat lookup.',
    icon: ScanFace,
  },
};

function welcomeForMode(mode: WorkbenchMode): WorkbenchChatMessage {
  return mode === 'photo_suspect'
    ? { ...PHOTO_WELCOME, timestamp: new Date() }
    : { ...ANALYST_WELCOME, timestamp: new Date() };
}

export default function AnalystWorkbench() {
  const [messages, setMessages] = useState<WorkbenchChatMessage[]>([ANALYST_WELCOME]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [mode, setMode] = useState<WorkbenchMode>('analyst');
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; previewUrl: string } | null>(
    null
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  const streamLlmTokens = useCallback(
    async (
      llmUserContent: string,
      onUpdate: (text: string) => void,
      chatMode: WorkbenchMode
    ): Promise<string> => {
      const { accessToken } = useAuthStore.getState();
      const response = await fetch('/api/v1/ml/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: llmUserContent }],
          mode: chatMode === 'report_draft' ? 'report_draft' : 'analyst',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to connect to LLM gateway');
      }

      let accumulated = '';
      if (response.body) {
        await consumeChatSSEStream(response.body, (token) => {
          accumulated += token;
          onUpdate(accumulated);
        });
      }
      return accumulated;
    },
    []
  );

  const streamLlmReply = useCallback(
    async (llmUserContent: string, assistantId: string, chatMode: WorkbenchMode) => {
      const content = await streamLlmTokens(
        llmUserContent,
        (text) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, content: text, loadingHint: undefined, streamingCardId: null }
                : msg
            )
          );
        },
        chatMode
      );

      if (!content.trim()) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  content: 'No response was returned from the model.',
                  loadingHint: undefined,
                }
              : msg
          )
        );
      }
    },
    [streamLlmTokens]
  );

  const streamSuspectCardReply = useCallback(
    async (params: {
      assistantId: string;
      cards: WorkbenchSuspectCard[];
      introPrompt: string;
      userQuestion?: string;
      context: 'photo' | 'text' | 'followup';
      chatMode: WorkbenchMode;
      conversationSummary?: string;
    }) => {
      const {
        assistantId,
        cards,
        introPrompt,
        userQuestion,
        context,
        chatMode,
        conversationSummary,
      } = params;

      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? { ...msg, suspectCards: cards, loadingHint: undefined, streamingCardId: null }
            : msg
        )
      );

      if (cards.length === 0) {
        await streamLlmReply(introPrompt, assistantId, chatMode);
        return;
      }

      await streamLlmTokens(
        introPrompt,
        (content) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId ? { ...msg, content, streamingCardId: null } : msg
            )
          );
        },
        chatMode
      );

      for (const card of cards) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === assistantId ? { ...msg, streamingCardId: card.id } : msg
          )
        );

        await streamLlmTokens(
          buildSuspectBriefPrompt({
            criminalName: card.criminalName,
            dossierSummary: card.dossierSummary,
            similarityPercent: card.similarityPercent,
            userQuestion,
            context,
            conversationSummary,
          }),
          (note) => {
            setMessages((m) =>
              m.map((msg) => {
                if (msg.id !== assistantId) return msg;
                return {
                  ...msg,
                  suspectCards: msg.suspectCards?.map((c) =>
                    c.id === card.id ? { ...c, note, noteLoading: false } : c
                  ),
                };
              })
            );
          },
          chatMode
        );
      }

      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                streamingCardId: null,
                suspectCards: msg.suspectCards?.map((c) => ({ ...c, noteLoading: false })),
              }
            : msg
        )
      );
    },
    [streamLlmReply, streamLlmTokens]
  );

  const sendPhotoSuspectMessage = async (text: string, photo: { file: File; previewUrl: string }) => {
    const userMsg: WorkbenchChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text || 'Identify the person in this photo.',
      timestamp: new Date(),
      photoPreview: photo.previewUrl,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantPlaceholder: WorkbenchChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loadingHint: 'Running facial recognition against suspect index…',
    };

    setMessages((m) => [...m, userMsg, assistantPlaceholder]);
    setInput('');
    setPendingPhoto(null);
    setIsStreaming(true);

    try {
      const result = await analyzePhotoAgainstSuspects(photo.file);
      const cards = suspectCardsFromPhotoResult(result);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                suspectCards: cards.length > 0 ? cards : undefined,
                loadingHint: cards.length > 0 ? 'Analysing matches…' : 'Preparing reply…',
              }
            : msg
        )
      );
      await streamSuspectCardReply({
        assistantId,
        cards,
        introPrompt: buildPhotoSearchIntroPrompt(result, text),
        userQuestion: text || undefined,
        context: 'photo',
        chatMode: mode,
      });
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content:
                  'Photo analysis failed. Ensure ml-gateway is running and the image contains a clear face.',
                loadingHint: undefined,
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const sendFollowUpSuspectQuestion = async (
    question: string,
    priorMessages: WorkbenchChatMessage[]
  ) => {
    const sessionCards = collectSessionSuspectCards(priorMessages);
    const conversationSummary = buildConversationSummary(priorMessages);
    let targets = resolveFollowUpTargets(question, sessionCards);

    const userMsg: WorkbenchChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantPlaceholder: WorkbenchChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loadingHint: 'Checking session suspects and refreshing dossier data…',
    };

    setMessages((m) => [...m, userMsg, assistantPlaceholder]);
    setInput('');
    setIsStreaming(true);

    try {
      if (targets.length === 0 && sessionCards.length === 1) {
        targets = sessionCards;
      }

      if (targets.length === 0) {
        await streamLlmReply(
          buildFollowUpNoTargetPrompt(question, sessionCards, conversationSummary),
          assistantId,
          mode
        );
        return;
      }

      const cards = await refreshSuspectCardsFromDb(targets);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                suspectCards: cards,
                loadingHint: 'Composing follow-up answer…',
              }
            : msg
        )
      );

      await streamSuspectCardReply({
        assistantId,
        cards,
        introPrompt: buildFollowUpIntroPrompt(question, cards),
        userQuestion: question,
        context: 'followup',
        chatMode: mode,
        conversationSummary,
      });
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: 'Could not process the follow-up. Please try again.',
                loadingHint: undefined,
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const sendTextSuspectLookup = async (question: string) => {
    const userMsg: WorkbenchChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: new Date(),
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantPlaceholder: WorkbenchChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      loadingHint: 'Searching suspect dossier database…',
    };

    setMessages((m) => [...m, userMsg, assistantPlaceholder]);
    setInput('');
    setIsStreaming(true);

    try {
      const searchTerm = extractSearchQueryFromQuestion(question);
      const list = await listSuspectDossiers({ q: searchTerm, pageSize: 5 });
      const dossiers = await searchSuspectsByQuery(searchTerm, 5);
      const cards = suspectCardsFromTextDossiers(dossiers);
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                suspectCards: cards.length > 0 ? cards : undefined,
                loadingHint: cards.length > 0 ? 'Analysing records…' : 'Preparing reply…',
              }
            : msg
        )
      );
      await streamSuspectCardReply({
        assistantId,
        cards,
        introPrompt: buildTextSearchIntroPrompt(question, list.total, dossiers.length),
        userQuestion: question,
        context: 'text',
        chatMode: mode,
      });
    } catch {
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: 'Could not search suspect dossiers. Check your connection and permissions.',
                loadingHint: undefined,
              }
            : msg
        )
      );
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? input).trim();
    const photo = pendingPhoto;
    if ((!content && !photo) || isStreaming) return;

    if (mode === 'photo_suspect') {
      if (photo) {
        await sendPhotoSuspectMessage(content, photo);
        return;
      }

      const sessionCards = collectSessionSuspectCards(messages);
      if (isFollowUpQuestion(content, sessionCards)) {
        await sendFollowUpSuspectQuestion(content, messages);
        return;
      }

      await sendTextSuspectLookup(content);
      return;
    }

    const userMsg: WorkbenchChatMessage = {
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
      setMessages((m) => [
        ...m,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        },
      ]);
      await streamLlmReply(content, assistantId, mode);
    } catch {
      setMessages((m) => [
        ...m.filter((msg) => msg.id !== assistantId),
        {
          id: assistantId,
          role: 'assistant',
          content:
            'Unable to reach the analyst assistant right now. Please try again in a moment.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsStreaming(false);
      textareaRef.current?.focus();
    }
  };

  const onPhotoSelected = async (file: File | null) => {
    if (!file || isStreaming) return;
    if (!file.type.startsWith('image/')) return;
    const previewUrl = await fileToSuspectPhotoPreviewDataUrl(file);
    setPendingPhoto({ file, previewUrl });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  const resetConversation = () => {
    if (isStreaming) return;
    setMessages([welcomeForMode(mode)]);
    setInput('');
    setPendingPhoto(null);
  };

  const switchMode = (next: WorkbenchMode) => {
    if (isStreaming) return;
    setMode(next);
    setMessages([welcomeForMode(next)]);
    setInput('');
    setPendingPhoto(null);
  };

  const visiblePrompts = QUICK_PROMPTS.filter((p) => !p.modes || p.modes.includes(mode));
  const ModeIcon = MODE_META[mode].icon;
  const canSend = !isStreaming && (input.trim().length > 0 || pendingPhoto != null);

  return (
    <div className="flex flex-col min-h-[calc(100dvh-9.5rem)] max-h-[calc(100dvh-9.5rem)] gap-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between shrink-0">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-iip-primary/10 text-iip-primary shrink-0">
            <Bot size={24} aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-iip-text">Analyst Workbench</h1>
            <p className="text-sm text-iip-text-muted mt-1 max-w-xl">
              Chat with the analyst assistant — text, reports, or suspect photo / dossier lookup.
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
                      onClick={() => switchMode(key)}
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
                Working…
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-5 space-y-5 bg-gradient-to-b from-iip-bg/30 to-iip-bg">
            <WorkbenchChatThread messages={messages} isStreaming={isStreaming} />
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 border-t border-iip-border bg-iip-surface p-4">
            {mode === 'photo_suspect' && pendingPhoto && (
              <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2">
                <img
                  src={pendingPhoto.previewUrl}
                  alt="Pending upload"
                  className="h-12 w-12 rounded-lg object-cover border border-iip-border"
                />
                <span className="text-xs text-iip-text-muted flex-1 truncate">
                  Photo attached — add a note or press send
                </span>
                <button
                  type="button"
                  className="p-1 rounded-md text-iip-text-muted hover:bg-iip-surface-hover"
                  onClick={() => setPendingPhoto(null)}
                  aria-label="Remove photo"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="flex gap-2 items-end max-w-4xl mx-auto w-full">
              {mode === 'photo_suspect' && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void onPhotoSelected(e.target.files?.[0] ?? null)}
                  />
                  <AdminButton
                    variant="ghost"
                    size="sm"
                    className="h-[52px] w-[52px] shrink-0 p-0"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    aria-label="Attach photo"
                    title="Attach suspect photo"
                  >
                    <ImagePlus size={20} aria-hidden />
                  </AdminButton>
                </>
              )}
              <label className="flex-1 min-w-0">
                <span className="sr-only">Message</span>
                <textarea
                  ref={textareaRef}
                  rows={2}
                  className="form-control w-full resize-none py-3 text-sm min-h-[52px] max-h-32"
                  placeholder={
                    mode === 'photo_suspect'
                      ? 'Ask a follow-up (e.g. phone number), search by name/address, or attach a photo…'
                      : mode === 'report_draft'
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
                disabled={!canSend}
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
              Enter to send · Shift+Enter for new line
              {mode === 'photo_suspect' ? ' · 📎 attach photo for FRS match' : ''}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
