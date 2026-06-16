import { emptyAddress, emptyDossierDraft, emptyPresentAddress } from './suspectFormDefaults';
import type {
  SuspectAddress,
  SuspectDossierDraft,
  SuspectFingerprintSlot,
  SuspectPhotoSlot,
} from './suspectTypes';

export { newRowId } from './suspectRowIds';

const MODUS_TAGS_PREFIX = 'Tags:';

export function normalizeModusTag(tag: string): string {
  return tag.replace(/\s+/g, ' ').trim();
}

export function parseModusOperandi(value: string | null | undefined): {
  tags: string[];
  notes: string;
} {
  const raw = (value ?? '').trim();
  if (!raw) return { tags: [], notes: '' };

  const lines = raw.split(/\r?\n/);
  const firstLine = lines[0]?.trim() ?? '';
  if (!firstLine.toLowerCase().startsWith(MODUS_TAGS_PREFIX.toLowerCase())) {
    return { tags: [], notes: raw };
  }

  const tags = firstLine
    .slice(MODUS_TAGS_PREFIX.length)
    .split(',')
    .map(normalizeModusTag)
    .filter(Boolean);
  const notes = lines.slice(1).join('\n').trim();
  return { tags: Array.from(new Set(tags)), notes };
}

export function composeModusOperandi(tags: string[], notes: string): string {
  const normalizedTags = Array.from(new Set(tags.map(normalizeModusTag).filter(Boolean)));
  const trimmedNotes = notes.trim();
  if (normalizedTags.length === 0) return trimmedNotes;
  if (!trimmedNotes) return `${MODUS_TAGS_PREFIX} ${normalizedTags.join(', ')}`;
  return `${MODUS_TAGS_PREFIX} ${normalizedTags.join(', ')}\n\n${trimmedNotes}`;
}

export function addressHasContent(addr: SuspectAddress): boolean {
  return Boolean(
    addr.villageTownCity.trim() ||
      addr.locality.trim() ||
      addr.pincode.trim() ||
      addr.houseNo.trim() ||
      addr.streetName.trim()
  );
}

/** Merge stored / partial drafts with defaults (incl. dual-address fields). */
export function normalizeDossierDraft(
  parsed: Partial<SuspectDossierDraft> & { address?: SuspectAddress }
): SuspectDossierDraft {
  const base = emptyDossierDraft();
  const parsedModus = parseModusOperandi(parsed.modusOperandi);
  const merged: SuspectDossierDraft = {
    ...base,
    ...parsed,
    address: { ...base.address, ...(parsed.address ?? {}) },
    presentAddress: parsed.presentAddress
      ? { ...emptyPresentAddress(), ...parsed.presentAddress, isPermanent: false }
      : emptyPresentAddress(),
    hasDifferentPresentAddress: parsed.hasDifferentPresentAddress ?? false,
    associates: parsed.associates ?? [],
    cases: parsed.cases ?? [],
    photos: (parsed.photos ?? base.photos).map((p) => {
      const def = base.photos.find((x) => x.poseType === p.poseType);
      return {
        ...p,
        required: def ? def.required : p.required,
      };
    }),
    fingerprints: (parsed.fingerprints ?? base.fingerprints).map((f) => {
      const def = base.fingerprints.find((x) => x.fingerPosition === f.fingerPosition);
      return {
        ...f,
        required: def ? def.required : f.required,
      };
    }),
    modusOperandi: parsedModus.notes || parsed.modusOperandi || '',
    modusOperandiTags:
      parsed.modusOperandiTags && parsed.modusOperandiTags.length > 0
        ? parsed.modusOperandiTags.map(normalizeModusTag).filter(Boolean)
        : parsedModus.tags,
    linkDecision: parsed.linkDecision ?? null,
  };

  if (parsed.hasDifferentPresentAddress === undefined && parsed.address?.isPermanent === false) {
    merged.hasDifferentPresentAddress = true;
    merged.presentAddress = { ...parsed.address, isPermanent: false };
    merged.address = { ...emptyAddress(), isPermanent: true };
  }

  if (!merged.hasDifferentPresentAddress) {
    merged.address = { ...merged.address, isPermanent: true };
  }

  return merged;
}

export function updatePhotoSlot(
  photos: SuspectPhotoSlot[],
  slotId: string,
  patch: Partial<SuspectPhotoSlot>
): SuspectPhotoSlot[] {
  return photos.map((p) => (p.id === slotId ? { ...p, ...patch } : p));
}

export function updateFingerprintSlot(
  fingerprints: SuspectFingerprintSlot[],
  slotId: string,
  patch: Partial<SuspectFingerprintSlot>
): SuspectFingerprintSlot[] {
  return fingerprints.map((f) => (f.id === slotId ? { ...f, ...patch } : f));
}

export function isFingerprintOnFile(slot: SuspectFingerprintSlot): boolean {
  return Boolean(
    slot.printId ||
      slot.templateDataB64 ||
      slot.status === 'validated' ||
      slot.status === 'duplicate'
  );
}

function isRequiredFingerprintCaptured(draft: SuspectDossierDraft): boolean {
  const required = draft.fingerprints.filter((f) => f.required);
  if (required.length === 0) return true;
  return required.every((f) => isFingerprintOnFile(f));
}

function isFingerprintDuplicateResolved(
  slot: SuspectFingerprintSlot
): boolean {
  if (slot.duplicateMatches.length === 0) return true;
  return slot.duplicateAcknowledged;
}

export function fingerprintsStepBlockedReason(draft: SuspectDossierDraft): string | null {
  const capturing = draft.fingerprints.some((f) => f.status === 'capturing');
  if (capturing) return 'Wait for fingerprint capture to finish.';
  if (!isRequiredFingerprintCaptured(draft)) {
    return 'Capture the required right thumb print before continuing.';
  }
  const unresolved = draft.fingerprints.find(
    (f) =>
      f.duplicateMatches.length > 0 &&
      !isFingerprintDuplicateResolved(f) &&
      (f.status === 'duplicate' || f.status === 'validated')
  );
  if (unresolved) {
    return 'Acknowledge the fingerprint duplicate alert before continuing.';
  }
  return null;
}

export function hasValidatedRequiredFingerprint(draft: SuspectDossierDraft): boolean {
  return isRequiredFingerprintCaptured(draft);
}

export function syncAgeFromDob(dateOfBirth: string): Pick<SuspectDossierDraft, 'age' | 'yearOfBirth'> {
  if (!dateOfBirth) return { age: '', yearOfBirth: '' };
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return { age: '', yearOfBirth: '' };
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return {
    age: age >= 0 ? String(age) : '',
    yearOfBirth: String(dob.getFullYear()),
  };
}

function isFrontPhotoAnalyzed(front: SuspectPhotoSlot): boolean {
  return front.status === 'validated' || front.status === 'duplicate';
}

function isDuplicateResolved(
  draft: SuspectDossierDraft,
  front: SuspectPhotoSlot
): boolean {
  if (front.duplicateMatches.length === 0) return true;
  if (
    draft.linkDecision?.decision === 'CONFIRMED_LINK' ||
    draft.linkDecision?.decision === 'REJECTED_LINK'
  ) {
    return true;
  }
  return front.duplicateAcknowledged;
}

export function hasValidatedFrontPhoto(draft: SuspectDossierDraft): boolean {
  const front = draft.photos.find((p) => p.poseType === 'FRONT');
  if (!front || !isFrontPhotoAnalyzed(front)) return false;
  return isDuplicateResolved(draft, front);
}

export function photosStepBlockedReason(draft: SuspectDossierDraft): string | null {
  const front = draft.photos.find((p) => p.poseType === 'FRONT');
  if (!front || !isFrontPhotoAnalyzed(front)) {
    return 'Upload and validate a front-facing photo before continuing.';
  }
  if (front.duplicateMatches.length > 0 && !isDuplicateResolved(draft, front)) {
    return 'Choose Same person (link) or Different person on the duplicate alert before continuing.';
  }
  const uploading = draft.photos.some((p) => p.status === 'uploading');
  if (uploading) {
    return 'Wait for photo analysis to finish.';
  }
  return null;
}

export function identityStepBlockedReason(draft: SuspectDossierDraft): string | null {
  if (!draft.criminalName.trim()) {
    return 'Criminal name is required before continuing.';
  }
  return null;
}

export function stepCompletion(draft: SuspectDossierDraft): Record<string, boolean> {
  const hasPhoto = hasValidatedFrontPhoto(draft);
  const hasIdentity = Boolean(draft.criminalName.trim());
  const hasAddress =
    addressHasContent(draft.address) &&
    (!draft.hasDifferentPresentAddress || addressHasContent(draft.presentAddress));
  const hasContacts = draft.contacts.some((c) => c.value.trim());
  const hasSocial = draft.socialAccounts.some((s) => s.details.trim());
  const hasCases = draft.cases.some(
    (c) =>
      c.crimeNumber.trim() ||
      c.policeStationName?.trim() ||
      c.actSection?.trim() ||
      c.brief?.trim()
  );
  const hasModusOperandi = Boolean(draft.modusOperandi.trim());
  const hasModusOperandiTags = draft.modusOperandiTags.some((tag) => tag.trim());
  const hasRelatives = draft.relatives.some((r) => r.name.trim());
  const hasAssociates = (draft.associates ?? []).some((a) => a.name.trim());

  const hasFingerprint = draft.fingerprints.some((f) => isFingerprintOnFile(f));

  return {
    photo: hasPhoto,
    fingerprint: hasFingerprint,
    identity: hasIdentity,
    address: hasAddress,
    cases: hasCases,
    modus_operandi: hasModusOperandi || hasModusOperandiTags,
    contacts: hasContacts,
    social: hasSocial,
    relatives: hasRelatives || hasAssociates,
    review: hasPhoto && hasIdentity,
  };
}
