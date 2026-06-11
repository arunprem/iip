import type {
  FingerPosition,
  SuspectAddress,
  SuspectDossierDraft,
  SuspectFingerprintSlot,
  SuspectPhotoPoseType,
  SuspectPhotoSlot,
} from './suspectTypes';
import { newRowId } from './suspectRowIds';

export { ASSOCIATION_TYPE_OPTIONS } from './suspectAssociateConstants';
export type { AssociateType } from './suspectAssociateConstants';

export const DOSSIER_DRAFT_STORAGE_KEY = 'iip-suspect-dossier-draft-v2';

export const PHOTO_SLOT_DEFS: {
  poseType: SuspectPhotoPoseType;
  label: string;
  required: boolean;
  hint: string;
}[] = [
  {
    poseType: 'FRONT',
    label: 'Front face',
    required: true,
    hint: 'Mandatory — used for face recognition and duplicate checks',
  },
  {
    poseType: 'LEFT_PROFILE',
    label: 'Left profile',
    required: false,
    hint: 'Optional — verified as left profile when uploaded',
  },
  {
    poseType: 'RIGHT_PROFILE',
    label: 'Right profile',
    required: false,
    hint: 'Optional — verified as right profile when uploaded',
  },
  {
    poseType: 'LEFT',
    label: 'Left angle',
    required: false,
    hint: 'Three-quarter or angled view from the left',
  },
  {
    poseType: 'RIGHT',
    label: 'Right angle',
    required: false,
    hint: 'Three-quarter or angled view from the right',
  },
  {
    poseType: 'OTHER',
    label: 'Other',
    required: false,
    hint: 'Additional reference photo (tattoos, marks, etc.)',
  },
];

export function emptyPhotoSlot(
  poseType: SuspectPhotoPoseType,
  label: string,
  required: boolean
): SuspectPhotoSlot {
  return {
    id: newRowId(),
    poseType,
    label,
    required,
    previewUrl: null,
    fileName: null,
    faceId: null,
    storageKey: null,
    status: 'empty',
    detectedPose: null,
    faceCount: null,
    errorMessage: null,
    duplicateMatches: [],
    duplicateAcknowledged: false,
  };
}

export function initialPhotoSlots(): SuspectPhotoSlot[] {
  return PHOTO_SLOT_DEFS.map((d) => emptyPhotoSlot(d.poseType, d.label, d.required));
}

export const FINGERPRINT_SLOT_DEFS: {
  fingerPosition: FingerPosition;
  label: string;
  required: boolean;
  hint: string;
}[] = [
  {
    fingerPosition: 'RIGHT_THUMB',
    label: 'Right thumb',
    required: true,
    hint: 'Mandatory — used for AFIS duplicate checks and field search',
  },
  {
    fingerPosition: 'RIGHT_INDEX',
    label: 'Right index',
    required: false,
    hint: 'Optional — improves identification coverage',
  },
  {
    fingerPosition: 'LEFT_THUMB',
    label: 'Left thumb',
    required: false,
    hint: 'Optional secondary print',
  },
];

export function emptyFingerprintSlot(
  fingerPosition: FingerPosition,
  label: string,
  required: boolean
): SuspectFingerprintSlot {
  return {
    id: newRowId(),
    fingerPosition,
    label,
    required,
    printId: null,
    templateDataB64: null,
    templateFormat: 'ISO19794-2',
    templateHash: null,
    qualityScore: null,
    deviceModel: null,
    status: 'empty',
    errorMessage: null,
    duplicateMatches: [],
    duplicateAcknowledged: false,
  };
}

export function initialFingerprintSlots(): SuspectFingerprintSlot[] {
  return FINGERPRINT_SLOT_DEFS.map((d) =>
    emptyFingerprintSlot(d.fingerPosition, d.label, d.required)
  );
}

function newDraftId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function emptyAddress(): SuspectAddress {
  return {
    isPermanent: true,
    houseNo: '',
    houseName: '',
    streetName: '',
    locality: '',
    tehsil: '',
    villageTownCity: '',
    pincode: '',
    latitude: '',
    longitude: '',
    country: 'INDIA',
    state: 'KERALA',
    district: '',
    policeStation: '',
  };
}

export function emptyPresentAddress(): SuspectAddress {
  return { ...emptyAddress(), isPermanent: false };
}

export function emptyDossierDraft(): SuspectDossierDraft {
  return {
    dossierDraftId: newDraftId(),
    photos: initialPhotoSlots(),
    fingerprints: initialFingerprintSlots(),
    criminalName: '',
    aliasName: '',
    gender: '',
    fathersName: '',
    dateOfBirth: '',
    age: '',
    yearOfBirth: '',
    placeOfBirth: '',
    religion: '',
    category: '',
    address: emptyAddress(),
    presentAddress: emptyPresentAddress(),
    hasDifferentPresentAddress: false,
    contacts: [],
    socialAccounts: [],
    relatives: [],
    associates: [],
    linkDecision: null,
    updatedAt: new Date().toISOString(),
  };
}

export const WIZARD_STEPS = [
  {
    id: 'photo',
    label: 'Suspect photo',
    shortLabel: 'Photo',
    description: 'Upload a clear photograph before entering details.',
  },
  {
    id: 'fingerprint',
    label: 'Fingerprints',
    shortLabel: 'Prints',
    description: 'Capture ISO templates from the SecuGen scanner (no images stored).',
  },
  {
    id: 'identity',
    label: 'Criminal information',
    shortLabel: 'Identity',
    description: 'Legal name, aliases, and demographic details.',
  },
  {
    id: 'address',
    label: 'Address',
    shortLabel: 'Address',
    description: 'Residential or known location with map coordinates.',
  },
  {
    id: 'contacts',
    label: 'Contact details',
    shortLabel: 'Contacts',
    description: 'Phone numbers and email addresses.',
  },
  {
    id: 'social',
    label: 'Social media',
    shortLabel: 'Social',
    description: 'Online profiles linked to the suspect.',
  },
  {
    id: 'relatives',
    label: 'Relatives & associates',
    shortLabel: 'Links',
    description: 'Family, whereabouts, and operational associates linked to other dossier profiles.',
  },
  {
    id: 'review',
    label: 'Review & submit',
    shortLabel: 'Review',
    description: 'Confirm everything before saving the dossier.',
  },
] as const;

export const GENDER_OPTIONS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export const RELIGION_OPTIONS = [
  'Hindu',
  'Muslim',
  'Christian',
  'Sikh',
  'Buddhist',
  'Jain',
  'Other',
];

export const CATEGORY_OPTIONS = ['General', 'OBC', 'SC', 'ST', 'EWS', 'Other'];

export const RELATION_OPTIONS = [
  'Father',
  'Mother',
  'Spouse',
  'Sibling',
  'Son',
  'Daughter',
  'Friend',
  'Associate',
  'Employer',
  'Landlord',
  'Other',
];

export const KERALA_DISTRICTS = [
  'Thiruvananthapuram',
  'Kollam',
  'Pathanamthitta',
  'Alappuzha',
  'Kottayam',
  'Idukki',
  'Ernakulam',
  'Thrissur',
  'Palakkad',
  'Malappuram',
  'Kozhikode',
  'Wayanad',
  'Kannur',
  'Kasaragod',
];
