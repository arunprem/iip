import { PHOTO_SLOT_DEFS, emptyAddress, emptyPresentAddress } from './suspectFormDefaults';
import type {
  ContactType,
  SocialPlatform,
  SuspectDossierDraft,
  SuspectPhotoSlot,
} from './suspectTypes';

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

function mapContacts(raw: unknown): SuspectDossierDraft['contacts'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: crypto.randomUUID(),
      type: str(row.contact_type).toUpperCase() as ContactType,
      value: str(row.value),
    };
  });
}

function mapSocial(raw: unknown): SuspectDossierDraft['socialAccounts'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => {
    const row = s as Record<string, unknown>;
    return {
      id: crypto.randomUUID(),
      platform: str(row.platform).toUpperCase() as SocialPlatform,
      details: str(row.details),
    };
  });
}

function mapAssociates(raw: unknown): SuspectDossierDraft['associates'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a) => {
    const row = a as Record<string, unknown>;
    return {
      id: crypto.randomUUID(),
      name: str(row.name),
      associationType: str(row.association_type) || 'ASSOCIATE',
      occupation: str(row.occupation),
      notes: str(row.notes),
      linkedMasterSuspectId: row.linked_master_suspect_id
        ? str(row.linked_master_suspect_id)
        : null,
    };
  });
}

function mapRelatives(raw: unknown): SuspectDossierDraft['relatives'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: crypto.randomUUID(),
      name: str(row.name),
      relation: str(row.relation),
      gender: str(row.gender),
      occupation: str(row.occupation),
    };
  });
}

function mapAddressRow(row: Record<string, unknown>, isPermanent: boolean): SuspectDossierDraft['address'] {
  const base = isPermanent ? emptyAddress() : emptyPresentAddress();
  return {
    ...base,
    isPermanent,
    houseNo: str(row.house_no),
    houseName: str(row.house_name),
    streetName: str(row.street_name),
    locality: str(row.locality),
    tehsil: str(row.tehsil),
    villageTownCity: str(row.village_town_city),
    pincode: str(row.pincode),
    latitude: row.latitude != null ? String(row.latitude) : '',
    longitude: row.longitude != null ? String(row.longitude) : '',
    country: str(row.country) || base.country,
    state: str(row.state) || base.state,
    district: str(row.district),
    policeStation: str(row.police_station),
  };
}

export function addressesToApiPayload(draft: SuspectDossierDraft) {
  return {
    address: { ...draft.address, isPermanent: true },
    hasDifferentPresentAddress: draft.hasDifferentPresentAddress,
    presentAddress: draft.hasDifferentPresentAddress
      ? { ...draft.presentAddress, isPermanent: false }
      : undefined,
  };
}

function mapPhotos(detail: Record<string, unknown>): SuspectPhotoSlot[] {
  const rawPhotos = Array.isArray(detail.photos) ? detail.photos : [];
  const byPose = new Map<string, Record<string, unknown>>();
  for (const p of rawPhotos) {
    const row = p as Record<string, unknown>;
    byPose.set(str(row.pose_type).toUpperCase(), row);
  }

  return PHOTO_SLOT_DEFS.map((def) => {
    const row = byPose.get(def.poseType);
    const photoId = row ? str(row.photo_id) : crypto.randomUUID();
    const storageKey = row ? str(row.storage_key) || null : null;
    return {
      id: photoId,
      poseType: def.poseType,
      label: def.label,
      required: def.required,
      previewUrl: null,
      fileName: null,
      faceId: row && row.face_id ? str(row.face_id) : null,
      storageKey,
      status: storageKey ? 'validated' : 'empty',
      detectedPose: row ? str(row.detected_pose) || null : null,
      faceCount: null,
      errorMessage: null,
      duplicateMatches: [],
      duplicateAcknowledged: false,
    };
  });
}

export function dossierDetailToDraft(detail: Record<string, unknown>): SuspectDossierDraft {
  const identity = (detail.identity as Record<string, unknown>) ?? {};
  const permRow = (detail.address as Record<string, unknown>) ?? {};
  const presRow = detail.present_address as Record<string, unknown> | undefined;
  const hasDifferent =
    detail.has_different_present_address === true ||
    (presRow != null && Object.keys(presRow).length > 0);

  const dossierId = str(detail.dossier_id);
  const dossierDraftId = str(detail.dossier_draft_id) || dossierId || crypto.randomUUID();

  return {
    dossierDraftId,
    editingDossierId: dossierId || undefined,
    editingMasterSuspectId: str(detail.master_suspect_id) || undefined,
    editingChildSuspectId: str(detail.suspect_id) || undefined,
    photos: mapPhotos(detail),
    criminalName: str(identity.criminal_name),
    aliasName: str(identity.alias_name),
    gender: str(identity.gender),
    fathersName: str(identity.fathers_name),
    dateOfBirth: str(identity.date_of_birth).slice(0, 10),
    age: identity.age != null ? String(identity.age) : '',
    yearOfBirth: identity.year_of_birth != null ? String(identity.year_of_birth) : '',
    placeOfBirth: str(identity.place_of_birth),
    religion: str(identity.religion),
    category: str(identity.category),
    address: mapAddressRow(permRow, true),
    presentAddress: hasDifferent && presRow ? mapAddressRow(presRow, false) : emptyPresentAddress(),
    hasDifferentPresentAddress: hasDifferent,
    contacts: mapContacts(detail.contacts),
    socialAccounts: mapSocial(detail.social_accounts),
    relatives: mapRelatives(detail.relatives),
    associates: mapAssociates(detail.associates),
    linkDecision: null,
    updatedAt: new Date().toISOString(),
  };
}

export function draftToUpdatePayload(draft: SuspectDossierDraft) {
  return {
    dossierDraftId: draft.dossierDraftId,
    criminalName: draft.criminalName,
    aliasName: draft.aliasName,
    gender: draft.gender,
    fathersName: draft.fathersName,
    dateOfBirth: draft.dateOfBirth,
    age: draft.age,
    yearOfBirth: draft.yearOfBirth,
    placeOfBirth: draft.placeOfBirth,
    religion: draft.religion,
    category: draft.category,
    ...addressesToApiPayload(draft),
    contacts: draft.contacts,
    socialAccounts: draft.socialAccounts,
    relatives: draft.relatives,
    associates: draft.associates.map((a) => ({
      id: a.id,
      name: a.name,
      associationType: a.associationType,
      occupation: a.occupation,
      notes: a.notes,
      linkedMasterSuspectId: a.linkedMasterSuspectId,
    })),
    photos: draft.photos
      .filter((p) => p.status === 'validated' || p.status === 'duplicate')
      .map((p) => ({
        id: p.id,
        pose_type: p.poseType,
        storage_key: p.storageKey,
        face_id: p.faceId,
        detected_pose: p.detectedPose,
        face_count: p.faceCount,
      })),
  };
}
