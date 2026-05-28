import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  FileSearch,
  Keyboard,
  Save,
  Trash2,
} from 'lucide-react';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminSectionCard } from '../../components/admin/AdminSectionCard';
import { AdminTipBanner } from '../../components/admin/AdminTipBanner';
import { SuspectWizardStepper } from '../../components/suspects/SuspectWizardStepper';
import { SuspectAddressStep } from '../../components/suspects/steps/SuspectAddressStep';
import { SuspectContactsStep } from '../../components/suspects/steps/SuspectContactsStep';
import { SuspectIdentityStep } from '../../components/suspects/steps/SuspectIdentityStep';
import { SuspectPhotoStep } from '../../components/suspects/steps/SuspectPhotoStep';
import { SuspectRelativesStep } from '../../components/suspects/steps/SuspectRelativesStep';
import { SuspectReviewStep } from '../../components/suspects/steps/SuspectReviewStep';
import { SuspectSocialStep } from '../../components/suspects/steps/SuspectSocialStep';
import { discardSuspectDraftPhotos } from '../../api/suspectFaces';
import { showToast } from '../../stores/toastStore';
import {
  DOSSIER_DRAFT_STORAGE_KEY,
  WIZARD_STEPS,
  emptyDossierDraft,
} from './suspectFormDefaults';
import { hasValidatedFrontPhoto, photosStepBlockedReason, stepCompletion } from './suspectFormUtils';
import type { SuspectDossierDraft, WizardStepId } from './suspectTypes';

function loadDraft(): SuspectDossierDraft {
  try {
    const raw = localStorage.getItem(DOSSIER_DRAFT_STORAGE_KEY);
    if (!raw) return emptyDossierDraft();
    const parsed = JSON.parse(raw) as Partial<SuspectDossierDraft>;
    const base = emptyDossierDraft();
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!parsed.dossierDraftId || !uuidRe.test(parsed.dossierDraftId) || !Array.isArray(parsed.photos)) {
      return { ...base, ...parsed, dossierDraftId: base.dossierDraftId, photos: parsed.photos ?? base.photos };
    }
    const photos = parsed.photos.map((p) => {
      let slot = uuidRe.test(p.id) ? p : { ...p, id: crypto.randomUUID() };
      if (
        slot.previewUrl?.startsWith('blob:') ||
        slot.previewUrl?.startsWith('data:')
      ) {
        slot = { ...slot, previewUrl: null };
      }
      if (slot.status === 'uploading') {
        slot = {
          ...slot,
          status: 'error',
          previewUrl: null,
          fileName: null,
          errorMessage:
            'A previous upload was interrupted (refresh or server restart). Please upload again.',
        };
      }
      return slot;
    });
    return { ...base, ...parsed, photos };
  } catch {
    return emptyDossierDraft();
  }
}

export default function SuspectDossierCreate() {
  const [step, setStep] = useState<WizardStepId>('photo');
  const [draft, setDraft] = useState<SuspectDossierDraft>(loadDraft);

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);
  const meta = WIZARD_STEPS[stepIndex];
  const completed = useMemo(() => stepCompletion(draft), [draft]);

  const patchDraft = useCallback((patch: Partial<SuspectDossierDraft>) => {
    setDraft((prev) => ({
      ...prev,
      ...patch,
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        // Preview URLs are session-only; persist storageKey and reload previews on mount.
        const draftForStorage = {
          ...draft,
          photos: draft.photos.map(({ previewUrl: _preview, ...photo }) => photo),
        };
        localStorage.setItem(DOSSIER_DRAFT_STORAGE_KEY, JSON.stringify(draftForStorage));
      } catch {
        /* quota — ignore */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [draft]);

  const goNext = () => {
    if (step === 'photo') {
      const block = photosStepBlockedReason(draft);
      if (block) {
        showToast('warning', block);
        return;
      }
    }
    if (step === 'identity' && !draft.criminalName.trim()) {
      showToast('warning', 'Criminal name is required before continuing.');
      return;
    }
    if (stepIndex < WIZARD_STEPS.length - 1) {
      setStep(WIZARD_STEPS[stepIndex + 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    if (stepIndex > 0) {
      setStep(WIZARD_STEPS[stepIndex - 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const clearDraft = async () => {
    if (!window.confirm('Discard all entered data and start over?')) return;
    const draftIdToDiscard = draft.dossierDraftId;
    const hadStoredPhotos = draft.photos.some((p) => p.storageKey);
    try {
      if (hadStoredPhotos) {
        await discardSuspectDraftPhotos(draftIdToDiscard);
      }
    } catch {
      showToast('warning', 'Local draft cleared, but some photos may remain on the server.');
    }
    const fresh = emptyDossierDraft();
    setDraft(fresh);
    localStorage.removeItem(DOSSIER_DRAFT_STORAGE_KEY);
    setStep('photo');
    showToast('info', 'Draft cleared.');
  };

  const handleSubmit = () => {
    if (!hasValidatedFrontPhoto(draft) || !draft.criminalName.trim()) {
      showToast('warning', 'Validated front photo and criminal name are required.');
      return;
    }
    showToast('info', 'Screen design only — backend save will be wired in the next phase.');
    console.info('[Suspect dossier draft]', draft);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (step === 'review') return;
      e.preventDefault();
      goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- goNext reads latest step/draft
  }, [step, draft.photos, draft.criminalName, stepIndex]);

  const stepBody = (() => {
    switch (step) {
      case 'photo':
        return (
          <SuspectPhotoStep
            draft={draft}
            onPhotosChange={(photosOrUpdater) => {
              setDraft((prev) => ({
                ...prev,
                photos:
                  typeof photosOrUpdater === 'function'
                    ? photosOrUpdater(prev.photos)
                    : photosOrUpdater,
                updatedAt: new Date().toISOString(),
              }));
            }}
          />
        );
      case 'identity':
        return <SuspectIdentityStep draft={draft} onChange={patchDraft} />;
      case 'address':
        return (
          <SuspectAddressStep
            address={draft.address}
            onChange={(address) => patchDraft({ address })}
          />
        );
      case 'contacts':
        return (
          <SuspectContactsStep
            draft={draft}
            onChange={(contacts) => patchDraft({ contacts })}
          />
        );
      case 'social':
        return (
          <SuspectSocialStep
            draft={draft}
            onChange={(socialAccounts) => patchDraft({ socialAccounts })}
          />
        );
      case 'relatives':
        return (
          <SuspectRelativesStep
            draft={draft}
            onChange={(relatives) => patchDraft({ relatives })}
          />
        );
      case 'review':
        return <SuspectReviewStep draft={draft} onEditStep={setStep} />;
      default:
        return null;
    }
  })();

  return (
    <AdminPageLayout
      title="New suspect dossier"
      description="Guided entry for criminal records — photo first, then structured details. Your progress is saved locally until the server API is ready."
      icon={FileSearch}
      actions={
        <AdminButton type="button" variant="ghost" size="sm" onClick={clearDraft}>
          <Trash2 size={16} />
          Clear draft
        </AdminButton>
      }
    >
      <AdminTipBanner>
        <Keyboard size={16} className="shrink-0 opacity-70" />
        <span>
          Tip: press <strong>Enter</strong> to move to the next step (except on review). Use the
          step bar above to jump back to any completed section.
        </span>
      </AdminTipBanner>

      <SuspectWizardStepper
        currentStep={step}
        completed={completed}
        onStepClick={setStep}
      />

      <div className="dossier-wizard-body">
        <AdminSectionCard
          title={meta.label}
          description={meta.description}
          step={stepIndex + 1}
        >
          <div className="px-5 py-6">{stepBody}</div>
        </AdminSectionCard>
      </div>

      <div className="dossier-wizard-footer-bar" aria-label="Wizard actions">
        <footer className="dossier-wizard-footer">
          <Link to="/suspects" className="btn-ghost btn btn-sm inline-flex items-center gap-1.5">
            <ArrowLeft size={16} />
            Back to list
          </Link>

          <span className="admin-form-actions-spacer min-w-2" />

          {stepIndex > 0 && (
            <AdminButton type="button" variant="secondary" onClick={goBack}>
              <ArrowLeft size={16} />
              Previous
            </AdminButton>
          )}

          {step !== 'review' ? (
            <AdminButton type="button" variant="primary" onClick={goNext}>
              Continue
              <ArrowRight size={16} />
            </AdminButton>
          ) : (
            <AdminButton type="button" variant="primary" onClick={handleSubmit}>
              <Save size={16} />
              Save dossier
            </AdminButton>
          )}
        </footer>
      </div>
    </AdminPageLayout>
  );
}
