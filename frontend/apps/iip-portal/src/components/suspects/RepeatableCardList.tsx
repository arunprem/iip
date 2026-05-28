import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { AdminButton } from '../admin/AdminButton';

interface RepeatableCardListProps {
  title: string;
  description?: string;
  emptyHint: string;
  addLabel: string;
  items: { id: string }[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  renderItem: (id: string, index: number) => ReactNode;
}

export function RepeatableCardList({
  title,
  description,
  emptyHint,
  addLabel,
  items,
  onAdd,
  onRemove,
  renderItem,
}: RepeatableCardListProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-iip-text">{title}</h3>
          {description && <p className="text-xs text-iip-text-muted mt-0.5">{description}</p>}
        </div>
        <AdminButton type="button" variant="secondary" size="sm" onClick={onAdd}>
          <Plus size={16} />
          {addLabel}
        </AdminButton>
      </div>

      {items.length === 0 ? (
        <div className="dossier-repeatable-empty">
          <p>{emptyHint}</p>
          <AdminButton type="button" variant="ghost" size="sm" onClick={onAdd}>
            <Plus size={16} />
            {addLabel}
          </AdminButton>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={item.id} className="dossier-repeatable-card">
              <div className="dossier-repeatable-card-header">
                <span className="text-xs font-semibold text-iip-text-muted uppercase tracking-wide">
                  #{index + 1}
                </span>
                <AdminButton
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="text-red-600 dark:text-red-400"
                  onClick={() => onRemove(item.id)}
                  aria-label={`Remove entry ${index + 1}`}
                >
                  <Trash2 size={14} />
                  Remove
                </AdminButton>
              </div>
              <div className="dossier-repeatable-card-body">{renderItem(item.id, index)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
