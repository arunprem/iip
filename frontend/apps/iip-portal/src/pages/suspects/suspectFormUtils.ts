import { emptyAddress, emptyDossierDraft, emptyPresentAddress } from './suspectFormDefaults';
import type {
  SuspectAddress,
  SuspectDossierDraft,
  SuspectFingerprintSlot,
  SuspectPhotoSlot,
} from './suspectTypes';

export { newRowId } from './suspectRowIds';

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
  const merged: SuspectDossierDraft = {
    ...base,
    ...parsed,
    address: { ...base.address, ...(parsed.address ?? {}) },
    presentAddress: parsed.presentAddress
      ? { ...emptyPresentAddress(), ...parsed.presentAddress, isPermanent: false }
      : emptyPresentAddress(),
    hasDifferentPresentAddress: parsed.hasDifferentPresentAddress ?? false,
    associates: parsed.associates ?? [],
    fingerprints: parsed.fingerprints ?? base.fingerprints,
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

export function stepCompletion(draft: SuspectDossierDraft): Record<string, boolean> {
  const hasPhoto = hasValidatedFrontPhoto(draft);
  const hasIdentity = Boolean(draft.criminalName.trim());
  const hasAddress =
    addressHasContent(draft.address) &&
    (!draft.hasDifferentPresentAddress || addressHasContent(draft.presentAddress));
  const hasContacts = draft.contacts.some((c) => c.value.trim());
  const hasSocial = draft.socialAccounts.some((s) => s.details.trim());
  const hasRelatives = draft.relatives.some((r) => r.name.trim());
  const hasAssociates = (draft.associates ?? []).some((a) => a.name.trim());

  const hasFingerprint =
    hasValidatedRequiredFingerprint(draft) ||
    draft.fingerprints.some((f) => isFingerprintOnFile(f));

  return {
    photo: hasPhoto,
    fingerprint: hasFingerprint,
    identity: hasIdentity,
    address: hasAddress,
    contacts: hasContacts,
    social: hasSocial,
    relatives: hasRelatives || hasAssociates,
    review: hasPhoto && hasIdentity,
  };
}
