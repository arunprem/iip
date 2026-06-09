import { useState } from 'react';
import { AdminFormField } from '../../admin/AdminFormField';
import type { SuspectProfileHit } from '../../../api/knowledgeGraph';
import { ASSOCIATION_TYPE_OPTIONS } from '../../../pages/suspects/suspectAssociateConstants';
import type { SuspectAssociate, SuspectDossierDraft } from '../../../pages/suspects/suspectTypes';
import { RepeatableCardList } from '../RepeatableCardList';
import { AssociateProfilePicker } from '../AssociateProfilePicker';
import { newRowId } from '../../../pages/suspects/suspectRowIds';

interface SuspectAssociatesStepProps {
  draft: SuspectDossierDraft;
  onChange: (associates: SuspectAssociate[]) => void;
  /** When nested inside Relatives step — shorter chrome */
  embedded?: boolean;
}

export function SuspectAssociatesStep({
  draft,
  onChange,
  embedded = false,
}: SuspectAssociatesStepProps) {
  const associates = draft.associates ?? [];
  const [linkedHits, setLinkedHits] = useState<Record<string, SuspectProfileHit>>({});

  const update = (id: string, patch: Partial<SuspectAssociate>) => {
    onChange(associates.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  return (
    <RepeatableCardList
      title={embedded ? 'Associate entries' : 'Operational associates'}
      description={
        embedded
          ? 'Search an existing dossier profile (with photo preview) or type a new name. Use filters to narrow large result sets.'
          : 'Persons working with this suspect. Search and pick an existing profile — use filters to drill down — or enter a new name to create a profile stub.'
      }
      emptyHint="No associates yet — click Add associate to link a profile."
      addLabel="Add associate"
      items={associates}
      onAdd={() =>
        onChange([
          ...associates,
          {
            id: newRowId(),
            name: '',
            associationType: 'ACCOMPLICE',
            occupation: '',
            notes: '',
            linkedMasterSuspectId: null,
          },
        ])
      }
      onRemove={(id) => {
        onChange(associates.filter((a) => a.id !== id));
        setLinkedHits((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }}
      renderItem={(id) => {
        const row = associates.find((a) => a.id === id);
        if (!row) return null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <AssociateProfilePicker
                rowId={id}
                value={row.name}
                linkedMasterSuspectId={row.linkedMasterSuspectId}
                linkedHit={linkedHits[id] ?? null}
                excludeMasterSuspectId={draft.editingMasterSuspectId}
                onSelect={(name, hit) => {
                  update(id, {
                    name,
                    linkedMasterSuspectId: hit?.master_suspect_id ?? null,
                  });
                  setLinkedHits((prev) => {
                    const next = { ...prev };
                    if (!hit) {
                      delete next[id];
                      return next;
                    }
                    next[id] = hit;
                    return next;
                  });
                }}
              />
            </div>
            <AdminFormField id={`${id}-type`} label="Association type">
              <select
                id={`${id}-type`}
                className="form-control"
                value={row.associationType}
                onChange={(e) => update(id, { associationType: e.target.value })}
              >
                {ASSOCIATION_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
            <AdminFormField id={`${id}-notes`} label="Notes" className="sm:col-span-2">
              <input
                id={`${id}-notes`}
                className="form-control"
                value={row.notes}
                onChange={(e) => update(id, { notes: e.target.value })}
              />
            </AdminFormField>
          </div>
        );
      }}
    />
  );
}
