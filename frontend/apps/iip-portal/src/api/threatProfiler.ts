import { apiClient } from './http';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ThreatCaseInfo {
  crime_number: string;
  crime_year?: number | null;
  police_station?: string | null;
  act_section?: string | null;
  brief?: string | null;
  present_status?: string | null;
}

export interface ThreatAssociateInfo {
  name: string;
  association_type: string;
  occupation?: string | null;
  notes?: string | null;
}

export interface RiskScores {
  violence_propensity: number;
  recidivism_risk: number;
  network_influence: number;
  flight_risk: number;
  radicalization_potential: number;
}

export interface ThreatProfile {
  criminal_psychology: string;
  mo_signature: string;
  escalation_trajectory: string;
  actionable_intelligence: string;
  risk_scores: RiskScores;
  threat_tier: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
}

export interface PatternMatch {
  suspect_name: string;
  similarity_reason: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface CrossDossierResult {
  pattern_matches: PatternMatch[];
  analysis_summary: string;
}

export interface ThreatProfileRequest {
  suspect_name: string;
  alias_name?: string | null;
  fathers_name?: string | null;
  gender?: string | null;
  age?: string | null;
  address?: string | null;
  cases: ThreatCaseInfo[];
  associates: ThreatAssociateInfo[];
  relatives: Array<Record<string, unknown>>;
}

// ─── API Calls ──────────────────────────────────────────────────────────────

export async function generateThreatProfile(
  data: ThreatProfileRequest
): Promise<ThreatProfile> {
  const res = await apiClient.post<ThreatProfile>(
    '/ml/assistant/threat-profile',
    data
  );
  return res.data;
}

export async function findCrossDossierPatterns(
  moSignature: string,
  suspectName: string,
  caseSections: string[],
  suspectId?: string | null
): Promise<CrossDossierResult> {
  const res = await apiClient.post<CrossDossierResult>(
    '/ml/assistant/cross-dossier-patterns',
    {
      mo_signature: moSignature,
      suspect_name: suspectName,
      suspect_id: suspectId ?? null,
      case_sections: caseSections,
    }
  );
  return res.data;
}
