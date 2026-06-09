import { GitBranch } from 'lucide-react';
import { AdminFormField } from '../../admin/AdminFormField';
import { GENDER_OPTIONS, RELATION_OPTIONS } from '../../../pages/suspects/suspectFormDefaults';
import type {
  SuspectAssociate,
  SuspectDossierDraft,
  SuspectRelative,
} from '../../../pages/suspects/suspectTypes';
import { newRowId } from '../../../pages/suspects/suspectRowIds';
import { RepeatableCardList } from '../RepeatableCardList';
import { SuspectAssociatesStep } from './SuspectAssociatesStep';

interface SuspectRelativesStepProps {
  draft: SuspectDossierDraft;
  onRelativesChange: (relatives: SuspectRelative[]) => void;
  onAssociatesChange: (associates: SuspectAssociate[]) => void;
}

export function SuspectRelativesStep({
  draft,
  onRelativesChange,
  onAssociatesChange,
}: SuspectRelativesStepProps) {
  const relatives = draft.relatives ?? [];
  const update = (id: string, patch: Partial<SuspectRelative>) => {
    onRelativesChange(relatives.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  return (
    <div className="flex flex-col gap-10">
      <RepeatableCardList
        title="Family & whereabouts"
        description="Relatives or persons who may know the suspect's location."
        emptyHint="No relatives listed yet."
        addLabel="Add relative"
        items={relatives}
        onAdd={() =>
          onRelativesChange([
            ...relatives,
            { id: newRowId(), name: '', relation: '', gender: '', occupation: '' },
          ])
        }
        onRemove={(id) => onRelativesChange(relatives.filter((r) => r.id !== id))}
        renderItem={(id) => {
          const row = relatives.find((r) => r.id === id);
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

      <section
        className="rounded-xl border-2 border-dashed border-iip-primary/35 bg-iip-primary/5 p-4 sm:p-5"
        aria-labelledby="associate-links-heading"
      >
        <div className="flex items-start gap-3 mb-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-iip-primary/15 text-iip-primary">
            <GitBranch size={18} />
          </span>
          <div>
            <h3 id="associate-links-heading" className="text-sm font-bold text-iip-text">
              Operational associates (knowledge graph)
            </h3>
            <p className="text-xs text-iip-text-muted mt-1 max-w-2xl">
              Link persons working with this suspect to existing dossier profiles, or enter a new
              name to create a profile stub. Links appear in the Knowledge Graph network analysis.
            </p>
          </div>
        </div>
        <SuspectAssociatesStep
          embedded
          draft={{ ...draft, associates: draft.associates ?? [] }}
          onChange={onAssociatesChange}
        />
      </section>
    </div>
  );
}
