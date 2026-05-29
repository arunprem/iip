import { AdminFormField } from '../admin/AdminFormField';
import { KERALA_DISTRICTS } from '../../pages/suspects/suspectFormDefaults';
import type { SuspectAddress } from '../../pages/suspects/suspectTypes';
import { AddressLocationPicker } from './AddressLocationPicker';

interface AddressFieldsFormProps {
  idPrefix: string;
  address: SuspectAddress;
  onChange: (address: SuspectAddress) => void;
}

export function AddressFieldsForm({ idPrefix, address, onChange }: AddressFieldsFormProps) {
  const set = (patch: Partial<SuspectAddress>) => onChange({ ...address, ...patch });

  return (
    <div className="address-form-layout">
      <div className="address-form-fields space-y-4 min-w-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <AdminFormField id={`${idPrefix}-house-no`} label="House no.">
            <input
              id={`${idPrefix}-house-no`}
              className="form-control"
              value={address.houseNo}
              onChange={(e) => set({ houseNo: e.target.value })}
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-house-name`} label="House name">
            <input
              id={`${idPrefix}-house-name`}
              className="form-control"
              value={address.houseName}
              onChange={(e) => set({ houseName: e.target.value })}
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-street`} label="Street name" className="sm:col-span-2">
            <input
              id={`${idPrefix}-street`}
              className="form-control"
              value={address.streetName}
              onChange={(e) => set({ streetName: e.target.value })}
            />
          </AdminFormField>
          <AdminFormField
            id={`${idPrefix}-locality`}
            label="Locality / colony / area"
            className="sm:col-span-2"
          >
            <input
              id={`${idPrefix}-locality`}
              className="form-control"
              value={address.locality}
              onChange={(e) => set({ locality: e.target.value })}
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-tehsil`} label="Tehsil / block / mandal">
            <input
              id={`${idPrefix}-tehsil`}
              className="form-control"
              value={address.tehsil}
              onChange={(e) => set({ tehsil: e.target.value })}
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-village`} label="Village / town / city">
            <input
              id={`${idPrefix}-village`}
              className="form-control"
              value={address.villageTownCity}
              onChange={(e) => set({ villageTownCity: e.target.value })}
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-pincode`} label="Pincode">
            <input
              id={`${idPrefix}-pincode`}
              className="form-control"
              inputMode="numeric"
              maxLength={6}
              value={address.pincode}
              onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-district`} label="District">
            <select
              id={`${idPrefix}-district`}
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
          <AdminFormField id={`${idPrefix}-ps`} label="Police station" className="sm:col-span-2">
            <input
              id={`${idPrefix}-ps`}
              className="form-control"
              value={address.policeStation}
              onChange={(e) => set({ policeStation: e.target.value })}
              placeholder="Jurisdiction PS"
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-country`} label="Country">
            <input
              id={`${idPrefix}-country`}
              className="form-control bg-iip-surface-hover/50"
              value={address.country}
              readOnly
            />
          </AdminFormField>
          <AdminFormField id={`${idPrefix}-state`} label="State">
            <input
              id={`${idPrefix}-state`}
              className="form-control bg-iip-surface-hover/50"
              value={address.state}
              readOnly
            />
          </AdminFormField>
        </div>
      </div>

      <aside className="address-form-map-panel w-full min-w-0">
        <fieldset className="dossier-fieldset h-full">
          <legend className="dossier-fieldset-legend">Map location (GPS)</legend>
          <AddressLocationPicker
            mapId={`${idPrefix}-map`}
            latitude={address.latitude}
            longitude={address.longitude}
            onChange={(latitude, longitude) => set({ latitude, longitude })}
          />
        </fieldset>
      </aside>
    </div>
  );
}
