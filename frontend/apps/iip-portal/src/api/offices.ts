import { apiClient } from './http';

export interface PSLookupResponse {
  id: string;
  office_name: string;
  office_code: string;
}

export async function fetchDescendantPoliceStations(): Promise<PSLookupResponse[]> {
  const res = await apiClient.get<PSLookupResponse[]>('/iam/offices/descendant-police-stations', {
    skipSuccessToast: true,
  });
  return res.data;
}
