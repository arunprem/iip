import type { SuspectDossierDraft, SuspectPhotoSlot } from './suspectTypes';

export function updatePhotoSlot(
  photos: SuspectPhotoSlot[],
  slotId: string,
  patch: Partial<SuspectPhotoSlot>
): SuspectPhotoSlot[] {
  return photos.map((p) => (p.id === slotId ? { ...p, ...patch } : p));
}

export function newRowId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
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

export function hasValidatedFrontPhoto(draft: SuspectDossierDraft): boolean {
  return draft.photos.some(
    (p) =>
      p.poseType === 'FRONT' &&
      p.status === 'validated' &&
      (p.duplicateMatches.length === 0 || p.duplicateAcknowledged)
  );
}

export function photosStepBlockedReason(draft: SuspectDossierDraft): string | null {
  const front = draft.photos.find((p) => p.poseType === 'FRONT');
  if (!front || front.status !== 'validated') {
    return 'Upload and validate a front-facing photo before continuing.';
  }
  if (front.duplicateMatches.length > 0 && !front.duplicateAcknowledged) {
    return 'Acknowledge the similar-face warning on the front photo, or upload a different image.';
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
  const addr = draft.address;
  const hasAddress = Boolean(
    addr.villageTownCity.trim() || addr.locality.trim() || addr.pincode.trim()
  );
  const hasContacts = draft.contacts.some((c) => c.value.trim());
  const hasSocial = draft.socialAccounts.some((s) => s.details.trim());
  const hasRelatives = draft.relatives.some((r) => r.name.trim());

  return {
    photo: hasPhoto,
    identity: hasIdentity,
    address: hasAddress,
    contacts: hasContacts,
    social: hasSocial,
    relatives: hasRelatives,
    review: hasPhoto && hasIdentity,
  };
}
