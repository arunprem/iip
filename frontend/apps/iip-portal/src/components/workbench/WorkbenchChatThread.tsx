import { Bot, Loader2, User, Zap } from 'lucide-react';
import type { WorkbenchSuspectCard } from '../../api/workbenchPhotoSearch';
import { AssistantMessageContent } from './AssistantMessageContent';
import { WorkbenchSuspectCards } from './WorkbenchSuspectCards';

export interface WorkbenchChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Small inline photo in user bubble (data URL). */
  photoPreview?: string;
  /** Assistant is running FRS / DB search before LLM reply. */
  loadingHint?: string;
  /** Per-suspect cards with photo, name, and individual LLM briefs. */
  suspectCards?: WorkbenchSuspectCard[];
  /** Card currently receiving streamed LLM tokens. */
  streamingCardId?: string | null;
}

interface WorkbenchChatThreadProps {
  messages: WorkbenchChatMessage[];
  isStreaming: boolean;
}

export function WorkbenchChatThread({ messages, isStreaming }: WorkbenchChatThreadProps) {
  return (
    <>
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
            className={`max-w-[85%] min-w-0 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}
          >
            <div
              className={`text-left rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'inline-block bg-iip-primary text-white rounded-tr-md'
                  : msg.suspectCards && msg.suspectCards.length > 0
                    ? 'block w-full max-w-xl bg-iip-surface border border-iip-border text-iip-text rounded-tl-md'
                    : 'inline-block bg-iip-surface border border-iip-border text-iip-text rounded-tl-md'
              }`}
            >
              {msg.role === 'assistant' ? (
                <>
                  {msg.content ? (
                    <AssistantMessageContent
                      content={msg.content}
                      isStreaming={
                        isStreaming &&
                        msg.id === messages[messages.length - 1]?.id &&
                        !msg.streamingCardId
                      }
                    />
                  ) : msg.loadingHint && !msg.suspectCards?.length ? (
                    <span className="inline-flex items-center gap-2 text-iip-text-muted">
                      <Loader2 size={14} className="animate-spin text-iip-primary" />
                      {msg.loadingHint}
                    </span>
                  ) : isStreaming && !msg.suspectCards?.length ? (
                    <span className="inline-flex items-center gap-2 text-iip-text-muted">
                      <Zap size={14} className="animate-pulse text-iip-primary" />
                      Thinking…
                    </span>
                  ) : null}
                  {msg.suspectCards && msg.suspectCards.length > 0 && (
                    <WorkbenchSuspectCards
                      cards={msg.suspectCards}
                      streamingCardId={
                        isStreaming && msg.id === messages[messages.length - 1]?.id
                          ? msg.streamingCardId
                          : null
                      }
                    />
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {msg.photoPreview && (
                    <img
                      src={msg.photoPreview}
                      alt="Uploaded photo"
                      className="h-16 w-16 rounded-lg object-cover border border-white/30"
                    />
                  )}
                  {msg.content ? (
                    <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  ) : msg.photoPreview ? (
                    <div className="text-white/90 text-xs">Photo uploaded for identification</div>
                  ) : null}
                </div>
              )}
            </div>
            <p
              className={`mt-1.5 text-[10px] font-mono uppercase tracking-wide text-iip-text-muted/70 ${
                msg.role === 'user' ? 'text-right' : 'text-left'
              }`}
            >
              {msg.role === 'user' ? 'You' : 'Assistant'} ·{' '}
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      ))}
    </>
  );
}
