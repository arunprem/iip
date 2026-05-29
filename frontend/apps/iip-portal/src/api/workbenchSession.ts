import { getSuspectDossierDetail } from './suspectDossiers';
import {
  extractSearchQueryFromQuestion,
  isFreshDossierSearch,
} from './workbenchSearchUtils';
import {
  formatDossierSummaryForLlm,
  type WorkbenchSuspectCard,
} from './workbenchPhotoSearch';

export interface SessionChatMessage {
  role: 'user' | 'assistant';
  content: string;
  suspectCards?: WorkbenchSuspectCard[];
}

const FOLLOW_UP_HINTS = [
  'phone',
  'mobile',
  'contact',
  'number',
  'address',
  'email',
  'relative',
  'father',
  'alias',
  'dob',
  'age',
  'this person',
  'that person',
  'the person',
  'matching',
  'match',
  'best match',
  'top match',
  'uploaded photo',
  'him',
  'her',
  'his',
  'their',
  'follow up',
  'follow-up',
  'more detail',
  'tell me more',
  'what about',
  'give me',
  'please give',
  'i need',
  'can you',
  'who is',
  'correct spelling',
  'miss spell',
  'misspell',
  'original name',
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function nameWords(name: string): string[] {
  return normalizeText(name)
    .split(' ')
    .filter((w) => w.length > 1);
}

export function collectSessionSuspectCards(messages: SessionChatMessage[]): WorkbenchSuspectCard[] {
  const byKey = new Map<string, WorkbenchSuspectCard>();
  for (const msg of messages) {
    if (msg.role !== 'assistant' || !msg.suspectCards?.length) continue;
    for (const card of msg.suspectCards) {
      const key = card.dossierId ?? card.id;
      const existing = byKey.get(key);
      if (!existing || (card.similarityPercent ?? 0) > (existing.similarityPercent ?? 0)) {
        byKey.set(key, card);
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) => (b.similarityPercent ?? 0) - (a.similarityPercent ?? 0)
  );
}

export function isFollowUpQuestion(question: string, sessionCards: WorkbenchSuspectCard[]): boolean {
  if (sessionCards.length === 0) return false;
  if (isFreshDossierSearch(question)) return false;

  const q = normalizeText(question);
  if (FOLLOW_UP_HINTS.some((hint) => q.includes(hint))) return true;
  return sessionCards.some((card) => questionMatchesName(q, card.criminalName));
}

function questionMatchesName(question: string, name: string): boolean {
  const q = normalizeText(question);
  const n = normalizeText(name);
  if (!n) return false;
  if (q.includes(n)) return true;
  const words = nameWords(name);
  return words.length > 0 && words.every((w) => q.includes(w));
}

export function resolveFollowUpTargets(
  question: string,
  sessionCards: WorkbenchSuspectCard[]
): WorkbenchSuspectCard[] {
  if (sessionCards.length === 0) return [];

  const q = normalizeText(question);
  const named = sessionCards.filter((card) => questionMatchesName(q, card.criminalName));
  if (named.length === 1) return named;
  if (named.length > 1) {
    return named.sort((a, b) => (b.similarityPercent ?? 0) - (a.similarityPercent ?? 0));
  }

  const referentHints = [
    'this person',
    'that person',
    'the person',
    'uploaded photo',
    'this photo',
    'matching perfectly',
    'best match',
    'top match',
    'highest match',
  ];
  if (referentHints.some((hint) => q.includes(hint))) {
    return sessionCards.slice(0, 1);
  }

  const extracted = normalizeText(extractSearchQueryFromQuestion(question));
  if (extracted) {
    const fromExtracted = sessionCards.filter((card) => {
      const n = normalizeText(card.criminalName);
      return n.includes(extracted) || extracted.includes(n) || questionMatchesName(extracted, card.criminalName);
    });
    if (fromExtracted.length > 0) {
      return fromExtracted.sort((a, b) => (b.similarityPercent ?? 0) - (a.similarityPercent ?? 0));
    }
  }

  if (sessionCards.length === 1) return sessionCards;

  // Last resort for short follow-ups like "phone number?" — use top FRS match
  const shortFollowUp =
    q.split(' ').length <= 8 &&
    ['phone', 'mobile', 'contact', 'number', 'address', 'email'].some((h) => q.includes(h));
  if (shortFollowUp) return sessionCards.slice(0, 1);

  return [];
}

export function buildConversationSummary(messages: SessionChatMessage[], limit = 8): string {
  const recent = messages
    .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim()))
    .slice(-limit);

  return recent
    .map((m) => {
      const prefix = m.role === 'user' ? 'Analyst' : 'Assistant';
      const cards =
        m.suspectCards?.length && m.role === 'assistant'
          ? ` [showed ${m.suspectCards.map((c) => c.criminalName).join(', ')}]`
          : '';
      return `${prefix}: ${m.content.trim().slice(0, 400)}${cards}`;
    })
    .join('\n');
}

function frontPhotoFromDetail(detail: Record<string, unknown>) {
  const photos = Array.isArray(detail.photos) ? detail.photos : [];
  const front = photos.find(
    (p) => String((p as Record<string, unknown>).pose_type ?? '').toUpperCase() === 'FRONT'
  ) as Record<string, unknown> | undefined;
  const identity = (detail.identity as Record<string, unknown> | undefined) ?? {};
  return {
    criminalName: String(identity.criminal_name ?? ''),
    photoId: front ? String(front.photo_id ?? '') : '',
    storageKey: front ? String(front.storage_key ?? '') : '',
    dossierDraftId: String(detail.dossier_draft_id ?? ''),
  };
}

export async function refreshSuspectCardsFromDb(
  cards: WorkbenchSuspectCard[]
): Promise<WorkbenchSuspectCard[]> {
  const out: WorkbenchSuspectCard[] = [];
  for (const card of cards) {
    if (!card.dossierId) {
      out.push(card);
      continue;
    }
    try {
      const detail = await getSuspectDossierDetail(card.dossierId);
      const front = frontPhotoFromDetail(detail);
      out.push({
        ...card,
        criminalName: front.criminalName || card.criminalName,
        dossierSummary: formatDossierSummaryForLlm(detail),
        dossierDraftId: front.dossierDraftId || card.dossierDraftId,
        photoId: front.photoId || card.photoId,
        storageKey: front.storageKey || card.storageKey,
      });
    } catch {
      out.push(card);
    }
  }
  return out;
}
