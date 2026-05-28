import { AdminFormField } from '../../admin/AdminFormField';
import { KERALA_DISTRICTS } from '../../../pages/suspects/suspectFormDefaults';
import type { SuspectAddress } from '../../../pages/suspects/suspectTypes';

interface SuspectAddressStepProps {
  address: SuspectAddress;
  onChange: (address: SuspectAddress) => void;
}

export function SuspectAddressStep({ address, onChange }: SuspectAddressStepProps) {
  const set = (patch: Partial<SuspectAddress>) => onChange({ ...address, ...patch });

  return (
    <div className="space-y-6">
      <fieldset className="dossier-fieldset">
        <legend className="dossier-fieldset-legend">Is permanent address?</legend>
        <div className="dossier-radio-group" role="radiogroup" aria-label="Permanent address">
          <label className="dossier-radio-pill">
            <input
              type="radio"
              name="is-permanent"
              checked={address.isPermanent}
              onChange={() => set({ isPermanent: true })}
            />
            Yes
          </label>
          <label className="dossier-radio-pill">
            <input
              type="radio"
              name="is-permanent"
              checked={!address.isPermanent}
              onChange={() => set({ isPermanent: false })}
            />
            No
          </label>
        </div>
        {!address.isPermanent && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
            Marked as current / temporary address — you can add a permanent address later when the
            backend supports multiple addresses.
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AdminFormField id="house-no" label="House no.">
          <input
            id="house-no"
            className="form-control"
            value={address.houseNo}
            onChange={(e) => set({ houseNo: e.target.value })}
          />
        </AdminFormField>
        <AdminFormField id="house-name" label="House name">
          <input
            id="house-name"
            className="form-control"
            value={address.houseName}
            onChange={(e) => set({ houseName: e.target.value })}
          />
        </AdminFormField>
        <AdminFormField id="street" label="Street name">
          <input
            id="street"
            className="form-control"
            value={address.streetName}
            onChange={(e) => set({ streetName: e.target.value })}
          />
        </AdminFormField>
        <AdminFormField id="locality" label="Locality / colony / area" className="sm:col-span-2">
          <input
            id="locality"
            className="form-control"
            value={address.locality}
            onChange={(e) => set({ locality: e.target.value })}
          />
        </AdminFormField>
        <AdminFormField id="tehsil" label="Tehsil / block / mandal">
          <input
            id="tehsil"
            className="form-control"
            value={address.tehsil}
            onChange={(e) => set({ tehsil: e.target.value })}
          />
        </AdminFormField>
        <AdminFormField id="village" label="Village / town / city" className="sm:col-span-2">
          <input
            id="village"
            className="form-control"
            value={address.villageTownCity}
            onChange={(e) => set({ villageTownCity: e.target.value })}
          />
        </AdminFormField>
        <AdminFormField id="pincode" label="Pincode">
          <input
            id="pincode"
            className="form-control"
            inputMode="numeric"
            maxLength={6}
            value={address.pincode}
            onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
          />
        </AdminFormField>
        <AdminFormField id="lat" label="Latitude" hint="Optional GPS">
          <input
            id="lat"
            className="form-control"
            value={address.latitude}
            onChange={(e) => set({ latitude: e.target.value })}
            placeholder="e.g. 8.5241"
          />
        </AdminFormField>
        <AdminFormField id="lng" label="Longitude">
          <input
            id="lng"
            className="form-control"
            value={address.longitude}
            onChange={(e) => set({ longitude: e.target.value })}
            placeholder="e.g. 76.9366"
          />
        </AdminFormField>
        <AdminFormField id="country" label="Country">
          <input
            id="country"
            className="form-control bg-iip-surface-hover/50"
            value={address.country}
            readOnly
          />
        </AdminFormField>
        <AdminFormField id="state" label="State">
          <input
            id="state"
            className="form-control bg-iip-surface-hover/50"
            value={address.state}
            readOnly
          />
        </AdminFormField>
        <AdminFormField id="district" label="District">
          <select
            id="district"
            className="form-control"
            value={address.district}
            onChange={(e) => set({ district: e.target.value })}
          >
            <option value="">— Select district —</option>
            {KERALA_DISTRICTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </AdminFormField>
        <AdminFormField id="ps" label="Police station" className="sm:col-span-2">
          <input
            id="ps"
            className="form-control"
            value={address.policeStation}
            onChange={(e) => set({ policeStation: e.target.value })}
            placeholder="Jurisdiction PS"
          />
        </AdminFormField>
      </div>
    </div>
  );
}
