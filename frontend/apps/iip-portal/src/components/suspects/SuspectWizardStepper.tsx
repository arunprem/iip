import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import type { WizardStepId } from '../../pages/suspects/suspectTypes';
import { WIZARD_STEPS } from '../../pages/suspects/suspectFormDefaults';

interface SuspectWizardStepperProps {
  currentStep: WizardStepId;
  completed: Record<string, boolean>;
  onStepClick?: (step: WizardStepId) => void;
}

export function SuspectWizardStepper({
  currentStep,
  completed,
  onStepClick,
}: SuspectWizardStepperProps) {
  const currentIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector('.dossier-wizard-step-btn--current');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
    }
  }, [currentStep]);

  return (
    <nav ref={navRef} className="dossier-wizard-nav" aria-label="Dossier entry progress">
      <ol className="dossier-wizard-steps">
        {WIZARD_STEPS.map((step, index) => {
          const isCurrent = step.id === currentStep;
          const isPast = index < currentIndex;
          const isDone = completed[step.id] || isPast;
          const canJump = onStepClick && (isPast || isDone || index <= currentIndex);

          return (
            <li key={step.id} className="dossier-wizard-step">
              <button
                type="button"
                className={[
                  'dossier-wizard-step-btn',
                  isCurrent && 'dossier-wizard-step-btn--current',
                  isDone && 'dossier-wizard-step-btn--done',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => canJump && onStepClick?.(step.id)}
                disabled={!canJump}
                aria-current={isCurrent ? 'step' : undefined}
                title={step.description}
              >
                <span className="dossier-wizard-step-indicator" aria-hidden>
                  {isDone && !isCurrent ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                <span className="dossier-wizard-step-text">
                  <span className="dossier-wizard-step-label">{step.shortLabel}</span>
                  <span className="dossier-wizard-step-desc hidden lg:block">{step.label}</span>
                </span>
              </button>
              {index < WIZARD_STEPS.length - 1 && (
                <span
                  className={[
                    'dossier-wizard-connector',
                    index < currentIndex && 'dossier-wizard-connector--done',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
