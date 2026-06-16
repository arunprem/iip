import { useEffect, useState } from 'react';
import { AdminFormField } from '../../admin/AdminFormField';
import type { SuspectCase, SuspectDossierDraft } from '../../../pages/suspects/suspectTypes';
import { RepeatableCardList } from '../RepeatableCardList';
import { newRowId } from '../../../pages/suspects/suspectFormUtils';
import { fetchDescendantPoliceStations, type PSLookupResponse } from '../../../api/offices';
import { showToast } from '../../../stores/toastStore';
import { useAuthStore } from '../../../stores/authStore';

interface SuspectCasesStepProps {
  draft: SuspectDossierDraft;
  onChange: (cases: SuspectCase[]) => void;
}

const PRESENT_STATUS_OPTIONS = [
  'Under Investigation',
  'Charge Sheeted',
  'Under Trial',
  'Convicted',
  'Acquitted',
  'Quashed',
  'Other',
];

export function SuspectCasesStep({ draft, onChange }: SuspectCasesStepProps) {
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const [policeStations, setPoliceStations] = useState<PSLookupResponse[]>([]);
  const [loadingPS, setLoadingPS] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingPS(true);
    fetchDescendantPoliceStations()
      .then((data) => {
        if (active) {
          setPoliceStations(data);
          // If any existing case is missing policeStationName, populate it
          if (draft.cases.length > 0) {
            const updatedCases = draft.cases.map((c) => {
              if (!c.policeStationName && c.policeStationId) {
                const ps = data.find((p) => p.id === c.policeStationId);
                if (ps) {
                  return { ...c, policeStationName: ps.office_name };
                }
              }
              return c;
            });
            onChange(updatedCases);
          }
        }
      })
      .catch(() => {
        showToast('error', 'Failed to load police stations list.');
      })
      .finally(() => {
        if (active) {
          setLoadingPS(false);
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOfficeId]);

  const update = (id: string, patch: Partial<SuspectCase>) => {
    onChange(
      draft.cases.map((c) => {
        if (c.id === id) {
          const updatedCase = { ...c, ...patch };
          if (patch.policeStationId) {
            const ps = policeStations.find((p) => p.id === patch.policeStationId);
            if (ps) {
              updatedCase.policeStationName = ps.office_name;
            }
          }
          return updatedCase;
        }
        return c;
      })
    );
  };

  const handleAdd = () => {
    const defaultPsId = policeStations[0]?.id || '';
    const defaultPsName = policeStations[0]?.office_name || '';
    onChange([
      ...draft.cases,
      {
        id: newRowId(),
        crimeNumber: '',
        crimeYear: new Date().getFullYear(),
        policeStationId: defaultPsId,
        policeStationName: defaultPsName,
        actSection: '',
        brief: '',
        presentStatus: PRESENT_STATUS_OPTIONS[0],
      },
    ]);
  };

  return (
    <RepeatableCardList
      title="Crime cases"
      description="Add details of the crime cases registered against the suspect."
      emptyHint="No crime cases added. Click below to add a crime case."
      addLabel="Add Crime Case"
      items={draft.cases.map((c) => ({ id: c.id || '' }))}
      onAdd={handleAdd}
      onRemove={(id) => onChange(draft.cases.filter((c) => c.id !== id))}
      renderItem={(id) => {
        const row = draft.cases.find((c) => c.id === id);
        if (!row) return null;
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <AdminFormField id={`${id}-crimeNumber`} label="Crime / FIR Number" required>
                <input
                  id={`${id}-crimeNumber`}
                  className="form-control"
                  value={row.crimeNumber}
                  onChange={(e) => update(id, { crimeNumber: e.target.value })}
                  placeholder="e.g. 101, 45/2026"
                  required
                />
              </AdminFormField>

              <AdminFormField id={`${id}-crimeYear`} label="Crime Year" required>
                <input
                  id={`${id}-crimeYear`}
                  type="number"
                  className="form-control"
                  value={row.crimeYear || ''}
                  onChange={(e) => update(id, { crimeYear: parseInt(e.target.value, 10) || new Date().getFullYear() })}
                  placeholder="e.g. 2026"
                  min={1900}
                  max={2100}
                  required
                />
              </AdminFormField>

              <AdminFormField id={`${id}-policeStationId`} label="Police station" required>
                <select
                  id={`${id}-policeStationId`}
                  className="form-control"
                  value={row.policeStationId}
                  onChange={(e) => update(id, { policeStationId: e.target.value })}
                  disabled={loadingPS}
                  required
                >
                  {loadingPS ? (
                    <option>Loading police stations...</option>
                  ) : policeStations.length === 0 ? (
                    <option value="">No police stations available</option>
                  ) : (
                    policeStations.map((ps) => (
                      <option key={ps.id} value={ps.id}>
                        {ps.office_name} ({ps.office_code})
                      </option>
                    ))
                  )}
                </select>
              </AdminFormField>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AdminFormField id={`${id}-actSection`} label="Act & Section">
                <input
                  id={`${id}-actSection`}
                  className="form-control"
                  value={row.actSection || ''}
                  onChange={(e) => update(id, { actSection: e.target.value })}
                  placeholder="e.g. IPC Sec 379, 34"
                />
              </AdminFormField>

              <AdminFormField id={`${id}-presentStatus`} label="Case Present Status">
                <select
                  id={`${id}-presentStatus`}
                  className="form-control"
                  value={row.presentStatus || ''}
                  onChange={(e) => update(id, { presentStatus: e.target.value })}
                >
                  {PRESENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </AdminFormField>
            </div>

            <AdminFormField id={`${id}-brief`} label="Brief Case Summary">
              <textarea
                id={`${id}-brief`}
                className="form-control min-h-[80px]"
                value={row.brief || ''}
                onChange={(e) => update(id, { brief: e.target.value })}
                placeholder="Describe the suspect's involvement, facts, or modus operandi..."
              />
            </AdminFormField>
          </div>
        );
      }}
    />
  );
}
