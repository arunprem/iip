import { AdminFormField } from '../../admin/AdminFormField';
import type { SocialPlatform, SuspectDossierDraft, SuspectSocialAccount } from '../../../pages/suspects/suspectTypes';
import { RepeatableCardList } from '../RepeatableCardList';
import { newRowId } from '../../../pages/suspects/suspectFormUtils';

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: 'FACEBOOK', label: 'Facebook' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'TWITTER', label: 'Twitter / X' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'OTHER', label: 'Other' },
];

interface SuspectSocialStepProps {
  draft: SuspectDossierDraft;
  onChange: (accounts: SuspectSocialAccount[]) => void;
}

export function SuspectSocialStep({ draft, onChange }: SuspectSocialStepProps) {
  const update = (id: string, patch: Partial<SuspectSocialAccount>) => {
    onChange(draft.socialAccounts.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <RepeatableCardList
      title="Social media accounts"
      description="Profile URL, username, or phone linked to the account."
      emptyHint="No social accounts recorded. Skip if none known."
      addLabel="Add account"
      items={draft.socialAccounts}
      onAdd={() =>
        onChange([
          ...draft.socialAccounts,
          { id: newRowId(), platform: 'FACEBOOK', details: '' },
        ])
      }
      onRemove={(id) => onChange(draft.socialAccounts.filter((s) => s.id !== id))}
      renderItem={(id) => {
        const row = draft.socialAccounts.find((s) => s.id === id);
        if (!row) return null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AdminFormField id={`${id}-platform`} label="Social account">
              <select
                id={`${id}-platform`}
                className="form-control"
                value={row.platform}
                onChange={(e) => update(id, { platform: e.target.value as SocialPlatform })}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </AdminFormField>
            <AdminFormField id={`${id}-details`} label="Account details">
              <input
                id={`${id}-details`}
                className="form-control"
                value={row.details}
                onChange={(e) => update(id, { details: e.target.value })}
                placeholder="@username or profile URL"
              />
            </AdminFormField>
          </div>
        );
      }}
    />
  );
}
