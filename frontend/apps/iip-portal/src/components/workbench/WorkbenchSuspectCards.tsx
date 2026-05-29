import { Link } from 'react-router-dom';
import { ExternalLink, Loader2 } from 'lucide-react';
import type { WorkbenchSuspectCard } from '../../api/workbenchPhotoSearch';
import { SuspectDossierPhotoThumb } from '../suspects/SuspectDossierPhotoThumb';
import { SuspectNoteContent } from './SuspectNoteContent';

interface WorkbenchSuspectCardsProps {
  cards: WorkbenchSuspectCard[];
  streamingCardId?: string | null;
}

export function WorkbenchSuspectCards({ cards, streamingCardId }: WorkbenchSuspectCardsProps) {
  if (cards.length === 0) return null;

  return (
    <div className="mt-3 space-y-4">
      {cards.map((card) => {
        const hasPhoto =
          card.dossierDraftId.trim() && card.photoId.trim() && card.storageKey.trim();

        return (
          <article
            key={card.id}
            className="workbench-suspect-card rounded-xl border border-iip-border/70 bg-iip-bg/30 p-3"
          >
            <div className="flex gap-3">
              <div className="shrink-0">
                {hasPhoto ? (
                  <SuspectDossierPhotoThumb
                    dossierDraftId={card.dossierDraftId}
                    photoId={card.photoId}
                    storageKey={card.storageKey}
                    alt={card.criminalName}
                    size="list"
                    className="workbench-suspect-card__thumb"
                  />
                ) : (
                  <div className="workbench-suspect-card__thumb workbench-suspect-card__thumb--empty" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <h4 className="text-sm font-semibold text-iip-text leading-snug">
                    {card.criminalName}
                  </h4>
                  {card.similarityPercent != null && (
                    <span className="text-[10px] font-mono font-medium text-iip-primary bg-iip-primary/10 px-1.5 py-0.5 rounded">
                      {card.similarityPercent}% FRS
                    </span>
                  )}
                </div>

                <div className="mt-2 text-sm text-iip-text-muted leading-relaxed">
                  {card.noteLoading && !card.note ? (
                    <span className="inline-flex items-center gap-2 text-iip-text-muted">
                      <Loader2 size={13} className="animate-spin text-iip-primary" />
                      Analysing dossier…
                    </span>
                  ) : card.note ? (
                    <SuspectNoteContent
                      content={card.note}
                      criminalName={card.criminalName}
                      isStreaming={streamingCardId === card.id}
                    />
                  ) : null}
                </div>

                {card.dossierId && (
                  <Link
                    to={`/suspects/${card.dossierId}`}
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-iip-primary hover:underline"
                  >
                    Open full dossier
                    <ExternalLink size={10} aria-hidden />
                  </Link>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
