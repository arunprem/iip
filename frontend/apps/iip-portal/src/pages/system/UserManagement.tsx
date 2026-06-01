import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Pencil,
  Plus,
  Save,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminFormField } from '../../components/admin/AdminFormField';
import { AdminInteractiveDataTable } from '../../components/admin/AdminInteractiveDataTable';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminTipBanner } from '../../components/admin/AdminTipBanner';
import {
  UserOfficeAssignmentsEditor,
  assignmentsFromUser,
  emptyAssignmentRow,
  type OfficeAssignmentDraft,
} from '../../components/admin/UserOfficeAssignmentsEditor';
import { getApiErrorMessage, useIamRoles } from '../../hooks/useIamRoles';
import { useAuthStore } from '../../stores/authStore';
import { showToast } from '../../stores/toastStore';
import { confirmDeleteReference } from '../../utils/confirmDialog';

const CLEARANCE_LEVELS = [
  'UNCLASSIFIED',
  'RESTRICTED',
  'CONFIDENTIAL',
  'SECRET',
  'TOP SECRET',
] as const;

interface OfficeAssignment {
  office_id: string;
  office_code: string;
  office_name: string;
  role_id: string;
  role_name: string;
}

interface UserRow {
  user_id: string;
  username: string;
  email: string;
  full_name: string;
  badge_number: string;
  department: string;
  clearance_level: string;
  is_active: boolean;
  legacy_roles: string[];
  office_assignments: OfficeAssignment[];
}

interface OfficeFlat {
  office_id: string;
  office_code: string;
  office_name: string;
}

const emptyProfile = {
  username: '',
  email: '',
  full_name: '',
  badge_number: '',
  department: '',
  clearance_level: 'UNCLASSIFIED' as (typeof CLEARANCE_LEVELS)[number],
  password: '',
};

function userToProfile(user: UserRow) {
  return {
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    badge_number: user.badge_number,
    department: user.department,
    clearance_level: user.clearance_level as (typeof CLEARANCE_LEVELS)[number],
    password: '',
  };
}

function formatOfficeSummary(assignments: OfficeAssignment[]): string {
  if (!assignments.length) return '—';
  return assignments
    .map((a) => `${a.office_name} (${a.role_name})`)
    .join('; ');
}

function buildAssignmentPayload(rows: OfficeAssignmentDraft[]) {
  return rows
    .filter((r) => r.office_id && r.role_id)
    .map((r) => ({ office_id: r.office_id, role_id: r.role_id }));
}

export default function UserManagement() {
  const queryClient = useQueryClient();
  const currentOfficeId = useAuthStore((s) => s.currentOfficeId);
  const currentUserId = useAuthStore((s) => s.user?.user_id);
  const formPanelRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState(emptyProfile);
  const [assignments, setAssignments] = useState<OfficeAssignmentDraft[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const { data: roles = [] } = useIamRoles();

  const { data: offices = [] } = useQuery({
    queryKey: ['admin-offices-flat', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<OfficeFlat[]>('/iam/offices/flat', {
        params: { include_inactive: false },
      });
      return res.data;
    },
  });

  const {
    data: usersResponse,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['admin-users', currentOfficeId],
    queryFn: async () => {
      const res = await apiClient.get<{
        users: UserRow[];
        total: number;
      }>('/iam/users/', { params: { page: 1, page_size: 500 } });
      return res.data;
    },
  });

  const users = usersResponse?.users ?? [];
  const isEditing = editingUserId != null;

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (activeFilter === 'active' && !u.is_active) return false;
      if (activeFilter === 'inactive' && u.is_active) return false;
      return true;
    });
  }, [users, activeFilter]);

  const resetForm = () => {
    setProfile(emptyProfile);
    setAssignments([]);
    setEditingUserId(null);
  };

  const startCreate = () => {
    resetForm();
    setAssignments([emptyAssignmentRow()]);
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const startEdit = (user: UserRow) => {
    setEditingUserId(user.user_id);
    setProfile(userToProfile(user));
    setAssignments(
      user.office_assignments.length
        ? assignmentsFromUser(user.office_assignments)
        : [emptyAssignmentRow()]
    );
    formPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    void queryClient.invalidateQueries({ queryKey: ['iam-users'] });
  };

  const refreshSelfSessionIfNeeded = async (userId: string) => {
    if (userId !== currentUserId) return;
    await useAuthStore.getState().refreshSessionProfile();
    void queryClient.invalidateQueries({ queryKey: ['nav-menus'] });
  };

  const assignmentPayload = buildAssignmentPayload(assignments);
  const hasPartialAssignment = assignments.some(
    (r) => Boolean(r.office_id) !== Boolean(r.role_id)
  );
  const hasDuplicateOffices = useMemo(() => {
    const seen = new Set<string>();
    for (const row of assignments) {
      if (!row.office_id) continue;
      if (seen.has(row.office_id)) return true;
      seen.add(row.office_id);
    }
    return false;
  }, [assignments]);

  const canSaveProfile =
    profile.full_name.trim() &&
    profile.email.trim() &&
    profile.badge_number.trim() &&
    profile.department.trim() &&
    (isEditing || profile.username.trim());

  const canSave = canSaveProfile && !hasPartialAssignment && !hasDuplicateOffices;

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post<UserRow & { initial_password?: string }>(
        '/iam/users/',
        {
          username: profile.username.trim(),
          email: profile.email.trim(),
          full_name: profile.full_name.trim(),
          badge_number: profile.badge_number.trim(),
          department: profile.department.trim(),
          clearance_level: profile.clearance_level,
          password: profile.password.trim() || undefined,
          office_assignments: assignmentPayload,
        }
      );
      return res.data;
    },
    onSuccess: async (data) => {
      resetForm();
      invalidate();
      await refreshSelfSessionIfNeeded(data.user_id);
      if (data.initial_password) {
        showToast(
          'success',
          `User created. Temporary password: ${data.initial_password}`,
          12000
        );
      } else {
        showToast('success', 'User created successfully.');
      }
    },
    onError: (err) => showToast('error', getApiErrorMessage(err)),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingUserId) return;
      await apiClient.patch(`/iam/users/${editingUserId}`, {
        email: profile.email.trim(),
        full_name: profile.full_name.trim(),
        badge_number: profile.badge_number.trim(),
        department: profile.department.trim(),
        clearance_level: profile.clearance_level,
        password: profile.password.trim() || undefined,
        office_assignments: assignmentPayload,
      });
    },
    onSuccess: async () => {
      const updatedId = editingUserId;
      resetForm();
      invalidate();
      if (updatedId) await refreshSelfSessionIfNeeded(updatedId);
      showToast('success', 'User updated successfully.');
    },
    onError: (err) => showToast('error', getApiErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, activate }: { userId: string; activate: boolean }) => {
      const path = activate ? 'activate' : 'deactivate';
      await apiClient.post(`/iam/users/${userId}/${path}`);
    },
    onSuccess: async (_data, vars) => {
      if (editingUserId === vars.userId && !vars.activate) resetForm();
      invalidate();
      await refreshSelfSessionIfNeeded(vars.userId);
      showToast('success', vars.activate ? 'User activated.' : 'User deactivated.');
    },
    onError: (err) => showToast('error', getApiErrorMessage(err)),
  });

  const handleToggleActive = async (user: UserRow) => {
    if (user.is_active) {
      if (user.user_id === currentUserId) {
        showToast('warning', 'You cannot deactivate your own account.');
        return;
      }
      const ok = await confirmDeleteReference({
        title: 'Deactivate user?',
        label: `${user.full_name} (${user.username})`,
        detail: 'They will not be able to sign in until reactivated.',
      });
      if (ok) toggleActiveMutation.mutate({ userId: user.user_id, activate: false });
    } else {
      toggleActiveMutation.mutate({ userId: user.user_id, activate: true });
    }
  };

  const formPending = createMutation.isPending || updateMutation.isPending;
  const showForm = isEditing || profile.username !== '' || assignments.length > 0;

  return (
    <AdminPageLayout
      title="User Management"
      description="Create and maintain personnel accounts. Assign each user to one or more offices with a role per office."
      icon={Users}
    >
      <AdminTipBanner>
        <strong>Office access</strong> sets which unit the user works in and which role applies there. Administration
        menus only appear when the <strong>selected office</strong> has the SYSTEM_ADMIN or IT_ADMIN role. Accounts
        with global admin privileges must keep at least one office assigned that role. Leave password blank on create
        to auto-generate a temporary password (shown once).
      </AdminTipBanner>

      <div className="flex flex-wrap gap-2 mb-4">
        <AdminButton variant="primary" size="sm" onClick={startCreate}>
          <UserPlus size={15} aria-hidden />
          New user
        </AdminButton>
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          Refresh
        </AdminButton>
      </div>

      {showForm && (
        <div className="dashboard-card mb-4 overflow-hidden">
          <div ref={formPanelRef} className="admin-form-panel scroll-mt-4" tabIndex={-1}>
            <div className="admin-form-panel-header">
              <p className="text-sm font-semibold text-iip-text">
                {isEditing ? `Edit user — ${profile.full_name || profile.username}` : 'New user'}
              </p>
              <p className="text-xs text-iip-text-muted mt-1">
                {isEditing
                  ? 'Username cannot be changed. Update profile and office assignments below.'
                  : 'Enter account details, then assign offices and roles.'}
              </p>
            </div>

            <div className="admin-form-panel-body space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AdminFormField id="user-username" label="Username" required={!isEditing}>
                  <input
                    id="user-username"
                    className="form-control"
                    value={profile.username}
                    onChange={(e) => setProfile((s) => ({ ...s, username: e.target.value }))}
                    readOnly={isEditing}
                    disabled={isEditing}
                    autoComplete="off"
                    placeholder="e.g. j.doe"
                  />
                </AdminFormField>
                <AdminFormField id="user-pen" label="PEN number" required>
                  <input
                    id="user-pen"
                    className="form-control font-mono"
                    value={profile.badge_number}
                    onChange={(e) => setProfile((s) => ({ ...s, badge_number: e.target.value }))}
                    placeholder="e.g. KP-12345"
                  />
                </AdminFormField>
                <AdminFormField id="user-full-name" label="Full name" required>
                  <input
                    id="user-full-name"
                    className="form-control"
                    value={profile.full_name}
                    onChange={(e) => setProfile((s) => ({ ...s, full_name: e.target.value }))}
                  />
                </AdminFormField>
                <AdminFormField id="user-email" label="Email" required>
                  <input
                    id="user-email"
                    type="email"
                    className="form-control"
                    value={profile.email}
                    onChange={(e) => setProfile((s) => ({ ...s, email: e.target.value }))}
                  />
                </AdminFormField>
                <AdminFormField id="user-department" label="Department" required>
                  <input
                    id="user-department"
                    className="form-control"
                    value={profile.department}
                    onChange={(e) => setProfile((s) => ({ ...s, department: e.target.value }))}
                  />
                </AdminFormField>
                <AdminFormField id="user-clearance" label="Clearance level">
                  <select
                    id="user-clearance"
                    className="form-control py-2.5"
                    value={profile.clearance_level}
                    onChange={(e) =>
                      setProfile((s) => ({
                        ...s,
                        clearance_level: e.target.value as (typeof CLEARANCE_LEVELS)[number],
                      }))
                    }
                  >
                    {CLEARANCE_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </AdminFormField>
                <AdminFormField
                  id="user-password"
                  label={isEditing ? 'New password' : 'Password'}
                  hint={
                    isEditing
                      ? 'Leave blank to keep current password.'
                      : 'Leave blank to auto-generate a temporary password.'
                  }
                  className="md:col-span-2"
                >
                  <input
                    id="user-password"
                    type="password"
                    className="form-control"
                    value={profile.password}
                    onChange={(e) => setProfile((s) => ({ ...s, password: e.target.value }))}
                    autoComplete="new-password"
                  />
                </AdminFormField>
              </div>

              {hasPartialAssignment && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Complete both office and role for each row, or remove incomplete rows.
                </p>
              )}
              {hasDuplicateOffices && (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Each office can only appear once. Use a different office per row.
                </p>
              )}

              <UserOfficeAssignmentsEditor
                assignments={assignments}
                offices={offices}
                roles={roles.map((r) => ({ role_id: r.role_id, role_name: r.role_name }))}
                onChange={setAssignments}
                disabled={formPending}
              />
            </div>

            <div className="admin-form-panel-footer">
              <AdminButton variant="ghost" size="sm" onClick={resetForm} disabled={formPending}>
                <X size={15} aria-hidden />
                Cancel
              </AdminButton>
              <span className="admin-form-actions-spacer flex-1" aria-hidden />
              <AdminButton
                variant="primary"
                size="sm"
                disabled={formPending || !canSave}
                onClick={() => (isEditing ? updateMutation.mutate() : createMutation.mutate())}
              >
                {isEditing ? <Save size={15} aria-hidden /> : <Plus size={15} aria-hidden />}
                {formPending ? 'Saving…' : isEditing ? 'Save changes' : 'Create user'}
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-card overflow-hidden">
        <div className="px-5 py-4 border-b border-iip-border">
          <p className="text-sm font-semibold text-iip-text">All users</p>
          <p className="text-xs text-iip-text-muted mt-1">
            {usersResponse?.total ?? 0} accounts — search, sort, and filter below.
          </p>
          {isError && (
            <p className="text-sm text-red-600 mt-2">{getApiErrorMessage(error)}</p>
          )}
        </div>

        <AdminInteractiveDataTable
          isLoading={isLoading}
          data={filteredUsers}
          keyField={(u) => u.user_id}
          searchPlaceholder="Search by name, username, PEN number, email…"
          defaultSort={{ key: 'name', direction: 'asc' }}
          getSearchText={(u) =>
            [
              u.username,
              u.full_name,
              u.badge_number,
              u.email,
              u.department,
              formatOfficeSummary(u.office_assignments),
            ].join(' ')
          }
          emptyMessage="No users found."
          filters={[
            {
              id: 'active',
              label: 'Status',
              value: activeFilter,
              onChange: setActiveFilter,
              options: [
                { value: 'all', label: 'All statuses' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ],
            },
          ]}
          columns={[
            {
              key: 'pen',
              header: 'PEN number',
              sortable: true,
              sortValue: (u) => u.badge_number,
              className: 'w-28 font-mono text-sm',
              render: (u) => u.badge_number,
            },
            {
              key: 'name',
              header: 'User',
              sortable: true,
              sortValue: (u) => u.full_name,
              render: (u) => (
                <div>
                  <p className="font-medium text-iip-text">{u.full_name}</p>
                  <p className="text-xs text-iip-text-muted">{u.username}</p>
                </div>
              ),
            },
            {
              key: 'department',
              header: 'Department',
              sortable: true,
              sortValue: (u) => u.department,
              className: 'hidden lg:table-cell max-w-[160px]',
              render: (u) => (
                <span className="text-sm text-iip-text-muted line-clamp-2">{u.department}</span>
              ),
            },
            {
              key: 'clearance',
              header: 'Clearance',
              sortable: true,
              sortValue: (u) => u.clearance_level,
              className: 'hidden md:table-cell w-32',
              render: (u) => (
                <span className="text-xs font-medium px-2 py-0.5 rounded bg-iip-primary/10 text-iip-primary">
                  {u.clearance_level}
                </span>
              ),
            },
            {
              key: 'offices',
              header: 'Office roles',
              render: (u) =>
                u.office_assignments.length ? (
                  <ul className="text-xs text-iip-text space-y-0.5 max-w-md">
                    {u.office_assignments.map((a) => (
                      <li key={a.office_id}>
                        <span className="font-medium">{a.office_name}</span>
                        <span className="text-iip-text-muted"> — {a.role_name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-iip-text-muted text-sm">No offices</span>
                ),
            },
            {
              key: 'active',
              header: 'Active',
              className: 'text-center w-24',
              sortable: true,
              sortValue: (u) => u.is_active,
              render: (u) => (
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={u.is_active}
                  disabled={toggleActiveMutation.isPending}
                  onChange={() => void handleToggleActive(u)}
                />
              ),
            },
            {
              key: 'actions',
              header: 'Actions',
              className: 'text-right w-[200px]',
              render: (u) => (
                <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                  <AdminButton
                    variant={editingUserId === u.user_id ? 'active' : 'ghost'}
                    size="xs"
                    onClick={() => startEdit(u)}
                  >
                    <Pencil size={14} aria-hidden />
                    Edit
                  </AdminButton>
                  {!u.is_active ? (
                    <AdminButton
                      variant="secondary"
                      size="xs"
                      onClick={() =>
                        toggleActiveMutation.mutate({ userId: u.user_id, activate: true })
                      }
                      disabled={toggleActiveMutation.isPending}
                    >
                      <UserCheck size={14} aria-hidden />
                      Activate
                    </AdminButton>
                  ) : (
                    <AdminButton
                      variant="ghost"
                      size="xs"
                      onClick={() => void handleToggleActive(u)}
                      disabled={
                        toggleActiveMutation.isPending || u.user_id === currentUserId
                      }
                    >
                      <UserMinus size={14} aria-hidden />
                      Deactivate
                    </AdminButton>
                  )}
                </div>
              ),
            },
          ]}
        />
      </div>
    </AdminPageLayout>
  );
}
