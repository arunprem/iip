import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { fetchFingerprintPreviewDataUrl } from '../../api/suspectFingerprints';

interface FingerprintImagePreviewProps {
  printId: string;
  altText?: string;
  className?: string;
  iconSize?: number;
}

export function FingerprintImagePreview({
  printId,
  altText = 'Fingerprint',
  className = 'w-14 h-18 object-cover rounded border border-iip-border bg-iip-bg shrink-0',
  iconSize = 24,
}: FingerprintImagePreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!printId) {
      setError(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    fetchFingerprintPreviewDataUrl(printId)
      .then((url) => {
        setDataUrl(url);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [printId]);

  if (loading) {
    return (
      <div className={`${className} flex items-center justify-center bg-iip-bg/20`}>
        <div className="w-4 h-4 border-2 border-iip-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !dataUrl) {
    return (
      <div className={`${className} flex items-center justify-center bg-iip-primary/10 text-iip-primary`}>
        <Fingerprint size={iconSize} />
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={altText}
      className={className}
      onError={() => setError(true)}
    />
  );
}
