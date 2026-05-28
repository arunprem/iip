import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Loader2, Save, X } from 'lucide-react';
import { AdminButton } from '../admin/AdminButton';
import { getCroppedImageBlob } from '../../utils/cropImage';
import { showToast } from '../../stores/toastStore';

export type SuspectCropVariant = 'profile' | 'portrait';

const CROP_CONFIG: Record<
  SuspectCropVariant,
  {
    aspect: number;
    cropShape: 'round' | 'rect';
    output: { width: number; height: number };
    hint: string;
  }
> = {
  profile: {
    aspect: 3 / 4,
    cropShape: 'rect',
    output: { width: 600, height: 800 },
    hint: 'Frame the full face in the box — used for recognition.',
  },
  portrait: {
    aspect: 3 / 4,
    cropShape: 'rect',
    output: { width: 600, height: 800 },
    hint: 'Frame head and shoulders in the box.',
  },
};

interface SuspectPhotoCropModalProps {
  imageSrc: string;
  open: boolean;
  slotLabel: string;
  variant: SuspectCropVariant;
  onClose: () => void;
  onConfirm: (file: File) => void;
  /** Upload the file as selected, without applying the crop frame. */
  onUseOriginal?: () => void;
  isUploading?: boolean;
}

export function SuspectPhotoCropModal({
  imageSrc,
  open,
  slotLabel,
  variant,
  onClose,
  onConfirm,
  onUseOriginal,
  isUploading = false,
}: SuspectPhotoCropModalProps) {
  const config = CROP_CONFIG[variant];
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    if (!open || !imageSrc) {
      setImageReady(false);
      return;
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setImageReady(false);

    const img = new Image();
    img.onload = () => setImageReady(true);
    img.onerror = () => showToast('error', 'Could not load the image for cropping.');
    img.src = imageSrc;
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, config.output);
      const file = new File([blob], 'suspect-photo.jpg', { type: 'image/jpeg' });
      onConfirm(file);
    } catch {
      setIsProcessing(false);
      showToast('error', 'Could not process the image. Try another file.');
    }
  };

  if (!open) return null;

  const busy = isUploading || isProcessing;

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="suspect-crop-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-iip-border bg-iip-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-iip-border">
          <div>
            <h2 id="suspect-crop-title" className="text-sm font-semibold text-iip-text">
              Crop photo
            </h2>
            <p className="text-[11px] text-iip-text-muted mt-0.5">{slotLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg text-iip-text-muted hover:bg-iip-surface-hover disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative w-full h-72 sm:h-80 bg-zinc-900">
          {!imageReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-zinc-300 text-sm">
              <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Loading…
            </div>
          ) : (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={config.aspect}
              cropShape={config.cropShape}
              showGrid
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: {
                  position: 'absolute',
                  inset: 0,
                },
                cropAreaStyle: {
                  border: '2px solid rgb(var(--color-iip-primary) / 1)',
                },
              }}
            />
          )}
        </div>

        <div className="px-5 py-3 space-y-2 border-t border-iip-border">
          <label className="block text-xs font-medium text-iip-text-muted">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={busy || !imageReady}
              className="mt-1 w-full accent-iip-primary"
            />
          </label>
          <p className="text-[11px] text-iip-text-muted">{config.hint}</p>
        </div>

        <div className="admin-form-panel-footer flex-col gap-2 sm:flex-row sm:items-center">
          <AdminButton variant="secondary" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </AdminButton>
          <span className="admin-form-actions-spacer flex-1 hidden sm:block" aria-hidden />
          {onUseOriginal && (
            <AdminButton
              type="button"
              variant="ghost"
              size="sm"
              className="text-iip-text-muted hover:text-iip-text order-last sm:order-none"
              onClick={onUseOriginal}
              disabled={busy}
            >
              Upload without cropping
            </AdminButton>
          )}
          <AdminButton
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={busy || !imageReady || !croppedAreaPixels}
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin shrink-0" aria-hidden />
            ) : (
              <Save size={15} aria-hidden />
            )}
            {busy ? 'Uploading…' : 'Use cropped photo'}
          </AdminButton>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
