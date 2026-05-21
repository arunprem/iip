import { useCallback, useState } from 'react';
import Cropper, { type Area, type Point } from 'react-easy-crop';
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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-photo-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-iip-border bg-iip-surface shadow-2xl overflow-hidden">
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

        <div className="relative h-72 bg-iip-bg">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
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
              disabled={busy}
              className="mt-1.5 w-full accent-iip-primary"
            />
          </label>
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
              disabled={busy || !croppedAreaPixels}
              className="admin-btn admin-btn-primary"
            >
              {busy ? 'Saving…' : 'Save photo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
