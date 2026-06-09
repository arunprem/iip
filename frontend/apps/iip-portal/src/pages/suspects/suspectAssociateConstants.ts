/** Associate / knowledge-graph constants (standalone — no imports). */

export type AssociateType =
  | 'ACCOMPLICE'
  | 'HANDLER'
  | 'CONTACT'
  | 'FINANCIER'
  | 'FAMILY_LINK'
  | 'OTHER';

export const ASSOCIATION_TYPE_OPTIONS: { value: AssociateType; label: string }[] = [
  { value: 'ACCOMPLICE', label: 'Accomplice' },
  { value: 'HANDLER', label: 'Handler' },
  { value: 'CONTACT', label: 'Contact' },
  { value: 'FINANCIER', label: 'Financier' },
  { value: 'FAMILY_LINK', label: 'Family link' },
  { value: 'OTHER', label: 'Other' },
];
