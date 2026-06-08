export type ContactType = 'MOBILE' | 'LANDLINE' | 'EMAILID';
export type SocialPlatform =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'TWITTER'
  | 'WHATSAPP'
  | 'TELEGRAM'
  | 'YOUTUBE'
  | 'OTHER';

export interface SuspectAddress {
  isPermanent: boolean;
  houseNo: string;
  houseName: string;
  streetName: string;
  locality: string;
  tehsil: string;
  villageTownCity: string;
  pincode: string;
  latitude: string;
  longitude: string;
  country: string;
  state: string;
  district: string;
  policeStation: string;
}

export interface SuspectContact {
  id: string;
  type: ContactType;
  value: string;
}

export interface SuspectSocialAccount {
  id: string;
  platform: SocialPlatform;
  details: string;
}

export interface SuspectRelative {
  id: string;
  name: string;
  relation: string;
  gender: string;
  occupation: string;
}

export interface FaceDuplicateMatch {
  face_id: string;
  photo_id: string | null;
  dossier_draft_id: string | null;
  suspect_id: string | null;
  master_suspect_id?: string | null;
  dossier_id?: string | null;
  criminal_name: string | null;
  storage_key: string | null;
  pose_type: string;
  similarity_score: number;
  match_score?: number;
  tier?: 'STRONG' | 'WEAK';
  office_name?: string | null;
}

export interface SuspectLinkDecision {
  masterSuspectId: string;
  matchedDossierId?: string;
  faceSimilarity: number;
  matchScore: number;
  decision: 'CONFIRMED_LINK' | 'REJECTED_LINK';
}

export type SuspectPhotoPoseType =
  | 'FRONT'
  | 'LEFT_PROFILE'
  | 'RIGHT_PROFILE'
  | 'LEFT'
  | 'RIGHT'
  | 'OTHER';

export type SuspectPhotoStatus = 'empty' | 'uploading' | 'validated' | 'error' | 'duplicate';

export interface SuspectPhotoSlot {
  id: string;
  poseType: SuspectPhotoPoseType;
  label: string;
  required: boolean;
  previewUrl: string | null;
  fileName: string | null;
  faceId: string | null;
  storageKey: string | null;
  status: SuspectPhotoStatus;
  detectedPose: string | null;
  faceCount: number | null;
  errorMessage: string | null;
  duplicateMatches: FaceDuplicateMatch[];
  duplicateAcknowledged: boolean;
}

export interface SuspectDossierDraft {
  dossierDraftId: string;
  /** Set when editing an existing dossier (exclude self from link suggestions). */
  editingDossierId?: string;
  editingMasterSuspectId?: string;
  /** Child suspect row id — used to purge legacy FRS index entries on photo replace. */
  editingChildSuspectId?: string;
  /** Permanent / native address (always saved). */
  address: SuspectAddress;
  /** Present / current address when different from permanent. */
  presentAddress: SuspectAddress;
  hasDifferentPresentAddress: boolean;
  photos: SuspectPhotoSlot[];
  criminalName: string;
  aliasName: string;
  gender: string;
  fathersName: string;
  dateOfBirth: string;
  age: string;
  yearOfBirth: string;
  placeOfBirth: string;
  religion: string;
  category: string;
  contacts: SuspectContact[];
  socialAccounts: SuspectSocialAccount[];
  relatives: SuspectRelative[];
  linkDecision: SuspectLinkDecision | null;
  photoGeoTag?: { latitude: number; longitude: number } | null;
  updatedAt: string;
}

export type WizardStepId =
  | 'photo'
  | 'identity'
  | 'address'
  | 'contacts'
  | 'social'
  | 'relatives'
  | 'review';

export interface WizardStepMeta {
  id: WizardStepId;
  label: string;
  shortLabel: string;
  description: string;
}
