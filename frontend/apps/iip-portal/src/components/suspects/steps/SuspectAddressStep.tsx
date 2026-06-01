import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, MapPin } from 'lucide-react';
import { AdminButton } from '../../admin/AdminButton';
import { AddressFieldsForm } from '../AddressFieldsForm';
import type { SuspectAddress } from '../../../pages/suspects/suspectTypes';

interface SuspectAddressStepProps {
  permanentAddress: SuspectAddress;
  presentAddress: SuspectAddress;
  hasDifferentPresentAddress: boolean;
  onPermanentChange: (address: SuspectAddress) => void;
  onPresentChange: (address: SuspectAddress) => void;
  onHasDifferentPresentChange: (value: boolean) => void;
  photoGeoTag?: { latitude: number; longitude: number } | null;
}

export function SuspectAddressStep({
  permanentAddress,
  presentAddress,
  hasDifferentPresentAddress,
  onPermanentChange,
  onPresentChange,
  onHasDifferentPresentChange,
  photoGeoTag,
}: SuspectAddressStepProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptedCoords, setPromptedCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (
      photoGeoTag &&
      (!permanentAddress.latitude || !permanentAddress.longitude) &&
      (!promptedCoords || promptedCoords.latitude !== photoGeoTag.latitude || promptedCoords.longitude !== photoGeoTag.longitude)
    ) {
      setShowPrompt(true);
      setPromptedCoords(photoGeoTag);
    }
  }, [photoGeoTag, permanentAddress.latitude, permanentAddress.longitude, promptedCoords]);

  const handleApplyGeoTag = () => {
    if (photoGeoTag) {
      onPermanentChange({
        ...permanentAddress,
        latitude: photoGeoTag.latitude.toFixed(6),
        longitude: photoGeoTag.longitude.toFixed(6),
      });
    }
    setShowPrompt(false);
  };

  const handleDismissPrompt = () => {
    setShowPrompt(false);
  };

  const copyPermanentToPresent = () => {
    onPresentChange({
      ...permanentAddress,
      isPermanent: false,
    });
  };

  const promptModal = showPrompt && photoGeoTag ? (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="geotag-prompt-title"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-pink-500/20 bg-iip-surface shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-500">
            <MapPin size={22} className="animate-bounce" />
          </div>
          <div>
            <h2 id="geotag-prompt-title" className="text-sm font-semibold text-iip-text">
              Apply Photo Geo-tag?
            </h2>
            <p className="text-[10px] text-iip-text-muted mt-0.5">Kerala Police FRS Assist</p>
          </div>
        </div>

        <p className="text-xs text-iip-text-muted leading-relaxed">
          We detected GPS coordinates <span className="text-iip-text font-medium">{photoGeoTag.latitude.toFixed(5)}, {photoGeoTag.longitude.toFixed(5)}</span> embedded in the imported quick suspect photograph. Would you like to use this photo's geo-tag location as the permanent address coordinates?
        </p>

        <div className="flex items-center gap-2 pt-2">
          <AdminButton
            type="button"
            variant="secondary"
            size="sm"
            className="flex-1 justify-center"
            onClick={handleDismissPrompt}
          >
            No, Skip
          </AdminButton>
          <AdminButton
            type="button"
            variant="primary"
            size="sm"
            className="flex-1 justify-center bg-pink-600 hover:bg-pink-700 text-white"
            onClick={handleApplyGeoTag}
          >
            Yes, Apply
          </AdminButton>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-8">
      <fieldset className="dossier-fieldset">
        <legend className="dossier-fieldset-legend">Present address differs from permanent?</legend>
        <div className="dossier-radio-group" role="radiogroup" aria-label="Separate present address">
          <label className="dossier-radio-pill">
            <input
              type="radio"
              name="has-different-present"
              checked={!hasDifferentPresentAddress}
              onChange={() => onHasDifferentPresentChange(false)}
            />
            Same address
          </label>
          <label className="dossier-radio-pill">
            <input
              type="radio"
              name="has-different-present"
              checked={hasDifferentPresentAddress}
              onChange={() => onHasDifferentPresentChange(true)}
            />
            Different present address
          </label>
        </div>
        {!hasDifferentPresentAddress && (
          <p className="text-xs text-iip-text-muted mt-2">
            One address is used for both permanent and present residence.
          </p>
        )}
      </fieldset>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-iip-text">Permanent address</h3>
          <p className="text-xs text-iip-text-muted mt-0.5">
            Native / permanent residence as recorded in official documents.
          </p>
        </div>
        <AddressFieldsForm
          idPrefix="perm"
          address={{ ...permanentAddress, isPermanent: true }}
          onChange={(a) => onPermanentChange({ ...a, isPermanent: true })}
        />
      </section>

      {hasDifferentPresentAddress && (
        <section className="space-y-3 pt-6 border-t border-iip-border/60">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-iip-text">Present / current address</h3>
              <p className="text-xs text-iip-text-muted mt-0.5">
                Where the suspect is currently residing or was last seen.
              </p>
            </div>
            <AdminButton type="button" variant="ghost" size="sm" onClick={copyPermanentToPresent}>
              <Copy size={14} />
              Copy from permanent
            </AdminButton>
          </div>
          <AddressFieldsForm
            idPrefix="present"
            address={{ ...presentAddress, isPermanent: false }}
            onChange={(a) => onPresentChange({ ...a, isPermanent: false })}
          />
        </section>
      )}

      {promptModal && createPortal(promptModal, document.body)}
    </div>
  );
}
