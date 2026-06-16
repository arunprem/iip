import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { AdminFormField } from '../../admin/AdminFormField';
import {
  CATEGORY_OPTIONS,
  GENDER_OPTIONS,
  RELIGION_OPTIONS,
} from '../../../pages/suspects/suspectFormDefaults';
import type { SuspectDossierDraft } from '../../../pages/suspects/suspectTypes';
import { parseModusOperandi, syncAgeFromDob } from '../../../pages/suspects/suspectFormUtils';
import { assistantAutofill, assistantTransliterate } from '../../../api/assistant';
import { showToast } from '../../../stores/toastStore';
import { AdminButton } from '../../admin/AdminButton';

interface SuspectIdentityStepProps {
  draft: SuspectDossierDraft;
  onChange: (patch: Partial<SuspectDossierDraft>) => void;
}

export function SuspectIdentityStep({ draft, onChange }: SuspectIdentityStepProps) {
  const [autofillText, setAutofillText] = useState('');
  const [autofilling, setAutofilling] = useState(false);
  const [transliteratingField, setTransliteratingField] = useState<'name' | 'alias' | 'father' | null>(null);

  const handleDobChange = (dateOfBirth: string) => {
    onChange({ dateOfBirth, ...syncAgeFromDob(dateOfBirth) });
  };

  const handleAutofill = async () => {
    if (!autofillText.trim()) {
      showToast('warning', 'Please paste some text first.');
      return;
    }
    setAutofilling(true);
    try {
      const data = await assistantAutofill(autofillText);
      
      const patch: Partial<SuspectDossierDraft> = {};
      if (data.criminalName) patch.criminalName = data.criminalName;
      if (data.aliasName) patch.aliasName = data.aliasName;
      if (data.fathersName) patch.fathersName = data.fathersName;
      if (data.dateOfBirth) {
        patch.dateOfBirth = data.dateOfBirth;
        Object.assign(patch, syncAgeFromDob(data.dateOfBirth));
      } else if (data.age) {
        patch.age = data.age;
      }
      if (data.gender) patch.gender = data.gender;
      if (data.modusOperandi) {
        const parsedModus = parseModusOperandi(data.modusOperandi);
        patch.modusOperandi = parsedModus.notes;
        patch.modusOperandiTags = parsedModus.tags;
      }
      if (data.address) {
        const addr = data.address;
        patch.address = {
          ...draft.address,
          houseNo: addr.houseNo ?? draft.address.houseNo ?? '',
          houseName: addr.houseName ?? draft.address.houseName ?? '',
          streetName: addr.streetName ?? draft.address.streetName ?? '',
          locality: addr.locality ?? draft.address.locality ?? '',
          tehsil: addr.tehsil ?? draft.address.tehsil ?? '',
          villageTownCity: addr.villageTownCity ?? draft.address.villageTownCity ?? '',
          pincode: addr.pincode ?? draft.address.pincode ?? '',
          district: addr.district ?? draft.address.district ?? '',
          state: addr.state ?? draft.address.state ?? '',
        };
      }
      if (data.cases && data.cases.length > 0) {
        patch.cases = data.cases.map((c) => ({
          id: crypto.randomUUID(),
          crimeNumber: c.crimeNumber,
          crimeYear: c.crimeYear,
          policeStationId: c.policeStationName || '',
          policeStationName: c.policeStationName || '',
          actSection: c.actSection || '',
          brief: c.brief || '',
          presentStatus: c.presentStatus || '',
        }));
      }

      onChange(patch);
      showToast('success', 'Dossier fields successfully prepopulated with AI!');
      setAutofillText('');
    } catch (err: any) {
      showToast('error', err.response?.data?.detail || 'Autofill extraction failed.');
    } finally {
      setAutofilling(false);
    }
  };

  const handleTransliterate = async (field: 'name' | 'alias' | 'father') => {
    let sourceText = '';
    if (field === 'name') sourceText = draft.criminalName;
    else if (field === 'alias') sourceText = draft.aliasName;
    else if (field === 'father') sourceText = draft.fathersName;

    if (!sourceText.trim()) {
      showToast('warning', 'Please enter text in Malayalam first.');
      return;
    }

    setTransliteratingField(field);
    try {
      const result = await assistantTransliterate(sourceText);
      const patch: Partial<SuspectDossierDraft> = {};
      if (field === 'name') patch.criminalName = result;
      else if (field === 'alias') patch.aliasName = result;
      else if (field === 'father') patch.fathersName = result;
      onChange(patch);
      showToast('success', 'Transliterated successfully.');
    } catch {
      showToast('error', 'Transliteration failed.');
    } finally {
      setTransliteratingField(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Smart Paste Autofill Card */}
      <div className="rounded-xl border border-iip-primary/20 bg-iip-primary/[0.02] p-4 space-y-3 shadow-inner">
        <div className="flex items-center gap-2 text-iip-primary font-semibold text-sm">
          <Sparkles size={16} />
          <span>Smart Paste / AI Autofill</span>
        </div>
        <p className="text-xs text-iip-text-muted">
          Paste a raw case document, arrest memo, or Malayalam FIR excerpt to extract and populate dossier fields automatically.
        </p>
        <div className="space-y-2">
          <textarea
            className="form-control text-xs h-20 w-full resize-none font-mono"
            placeholder="Paste raw police text here..."
            value={autofillText}
            onChange={(e) => setAutofillText(e.target.value)}
            disabled={autofilling}
          />
          <div className="flex justify-end">
            <AdminButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAutofill}
              disabled={autofilling}
            >
              {autofilling ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Autofill Dossier
                </>
              )}
            </AdminButton>
          </div>
        </div>
      </div>

      <p className="text-sm text-iip-text-muted">
        Enter the primary identity fields. Required fields are marked with{' '}
        <span className="text-red-500">*</span>. Age and year of birth update automatically from
        date of birth.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AdminFormField
          id="criminal-name"
          label={
            <div className="flex items-center justify-between w-full">
              <span>Criminal name <span className="text-red-500">*</span></span>
              <button
                type="button"
                className="text-[10px] text-iip-primary font-medium hover:underline flex items-center gap-0.5 ml-2"
                onClick={() => handleTransliterate('name')}
                disabled={transliteratingField !== null}
              >
                {transliteratingField === 'name' ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                Malayalam to English
              </button>
            </div>
          }
        >
          <input
            id="criminal-name"
            className="form-control"
            value={draft.criminalName}
            onChange={(e) => onChange({ criminalName: e.target.value })}
            placeholder="Full legal name"
            autoFocus
          />
        </AdminFormField>

        <AdminFormField
          id="alias-name"
          label={
            <div className="flex items-center justify-between w-full">
              <span>Alias name</span>
              <button
                type="button"
                className="text-[10px] text-iip-primary font-medium hover:underline flex items-center gap-0.5 ml-2"
                onClick={() => handleTransliterate('alias')}
                disabled={transliteratingField !== null}
              >
                {transliteratingField === 'alias' ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                Malayalam to English
              </button>
            </div>
          }
          hint="Known nicknames or aliases"
        >
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

        <AdminFormField
          id="fathers-name"
          label={
            <div className="flex items-center justify-between w-full">
              <span>Father's name</span>
              <button
                type="button"
                className="text-[10px] text-iip-primary font-medium hover:underline flex items-center gap-0.5 ml-2"
                onClick={() => handleTransliterate('father')}
                disabled={transliteratingField !== null}
              >
                {transliteratingField === 'father' ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                Malayalam to English
              </button>
            </div>
          }
        >
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
