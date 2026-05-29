import { getSuspectDossierDetail } from './suspectDossiers';
import { identifySuspectPhoto, type FaceDuplicateMatch } from './suspectFaces';
import { apiClient } from './http';
import { extractEmailFromQuestion, extractPhoneFromQuestion } from './workbenchSearchUtils';

export const WORKBENCH_FRS_MATCH_MIN = 0.7;

export interface PhotoSearchMatch {
  similarityPercent: number;
  criminalName: string | null;
  suspectId: string | null;
  dossierId: string | null;
  dossierDraftId: string | null;
  storageKey: string | null;
  photoId: string | null;
  frsMatch: FaceDuplicateMatch;
  dossierDetail: Record<string, unknown> | null;
  dossierSummary: string;
}

export interface PhotoSearchResult {
  faceDetected: boolean;
  faceCount: number;
  detectedPose: string;
  message: string | null;
  matches: PhotoSearchMatch[];
}

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function formatAddress(row: Record<string, unknown> | null | undefined): string {
  if (!row) return 'Not recorded';
  const line = [
    str(row.house_no),
    str(row.house_name),
    str(row.street_name),
    str(row.locality),
    str(row.village_town_city),
    str(row.district),
    str(row.state),
    str(row.pincode),
  ]
    .filter(Boolean)
    .join(', ');
  const ps = str(row.police_station);
  return [line, ps ? `PS: ${ps}` : ''].filter(Boolean).join(' · ') || 'Not recorded';
}

export function formatDossierSummaryForLlm(detail: Record<string, unknown>): string {
  const identity = (detail.identity as Record<string, unknown> | undefined) ?? {};
  const contacts = Array.isArray(detail.contacts) ? detail.contacts : [];
  const relatives = Array.isArray(detail.relatives) ? detail.relatives : [];
  const social = Array.isArray(detail.social_accounts) ? detail.social_accounts : [];

  const contactLines = contacts
    .slice(0, 6)
    .map((c) => {
      const row = c as Record<string, unknown>;
      return `${str(row.contact_type)}: ${str(row.value)}`;
    })
    .join('; ');

  const relativeLines = relatives
    .slice(0, 4)
    .map((r) => {
      const row = r as Record<string, unknown>;
      return `${str(row.name)} (${str(row.relation)})`;
    })
    .join('; ');

  const socialLines = social
    .slice(0, 4)
    .map((s) => {
      const row = s as Record<string, unknown>;
      return `${str(row.platform)}: ${str(row.details)}`;
    })
    .join('; ');

  return [
    `Criminal name: ${str(identity.criminal_name) || 'Unknown'}`,
    identity.alias_name ? `Alias: ${str(identity.alias_name)}` : null,
    identity.fathers_name ? `Father's name: ${str(identity.fathers_name)}` : null,
    identity.date_of_birth ? `DOB: ${str(identity.date_of_birth)}` : null,
    identity.age != null ? `Age: ${str(identity.age)}` : null,
    identity.gender ? `Gender: ${str(identity.gender)}` : null,
    identity.category ? `Category: ${str(identity.category)}` : null,
    `Permanent address: ${formatAddress(detail.address as Record<string, unknown> | undefined)}`,
    detail.has_different_present_address
      ? `Present address: ${formatAddress(detail.present_address as Record<string, unknown> | undefined)}`
      : null,
    contactLines ? `Contacts: ${contactLines}` : null,
    relativeLines ? `Relatives: ${relativeLines}` : null,
    socialLines ? `Social: ${socialLines}` : null,
    detail.office_name ? `Submitted by office: ${str(detail.office_name)}` : null,
    detail.submitted_at ? `Submitted: ${str(detail.submitted_at)}` : null,
    `Dossier status: ${str(detail.status)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function resolveFrsDossierId(params: {
  suspectId?: string | null;
  dossierDraftId?: string | null;
}): Promise<string | null> {
  if (!params.suspectId && !params.dossierDraftId) return null;
  const res = await apiClient.get<{ dossier_id: string | null }>('/mobile/frs/resolve-dossier', {
    params: {
      ...(params.suspectId ? { suspect_id: params.suspectId } : {}),
      ...(params.dossierDraftId ? { dossier_draft_id: params.dossierDraftId } : {}),
    },
    skipSuccessToast: true,
    skipToast: true,
  });
  return res.data.dossier_id;
}

function frontPhotoFromDetail(
  detail: Record<string, unknown>
): { photoId: string | null; storageKey: string | null; draftId: string | null } {
  const photos = Array.isArray(detail.photos) ? detail.photos : [];
  const front = photos.find(
    (p) => str((p as Record<string, unknown>).pose_type).toUpperCase() === 'FRONT'
  ) as Record<string, unknown> | undefined;
  return {
    photoId: front ? str(front.photo_id) || null : null,
    storageKey: front ? str(front.storage_key) || null : null,
    draftId: str(detail.dossier_draft_id) || null,
  };
}

export async function analyzePhotoAgainstSuspects(file: File): Promise<PhotoSearchResult> {
  const identify = await identifySuspectPhoto(file);
  const qualifying = identify.matches.filter((m) => m.similarity_score >= WORKBENCH_FRS_MATCH_MIN);

  const matches: PhotoSearchMatch[] = [];

  for (const frsMatch of qualifying) {
    const dossierId = await resolveFrsDossierId({
      suspectId: frsMatch.suspect_id,
      dossierDraftId: frsMatch.dossier_draft_id,
    });

    let dossierDetail: Record<string, unknown> | null = null;
    let dossierSummary: string;

    if (dossierId) {
      dossierDetail = await getSuspectDossierDetail(dossierId);
      dossierSummary = formatDossierSummaryForLlm(dossierDetail);
    } else {
      dossierSummary = [
        `Indexed name: ${frsMatch.criminal_name ?? 'Unknown'}`,
        frsMatch.suspect_id ? `Suspect ID: ${frsMatch.suspect_id}` : null,
        'No submitted dossier record could be resolved for this face index entry.',
      ]
        .filter(Boolean)
        .join('\n');
    }

    const front = dossierDetail ? frontPhotoFromDetail(dossierDetail) : null;

    matches.push({
      similarityPercent: Math.round(frsMatch.similarity_score * 100),
      criminalName: frsMatch.criminal_name,
      suspectId: frsMatch.suspect_id,
      dossierId,
      dossierDraftId: dossierDetail
        ? front?.draftId ?? frsMatch.dossier_draft_id
        : frsMatch.dossier_draft_id,
      storageKey: front?.storageKey ?? frsMatch.storage_key,
      photoId: front?.photoId ?? frsMatch.photo_id,
      frsMatch,
      dossierDetail,
      dossierSummary,
    });
  }

  matches.sort((a, b) => b.similarityPercent - a.similarityPercent);

  return {
    faceDetected: identify.face_detected,
    faceCount: identify.face_count,
    detectedPose: identify.detected_pose,
    message: identify.message,
    matches,
  };
}

export interface TextSearchDossier {
  dossierId: string;
  criminalName: string;
  summary: string;
  dossierDraftId: string | null;
  photoId: string | null;
  storageKey: string | null;
}

/** Inline suspect card: photo + name + per-suspect LLM brief. */
export interface WorkbenchSuspectCard {
  id: string;
  criminalName: string;
  dossierId: string | null;
  dossierDraftId: string;
  photoId: string;
  storageKey: string;
  similarityPercent?: number;
  /** Raw dossier text sent to LLM (not shown in UI). */
  dossierSummary: string;
  note: string;
  noteLoading: boolean;
}

function photoIdFromStorageKey(storageKey: string | null | undefined): string | null {
  if (!storageKey) return null;
  const name = storageKey.split('/').pop();
  if (!name) return null;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function toPhotoRef(params: {
  criminalName: string;
  dossierId: string | null;
  dossierDraftId: string | null | undefined;
  photoId: string | null | undefined;
  storageKey: string | null | undefined;
  similarityPercent?: number;
}): Pick<
  WorkbenchSuspectCard,
  'criminalName' | 'dossierId' | 'dossierDraftId' | 'photoId' | 'storageKey' | 'similarityPercent'
> | null {
  const storageKey = params.storageKey?.trim();
  const dossierDraftId = params.dossierDraftId?.trim();
  const photoId = params.photoId?.trim() || photoIdFromStorageKey(storageKey);
  if (!storageKey || !dossierDraftId || !photoId) {
    return {
      criminalName: params.criminalName || 'Unknown',
      dossierId: params.dossierId,
      dossierDraftId: dossierDraftId ?? '',
      photoId: photoId ?? '',
      storageKey: storageKey ?? '',
      similarityPercent: params.similarityPercent,
    };
  }
  return {
    criminalName: params.criminalName || 'Unknown',
    dossierId: params.dossierId,
    dossierDraftId,
    photoId,
    storageKey,
    similarityPercent: params.similarityPercent,
  };
}

export function suspectCardsFromPhotoResult(result: PhotoSearchResult): WorkbenchSuspectCard[] {
  return result.matches.map((m, index) => {
    const photo = toPhotoRef({
      criminalName: m.criminalName ?? 'Unknown',
      dossierId: m.dossierId,
      dossierDraftId: m.dossierDraftId,
      photoId: m.photoId,
      storageKey: m.storageKey,
      similarityPercent: m.similarityPercent,
    });
    return {
      id: `card-${m.dossierId ?? m.suspectId ?? index}`,
      criminalName: photo?.criminalName ?? m.criminalName ?? 'Unknown',
      dossierId: m.dossierId,
      dossierDraftId: photo?.dossierDraftId ?? m.dossierDraftId ?? '',
      photoId: photo?.photoId ?? '',
      storageKey: photo?.storageKey ?? '',
      similarityPercent: m.similarityPercent,
      dossierSummary: m.dossierSummary,
      note: '',
      noteLoading: true,
    };
  });
}

export function suspectCardsFromTextDossiers(dossiers: TextSearchDossier[]): WorkbenchSuspectCard[] {
  return dossiers.map((d, index) => {
    const photo = toPhotoRef({
      criminalName: d.criminalName,
      dossierId: d.dossierId,
      dossierDraftId: d.dossierDraftId,
      photoId: d.photoId,
      storageKey: d.storageKey,
    });
    return {
      id: `card-${d.dossierId}-${index}`,
      criminalName: d.criminalName,
      dossierId: d.dossierId,
      dossierDraftId: photo?.dossierDraftId ?? d.dossierDraftId ?? '',
      photoId: photo?.photoId ?? '',
      storageKey: photo?.storageKey ?? '',
      dossierSummary: d.summary,
      note: '',
      noteLoading: true,
    };
  });
}

export function buildSuspectBriefPrompt(params: {
  criminalName: string;
  dossierSummary: string;
  similarityPercent?: number;
  userQuestion?: string;
  context: 'photo' | 'text' | 'followup';
  conversationSummary?: string;
}): string {
  const frsLine =
    params.similarityPercent != null
      ? `Facial recognition similarity: ${params.similarityPercent}%.\n`
      : '';
  const questionLine = params.userQuestion?.trim()
    ? `Analyst question: "${params.userQuestion.trim()}"\n`
    : '';
  const historyLine = params.conversationSummary?.trim()
    ? `Recent conversation:\n${params.conversationSummary.trim()}\n`
    : '';

  const contextLabel =
    params.context === 'photo'
      ? 'Photo upload / facial recognition match'
      : params.context === 'followup'
        ? 'Follow-up question about a suspect already shown in this chat session'
        : 'Name or address dossier search';

  return `You are the intelligence analyst assistant. Write a brief analyst note (2–5 sentences) about suspect "${params.criminalName}" for a chat UI that already shows their photo and name.

Context: ${contextLabel}
${frsLine}${historyLine}${questionLine}
Dossier record:
${params.dossierSummary}

Rules:
- Write ONLY the brief note body — no name heading, no "Brief:" label, do not repeat the suspect's name at the start.
- Answer the analyst's specific question first (e.g. if they ask for phone number, lead with: Mobile: 9048652862 on one line).
- Format phone numbers as a single uninterrupted 10-digit number with no spaces or line breaks.
- Use only facts from the dossier record above — do not say the person was not found or that you need to verify.
- If the requested field is missing from the dossier, say so explicitly.
- Conversational, professional tone.`;
}

export function buildFollowUpIntroPrompt(
  question: string,
  cards: WorkbenchSuspectCard[]
): string {
  if (cards.length === 1) {
    return `Write one short sentence (max 15 words) confirming you are answering the follow-up about ${cards[0].criminalName}.
Follow-up: "${question}"
Do not say you need to verify, do not repeat dossier facts, do not mention phone numbers yet.`;
  }

  return `Write one short sentence (max 20 words) confirming you are answering the follow-up for ${cards.length} suspects from this session.
Follow-up: "${question}"
Do not list details yet.`;
}

export function buildFollowUpNoTargetPrompt(
  question: string,
  sessionCards: WorkbenchSuspectCard[],
  conversationSummary: string
): string {
  const suspects = sessionCards
    .map(
      (c, i) =>
        `${i + 1}. ${c.criminalName}${c.similarityPercent != null ? ` (${c.similarityPercent}% FRS)` : ''}`
    )
    .join('\n');

  return `You are the intelligence analyst assistant. The analyst asked a follow-up in an ongoing suspect search chat:

"${question}"

Recent conversation:
${conversationSummary}

Suspects already shown in this session:
${suspects || 'None'}

The follow-up did not clearly map to one suspect. Ask which person they mean, listing the names above, OR if the question applies to the top FRS match, say you need them to confirm the name. Keep it brief and helpful.`;
}

export function buildPhotoSearchIntroPrompt(
  result: PhotoSearchResult,
  userNote?: string
): string {
  if (result.matches.length === 0) {
    return buildPhotoNoMatchPrompt(result, userNote);
  }

  const ask = userNote?.trim() ? ` The analyst also wrote: "${userNote.trim()}".` : '';
  return `Write a short chat intro (1–2 sentences only) for an intelligence analyst.${ask}
Facial recognition on their uploaded photo found ${result.matches.length} suspect(s) at ≥70% similarity.
Face detected: ${result.faceDetected ? 'yes' : 'no'}. Do not list suspect details — individual cards follow below.`;
}

export function buildPhotoNoMatchPrompt(result: PhotoSearchResult, userNote?: string): string {
  const ask = userNote?.trim() ? `\nAnalyst message: "${userNote.trim()}"` : '';
  return `You are the intelligence analyst assistant in chat. An analyst uploaded a suspect photo.${ask}

FRS results:
- Face detected: ${result.faceDetected ? 'Yes' : 'No'}
- Faces in image: ${result.faceCount}
- Pose: ${result.detectedPose || 'Unknown'}
${result.message ? `- Note: ${result.message}` : ''}
- No suspects met the 70% similarity threshold.

Explain clearly in a conversational tone why no match was found and suggest next steps (better photo angle, lower threshold review, manual name search, etc.).`;
}

export function buildTextSearchIntroPrompt(
  userQuestion: string,
  totalFound: number,
  shownCount: number
): string {
  if (shownCount === 0) {
    return buildTextNoMatchPrompt(userQuestion);
  }

  const phone = extractPhoneFromQuestion(userQuestion);
  if (phone) {
    return `Write one short sentence (max 20 words) confirming ${shownCount} suspect(s) matched phone number ${phone} in the dossier database. Do not list details yet.`;
  }

  return `Write a short chat intro (1–2 sentences only) for an intelligence analyst who asked:
"${userQuestion}"

Search found ${totalFound} dossier record(s); showing ${shownCount} below with individual briefs. Do not repeat suspect details in the intro.`;
}

export function buildTextNoMatchPrompt(userQuestion: string): string {
  const phone = extractPhoneFromQuestion(userQuestion);
  const email = extractEmailFromQuestion(userQuestion);

  if (phone) {
    return `You are the intelligence analyst assistant in chat. The analyst searched for a suspect with phone/mobile number ${phone}.

No dossier records matched that number in contacts (mobile, landline) or social account details.

Reply briefly: confirm no match for ${phone}, suggest checking spelling/format, trying name or address search, or uploading a photo for FRS.`;
  }

  if (email) {
    return `You are the intelligence analyst assistant in chat. The analyst searched for a suspect with email ${email}.

No dossier records matched that email in contacts or social accounts.

Reply briefly with helpful next steps.`;
  }

  return `You are the intelligence analyst assistant in chat. The analyst asked:
"${userQuestion}"

No dossier records matched in name, alias, father's name, relative name, address, phone, or email fields.

Reply conversationally: explain no matches, suggest refining spelling, partial name, locality/village, district, police station, father's name, relative name, phone number, or photo upload.`;
}

export async function searchSuspectsByQuery(
  query: string,
  limit = 5
): Promise<TextSearchDossier[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { listSuspectDossiers } = await import('./suspectDossiers');
  const list = await listSuspectDossiers({ q: trimmed, pageSize: limit });
  const out: TextSearchDossier[] = [];

  for (const row of list.dossiers.slice(0, limit)) {
    try {
      const detail = await getSuspectDossierDetail(row.dossier_id);
      const front = frontPhotoFromDetail(detail);
      out.push({
        dossierId: row.dossier_id,
        criminalName: row.criminal_name,
        summary: formatDossierSummaryForLlm(detail),
        dossierDraftId: row.dossier_draft_id ?? (str(detail.dossier_draft_id) || null),
        photoId: row.front_photo_id ?? front.photoId,
        storageKey: row.front_photo_storage_key ?? front.storageKey,
      });
    } catch {
      out.push({
        dossierId: row.dossier_id,
        criminalName: row.criminal_name,
        summary: `Criminal name: ${row.criminal_name}\n(Dossier detail could not be loaded.)`,
        dossierDraftId: row.dossier_draft_id,
        photoId: row.front_photo_id,
        storageKey: row.front_photo_storage_key,
      });
    }
  }

  return out;
}

