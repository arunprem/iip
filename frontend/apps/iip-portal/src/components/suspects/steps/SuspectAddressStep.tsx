import { Copy } from 'lucide-react';
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
}

export function SuspectAddressStep({
  permanentAddress,
  presentAddress,
  hasDifferentPresentAddress,
  onPermanentChange,
  onPresentChange,
  onHasDifferentPresentChange,
}: SuspectAddressStepProps) {
  const copyPermanentToPresent = () => {
    onPresentChange({
      ...permanentAddress,
      isPermanent: false,
    });
  };

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
    </div>
  );
}
