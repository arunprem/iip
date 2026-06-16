import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Fingerprint,
  Loader2,
  Shield,
  TrendingUp,
} from 'lucide-react';

type SectionStatus = 'pending' | 'generating' | 'complete';

interface ProfileSectionProps {
  id: string;
  title: string;
  content: string;
  status: SectionStatus;
  sectionIndex: number;
}

const SECTION_ICONS: Record<string, typeof Brain> = {
  criminal_psychology: Brain,
  mo_signature: Fingerprint,
  escalation_trajectory: TrendingUp,
  actionable_intelligence: Crosshair,
};

const SECTION_BADGES: Record<string, { label: string; color: string }> = {
  criminal_psychology: { label: 'BEHAVIORAL', color: '#a78bfa' },
  mo_signature: { label: 'FORENSIC', color: '#60a5fa' },
  escalation_trajectory: { label: 'TEMPORAL', color: '#f59e0b' },
  actionable_intelligence: { label: 'TACTICAL', color: '#34d399' },
};

export function ProfileSection({
  id,
  title,
  content,
  status,
  sectionIndex,
}: ProfileSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const Icon = SECTION_ICONS[id] || Shield;
  const badge = SECTION_BADGES[id];

  const isReady = status === 'complete' || (status === 'generating' && content.length > 0);
  const showContent = isReady && !collapsed;

  return (
    <div
      className={`tp-section tp-section--${status}`}
      style={{ animationDelay: `${sectionIndex * 150}ms` }}
    >
      <button
        type="button"
        className="tp-section__header"
        onClick={() => status === 'complete' && setCollapsed((c) => !c)}
        disabled={status !== 'complete'}
      >
        <div className="tp-section__header-left">
          <div className={`tp-section__icon tp-section__icon--${status}`}>
            {status === 'generating' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Icon size={16} />
            )}
          </div>
          <span className="tp-section__title">{title}</span>
          {badge && (
            <span
              className="tp-section__badge"
              style={{ backgroundColor: `${badge.color}22`, color: badge.color, borderColor: `${badge.color}44` }}
            >
              {badge.label}
            </span>
          )}
        </div>
        <div className="tp-section__header-right">
          {status === 'pending' && (
            <span className="tp-section__status-dot tp-section__status-dot--pending" />
          )}
          {status === 'generating' && (
            <span className="tp-section__status-text">Analyzing…</span>
          )}
          {status === 'complete' && (
            collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />
          )}
        </div>
      </button>

      {status === 'pending' && (
        <div className="tp-section__skeleton">
          <div className="tp-section__skeleton-line tp-section__skeleton-line--w80" />
          <div className="tp-section__skeleton-line tp-section__skeleton-line--w60" />
          <div className="tp-section__skeleton-line tp-section__skeleton-line--w90" />
        </div>
      )}

      {showContent && (
        <div className="tp-section__content">
          <div className="tp-section__text">
            {content}
            {status === 'generating' && (
              <span className="tp-cursor" aria-hidden>▊</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
