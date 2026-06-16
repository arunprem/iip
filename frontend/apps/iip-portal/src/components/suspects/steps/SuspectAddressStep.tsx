import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, MapPin, Sparkles, Loader2 } from 'lucide-react';
import { AdminButton } from '../../admin/AdminButton';
import { AddressFieldsForm } from '../AddressFieldsForm';
import type { SuspectAddress } from '../../../pages/suspects/suspectTypes';
import { assistantAutofill } from '../../../api/assistant';
import { showToast } from '../../../stores/toastStore';

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
  const [parsingAddressField, setParsingAddressField] = useState<'perm' | 'present' | null>(null);
  const [addressRawText, setAddressRawText] = useState({ perm: '', present: '' });

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

  const handleParseAddress = async (field: 'perm' | 'present') => {
    const text = addressRawText[field];
    if (!text.trim()) {
      showToast('warning', 'Please enter address text to parse.');
      return;
    }
    setParsingAddressField(field);
    try {
      const data = await assistantAutofill(`Extract address details from this text: ${text}`);
      if (data.address) {
        const parsed = {
          houseNo: data.address.houseNo || '',
          houseName: data.address.houseName || '',
          streetName: data.address.streetName || '',
          locality: data.address.locality || '',
          tehsil: data.address.tehsil || '',
          villageTownCity: data.address.villageTownCity || '',
          pincode: data.address.pincode || '',
          district: data.address.district || '',
          state: data.address.state || 'KERALA',
          country: 'INDIA',
        };
        if (field === 'perm') {
          onPermanentChange({ ...permanentAddress, ...parsed, isPermanent: true });
        } else {
          onPresentChange({ ...presentAddress, ...parsed, isPermanent: false });
        }
        showToast('success', 'Address successfully parsed and filled!');
        setAddressRawText((prev) => ({ ...prev, [field]: '' }));
      } else {
        showToast('warning', 'No structured address details found in the input.');
      }
    } catch {
      showToast('error', 'Address parsing failed.');
    } finally {
      setParsingAddressField(null);
    }
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

        {/* AI Address Parser */}
        <div className="rounded-xl border border-iip-primary/20 bg-iip-primary/[0.02] p-3 space-y-2 max-w-xl">
          <div className="flex items-center gap-1.5 text-xs text-iip-primary font-semibold">
            <Sparkles size={13} />
            <span>AI Address Parser</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="form-control text-xs flex-1"
              placeholder="Paste raw address (e.g. Mundakkal House, Fort Road, Kollam, 691001)..."
              value={addressRawText.perm}
              onChange={(e) => setAddressRawText((prev) => ({ ...prev, perm: e.target.value }))}
              disabled={parsingAddressField !== null}
            />
            <AdminButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => handleParseAddress('perm')}
              disabled={parsingAddressField !== null}
            >
              {parsingAddressField === 'perm' ? <Loader2 size={12} className="animate-spin" /> : 'Parse'}
            </AdminButton>
          </div>
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

          {/* AI Address Parser (Present) */}
          <div className="rounded-xl border border-iip-primary/20 bg-iip-primary/[0.02] p-3 space-y-2 max-w-xl">
            <div className="flex items-center gap-1.5 text-xs text-iip-primary font-semibold">
              <Sparkles size={13} />
              <span>AI Address Parser</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                className="form-control text-xs flex-1"
                placeholder="Paste raw present address..."
                value={addressRawText.present}
                onChange={(e) => setAddressRawText((prev) => ({ ...prev, present: e.target.value }))}
                disabled={parsingAddressField !== null}
              />
              <AdminButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => handleParseAddress('present')}
                disabled={parsingAddressField !== null}
              >
                {parsingAddressField === 'present' ? <Loader2 size={12} className="animate-spin" /> : 'Parse'}
              </AdminButton>
            </div>
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

