import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Loader2, FolderHeart, MapPin, Calendar, X, RefreshCw, Search } from 'lucide-react';
import { createPortal } from 'react-dom';
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
import {
  fetchQuickSuspects,
  fetchQuickSuspectImageBlob,
  type QuickSuspectCapture,
} from '../../../api/suspectDossiers';
import { showToast } from '../../../stores/toastStore';
import { AdminButton } from '../../admin/AdminButton';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotosUpdater =
  | SuspectPhotoSlot[]
  | ((prev: SuspectPhotoSlot[]) => SuspectPhotoSlot[]);

interface SuspectPhotoStepProps {
  draft: SuspectDossierDraft;
  onPhotosChange: (update: PhotosUpdater) => void;
  onLinkDecision: (decision: SuspectDossierDraft['linkDecision']) => void;
  onGeoTagChange?: (geoTag: { latitude: number; longitude: number } | null) => void;
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

export function SuspectPhotoStep({ draft, onPhotosChange, onLinkDecision, onGeoTagChange }: SuspectPhotoStepProps) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const loadedPreviewKeys = useRef<Set<string>>(new Set());
  const [uploadElapsedSec, setUploadElapsedSec] = useState(0);
  const [modelsReady, setModelsReady] = useState<boolean | null>(null);
  const [modelsMessage, setModelsMessage] = useState<string | null>(null);
  const [cropSession, setCropSession] = useState<CropSession | null>(null);
  const [uploadingSlotId, setUploadingSlotId] = useState<string | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryTargetSlotId, setGalleryTargetSlotId] = useState<string | null>(null);

  const openGallery = (slot: SuspectPhotoSlot) => {
    setGalleryTargetSlotId(slot.id);
    setGalleryOpen(true);
  };

  const closeGallery = () => {
    setGalleryOpen(false);
    setGalleryTargetSlotId(null);
  };

  const handleImportSelect = async (capture: QuickSuspectCapture) => {
    const targetSlot = galleryTargetSlotId ? getSlot(galleryTargetSlotId) : frontSlot;
    if (!targetSlot) return;
    closeGallery();
    patchSlot(targetSlot.id, { status: 'uploading', errorMessage: null });
    try {
      const blob = await fetchQuickSuspectImageBlob(capture.id);
      const safeName = capture.name.replace(/\s+/g, '_');
      const file = new File([blob], `imported_${targetSlot.poseType.toLowerCase()}_${safeName}.jpg`, {
        type: blob.type || 'image/jpeg',
      });
      
      if (targetSlot.poseType === 'FRONT' && onGeoTagChange) {
        if (capture.latitude !== null && capture.longitude !== null) {
          onGeoTagChange({ latitude: capture.latitude, longitude: capture.longitude });
        } else {
          onGeoTagChange(null);
        }
      }

      const src = await readFileAsDataUrl(file);
      openCrop(targetSlot, src, file);
    } catch (err) {
      showToast('error', 'Failed to retrieve quick suspect image from server.');
      patchSlot(targetSlot.id, { status: 'empty', errorMessage: 'Gallery import failed.' });
    }
  };

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
    if (isFront) {
      onLinkDecision(null);
    }
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
        suspectId: draft.editingMasterSuspectId,
        childSuspectId: draft.editingChildSuspectId,
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
    // Only immediately delete from backend if it is a new/draft capture, not an existing saved dossier.
    // That way, if the user navigates away or cancels, their saved dossier photo is completely safe and unchanged.
    if (slot.storageKey && !draft.editingDossierId) {
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
  const galleryTargetSlot = galleryTargetSlotId ? getSlot(galleryTargetSlotId) : null;

  return (
    <div className="dossier-photo-step">
      <div className="dossier-photo-step__toolbar">
        <div className="dossier-photo-step__toolbar-meta">
          <span className="dossier-photo-step__count">
            {validatedCount} of {draft.photos.length} photos
          </span>
          {hasFront ? (
            <span className="dossier-photo-step__pill dossier-photo-step__pill--ok">
              Front ready
            </span>
          ) : (
            <span className="dossier-photo-step__pill dossier-photo-step__pill--req">
              Front required
            </span>
          )}
        </div>
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
            {modelsReady ? (
              <CheckCircle2 size={12} className="inline shrink-0 mr-1 -mt-px" />
            ) : modelsReady === null ? (
              <AlertCircle size={12} className="inline shrink-0 mr-1 -mt-px" />
            ) : (
              <Loader2 size={12} className="inline shrink-0 mr-1 -mt-px animate-spin" />
            )}
            {modelsMessage}
          </p>
        )}
      </div>

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
            onPickFromGallery={() => openGallery(frontSlot)}
            onRecrop={() => handleRecrop(frontSlot)}
            onClear={() => void clearSlot(frontSlot)}
            onPreviewError={() => handlePreviewError(frontSlot)}
            onFileInputChange={(file) => void handleRawFile(frontSlot, file)}
          />
          <div className="dossier-photo-hero__aside">
            <p className="dossier-photo-hero__title">
              {hasFront ? 'Front photo ready' : 'Upload front face (required)'}
            </p>
            <p className="dossier-photo-hero__text">
              Used for face recognition and duplicate checks on submitted dossiers only. Crop is
              recommended; you can skip crop from the crop screen if the photo is already framed.
            </p>
            {frontSlot.status === 'validated' && (
              <p className="dossier-photo-hero__badge">
                <CheckCircle2 size={13} />
                Face verified
                {frontSlot.detectedPose && frontSlot.detectedPose !== 'FRONT' && (
                  <span className="text-iip-text-muted font-normal">
                    {' '}
                    · detected {frontSlot.detectedPose}
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
          linkDecision={draft.linkDecision}
          onConfirmLink={(match) => {
            const masterSuspectId = match.master_suspect_id ?? match.suspect_id;
            if (!masterSuspectId) return;
            onLinkDecision({
              masterSuspectId,
              matchedDossierId: match.dossier_id ?? undefined,
              faceSimilarity: match.similarity_score,
              matchScore: match.match_score ?? 0,
              decision: 'CONFIRMED_LINK',
            });
            patchSlot(frontSlot!.id, {
              duplicateAcknowledged: true,
              status: 'validated',
            });
          }}
          onRejectLink={() => {
            const top = frontSlot!.duplicateMatches[0];
            const masterSuspectId = top?.master_suspect_id ?? top?.suspect_id ?? '';
            onLinkDecision({
              masterSuspectId,
              faceSimilarity: top?.similarity_score ?? 0,
              matchScore: 0,
              decision: 'REJECTED_LINK',
            });
            patchSlot(frontSlot!.id, {
              duplicateAcknowledged: true,
              status: 'validated',
            });
          }}
        />
      )}

      <section className="dossier-photo-secondary">
        <p className="dossier-photo-secondary__heading">Additional angles (optional)</p>
        <div className="dossier-photo-secondary__grid">
          {secondarySlots.map((slot) => {
            const slotDef = PHOTO_SLOT_DEFS.find((d) => d.poseType === slot.poseType);
            return (
              <SuspectPhotoAvatarSlot
                key={slot.id}
                slot={slot}
                hint={slotDef?.hint}
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
                onPickFromGallery={() => openGallery(slot)}
                onRecrop={() => handleRecrop(slot)}
                onClear={() => void clearSlot(slot)}
                onPreviewError={() => handlePreviewError(slot)}
                onFileInputChange={(file) => void handleRawFile(slot, file)}
              />
            );
          })}
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

      <QuickGalleryImportModal
        open={galleryOpen}
        targetLabel={galleryTargetSlot?.label}
        onClose={closeGallery}
        onSelect={handleImportSelect}
      />
    </div>
  );
}

interface QuickGalleryItemCardProps {
  capture: QuickSuspectCapture;
  onSelect: (capture: QuickSuspectCapture) => void;
}

function QuickGalleryItemCard({ capture, onSelect }: QuickGalleryItemCardProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    const loadImg = async () => {
      try {
        const blob = await fetchQuickSuspectImageBlob(capture.id);
        if (!active) return;
        const url = URL.createObjectURL(blob);
        setImgUrl(url);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadImg();
    return () => {
      active = false;
      if (imgUrl) {
        URL.revokeObjectURL(imgUrl);
      }
    };
  }, [capture.id]);

  return (
    <div
      onClick={() => !loading && !error && onSelect(capture)}
      className="group relative cursor-pointer overflow-hidden rounded-xl border border-iip-border bg-iip-surface-hover/30 p-2.5 transition-all hover:border-pink-500/50 hover:bg-iip-surface-hover hover:shadow-lg"
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-zinc-950">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60">
            <Loader2 className="h-6 w-6 animate-spin text-iip-primary" />
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-xs text-iip-text-muted bg-zinc-900/60">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <span>Failed to load</span>
          </div>
        ) : (
          <img
            src={imgUrl!}
            alt={capture.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {capture.latitude !== null && capture.longitude !== null && (
          <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[9px] font-medium text-white backdrop-blur-sm">
            <MapPin size={9} className="text-pink-400" />
            <span>Geo-tagged</span>
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <p className="truncate text-xs font-semibold text-iip-text group-hover:text-pink-400">
          {capture.name}
        </p>
        <p className="flex items-center gap-1 text-[10px] text-iip-text-muted">
          <Calendar size={10} />
          <span>{new Date(capture.captured_at).toLocaleDateString()}</span>
        </p>
      </div>
    </div>
  );
}

interface QuickGalleryImportModalProps {
  open: boolean;
  targetLabel?: string;
  onClose: () => void;
  onSelect: (capture: QuickSuspectCapture) => void;
}

export function QuickGalleryImportModal({
  open,
  targetLabel,
  onClose,
  onSelect,
}: QuickGalleryImportModalProps) {
  const [items, setItems] = useState<QuickSuspectCapture[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadItems = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(false);
    try {
      const data = await fetchQuickSuspects();
      setItems(data);
    } catch {
      if (!silent) setError(true);
    } finally {
      if (!silent) setLoading(false);
      else setRefreshing(false);
    }
  };

  // Initial load when modal opens
  useEffect(() => {
    if (!open) return;
    setSearchQuery('');
    void loadItems(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Auto-poll every 10 seconds while modal is open — new photos pop in automatically
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      void loadItems(true);
    }, 10_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const content = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-gallery-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-iip-border bg-iip-surface shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-iip-border bg-iip-surface-hover/30">
          <div className="flex items-center gap-2">
            <FolderHeart className="text-pink-500 h-5 w-5" />
            <div>
              <h2 id="quick-gallery-title" className="text-sm font-semibold text-iip-text">
                Quick Suspect Gallery
              </h2>
              <p className="text-[11px] text-iip-text-muted mt-0.5 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                </span>
                {targetLabel
                  ? `Importing to ${targetLabel} · live refresh every 10s`
                  : 'Live — auto-refreshes every 10s'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadItems(false)}
              disabled={loading || refreshing}
              className="p-1.5 rounded-lg text-iip-text-muted hover:bg-iip-surface-hover disabled:opacity-40 transition-colors"
              aria-label="Refresh gallery"
              title="Refresh"
            >
              <RefreshCw size={15} className={(loading || refreshing) ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-iip-text-muted hover:bg-iip-surface-hover"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="px-5 py-2.5 border-b border-iip-border bg-iip-surface-hover/20">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-iip-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or tag…"
              className="w-full pl-8 pr-8 py-1.5 text-xs rounded-lg bg-iip-surface border border-iip-border text-iip-text placeholder-iip-text-muted focus:outline-none focus:border-pink-500/60 focus:ring-1 focus:ring-pink-500/30 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-iip-text-muted hover:text-iip-text"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-sm text-iip-text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
              <span>Fetching your quick gallery…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-sm text-center text-iip-text-muted max-w-md mx-auto">
              <AlertCircle className="h-8 w-8 text-red-500" />
              <p>Failed to retrieve Quick Suspect items from server. Check that iam-svc and postgres are running.</p>
              <AdminButton variant="secondary" size="sm" onClick={() => void loadItems(false)}>
                Retry
              </AdminButton>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-sm text-center text-iip-text-muted max-w-md mx-auto">
              <FolderHeart className="h-10 w-10 text-pink-500/40" />
              <p className="font-semibold text-iip-text">Gallery is empty</p>
              <p className="text-xs">
                You have no quick gallery photos yet. Capture suspect photos in the Kerala Police FRS mobile app while signed in as you — only your captures appear here.
              </p>
            </div>
          ) : (() => {
            const filtered = searchQuery.trim()
              ? items.filter((i) =>
                  i.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
                )
              : items;
            if (filtered.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-sm text-center text-iip-text-muted max-w-sm mx-auto">
                  <Search className="h-9 w-9 text-iip-text-muted/40" />
                  <p className="font-semibold text-iip-text">No matches found</p>
                  <p className="text-xs">
                    No photo matches &ldquo;{searchQuery}&rdquo;. Try a different name or keyword.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-pink-400 hover:text-pink-300 underline underline-offset-2"
                  >
                    Clear search
                  </button>
                </div>
              );
            }
            return (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {filtered.map((item) => (
                  <QuickGalleryItemCard
                    key={item.id}
                    capture={item}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            );
          })()}
        </div>

        <div className="px-5 py-3 border-t border-iip-border bg-iip-surface-hover/30 flex justify-between items-center text-[11px] text-iip-text-muted">
          <span className="flex items-center gap-1.5">
            {refreshing && <RefreshCw size={11} className="animate-spin text-pink-400" />}
            {searchQuery.trim()
              ? `${items.filter((i) => i.name.toLowerCase().includes(searchQuery.trim().toLowerCase())).length} of ${items.length} matching`
              : `${items.length} suspect photograph(s) available`
            }
          </span>
          <AdminButton variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </AdminButton>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
