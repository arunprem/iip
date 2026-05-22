import Swal from 'sweetalert2';

const swalBase = {
  buttonsStyling: true,
  customClass: {
    popup: 'rounded-xl border border-iip-border shadow-lg',
    title: 'text-iip-text text-lg font-semibold',
    htmlContainer: 'text-iip-text-muted text-sm',
    confirmButton: 'rounded-lg px-4 py-2 text-sm font-medium',
    cancelButton: 'rounded-lg px-4 py-2 text-sm font-medium',
  },
};

export async function confirmDeleteMenu(menu: {
  label: string;
  menu_key: string;
  is_group: boolean;
  childCount: number;
}): Promise<boolean> {
  const groupNote = menu.is_group ? '<p class="mt-1">This is a <strong>group header</strong>.</p>' : '';
  const childNote =
    menu.childCount > 0
      ? `<p class="mt-2 text-amber-600">It has <strong>${menu.childCount}</strong> child menu item(s) that will also be removed.</p>`
      : '';

  const result = await Swal.fire({
    ...swalBase,
    title: 'Delete menu item?',
    html: `
      <p>Remove <strong>${escapeHtml(menu.label)}</strong> (<code>${escapeHtml(menu.menu_key)}</code>)?</p>
      ${groupNote}
      <p class="mt-2">This cannot be undone.</p>
      ${childNote}
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });

  return result.isConfirmed;
}

export async function confirmDeletePrivilege(priv: {
  name: string;
  privilege_code: string;
  privilege_type: string;
  linkedMenuCount?: number;
  actionCount?: number;
}): Promise<boolean> {
  const menuNote =
    priv.privilege_type === 'MENU' && (priv.linkedMenuCount ?? 0) > 0
      ? `<p class="mt-2 text-amber-600"><strong>${priv.linkedMenuCount}</strong> menu item(s) are linked to this privilege and will lose that link.</p>`
      : '';
  const actionNote =
    priv.privilege_type === 'DATA' && (priv.actionCount ?? 0) > 0
      ? `<p class="mt-2 text-amber-600"><strong>${priv.actionCount}</strong> custom action(s) and any role grants for them will be removed.</p>`
      : '';

  const result = await Swal.fire({
    ...swalBase,
    title: 'Delete privilege?',
    html: `
      <p>Remove <strong>${escapeHtml(priv.name)}</strong> (<code>${escapeHtml(priv.privilege_code)}</code>)?</p>
      <p class="mt-2">Role grants for this privilege will be removed. This cannot be undone.</p>
      ${menuNote}
      ${actionNote}
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });

  return result.isConfirmed;
}

export async function confirmDeleteAction(action: {
  action_code: string;
  action_label: string;
  privilege_code: string;
  grantedRoleCount: number;
}): Promise<boolean> {
  const grantNote =
    action.grantedRoleCount > 0
      ? `<p class="mt-2 text-amber-600">This action is granted to <strong>${action.grantedRoleCount}</strong> role(s). Those grants will be removed.</p>`
      : '';

  const result = await Swal.fire({
    ...swalBase,
    title: 'Delete custom action?',
    html: `
      <p>Remove action <strong>${escapeHtml(action.action_label)}</strong> (<code>${escapeHtml(action.action_code)}</code>) from <code>${escapeHtml(action.privilege_code)}</code>?</p>
      <p class="mt-2">This cannot be undone.</p>
      ${grantNote}
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete action',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });

  return result.isConfirmed;
}

export async function confirmDeleteRole(role: {
  role_name: string;
  description: string;
}): Promise<boolean> {
  const result = await Swal.fire({
    ...swalBase,
    title: 'Delete role?',
    html: `
      <p>Remove role <strong>${escapeHtml(role.role_name)}</strong>?</p>
      <p class="mt-2 text-left text-iip-text-muted">${escapeHtml(role.description)}</p>
      <p class="mt-2">Menu and data grants for this role will be removed. This cannot be undone.</p>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete role',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });

  return result.isConfirmed;
}

export async function showRoleDeleteBlocked(blockers: string[]): Promise<void> {
  const items = blockers
    .map((b) => `<li class="text-left">${escapeHtml(b)}</li>`)
    .join('');

  await Swal.fire({
    ...swalBase,
    title: 'Cannot delete role',
    html: `
      <p>Clear the assignments below, then try delete again.</p>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm">${items}</ul>
    `,
    icon: 'error',
    confirmButtonText: 'OK',
    confirmButtonColor: '#465FFF',
  });
}

export async function confirmDeleteOffice(office: {
  office_name: string;
  office_code: string;
  descendant_count: number;
}): Promise<boolean> {
  const subtreeNote =
    office.descendant_count > 0
      ? `<p class="mt-2 text-amber-600">This will also delete <strong>${office.descendant_count}</strong> descendant office(s).</p>`
      : '';

  const result = await Swal.fire({
    ...swalBase,
    title: 'Delete office?',
    html: `
      <p>Remove <strong>${escapeHtml(office.office_name)}</strong> (<code>${escapeHtml(office.office_code)}</code>)?</p>
      ${subtreeNote}
      <p class="mt-2">This cannot be undone.</p>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });

  return result.isConfirmed;
}

export async function confirmImportLegacyOffices(replace: boolean): Promise<boolean> {
  const result = await Swal.fire({
    ...swalBase,
    title: replace ? 'Re-import Kerala units?' : 'Import Kerala units?',
    html: replace
      ? '<p>This removes previously imported legacy offices and reloads ~1,200 units from the bundled export. HQ and manually created offices are kept.</p>'
      : '<p>Load the full Kerala police unit hierarchy (~1,200 offices) from the legacy export. Safe to run once; already-imported rows are skipped.</p>',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: replace ? 'Re-import' : 'Import',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#465FFF',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });
  return result.isConfirmed;
}

export async function showOfficeDeleteBlocked(blockers: string[]): Promise<void> {
  const items = blockers
    .map((b) => `<li class="text-left">${escapeHtml(b)}</li>`)
    .join('');

  await Swal.fire({
    ...swalBase,
    title: 'Cannot delete office',
    html: `
      <p>Resolve the issues below, then try again.</p>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm">${items}</ul>
    `,
    icon: 'error',
    confirmButtonText: 'OK',
    confirmButtonColor: '#465FFF',
  });
}

export async function confirmDeleteReference(item: {
  title: string;
  label: string;
  detail?: string;
}): Promise<boolean> {
  const detailHtml = item.detail
    ? `<p class="mt-2 text-sm text-slate-600">${escapeHtml(item.detail)}</p>`
    : '';

  const result = await Swal.fire({
    ...swalBase,
    title: item.title,
    html: `
      <p>Remove <strong>${escapeHtml(item.label)}</strong>?</p>
      ${detailHtml}
      <p class="mt-2">This cannot be undone.</p>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, delete',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });

  return result.isConfirmed;
}

export async function showReferenceDeleteBlocked(
  title: string,
  blockers: string[]
): Promise<void> {
  const items = blockers
    .map((b) => `<li class="text-left">${escapeHtml(b)}</li>`)
    .join('');

  await Swal.fire({
    ...swalBase,
    title,
    html: `
      <p>Resolve the issues below, then try again.</p>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm">${items}</ul>
    `,
    icon: 'error',
    confirmButtonText: 'OK',
    confirmButtonColor: '#465FFF',
  });
}

export async function confirmRemoveUserOfficeAssignment(details: {
  officeName: string;
  officeCode?: string;
  roleName?: string;
  isEmpty?: boolean;
}): Promise<boolean> {
  const html = details.isEmpty
    ? '<p>Remove this empty office assignment row?</p>'
    : (() => {
        const officeLabel = details.officeCode
          ? `<strong>${escapeHtml(details.officeName)}</strong> (<code>${escapeHtml(details.officeCode)}</code>)`
          : `<strong>${escapeHtml(details.officeName)}</strong>`;
        const roleNote = details.roleName
          ? `<p class="mt-2">Role: <strong>${escapeHtml(details.roleName)}</strong></p>`
          : '';
        return `
          <p>Remove office access for ${officeLabel}?</p>
          ${roleNote}
          <p class="mt-2 text-iip-text-muted">Save the user form to apply this change on the server.</p>
        `;
      })();

  const result = await Swal.fire({
    ...swalBase,
    title: 'Remove office assignment?',
    html,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, remove',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    focusCancel: true,
    reverseButtons: true,
  });

  return result.isConfirmed;
}

export async function showPrivilegeDeleteBlocked(blockers: string[]): Promise<void> {
  const items = blockers
    .map((b) => `<li class="text-left">${escapeHtml(b)}</li>`)
    .join('');

  await Swal.fire({
    ...swalBase,
    title: 'Cannot delete privilege',
    html: `
      <p>Clear the assignments below, then try delete again.</p>
      <ul class="mt-3 list-disc pl-5 space-y-2 text-sm">${items}</ul>
    `,
    icon: 'error',
    confirmButtonText: 'OK',
    confirmButtonColor: '#465FFF',
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
