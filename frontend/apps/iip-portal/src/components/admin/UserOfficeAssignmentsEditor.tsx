import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { AdminButton } from './AdminButton';
import { OfficeSearchPicker, type OfficeSearchOption } from './OfficeSearchPicker';

export type OfficeOption = OfficeSearchOption;

export interface RoleOption {
  role_id: string;
  role_name: string;
}

export interface OfficeAssignmentDraft {
  key: string;
  office_id: string;
  role_id: string;
}

interface UserOfficeAssignmentsEditorProps {
  assignments: OfficeAssignmentDraft[];
  offices: OfficeOption[];
  roles: RoleOption[];
  onChange: (next: OfficeAssignmentDraft[]) => void;
  disabled?: boolean;
}

let rowKey = 0;
function newRowKey() {
  rowKey += 1;
  return `assign-${rowKey}`;
}

export function assignmentsFromUser(
  items: { office_id: string; role_id: string }[]
): OfficeAssignmentDraft[] {
  return items.map((a) => ({
    key: newRowKey(),
    office_id: a.office_id,
    role_id: a.role_id,
  }));
}

export function emptyAssignmentRow(): OfficeAssignmentDraft {
  return { key: newRowKey(), office_id: '', role_id: '' };
}

export function UserOfficeAssignmentsEditor({
  assignments,
  offices,
  roles,
  onChange,
  disabled = false,
}: UserOfficeAssignmentsEditorProps) {
  const officeById = useMemo(() => {
    const map = new Map<string, OfficeOption>();
    for (const o of offices) map.set(o.office_id, o);
    return map;
  }, [offices]);

  const usedOfficeIds = useMemo(
    () => new Set(assignments.map((a) => a.office_id).filter(Boolean)),
    [assignments]
  );

  const updateRow = (key: string, patch: Partial<OfficeAssignmentDraft>) => {
    onChange(assignments.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    onChange(assignments.filter((row) => row.key !== key));
  };

  const addRow = () => {
    onChange([...assignments, emptyAssignmentRow()]);
  };

  const duplicateOfficeKeys = useMemo(() => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const row of assignments) {
      if (!row.office_id) continue;
      if (seen.has(row.office_id)) dupes.add(row.office_id);
      seen.add(row.office_id);
    }
    return dupes;
  }, [assignments]);

  const excludeForRow = (row: OfficeAssignmentDraft) => {
    const excluded = new Set(usedOfficeIds);
    if (row.office_id) excluded.delete(row.office_id);
    return excluded;
  };

  return (
    <div className="admin-user-assignments">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-semibold text-iip-text">Office access</p>
          <p className="text-xs text-iip-text-muted mt-0.5">
            Search by unit name or short code (e.g. &quot;PARUR&quot;, &quot;PHQ&quot;). One role per office.
          </p>
        </div>
        <AdminButton
          variant="secondary"
          size="sm"
          type="button"
          onClick={addRow}
          disabled={disabled}
        >
          <Plus size={15} aria-hidden />
          Add office
        </AdminButton>
      </div>

      {duplicateOfficeKeys.size > 0 && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Each office can only be assigned once. Remove duplicate office rows.
        </p>
      )}

      {assignments.length === 0 ? (
        <p className="text-sm text-iip-text-muted rounded-lg border border-dashed border-iip-border px-4 py-6 text-center">
          No offices assigned yet. Add at least one office so the user can sign in with a scoped role.
        </p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((row, index) => {
            const isDuplicate = row.office_id && duplicateOfficeKeys.has(row.office_id);
            return (
              <li
                key={row.key}
                className={`admin-user-assignment-row rounded-lg border p-3 ${
                  isDuplicate
                    ? 'border-amber-400 bg-amber-50/50'
                    : 'border-iip-border bg-iip-bg/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-medium text-iip-text-muted">
                    Assignment {index + 1}
                  </span>
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    type="button"
                    onClick={() => removeRow(row.key)}
                    disabled={disabled}
                    aria-label={`Remove assignment ${index + 1}`}
                  >
                    <Trash2 size={14} aria-hidden />
                    Remove
                  </AdminButton>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-iip-text-muted font-medium">Office</span>
                    <OfficeSearchPicker
                      value={row.office_id}
                      offices={offices}
                      excludeOfficeIds={excludeForRow(row)}
                      disabled={disabled}
                      onChange={(officeId) =>
                        updateRow(row.key, {
                          office_id: officeId,
                          role_id: officeId ? row.role_id : '',
                        })
                      }
                    />
                    {row.office_id && !officeById.has(row.office_id) && (
                      <span className="text-amber-700">Office no longer active in directory.</span>
                    )}
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-iip-text-muted font-medium">Role in this office</span>
                    <select
                      className="form-control py-2 text-sm min-h-[42px]"
                      value={row.role_id}
                      onChange={(e) => updateRow(row.key, { role_id: e.target.value })}
                      disabled={disabled || !row.office_id}
                    >
                      <option value="">Select role…</option>
                      {roles.map((r) => (
                        <option key={r.role_id} value={r.role_id}>
                          {r.role_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
