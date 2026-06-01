import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Crop,
  FolderHeart,
  Loader2,
  User,
  X,
} from 'lucide-react';
import type { SuspectPhotoSlot } from '../../pages/suspects/suspectTypes';
import {
  SuspectPoseSampleIllustration,
  poseHasSampleGuide,
  type PoseSamplePose,
} from './SuspectPoseSampleIllustration';

export type SuspectAvatarSize = 'hero' | 'thumb';

interface SuspectPhotoAvatarSlotProps {
  slot: SuspectPhotoSlot;
  hint?: string;
  size: SuspectAvatarSize;
  disabled?: boolean;
  isBusy?: boolean;
  busyLabel?: string;
  verifiedLabel?: string;
  /** When false, long errors render in the parent step (full width). */
  showInlineError?: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
  onPickFile: () => void;
  onPickFromGallery?: () => void;
  onClear?: () => void;
  onRecrop?: () => void;
  onPreviewError?: () => void;
  onFileInputChange: (file: File | null) => void;
}

export function SuspectPhotoAvatarSlot({
  slot,
  hint,
  size,
  disabled = false,
  isBusy = false,
  busyLabel,
  showInlineError = true,
  verifiedLabel = 'Saved',
  inputRef,
  onPickFile,
  onPickFromGallery,
  onClear,
  onRecrop,
  onPreviewError,
  onFileInputChange,
}: SuspectPhotoAvatarSlotProps) {
  const hasPhoto = Boolean(slot.previewUrl);
  const showActions = hasPhoto && !isBusy && !disabled;
  const showGalleryAction = !hasPhoto && !isBusy && Boolean(onPickFromGallery);
  const samplePose: PoseSamplePose | null =
    !hasPhoto && poseHasSampleGuide(slot.poseType) ? slot.poseType : null;

  return (
    <div
      className={[
        'dossier-photo-avatar-slot',
        size === 'hero' && 'dossier-photo-avatar-slot--hero',
        slot.required && 'dossier-photo-avatar-slot--required',
        slot.status === 'validated' && 'dossier-photo-avatar-slot--ok',
        slot.status === 'duplicate' && 'dossier-photo-avatar-slot--warn',
        slot.status === 'error' && 'dossier-photo-avatar-slot--error',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="dossier-photo-avatar-slot__frame">
        <button
          type="button"
          className={[
            'dossier-photo-avatar',
            size === 'hero' ? 'dossier-photo-avatar--hero' : 'dossier-photo-avatar--thumb',
            hasPhoto && 'dossier-photo-avatar--filled',
            !hasPhoto && 'dossier-photo-avatar--empty',
            disabled && 'dossier-photo-avatar--disabled',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => !disabled && !isBusy && onPickFile()}
          disabled={disabled || isBusy}
          aria-label={
            hasPhoto ? `Replace ${slot.label}` : `Upload ${slot.label}`
          }
        >
          {hasPhoto ? (
            <img
              key={slot.previewUrl ?? slot.id}
              src={slot.previewUrl!}
              alt=""
              className="dossier-photo-avatar__img"
              onError={onPreviewError}
            />
          ) : samplePose ? (
            <span className="dossier-photo-avatar__placeholder dossier-photo-avatar__placeholder--sample">
              <SuspectPoseSampleIllustration
                pose={samplePose}
                className="dossier-photo-avatar__sample"
              />
              <span className="dossier-photo-avatar__sample-badge">Example</span>
            </span>
          ) : (
            <span className="dossier-photo-avatar__placeholder dossier-photo-avatar__placeholder--empty" aria-hidden>
              <User
                className={
                  size === 'hero'
                    ? 'dossier-photo-avatar__icon dossier-photo-avatar__icon--hero'
                    : 'dossier-photo-avatar__icon'
                }
                strokeWidth={1.25}
              />
              {size === 'thumb' && (
                <span className="dossier-photo-avatar__upload-label">Upload</span>
              )}
            </span>
          )}

          {isBusy && (
            <span className="dossier-photo-avatar__busy">
              <Loader2 className="animate-spin text-white" size={size === 'hero' ? 28 : 20} />
              {busyLabel && size === 'hero' && (
                <span className="dossier-photo-avatar__busy-label">{busyLabel}</span>
              )}
            </span>
          )}

          {!isBusy && !disabled && (
            <span className="dossier-photo-avatar__hover">
              <Camera size={size === 'hero' ? 22 : 16} />
            </span>
          )}
        </button>

        {showActions && onRecrop && (
          <button
            type="button"
            className="dossier-photo-avatar__action dossier-photo-avatar__action--crop"
            onClick={(e) => {
              e.stopPropagation();
              onRecrop();
            }}
            title="Crop again"
            aria-label={`Crop ${slot.label} again`}
          >
            <Crop size={12} />
          </button>
        )}

        {showActions && onClear && (
          <button
            type="button"
            className="dossier-photo-avatar__action dossier-photo-avatar__action--remove"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            title="Remove"
            aria-label={`Remove ${slot.label}`}
          >
            <X size={12} />
          </button>
        )}

        {showGalleryAction && (
          <button
            type="button"
            className="dossier-photo-avatar__action dossier-photo-avatar__action--gallery"
            onClick={(e) => {
              e.stopPropagation();
              onPickFromGallery?.();
            }}
            disabled={disabled}
            title="Import from Quick Gallery"
            aria-label={`Import ${slot.label} from Quick Gallery`}
          >
            <FolderHeart size={12} />
          </button>
        )}

        {slot.status === 'validated' && !isBusy && (
          <span className="dossier-photo-avatar__badge dossier-photo-avatar__badge--ok" aria-hidden>
            <CheckCircle2 size={12} />
          </span>
        )}
        {slot.status === 'error' && !isBusy && (
          <span className="dossier-photo-avatar__badge dossier-photo-avatar__badge--err" aria-hidden>
            <AlertCircle size={12} />
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          onFileInputChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />

      <div className="dossier-photo-avatar-slot__meta">
        <p className="dossier-photo-avatar-slot__label">
          {slot.label}
          {slot.required && <span className="text-red-500">*</span>}
        </p>
        {!hasPhoto && poseHasSampleGuide(slot.poseType) && (
          <p className="dossier-photo-avatar-slot__sample-hint">
            {slot.poseType === 'FRONT'
              ? 'Match example'
              : slot.poseType === 'LEFT_PROFILE'
                ? 'Turn left · cheek to camera'
                : 'Turn right · cheek to camera'}
          </p>
        )}
        {size === 'thumb' && hint && !hasPhoto && (
          <p className="dossier-photo-avatar-slot__hint">{hint}</p>
        )}
        {size === 'hero' && hint && (
          <p className="dossier-photo-avatar-slot__hint">{hint}</p>
        )}
        {showInlineError && slot.status === 'error' && slot.errorMessage && (
          <p className="dossier-photo-avatar-slot__error">{slot.errorMessage}</p>
        )}
        {slot.status === 'validated' && size === 'thumb' && (
          <p className="dossier-photo-avatar-slot__ok">{verifiedLabel}</p>
        )}
      </div>
    </div>
  );
}
