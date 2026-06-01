import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { discardSuspectDraftPhotos, indexSubmittedSuspectFace } from '../../api/suspectFaces';
import { createSuspectDossier, scoreSuspectMatches } from '../../api/suspectDossiers';
import { showToast } from '../../stores/toastStore';
import {
  DOSSIER_DRAFT_STORAGE_KEY,
  WIZARD_STEPS,
  emptyDossierDraft,
} from './suspectFormDefaults';
import {
  hasValidatedFrontPhoto,
  normalizeDossierDraft,
  photosStepBlockedReason,
  stepCompletion,
} from './suspectFormUtils';
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
    return normalizeDossierDraft({ ...parsed, photos });
  } catch {
    return emptyDossierDraft();
  }
}

export default function SuspectDossierCreate() {
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStepId>('photo');
  const [draft, setDraft] = useState<SuspectDossierDraft>(loadDraft);
  const [submitting, setSubmitting] = useState(false);

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

  const handleStepClick = (targetStep: WizardStepId) => {
    const targetIndex = WIZARD_STEPS.findIndex((s) => s.id === targetStep);
    const photoIndex = WIZARD_STEPS.findIndex((s) => s.id === 'photo');
    if (targetIndex > photoIndex) {
      const block = photosStepBlockedReason(draft);
      if (block) {
        showToast('warning', block);
        return;
      }
    }
    const identityIndex = WIZARD_STEPS.findIndex((s) => s.id === 'identity');
    if (targetIndex > identityIndex && !draft.criminalName.trim()) {
      showToast('warning', 'Criminal name is required before continuing.');
      return;
    }
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  const handleSubmit = async () => {
    if (!hasValidatedFrontPhoto(draft) || !draft.criminalName.trim()) {
      showToast('warning', 'Validated front photo and criminal name are required.');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      if (!draft.linkDecision) {
        const scored = await scoreSuspectMatches(draft);
        const hasStrong = scored.some((m) => m.tier === 'STRONG');
        if (hasStrong) {
          showToast(
            'warning',
            'A strong match was found — confirm same person or reject on the review step.'
          );
          setStep('review');
          setSubmitting(false);
          return;
        }
      }

      const saved = await createSuspectDossier(draft);
      const frontPhoto = saved.front_photo;
      if (frontPhoto?.face_id && frontPhoto.storage_key) {
        const indexResult = await indexSubmittedSuspectFace({
          suspectId: saved.master_suspect_id,
          dossierDraftId: saved.dossier_draft_id,
          photoId: frontPhoto.photo_id,
          storageKey: frontPhoto.storage_key,
          faceId: frontPhoto.face_id,
          criminalName: saved.criminal_name,
        });
        if (!indexResult.indexed && indexResult.message) {
          showToast('warning', indexResult.message);
        }
      }

      localStorage.removeItem(DOSSIER_DRAFT_STORAGE_KEY);
      showToast('success', saved.message);
      navigate('/suspects');
    } catch {
      /* API client surfaces errors */
    } finally {
      setSubmitting(false);
    }
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
            onLinkDecision={(linkDecision) => patchDraft({ linkDecision })}
            onGeoTagChange={(photoGeoTag) => patchDraft({ photoGeoTag })}
          />
        );
      case 'identity':
        return <SuspectIdentityStep draft={draft} onChange={patchDraft} />;
      case 'address':
        return (
          <SuspectAddressStep
            permanentAddress={draft.address}
            presentAddress={draft.presentAddress}
            hasDifferentPresentAddress={draft.hasDifferentPresentAddress}
            onPermanentChange={(address) => patchDraft({ address })}
            onPresentChange={(presentAddress) => patchDraft({ presentAddress })}
            onHasDifferentPresentChange={(hasDifferentPresentAddress) =>
              patchDraft({ hasDifferentPresentAddress })
            }
            photoGeoTag={draft.photoGeoTag}
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
        return (
          <SuspectReviewStep
            draft={draft}
            onEditStep={handleStepClick}
            onLinkDecision={(linkDecision) => patchDraft({ linkDecision })}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <AdminPageLayout
      title="New suspect dossier"
      description="Guided entry for criminal records — photo first, then structured details. Your progress is saved locally until you submit."
      icon={FileSearch}
      actions={
        <AdminButton type="button" variant="ghost" size="sm" onClick={clearDraft}>
          <Trash2 size={16} />
          Clear draft
        </AdminButton>
      }
    >
      <div className="dossier-wizard-page">
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
          onStepClick={handleStepClick}
        />

        <div className="dossier-wizard-shell">
          <AdminSectionCard
            title={meta.label}
            description={step === 'review' ? undefined : meta.description}
            step={stepIndex + 1}
            className={`dossier-wizard-card${step === 'review' ? ' dossier-wizard-card--report-mode' : ''}`}
          >
            <div className="dossier-wizard-card-inner">
              <div className="dossier-wizard-step-body">{stepBody}</div>
              <footer className="dossier-wizard-footer" aria-label="Wizard actions">
                <Link
                  to="/suspects"
                  className="btn-ghost btn btn-sm inline-flex items-center gap-1.5"
                >
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
                  <AdminButton
                    type="button"
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    <Save size={16} />
                    {submitting ? 'Submitting…' : 'Submit dossier'}
                  </AdminButton>
                )}
              </footer>
            </div>
          </AdminSectionCard>
        </div>
      </div>
    </AdminPageLayout>
  );
}
