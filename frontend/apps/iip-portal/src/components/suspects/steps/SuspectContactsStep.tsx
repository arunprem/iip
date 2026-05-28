import { AdminFormField } from '../../admin/AdminFormField';
import type { ContactType, SuspectContact, SuspectDossierDraft } from '../../../pages/suspects/suspectTypes';
import { RepeatableCardList } from '../RepeatableCardList';
import { newRowId } from '../../../pages/suspects/suspectFormUtils';

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
  { value: 'MOBILE', label: 'Mobile' },
  { value: 'LANDLINE', label: 'Landline' },
  { value: 'EMAILID', label: 'Email' },
];

interface SuspectContactsStepProps {
  draft: SuspectDossierDraft;
  onChange: (contacts: SuspectContact[]) => void;
}

export function SuspectContactsStep({ draft, onChange }: SuspectContactsStepProps) {
  const update = (id: string, patch: Partial<SuspectContact>) => {
    onChange(draft.contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  return (
    <RepeatableCardList
      title="Contact details"
      description="Add every number or email you have — mobile first is typical."
      emptyHint="No contacts yet. Add at least one mobile number if known."
      addLabel="Add contact"
      items={draft.contacts}
      onAdd={() =>
        onChange([...draft.contacts, { id: newRowId(), type: 'MOBILE', value: '' }])
      }
      onRemove={(id) => onChange(draft.contacts.filter((c) => c.id !== id))}
      renderItem={(id) => {
        const row = draft.contacts.find((c) => c.id === id);
        if (!row) return null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AdminFormField id={`${id}-type`} label="Type of contact">
              <select
                id={`${id}-type`}
                className="form-control"
                value={row.type}
                onChange={(e) => update(id, { type: e.target.value as ContactType })}
              >
                {CONTACT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField id={`${id}-value`} label="Contact details">
              <input
                id={`${id}-value`}
                className="form-control"
                value={row.value}
                onChange={(e) => update(id, { value: e.target.value })}
                placeholder={
                  row.type === 'EMAILID' ? 'name@example.com' : '10-digit number'
                }
                inputMode={row.type === 'EMAILID' ? 'email' : 'tel'}
              />
            </AdminFormField>
          </div>
        );
      }}
    />
  );
}
