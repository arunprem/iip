import { apiClient } from './http';

export type HotspotAddressScope = 'both' | 'permanent' | 'present';
export type HotspotCaseScope = 'all' | 'recent_active';

export interface HotspotPoint {
  point_id: string;
  dossier_id: string;
  dossier_draft_id: string | null;
  suspect_id: string;
  master_suspect_id: string;
  criminal_name: string;
  alias_name: string | null;
  link_status: string;
  address_kind: 'permanent' | 'present' | string;
  latitude: number;
  longitude: number;
  district: string | null;
  police_station: string | null;
  locality: string | null;
  village_town_city: string | null;
  house_name: string | null;
  house_no: string | null;
  modus_operandi: string | null;
  case_count: number;
  front_photo_id: string | null;
  front_photo_storage_key: string | null;
  submitted_at: string;
  office_id: string | null;
}

export interface HotspotPointListResponse {
  points: HotspotPoint[];
  total: number;
  districts: string[];
  police_stations: string[];
}

export async function listHotspotPoints(params?: {
  q?: string;
  district?: string;
  policeStation?: string;
  addressScope?: HotspotAddressScope;
  caseScope?: HotspotCaseScope;
  limit?: number;
}): Promise<HotspotPointListResponse> {
  const res = await apiClient.get<HotspotPointListResponse>('/intelligence/suspect-dossiers/hotspots/points', {
    params: {
      q: params?.q?.trim() || undefined,
      district: params?.district?.trim() || undefined,
      policeStation: params?.policeStation?.trim() || undefined,
      addressScope: params?.addressScope ?? 'both',
      caseScope: params?.caseScope ?? 'all',
      limit: params?.limit ?? 5000,
    },
  });
  return res.data;
}
