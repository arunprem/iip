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
  criminal_name: string | null;
  storage_key: string | null;
  pose_type: string;
  similarity_score: number;
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
  address: SuspectAddress;
  contacts: SuspectContact[];
  socialAccounts: SuspectSocialAccount[];
  relatives: SuspectRelative[];
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
