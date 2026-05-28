import { AdminFormField } from '../../admin/AdminFormField';
import {
  CATEGORY_OPTIONS,
  GENDER_OPTIONS,
  RELIGION_OPTIONS,
} from '../../../pages/suspects/suspectFormDefaults';
import type { SuspectDossierDraft } from '../../../pages/suspects/suspectTypes';
import { syncAgeFromDob } from '../../../pages/suspects/suspectFormUtils';

interface SuspectIdentityStepProps {
  draft: SuspectDossierDraft;
  onChange: (patch: Partial<SuspectDossierDraft>) => void;
}

export function SuspectIdentityStep({ draft, onChange }: SuspectIdentityStepProps) {
  const handleDobChange = (dateOfBirth: string) => {
    onChange({ dateOfBirth, ...syncAgeFromDob(dateOfBirth) });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-iip-text-muted">
        Enter the primary identity fields. Required fields are marked with{' '}
        <span className="text-red-500">*</span>. Age and year of birth update automatically from
        date of birth.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AdminFormField id="criminal-name" label="Criminal name" required>
          <input
            id="criminal-name"
            className="form-control"
            value={draft.criminalName}
            onChange={(e) => onChange({ criminalName: e.target.value })}
            placeholder="Full legal name"
            autoFocus
          />
        </AdminFormField>

        <AdminFormField id="alias-name" label="Alias name" hint="Known nicknames or aliases">
          <input
            id="alias-name"
            className="form-control"
            value={draft.aliasName}
            onChange={(e) => onChange({ aliasName: e.target.value })}
            placeholder="Optional"
          />
        </AdminFormField>

        <AdminFormField id="gender" label="Gender">
          <select
            id="gender"
            className="form-control"
            value={draft.gender}
            onChange={(e) => onChange({ gender: e.target.value })}
          >
            <option value="">— Select —</option>
            {GENDER_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </AdminFormField>

        <AdminFormField id="fathers-name" label="Father's name">
          <input
            id="fathers-name"
            className="form-control"
            value={draft.fathersName}
            onChange={(e) => onChange({ fathersName: e.target.value })}
          />
        </AdminFormField>

        <AdminFormField id="dob" label="Date of birth">
          <input
            id="dob"
            type="date"
            className="form-control"
            value={draft.dateOfBirth}
            onChange={(e) => handleDobChange(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </AdminFormField>

        <div className="grid grid-cols-2 gap-3">
          <AdminFormField id="age" label="Age" hint="Auto-filled from DOB">
            <input
              id="age"
              type="number"
              min={0}
              max={120}
              className="form-control"
              value={draft.age}
              onChange={(e) => onChange({ age: e.target.value })}
            />
          </AdminFormField>
          <AdminFormField id="yob" label="Year of birth">
            <input
              id="yob"
              type="number"
              className="form-control"
              value={draft.yearOfBirth}
              onChange={(e) => onChange({ yearOfBirth: e.target.value })}
            />
          </AdminFormField>
        </div>

        <AdminFormField id="place-of-birth" label="Place of birth">
          <input
            id="place-of-birth"
            className="form-control"
            value={draft.placeOfBirth}
            onChange={(e) => onChange({ placeOfBirth: e.target.value })}
          />
        </AdminFormField>

        <AdminFormField id="religion" label="Religion">
          <select
            id="religion"
            className="form-control"
            value={draft.religion}
            onChange={(e) => onChange({ religion: e.target.value })}
          >
            <option value="">— Select —</option>
            {RELIGION_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </AdminFormField>

        <AdminFormField id="category" label="Category">
          <select
            id="category"
            className="form-control"
            value={draft.category}
            onChange={(e) => onChange({ category: e.target.value })}
          >
            <option value="">— Select —</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </AdminFormField>
      </div>
    </div>
  );
}
