import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera } from 'lucide-react';
import {
  analyzeSuspectPhoto,
  deleteSuspectDraftPhoto,
  fetchFaceModelsStatus,
  fetchSuspectPhotoPreviewDataUrl,
  fileToSuspectPhotoPreviewDataUrl,
} from '../../../api/suspectFaces';
import { readFileAsDataUrl } from '../../../utils/cropImage';
import { extractApiErrorMessage } from '../../../utils/apiMessages';
import type {
  SuspectDossierDraft,
  SuspectPhotoPoseType,
  SuspectPhotoSlot,
} from '../../../pages/suspects/suspectTypes';
import { PHOTO_SLOT_DEFS } from '../../../pages/suspects/suspectFormDefaults';
import { updatePhotoSlot } from '../../../pages/suspects/suspectFormUtils';
import { SuspectDuplicateAlert } from '../SuspectDuplicateAlert';
import { SuspectPhotoAvatarSlot } from '../SuspectPhotoAvatarSlot';
import {
  SuspectPhotoCropModal,
  type SuspectCropVariant,
} from '../SuspectPhotoCropModal';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotosUpdater =
  | SuspectPhotoSlot[]
  | ((prev: SuspectPhotoSlot[]) => SuspectPhotoSlot[]);

interface SuspectPhotoStepProps {
  draft: SuspectDossierDraft;
  onPhotosChange: (update: PhotosUpdater) => void;
}

interface CropSession {
  slotId: string;
  imageSrc: string;
  variant: SuspectCropVariant;
  originalFile: File | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uploadProgressMessage(
  modelsReady: boolean | null,
  elapsedSec: number
): string {
  if (modelsReady === false) {
    return 'Loading face models…';
  }
  if (elapsedSec >= 90) return `Still analyzing (${elapsedSec}s)…`;
  if (elapsedSec >= 20) return `First upload may take up to 90s (${elapsedSec}s)…`;
  return elapsedSec > 0 ? `Analyzing (${elapsedSec}s)…` : 'Analyzing…';
}

function cropVariantForSlot(slot: SuspectPhotoSlot): SuspectCropVariant {
  return slot.poseType === 'FRONT' ? 'profile' : 'portrait';
}

function slotNeedsFaceCheck(poseType: SuspectPhotoPoseType): boolean {
  return poseType === 'FRONT' || poseType === 'LEFT_PROFILE' || poseType === 'RIGHT_PROFILE';
}

function uploadBusyLabel(
  slot: SuspectPhotoSlot,
  modelsReady: boolean | null,
  elapsedSec: number
): string {
  if (slot.poseType === 'FRONT') {
    return uploadProgressMessage(modelsReady, elapsedSec);
  }
  if (slot.poseType === 'LEFT_PROFILE' || slot.poseType === 'RIGHT_PROFILE') {
    return elapsedSec > 0 ? `Verifying profile (${elapsedSec}s)…` : 'Verifying profile…';
  }
  return elapsedSec > 0 ? `Uploading (${elapsedSec}s)…` : 'Uploading…';
}

export function SuspectPhotoStep({ draft, onPhotosChange }: SuspectPhotoStepProps) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const loadedPreviewKeys = useRef<Set<string>>(new Set());
  const [uploadElapsedSec, setUploadElapsedSec] = useState(0);
  const [modelsReady, setModelsReady] = useState<boolean | null>(null);
  const [modelsMessage, setModelsMessage] = useState<string | null>(null);
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  const [uploadingSlotId, setUploadingSlotId] = useState<string | null>(null);

  const uploadingCount = draft.photos.filter((p) => p.status === 'uploading').length;
  const faceServiceReady = modelsReady === true;

  const frontSlot = draft.photos.find((p) => p.poseType === 'FRONT');
  const secondarySlots = draft.photos.filter((p) => p.poseType !== 'FRONT');
  const frontDef = PHOTO_SLOT_DEFS.find((d) => d.poseType === 'FRONT')!;

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await fetchFaceModelsStatus();
        if (cancelled) return;
        setModelsReady(st.ready);
        setModelsMessage(st.message);
        if (!st.ready) window.setTimeout(poll, 4000);
      } catch (err: unknown) {
        if (!cancelled) {
          setModelsReady(null);
          const isNetwork =
            axios.isAxiosError(err) &&
            (!err.response || err.code === 'ECONNABORTED' || err.message.includes('Network'));
          setModelsMessage(
            isNetwork
              ? 'Cannot reach ml-gateway (port 8020).'
              : 'Face service unavailable.'
          );
        }
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (uploadingCount === 0) {
      setUploadElapsedSec(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setUploadElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [uploadingCount]);

  const patchSlot = (slotId: string, patch: Partial<SuspectPhotoSlot>) => {
    onPhotosChange((photos) => updatePhotoSlot(photos, slotId, patch));
  };

  const getSlot = (slotId: string) => draft.photos.find((p) => p.id === slotId);

  const requestPreviewFromStorage = (slot: SuspectPhotoSlot) => {
    if (!slot.storageKey) return;
    const cacheKey = `${slot.id}:${slot.storageKey}`;
    if (loadedPreviewKeys.current.has(cacheKey)) return;

    void fetchSuspectPhotoPreviewDataUrl(draft.dossierDraftId, slot.id, slot.storageKey)
      .then((url) => {
        loadedPreviewKeys.current.add(cacheKey);
        patchSlot(slot.id, { previewUrl: url });
      })
      .catch(() => {
        loadedPreviewKeys.current.delete(cacheKey);
      });
  };

  useEffect(() => {
    for (const slot of draft.photos) {
      if (slot.status !== 'validated' && slot.status !== 'duplicate') continue;
      if (!slot.storageKey || slot.previewUrl) continue;
      requestPreviewFromStorage(slot);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.dossierDraftId, draft.photos]);

  const handlePreviewError = (slot: SuspectPhotoSlot) => {
    const cacheKey = slot.storageKey ? `${slot.id}:${slot.storageKey}` : '';
    if (cacheKey && loadedPreviewKeys.current.has(cacheKey)) {
      patchSlot(slot.id, {
        previewUrl: null,
        errorMessage: 'Could not load photo preview.',
      });
      return;
    }
    patchSlot(slot.id, { previewUrl: null });
    if (slot.storageKey) {
      requestPreviewFromStorage({ ...slot, previewUrl: null });
    }
  };

  const validateBeforeUpload = (slot: SuspectPhotoSlot, file: File): string | null => {
    if (slotNeedsFaceCheck(slot.poseType) && !faceServiceReady) {
      return modelsReady === false
        ? 'Face models are still loading. Wait for the green status, then try again.'
        : 'Cannot reach the face service. Start ml-gateway on port 8020.';
    }
    if (!ACCEPT_TYPES.some((t) => file.type === t || file.type.startsWith('image/'))) {
      return 'Use JPEG, PNG, or WebP.';
    }
    if (file.size > MAX_BYTES) return 'Image must be 8 MB or smaller.';
    if (!UUID_RE.test(draft.dossierDraftId) || !UUID_RE.test(slot.id)) {
      return 'Session draft is invalid. Clear draft and start over.';
    }
    return null;
  };

  const uploadCroppedFile = async (slot: SuspectPhotoSlot, file: File) => {
    const isFront = slot.poseType === 'FRONT';
    const isProfile =
      slot.poseType === 'LEFT_PROFILE' || slot.poseType === 'RIGHT_PROFILE';
    const err = validateBeforeUpload(slot, file);
    if (err) {
      patchSlot(slot.id, { status: 'error', errorMessage: err });
      return;
    }

    let previewUrl: string;
    try {
      previewUrl = await fileToSuspectPhotoPreviewDataUrl(file);
    } catch {
      patchSlot(slot.id, {
        status: 'error',
        errorMessage: 'Could not read the image file.',
      });
      return;
    }

    setUploadingSlotId(slot.id);
    patchSlot(slot.id, {
      status: 'uploading',
      previewUrl,
      fileName: file.name,
      errorMessage: null,
      duplicateMatches: [],
      duplicateAcknowledged: false,
    });

    try {
      const result = await analyzeSuspectPhoto({
        file,
        poseType: slot.poseType,
        dossierDraftId: draft.dossierDraftId,
        photoId: slot.id,
        criminalName: draft.criminalName,
        replaceFaceId: slot.faceId ?? undefined,
      });

      const hasDuplicate = isFront && result.has_duplicate;
      patchSlot(slot.id, {
        status: hasDuplicate ? 'duplicate' : 'validated',
        previewUrl,
        fileName: file.name,
        faceId: result.face_id || null,
        storageKey: result.storage_key,
        detectedPose: isFront || isProfile ? result.detected_pose : null,
        faceCount: isFront || isProfile ? result.face_count : null,
        duplicateMatches: isFront ? result.duplicate_matches : [],
        duplicateAcknowledged: false,
        errorMessage: null,
      });
    } catch (err: unknown) {
      let errorMessage = 'Face analysis failed. Check that ml-gateway is running on port 8020.';
      if (axios.isAxiosError(err)) {
        if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
          errorMessage =
            'Analysis timed out. Wait and try again, or run POST /api/v1/ml/faces/warmup once.';
        } else if (err.response) {
          errorMessage = extractApiErrorMessage(err.response.data, err.response.status);
        } else if (err.request) {
          errorMessage = 'Cannot reach the face analysis service.';
        }
      }
      patchSlot(slot.id, {
        status: 'error',
        previewUrl: null,
        fileName: null,
        faceId: null,
        storageKey: null,
        errorMessage,
      });
    } finally {
      setUploadingSlotId(null);
      setCropSession(null);
    }
  };

  const openCrop = (
    slot: SuspectPhotoSlot,
    imageSrc: string,
    originalFile: File | null = null
  ) => {
    setCropSession({
      slotId: slot.id,
      imageSrc,
      variant: cropVariantForSlot(slot),
      originalFile,
    });
  };

  const handleRawFile = async (slot: SuspectPhotoSlot, file: File | null) => {
    if (!file) return;
    const err = validateBeforeUpload(slot, file);
    if (err) {
      patchSlot(slot.id, { status: 'error', errorMessage: err });
      return;
    }
    try {
      const src = await readFileAsDataUrl(file);
      openCrop(slot, src, file);
    } catch {
      patchSlot(slot.id, {
        status: 'error',
        errorMessage: 'Could not read the image file.',
      });
    }
  };

  const handleRecrop = (slot: SuspectPhotoSlot) => {
    if (slot.previewUrl) {
      openCrop(slot, slot.previewUrl);
      return;
    }
    inputRefs.current[slot.id]?.click();
  };

  const clearSlot = async (slot: SuspectPhotoSlot) => {
    const cacheKey = slot.storageKey ? `${slot.id}:${slot.storageKey}` : '';
    if (cacheKey) loadedPreviewKeys.current.delete(cacheKey);
    if (slot.storageKey) {
      try {
        await deleteSuspectDraftPhoto({
          dossierDraftId: draft.dossierDraftId,
          photoId: slot.id,
          storageKey: slot.storageKey,
          faceId: slot.faceId,
        });
      } catch {
        /* best effort */
      }
    }
    onPhotosChange((photos) =>
      photos.map((p) =>
        p.id === slot.id
          ? {
              ...p,
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
            }
          : p
      )
    );
  };

  const validatedCount = draft.photos.filter(
    (p) => p.status === 'validated' || p.status === 'duplicate'
  ).length;
  const hasFront = frontSlot?.status === 'validated' || frontSlot?.status === 'duplicate';
  const cropSlot = cropSession ? getSlot(cropSession.slotId) : null;

  return (
    <div className="dossier-photo-step">
      <header className="dossier-photo-step__header">
        <div className="dossier-photo-step__title-row">
          <Camera size={18} className="text-iip-primary shrink-0" />
          <h2 className="text-base font-semibold text-iip-text">Suspect photographs</h2>
          <span className="dossier-photo-step__pill">
            {validatedCount}/{draft.photos.length}
          </span>
        </div>
        <p className="dossier-photo-step__lede">
          Front face is required for recognition. Crop is recommended; you can upload the original file
          without cropping from the crop screen.
        </p>
        {modelsMessage && (
          <p
            className={`dossier-photo-step__status ${
              modelsReady
                ? 'dossier-photo-step__status--ok'
                : modelsReady === null
                  ? 'dossier-photo-step__status--err'
                  : 'dossier-photo-step__status--wait'
            }`}
          >
            {modelsMessage}
          </p>
        )}
      </header>

      {frontSlot && (
        <section className="dossier-photo-hero">
          <SuspectPhotoAvatarSlot
            slot={frontSlot}
            hint={frontDef.hint}
            size="hero"
            disabled={!faceServiceReady}
            isBusy={frontSlot.status === 'uploading'}
            busyLabel={uploadBusyLabel(frontSlot, modelsReady, uploadElapsedSec)}
            inputRef={(el) => {
              inputRefs.current[frontSlot.id] = el;
            }}
            onPickFile={() => inputRefs.current[frontSlot.id]?.click()}
            onRecrop={() => handleRecrop(frontSlot)}
            onClear={() => void clearSlot(frontSlot)}
            onPreviewError={() => handlePreviewError(frontSlot)}
            onFileInputChange={(file) => void handleRawFile(frontSlot, file)}
          />
          <div className="dossier-photo-hero__aside">
            <p className="text-sm font-medium text-iip-text">
              {hasFront ? 'Front photo ready' : 'Add front face photo'}
            </p>
            <p className="text-xs text-iip-text-muted mt-1 leading-relaxed">
              Tap the frame to choose an image, then crop (or skip crop). Duplicate checks run against{' '}
              <strong className="font-medium text-iip-text">submitted</strong> dossiers only.
            </p>
            {frontSlot.status === 'validated' && frontSlot.detectedPose && (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-2">
                Face verified
                {frontSlot.detectedPose !== 'FRONT' && (
                  <span className="text-iip-text-muted">
                    {' '}
                    (detected {frontSlot.detectedPose})
                  </span>
                )}
              </p>
            )}
          </div>
        </section>
      )}

      {(frontSlot?.status === 'duplicate' || (frontSlot?.duplicateMatches.length ?? 0) > 0) && (
        <SuspectDuplicateAlert
          matches={frontSlot!.duplicateMatches}
          acknowledged={frontSlot!.duplicateAcknowledged}
          onAcknowledge={() =>
            patchSlot(frontSlot!.id, {
              duplicateAcknowledged: true,
              status: 'validated',
            })
          }
        />
      )}

      <section className="dossier-photo-secondary">
        <p className="dossier-photo-secondary__heading">Additional angles (optional)</p>
        <div className="dossier-photo-secondary__grid">
          {secondarySlots.map((slot) => (
              <SuspectPhotoAvatarSlot
                key={slot.id}
                slot={slot}
                size="thumb"
                showInlineError={false}
                disabled={slotNeedsFaceCheck(slot.poseType) && !faceServiceReady}
                isBusy={slot.status === 'uploading'}
                busyLabel={
                  slot.status === 'uploading'
                    ? uploadBusyLabel(slot, modelsReady, uploadElapsedSec)
                    : undefined
                }
                verifiedLabel={
                  slot.poseType === 'LEFT_PROFILE'
                    ? 'Left OK'
                    : slot.poseType === 'RIGHT_PROFILE'
                      ? 'Right OK'
                      : 'Saved'
                }
                inputRef={(el) => {
                  inputRefs.current[slot.id] = el;
                }}
                onPickFile={() => inputRefs.current[slot.id]?.click()}
                onRecrop={() => handleRecrop(slot)}
                onClear={() => void clearSlot(slot)}
                onPreviewError={() => handlePreviewError(slot)}
                onFileInputChange={(file) => void handleRawFile(slot, file)}
              />
          ))}
        </div>
        {secondarySlots.some((s) => s.status === 'error' && s.errorMessage) && (
          <ul className="dossier-photo-slot-errors" aria-live="polite">
            {secondarySlots
              .filter((s) => s.status === 'error' && s.errorMessage)
              .map((s) => (
                <li key={s.id}>
                  <span className="font-semibold text-iip-text">{s.label}:</span> {s.errorMessage}
                </li>
              ))}
          </ul>
        )}
        <p className="dossier-photo-secondary__note">
          Left and right profile show an example pose — match it before uploading. Profile slots
          are verified; angle and other slots are reference-only.
        </p>
      </section>

      {cropSession && cropSlot && (
        <SuspectPhotoCropModal
          imageSrc={cropSession.imageSrc}
          open
          slotLabel={cropSlot.label}
          variant={cropSession.variant}
          isUploading={uploadingSlotId === cropSlot.id}
          onClose={() => {
            if (uploadingSlotId !== cropSlot.id) setCropSession(null);
          }}
          onConfirm={(file) => void uploadCroppedFile(cropSlot, file)}
          onUseOriginal={
            cropSession.originalFile
              ? () => void uploadCroppedFile(cropSlot, cropSession.originalFile!)
              : undefined
          }
        />
      )}
    </div>
  );
}
