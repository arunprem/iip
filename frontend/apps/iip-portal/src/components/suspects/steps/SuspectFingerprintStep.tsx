import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  CheckCircle2,
  Fingerprint,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Usb,
} from 'lucide-react';
import {
  captureFingerprintFromBridge,
  fetchFingerprintBridgeStatus,
  ingestSuspectFingerprint,
  readFileAsBase64,
  removeSuspectDossierFingerprint,
  type FingerprintBridgeStatus,
} from '../../../api/suspectFingerprints';
import { extractApiErrorMessage } from '../../../utils/apiMessages';
import { confirmRemoveSuspectFingerprint } from '../../../utils/confirmDialog';
import type { SuspectDossierDraft, SuspectFingerprintSlot } from '../../../pages/suspects/suspectTypes';
import { FINGERPRINT_SLOT_DEFS } from '../../../pages/suspects/suspectFormDefaults';
import { isFingerprintOnFile, updateFingerprintSlot } from '../../../pages/suspects/suspectFormUtils';
import { AdminButton } from '../../admin/AdminButton';
import { showToast } from '../../../stores/toastStore';
import { FingerprintImagePreview } from '../FingerprintImagePreview';

type FingerprintsUpdater =
  | SuspectFingerprintSlot[]
  | ((prev: SuspectFingerprintSlot[]) => SuspectFingerprintSlot[]);

interface SuspectFingerprintStepProps {
  draft: SuspectDossierDraft;
  onFingerprintsChange: (update: FingerprintsUpdater) => void;
}

function slotDef(slot: SuspectFingerprintSlot) {
  return FINGERPRINT_SLOT_DEFS.find((d) => d.fingerPosition === slot.fingerPosition);
}

export function SuspectFingerprintStep({
  draft,
  onFingerprintsChange,
}: SuspectFingerprintStepProps) {
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [capturingSlotId, setCapturingSlotId] = useState<string | null>(null);
  const [removingSlotId, setRemovingSlotId] = useState<string | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<FingerprintBridgeStatus | null>(null);
  const [bridgeChecking, setBridgeChecking] = useState(true);

  const refreshBridgeStatus = async () => {
    setBridgeChecking(true);
    const status = await fetchFingerprintBridgeStatus();
    setBridgeStatus(status);
    setBridgeChecking(false);
  };

  useEffect(() => {
    void refreshBridgeStatus();
  }, []);

  const patchSlots = (slotId: string, patch: Partial<SuspectFingerprintSlot>) => {
    onFingerprintsChange((prev) => updateFingerprintSlot(prev, slotId, patch));
  };

  const ingestTemplate = async (
    slot: SuspectFingerprintSlot,
    templateDataB64: string,
    meta: { qualityScore?: number; deviceModel?: string; templateFormat?: string }
  ) => {
    patchSlots(slot.id, { status: 'capturing', errorMessage: null });
    setCapturingSlotId(slot.id);
    try {
      const result = await ingestSuspectFingerprint({
        dossierDraftId: draft.dossierDraftId,
        templateId: slot.id,
        fingerPosition: slot.fingerPosition,
        templateDataB64,
        templateFormat: meta.templateFormat,
        criminalName: draft.criminalName,
        qualityScore: meta.qualityScore,
        deviceModel: meta.deviceModel,
        replacePrintId: slot.printId ?? undefined,
      });

      const hasDup = result.has_duplicate && result.duplicate_matches.length > 0;
      patchSlots(slot.id, {
        printId: result.print_id,
        templateDataB64,
        templateFormat: result.template_format,
        templateHash: result.template_hash,
        qualityScore: result.quality_score,
        deviceModel: meta.deviceModel ?? null,
        status: hasDup ? 'duplicate' : 'validated',
        duplicateMatches: result.duplicate_matches,
        duplicateAcknowledged: false,
        errorMessage: null,
      });
      if (hasDup) {
        showToast(
          'warning',
          'A similar fingerprint exists in another dossier — review the alert below.'
        );
      }
    } catch (err: unknown) {
      let errorMessage = 'Fingerprint ingest failed. Please check network connection and try again.';
      if (axios.isAxiosError(err) && err.response) {
        errorMessage = extractApiErrorMessage(err.response.data, err.response.status);
      } else if (err instanceof Error && err.message.trim()) {
        errorMessage = err.message;
      }
      patchSlots(slot.id, { status: 'error', errorMessage });
    } finally {
      setCapturingSlotId(null);
    }
  };

  const captureFromScanner = async (slot: SuspectFingerprintSlot) => {
    patchSlots(slot.id, { status: 'capturing', errorMessage: null });
    setCapturingSlotId(slot.id);
    try {
      const captured = await captureFingerprintFromBridge(slot.fingerPosition);
      if (!captured.template_data_b64?.trim()) {
        throw new Error('Scanner returned an empty template');
      }
      await ingestTemplate(slot, captured.template_data_b64.trim(), {
        qualityScore: captured.quality_score,
        deviceModel: captured.device_model,
        templateFormat: captured.template_format,
      });
    } catch (err: unknown) {
      const fallback =
        'Scanner unavailable — use template upload or start the local bridge on port 17890.';
      patchSlots(slot.id, {
        status: 'error',
        errorMessage: err instanceof Error && err.message.trim() ? err.message : fallback,
      });
      setCapturingSlotId(null);
    }
  };

  const handleTemplateFile = async (slot: SuspectFingerprintSlot, file: File) => {
    if (file.size < 32 || file.size > 64 * 1024) {
      patchSlots(slot.id, {
        status: 'error',
        errorMessage: 'Template file must be between 32 bytes and 64 KB.',
      });
      return;
    }
    try {
      const b64 = await readFileAsBase64(file);
      await ingestTemplate(slot, b64, { deviceModel: 'DEV_UPLOAD' });
    } catch (err: unknown) {
      patchSlots(slot.id, {
        status: 'error',
        errorMessage:
          err instanceof Error && err.message.trim()
            ? err.message
            : 'Could not read template file',
      });
    }
  };

  const onFilePrints = draft.fingerprints.filter(isFingerprintOnFile);
  const capturedCount = onFilePrints.length;

  const clearSlot = (slotId: string) => {
    patchSlots(slotId, {
      status: 'empty',
      printId: null,
      templateDataB64: null,
      templateHash: null,
      qualityScore: null,
      deviceModel: null,
      duplicateMatches: [],
      duplicateAcknowledged: false,
      errorMessage: null,
    });
  };

  const handleRemovePrint = async (slot: SuspectFingerprintSlot) => {
    const confirmed = await confirmRemoveSuspectFingerprint({
      fingerLabel: slot.label,
      criminalName: draft.criminalName.trim() || undefined,
    });
    if (!confirmed) return;

    setRemovingSlotId(slot.id);
    try {
      if (draft.editingDossierId && slot.printId) {
        await removeSuspectDossierFingerprint(draft.editingDossierId, slot.printId);
        showToast('success', `${slot.label} removed from dossier and AFIS index.`);
      }
      clearSlot(slot.id);
    } catch {
      /* API surfaces errors */
    } finally {
      setRemovingSlotId(null);
    }
  };

  const bridgeOffline = !bridgeChecking && bridgeStatus && !bridgeStatus.ok;
  const macNoSdk =
    bridgeStatus?.mode === 'macos_no_sdk' ||
    bridgeStatus?.usb?.platform === 'macos';
  const bridgeReady = Boolean(bridgeStatus?.ok && bridgeStatus.can_capture);

  return (
    <div className="dossier-fingerprint-step dossier-photo-step">
      <div
        className={[
          'dossier-fingerprint-bridge-banner rounded-lg border p-3 text-sm',
          bridgeChecking
            ? 'border-iip-border text-iip-text-muted'
            : bridgeReady
              ? 'border-emerald-300/60 bg-emerald-50/80 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-100'
              : 'border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/30 text-amber-950 dark:text-amber-100',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            {bridgeChecking ? (
              <p className="inline-flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                Checking local capture bridge…
              </p>
            ) : bridgeOffline ? (
              <>
                <p className="font-medium">Fingerprint scanner connection issue</p>
                <p className="text-xs opacity-90">
                  The fingerprint capture helper service could not be reached. Please check if the helper program is running or try importing a template file.
                </p>
              </>
            ) : macNoSdk && !bridgeStatus?.can_capture ? (
              <>
                <p className="font-medium">USB device detected but scanner capture is unavailable</p>
                <p className="text-xs opacity-90">
                  The local environment does not support direct capture. Please import the fingerprint template file instead.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">
                  Bridge ready ({bridgeStatus?.mode ?? 'unknown'})
                  {bridgeStatus?.usb?.usb_visible ? ' · USB device visible' : ''}
                </p>
                <p className="text-xs opacity-90">{bridgeStatus?.message}</p>
              </>
            )}
          </div>
          <AdminButton
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={bridgeChecking}
            onClick={() => void refreshBridgeStatus()}
          >
            <RefreshCw size={14} />
            Refresh
          </AdminButton>
        </div>
      </div>

      <div className="dossier-photo-step__toolbar">
        <p className="dossier-photo-step__toolbar-meta text-sm text-iip-text-muted">
          Integrates with the workstation scanner helper service. You can capture prints directly, upload templates, or view mobile-approved prints below.
        </p>
        <div className="dossier-photo-step__count">
          <span
            className={[
              'dossier-photo-step__pill',
              capturedCount > 0 ? 'dossier-photo-step__pill--ok' : 'dossier-photo-step__pill--req',
            ].join(' ')}
          >
            {capturedCount} on file
          </span>
        </div>
      </div>

      {onFilePrints.length > 0 ? (
        <div className="mb-6 space-y-3">
          <p className="text-xs font-semibold text-iip-text uppercase tracking-wide">
            On file — approved &amp; searchable
          </p>
          <div className="grid grid-cols-1 gap-3">
            {onFilePrints.map((slot) => {
              const quality =
                slot.qualityScore != null ? Math.round(slot.qualityScore * 100) : null;
              const busy = removingSlotId === slot.id;
              return (
                <div
                  key={`on-file-${slot.id}`}
                  className="flex items-start gap-4 p-4 rounded-xl border border-iip-border bg-iip-bg/40 shadow-sm"
                >
                  <FingerprintImagePreview
                    printId={slot.printId ?? ''}
                    altText={slot.label}
                    className="w-14 h-18 object-cover rounded border border-iip-border bg-iip-bg shrink-0"
                    iconSize={24}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-iip-text truncate">{slot.label}</p>
                      {quality !== null ? (
                        <span
                          className={[
                            'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                            quality >= 80
                              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                              : quality >= 50
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : 'bg-red-500/10 text-red-600 border border-red-500/20',
                          ].join(' ')}
                        >
                          {quality}% Quality
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-iip-text-muted mt-1 font-medium">
                      ISO 19794-2 FMR Template
                    </p>
                    {slot.deviceModel ? (
                      <p className="text-[11px] text-iip-text-muted/80 mt-0.5 truncate font-mono">
                        Device: {slot.deviceModel}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-600 font-semibold">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                      </span>
                      <span>Active &amp; Searchable</span>
                    </div>
                  </div>
                  <AdminButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-red-600 hover:text-red-700"
                    disabled={busy}
                    onClick={() => void handleRemovePrint(slot)}
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Remove
                  </AdminButton>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-iip-text-muted">
          No fingerprints on file yet. Capture below or approve a mobile field submission.
        </p>
      )}

      <p className="text-xs font-semibold text-iip-text uppercase tracking-wide mb-3">
        Capture slots
      </p>

      <div className="dossier-fingerprint-grid">
        {draft.fingerprints.map((slot) => {
          const def = slotDef(slot);
          const busy = capturingSlotId === slot.id || slot.status === 'capturing';
          const done = isFingerprintOnFile(slot);

          return (
            <div key={slot.id} className="dossier-fingerprint-slot">
              <div className="dossier-fingerprint-slot__header">
                <Fingerprint size={18} className="text-iip-primary shrink-0" />
                <div>
                  <p className="dossier-fingerprint-slot__label">
                    {slot.label}
                    {slot.required ? (
                      <span className="dossier-photo-step__pill dossier-photo-step__pill--req ml-2">
                        Required
                      </span>
                    ) : null}
                  </p>
                  {def?.hint ? (
                    <p className="text-xs text-iip-text-muted mt-0.5">{def.hint}</p>
                  ) : null}
                </div>
              </div>

              <div className="dossier-fingerprint-slot__status">
                {busy ? (
                  <span className="dossier-photo-step__status dossier-photo-step__status--wait inline-flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" />
                    Capturing…
                  </span>
                ) : done ? (
                  <span className="dossier-photo-step__status dossier-photo-step__status--ok inline-flex items-center gap-1.5">
                    <CheckCircle2 size={14} />
                    Template saved
                    {slot.qualityScore != null
                      ? ` · quality ${Math.round(slot.qualityScore * 100)}%`
                      : ''}
                  </span>
                ) : slot.status === 'error' ? (
                  <span className="dossier-photo-step__status dossier-photo-step__status--err inline-flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    {slot.errorMessage ?? 'Capture failed'}
                  </span>
                ) : (
                  <span className="text-xs text-iip-text-muted">Not captured</span>
                )}
              </div>

              {slot.duplicateMatches.length > 0 && !slot.duplicateAcknowledged ? (
                <div className="dossier-fingerprint-dup-alert">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Similar print found ({slot.duplicateMatches.length} match
                    {slot.duplicateMatches.length === 1 ? '' : 'es'})
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-iip-text-muted">
                    {slot.duplicateMatches.slice(0, 3).map((m) => (
                      <li key={m.print_id}>
                        {m.criminal_name?.trim() || 'Unnamed suspect'} ·{' '}
                        {Math.round(m.similarity_score * 100)}% match
                      </li>
                    ))}
                  </ul>
                  <AdminButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-3"
                    onClick={() => patchSlots(slot.id, { duplicateAcknowledged: true })}
                  >
                    Acknowledge and continue
                  </AdminButton>
                </div>
              ) : null}

              <div className="dossier-fingerprint-slot__actions">
                <AdminButton
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void captureFromScanner(slot)}
                >
                  <Usb size={14} />
                  Scan
                </AdminButton>
                <AdminButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => fileRefs.current[slot.id]?.click()}
                >
                  <Upload size={14} />
                  Upload .bin
                </AdminButton>
                <input
                  ref={(el) => {
                    fileRefs.current[slot.id] = el;
                  }}
                  type="file"
                  accept=".bin,application/octet-stream"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleTemplateFile(slot, file);
                  }}
                />
                {done ? (
                  <AdminButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy || removingSlotId === slot.id}
                    onClick={() => void handleRemovePrint(slot)}
                  >
                    {removingSlotId === slot.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Remove
                  </AdminButton>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
