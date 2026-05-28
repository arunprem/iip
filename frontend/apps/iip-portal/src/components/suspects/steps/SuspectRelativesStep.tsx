import { AdminFormField } from '../../admin/AdminFormField';
import { GENDER_OPTIONS, RELATION_OPTIONS } from '../../../pages/suspects/suspectFormDefaults';
import type { SuspectDossierDraft, SuspectRelative } from '../../../pages/suspects/suspectTypes';
import { RepeatableCardList } from '../RepeatableCardList';
import { newRowId } from '../../../pages/suspects/suspectFormUtils';

interface SuspectRelativesStepProps {
  draft: SuspectDossierDraft;
  onChange: (relatives: SuspectRelative[]) => void;
}

export function SuspectRelativesStep({ draft, onChange }: SuspectRelativesStepProps) {
  const update = (id: string, patch: Partial<SuspectRelative>) => {
    onChange(draft.relatives.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <RepeatableCardList
      title="Whereabouts & relative details"
      description="Associates, family, or persons who may know the suspect's location."
      emptyHint="No relatives or associates listed yet."
      addLabel="Add relative"
      items={draft.relatives}
      onAdd={() =>
        onChange([
          ...draft.relatives,
          { id: newRowId(), name: '', relation: '', gender: '', occupation: '' },
        ])
      }
      onRemove={(id) => onChange(draft.relatives.filter((r) => r.id !== id))}
      renderItem={(id) => {
        const row = draft.relatives.find((r) => r.id === id);
        if (!row) return null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AdminFormField id={`${id}-name`} label="Relative name">
              <input
                id={`${id}-name`}
                className="form-control"
                value={row.name}
                onChange={(e) => update(id, { name: e.target.value })}
              />
            </AdminFormField>
            <AdminFormField id={`${id}-relation`} label="Relation with criminal">
              <select
                id={`${id}-relation`}
                className="form-control"
                value={row.relation}
                onChange={(e) => update(id, { relation: e.target.value })}
              >
                <option value="">— Select —</option>
                {RELATION_OPTIONS.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField id={`${id}-gender`} label="Gender">
              <select
                id={`${id}-gender`}
                className="form-control"
                value={row.gender}
                onChange={(e) => update(id, { gender: e.target.value })}
              >
                <option value="">— Select —</option>
                {GENDER_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField id={`${id}-occupation`} label="Occupation">
              <input
                id={`${id}-occupation`}
                className="form-control"
                value={row.occupation}
                onChange={(e) => update(id, { occupation: e.target.value })}
              />
            </AdminFormField>
          </div>
        );
      }}
    />
  );
}
