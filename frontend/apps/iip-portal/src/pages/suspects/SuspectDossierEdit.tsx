import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Pencil, Save } from 'lucide-react';
import { AdminButton } from '../../components/admin/AdminButton';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { AdminSectionCard } from '../../components/admin/AdminSectionCard';
import { SuspectWizardStepper } from '../../components/suspects/SuspectWizardStepper';
import { SuspectAddressStep } from '../../components/suspects/steps/SuspectAddressStep';
import { SuspectContactsStep } from '../../components/suspects/steps/SuspectContactsStep';
import { SuspectIdentityStep } from '../../components/suspects/steps/SuspectIdentityStep';
import { SuspectPhotoStep } from '../../components/suspects/steps/SuspectPhotoStep';
import { SuspectRelativesStep } from '../../components/suspects/steps/SuspectRelativesStep';
import { SuspectReviewStep } from '../../components/suspects/steps/SuspectReviewStep';
import { SuspectSocialStep } from '../../components/suspects/steps/SuspectSocialStep';
import { getSuspectDossierDetail, updateSuspectDossier } from '../../api/suspectDossiers';
import { indexSubmittedSuspectFace } from '../../api/suspectFaces';
import { showToast } from '../../stores/toastStore';
import { WIZARD_STEPS } from './suspectFormDefaults';
import { dossierDetailToDraft } from './suspectDetailMappers';
import { hasValidatedFrontPhoto, photosStepBlockedReason, stepCompletion } from './suspectFormUtils';
import type { SuspectDossierDraft, WizardStepId } from './suspectTypes';

function str(v: unknown): string {
  return v != null ? String(v) : '';
}

export default function SuspectDossierEdit() {
  const { dossierId } = useParams<{ dossierId: string }>();
  const navigate = useNavigate();
  const [step, setStep] = useState<WizardStepId>('identity');
  const [draft, setDraft] = useState<SuspectDossierDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!dossierId) return;
    let cancelled = false;
    void getSuspectDossierDetail(dossierId)
      .then((detail) => {
        if (!cancelled) {
          if (detail.can_edit === false) {
            showToast('warning', 'You do not have permission to edit this dossier.');
            navigate(`/suspects/${dossierId}`);
            return;
          }
          setDraft(dossierDetailToDraft(detail));
        }
      })
      .catch(() => {
        if (!cancelled) navigate('/suspects');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dossierId, navigate]);

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === step);
  const meta = WIZARD_STEPS[stepIndex];
  const completed = useMemo(() => (draft ? stepCompletion(draft) : {}), [draft]);

  const patchDraft = useCallback((patch: Partial<SuspectDossierDraft>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            ...patch,
            updatedAt: new Date().toISOString(),
          }
        : prev
    );
  }, []);

  const handleStepClick = (targetStep: WizardStepId) => {
    if (!draft) return;
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
      showToast('warning', 'Criminal name is required.');
      return;
    }
    setStep(targetStep);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    if (!draft) return;
    if (step === 'photo') {
      const block = photosStepBlockedReason(draft);
      if (block) {
        showToast('warning', block);
        return;
      }
    }
    if (step === 'identity' && !draft.criminalName.trim()) {
      showToast('warning', 'Criminal name is required.');
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

  const handleSave = async () => {
    if (!draft || !dossierId || !hasValidatedFrontPhoto(draft) || !draft.criminalName.trim()) {
      showToast('warning', 'Criminal name and validated front photo are required.');
      return;
    }
    setSubmitting(true);
    try {
      const updated = await updateSuspectDossier(dossierId, draft);

      const frontFromApi = updated.front_photo as
        | {
            photo_id?: string;
            storage_key?: string;
            face_id?: string | null;
          }
        | undefined;
      const frontSlot = draft.photos.find((p) => p.poseType === 'FRONT');
      const masterSuspectId =
        str(updated.master_suspect_id) || draft.editingMasterSuspectId;
      const childSuspectId = str(updated.suspect_id) || draft.editingChildSuspectId;
      const dossierDraftId =
        str(updated.dossier_draft_id) || draft.dossierDraftId;
      const photoId = frontFromApi?.photo_id || frontSlot?.id;
      const storageKey = frontFromApi?.storage_key || frontSlot?.storageKey;
      const faceId = frontFromApi?.face_id || frontSlot?.faceId;

      if (faceId && storageKey && photoId && masterSuspectId) {
        const indexResult = await indexSubmittedSuspectFace({
          suspectId: masterSuspectId,
          dossierDraftId,
          photoId,
          storageKey,
          faceId,
          criminalName: draft.criminalName,
          childSuspectId,
        });
        if (!indexResult.indexed && indexResult.message) {
          showToast('warning', indexResult.message);
        }
      }

      showToast('success', 'Dossier updated.');
      navigate(`/suspects/${dossierId}`);
    } catch {
      /* API surfaces errors */
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !draft) {
    return (
      <AdminPageLayout
        title="Edit dossier"
        description="Loading dossier…"
        icon={Pencil}
      >
        <p className="text-sm text-iip-text-muted">Loading…</p>
      </AdminPageLayout>
    );
  }

  const stepBody = (() => {
    switch (step) {
      case 'photo':
        return (
          <SuspectPhotoStep
            draft={draft}
            onPhotosChange={(photosOrUpdater) => {
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      photos:
                        typeof photosOrUpdater === 'function'
                          ? photosOrUpdater(prev.photos)
                          : photosOrUpdater,
                    }
                  : prev
              );
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
          <SuspectContactsStep draft={draft} onChange={(contacts) => patchDraft({ contacts })} />
        );
      case 'social':
        return (
          <SuspectSocialStep draft={draft} onChange={(socialAccounts) => patchDraft({ socialAccounts })} />
        );
      case 'relatives':
        return (
          <SuspectRelativesStep
            draft={draft}
            onRelativesChange={(relatives) => patchDraft({ relatives })}
            onAssociatesChange={(associates) => patchDraft({ associates })}
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
      title="Edit unit dossier"
      description="Update identity, contacts, and associates. Photos can be replaced from the photo step."
      icon={Pencil}
      actions={
        <Link
          to={`/suspects/${dossierId}`}
          className="btn-ghost btn btn-sm inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={16} />
          View dossier
        </Link>
      }
    >
      <SuspectWizardStepper currentStep={step} completed={completed} onStepClick={handleStepClick} />
      <div className="dossier-wizard-shell mt-4">
        <AdminSectionCard
          title={meta.label}
          description={meta.description}
          step={stepIndex + 1}
          className={`dossier-wizard-card${step === 'review' ? ' dossier-wizard-card--report-mode' : ''}`}
        >
          <div className="dossier-wizard-card-inner">
            <div className="dossier-wizard-step-body">{stepBody}</div>
            <footer className="dossier-wizard-footer">
              <Link
                to={`/suspects/${dossierId}`}
                className="btn-ghost btn btn-sm inline-flex items-center gap-1.5"
              >
                Cancel
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
                  onClick={handleSave}
                  disabled={submitting}
                >
                  <Save size={16} />
                  {submitting ? 'Saving…' : 'Save changes'}
                </AdminButton>
              )}
            </footer>
          </div>
        </AdminSectionCard>
      </div>
    </AdminPageLayout>
  );
}
