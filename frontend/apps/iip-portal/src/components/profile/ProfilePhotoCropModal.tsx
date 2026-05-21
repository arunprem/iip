import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area, type Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { X } from 'lucide-react';
import { getCroppedImageBlob } from '../../utils/cropImage';
import { showToast } from '../../stores/toastStore';

interface ProfilePhotoCropModalProps {
  imageSrc: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (file: File) => void;
  isUploading?: boolean;
}

export function ProfilePhotoCropModal({
  imageSrc,
  open,
  onClose,
  onConfirm,
  isUploading = false,
}: ProfilePhotoCropModalProps) {
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
    img.onerror = () => {
      showToast('error', 'Could not load the image for cropping.');
    };
    img.src = imageSrc;
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setIsProcessing(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      const file = new File([blob], 'profile.jpg', { type: 'image/jpeg' });
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
      aria-labelledby="crop-photo-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-iip-border bg-iip-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-iip-border">
          <h2 id="crop-photo-title" className="text-sm font-semibold text-iip-text">
            Crop profile photo
          </h2>
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

        <div className="relative w-full h-80 bg-zinc-800">
          {!imageReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-300 text-sm">
              <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Loading image…
            </div>
          ) : (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                },
                cropAreaStyle: {
                  border: '2px solid rgb(var(--color-iip-primary) / 1)',
                },
              }}
            />
          )}
        </div>

        <div className="px-5 py-4 space-y-3 border-t border-iip-border">
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
              className="mt-1.5 w-full accent-iip-primary"
            />
          </label>
          <p className="text-[11px] text-iip-text-muted">
            Drag to reposition · use zoom to frame your face
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="admin-btn admin-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !imageReady || !croppedAreaPixels}
              className="admin-btn admin-btn-primary"
            >
              {busy ? 'Saving…' : 'Save photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
