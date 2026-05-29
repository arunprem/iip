/** Kerala approximate center (Kochi) for default map view. */
export const KERALA_MAP_CENTER = { lat: 9.9312, lng: 76.2673 };

export function parseCoord(value: string): number | null {
  const n = Number.parseFloat(value.trim());
  return Number.isFinite(n) ? n : null;
}

export function formatCoord(value: number): string {
  return value.toFixed(6);
}

export function coordsFromAddress(address: {
  latitude: string;
  longitude: string;
}): { lat: number; lng: number } | null {
  const lat = parseCoord(address.latitude);
  const lng = parseCoord(address.longitude);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}
