import { apiClient } from './http';

export type FingerPosition =
  | 'RIGHT_THUMB'
  | 'RIGHT_INDEX'
  | 'RIGHT_MIDDLE'
  | 'RIGHT_RING'
  | 'RIGHT_LITTLE'
  | 'LEFT_THUMB'
  | 'LEFT_INDEX'
  | 'LEFT_MIDDLE'
  | 'LEFT_RING'
  | 'LEFT_LITTLE';

export interface FingerprintDuplicateMatch {
  print_id: string;
  template_id: string | null;
  dossier_draft_id: string | null;
  suspect_id: string | null;
  criminal_name: string | null;
  finger_position: string;
  similarity_score: number;
}

export interface FingerprintIngestResult {
  template_id: string;
  print_id: string;
  finger_position: string;
  template_format: string;
  template_hash: string;
  quality_score: number | null;
  indexed: boolean;
  duplicate_matches: FingerprintDuplicateMatch[];
  has_duplicate: boolean;
  message: string | null;
}

export async function ingestSuspectFingerprint(params: {
  dossierDraftId: string;
  templateId: string;
  fingerPosition: FingerPosition;
  templateDataB64: string;
  templateFormat?: string;
  criminalName?: string;
  suspectId?: string;
  qualityScore?: number;
  deviceModel?: string;
  replacePrintId?: string;
  imageDataB64?: string;
  imageWidth?: number;
  imageHeight?: number;
}): Promise<FingerprintIngestResult> {
  const res = await apiClient.post<FingerprintIngestResult>(
    '/ml/fingerprints/ingest',
    {
      dossierDraftId: params.dossierDraftId,
      templateId: params.templateId,
      fingerPosition: params.fingerPosition,
      templateDataB64: params.templateDataB64,
      templateFormat: params.templateFormat ?? 'ISO19794-2',
      criminalName: params.criminalName?.trim() || undefined,
      suspectId: params.suspectId?.trim() || undefined,
      qualityScore: params.qualityScore,
      deviceModel: params.deviceModel,
      replacePrintId: params.replacePrintId,
      imageDataB64: params.imageDataB64,
      imageWidth: params.imageWidth,
      imageHeight: params.imageHeight,
    },
    { skipSuccessToast: true, timeout: 60_000 }
  );
  return res.data;
}

export interface IndexSubmittedFingerprintResponse {
  indexed: boolean;
  print_id: string;
  suspect_id: string;
  message: string | null;
}

export async function indexSubmittedSuspectFingerprint(params: {
  suspectId: string;
  dossierDraftId: string;
  templateId: string;
  printId: string;
  fingerPosition: FingerPosition;
  templateDataB64: string;
  templateFormat?: string;
  criminalName: string;
  qualityScore?: number;
  deviceModel?: string;
  imageDataB64?: string;
  imageWidth?: number;
  imageHeight?: number;
}): Promise<IndexSubmittedFingerprintResponse> {
  const res = await apiClient.post<IndexSubmittedFingerprintResponse>(
    '/ml/fingerprints/index-submitted',
    {
      suspectId: params.suspectId,
      dossierDraftId: params.dossierDraftId,
      templateId: params.templateId,
      printId: params.printId,
      fingerPosition: params.fingerPosition,
      templateDataB64: params.templateDataB64,
      templateFormat: params.templateFormat ?? 'ISO19794-2',
      criminalName: params.criminalName,
      qualityScore: params.qualityScore,
      deviceModel: params.deviceModel,
      imageDataB64: params.imageDataB64,
      imageWidth: params.imageWidth,
      imageHeight: params.imageHeight,
    },
    { skipSuccessToast: true }
  );
  return res.data;
}

export async function discardSuspectDraftFingerprints(dossierDraftId: string): Promise<void> {
  await apiClient.delete(`/ml/fingerprints/drafts/${dossierDraftId}`, {
    skipSuccessToast: true,
    skipToast: true,
  });
}

export async function removeSuspectDossierFingerprint(
  dossierId: string,
  printId: string
): Promise<void> {
  await apiClient.delete(`/intelligence/suspect-dossiers/${dossierId}/fingerprints/${printId}`);
}

export async function fetchFingerprintPreviewDataUrl(
  printId: string
): Promise<string> {
  const res = await apiClient.get<Blob>(`/ml/fingerprints/prints/${printId}/image`, {
    responseType: 'blob',
    skipSuccessToast: true,
    skipToast: true,
    timeout: 30_000,
  });
  
  // Custom local conversion of blob to data URL
  if (!(res.data instanceof Blob) || res.data.size === 0) {
    throw new Error('Empty image response');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(res.data);
  });
}


/** Local SecuGen / FDx bridge — returns ISO template bytes as base64. */
export interface FingerprintBridgeCapture {
  template_data_b64: string;
  template_format?: string;
  quality_score?: number;
  device_model?: string;
  finger_position?: string;
}

const FINGERPRINT_BRIDGE_URL =
  (import.meta.env.VITE_FINGERPRINT_BRIDGE_URL as string | undefined)?.trim() ||
  'http://127.0.0.1:17890';

export interface FingerprintBridgeStatus {
  ok: boolean;
  service?: string;
  mode?: string;
  can_capture?: boolean;
  message?: string;
  usb?: {
    platform?: string;
    usb_visible?: boolean;
    note?: string;
  };
  error?: string;
}

export async function fetchFingerprintBridgeStatus(): Promise<FingerprintBridgeStatus> {
  const url = `${FINGERPRINT_BRIDGE_URL.replace(/\/$/, '')}/status`;
  try {
    const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
    if (!res.ok) {
      return {
        ok: false,
        error: `Bridge returned ${res.status}. Start: FINGERPRINT_BRIDGE_MOCK=1 python3 infra/fingerprint-bridge/bridge.py`,
      };
    }
    return (await res.json()) as FingerprintBridgeStatus;
  } catch {
    return {
      ok: false,
      error:
        'Capture bridge is not running on this Mac. Open a terminal and run:\n' +
        'FINGERPRINT_BRIDGE_MOCK=1 python3 infra/fingerprint-bridge/bridge.py',
    };
  }
}

export async function captureFingerprintFromBridge(
  fingerPosition: FingerPosition
): Promise<FingerprintBridgeCapture> {
  const url = `${FINGERPRINT_BRIDGE_URL.replace(/\/$/, '')}/capture`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ finger_position: fingerPosition }),
    });
  } catch {
    throw new Error(
      'Cannot reach fingerprint bridge at http://127.0.0.1:17890. ' +
        'Start it with: FINGERPRINT_BRIDGE_MOCK=1 python3 infra/fingerprint-bridge/bridge.py'
    );
  }
  if (!res.ok) {
    let detail = '';
    try {
      const data = (await res.json()) as { error?: string; status?: FingerprintBridgeStatus };
      detail = data.error?.trim() || data.status?.message?.trim() || '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(
      detail.trim() ||
        `Fingerprint capture failed (${res.status}). On macOS, SecuGen has no SDK — use mock bridge or Upload .bin.`
    );
  }
  return (await res.json()) as FingerprintBridgeCapture;
}

export async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read file'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}
