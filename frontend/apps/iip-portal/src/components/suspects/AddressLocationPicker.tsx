import { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AdminButton } from '../admin/AdminButton';
import {
  KERALA_MAP_CENTER,
  coordsFromAddress,
  formatCoord,
  parseCoord,
} from './addressMapUtils';
import { OSM_ATTRIBUTION, OSM_TILE_URL, suspectMapMarkerIcon } from './leafletSetup';

interface AddressLocationPickerProps {
  latitude: string;
  longitude: string;
  onChange: (lat: string, lng: string) => void;
  mapId: string;
}

function refreshMapSize(map: L.Map) {
  requestAnimationFrame(() => {
    map.invalidateSize({ animate: false });
  });
  window.setTimeout(() => map.invalidateSize({ animate: false }), 150);
  window.setTimeout(() => map.invalidateSize({ animate: false }), 400);
}

export function AddressLocationPicker({
  latitude,
  longitude,
  onChange,
  mapId,
}: AddressLocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [mapReady, setMapReady] = useState(false);

  onChangeRef.current = onChange;

  const pick = (lat: number, lng: number) => {
    onChangeRef.current(formatCoord(lat), formatCoord(lng));
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const existing = coordsFromAddress({ latitude, longitude });
    const center = existing ?? KERALA_MAP_CENTER;
    const zoom = existing ? 15 : 8;

    const map = L.map(container, {
      center: [center.lat, center.lng],
      zoom,
      scrollWheelZoom: true,
    });

    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      pick(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    setMapReady(true);
    refreshMapSize(map);

    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => refreshMapSize(map))
        : null;
    ro?.observe(container);

    return () => {
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one map instance per mapId mount
  }, [mapId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const coords = coordsFromAddress({ latitude, longitude });
    if (!coords) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }

    if (markerRef.current) {
      markerRef.current.setLatLng([coords.lat, coords.lng]);
    } else {
      markerRef.current = L.marker([coords.lat, coords.lng], {
        icon: suspectMapMarkerIcon,
        draggable: true,
      })
        .addTo(map)
        .on('dragend', () => {
          const pos = markerRef.current?.getLatLng();
          if (pos) pick(pos.lat, pos.lng);
        });
    }

    const targetZoom = Math.max(map.getZoom(), 14);
    if (map.getCenter().distanceTo(L.latLng(coords.lat, coords.lng)) > 50) {
      map.setView([coords.lat, coords.lng], targetZoom, { animate: false });
    }
    refreshMapSize(map);
  }, [latitude, longitude, mapReady]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => pick(pos.coords.latitude, pos.coords.longitude),
      () => {
        /* user denied or unavailable */
      },
      { enableHighAccuracy: true, timeout: 12_000 }
    );
  };

  const latNum = parseCoord(latitude);
  const lngNum = parseCoord(longitude);

  return (
    <div className="address-map-picker">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-iip-text-muted flex items-center gap-1.5 min-w-0">
          <MapPin size={14} className="shrink-0" />
          <span>Click the map or drag the pin to set GPS coordinates</span>
        </p>
        <AdminButton type="button" variant="ghost" size="sm" onClick={useMyLocation}>
          <Crosshair size={14} />
          My location
        </AdminButton>
      </div>

      <div className="address-map-picker__body">
        <div
          ref={containerRef}
          id={mapId}
          className="address-map-picker__map rounded-lg border border-iip-border overflow-hidden bg-[#e8ecef]"
          role="application"
          aria-label="Location picker map"
        />

        <div className="address-map-picker__coords">
          <label htmlFor={`${mapId}-lat`}>
            Latitude
            <input
              id={`${mapId}-lat`}
              type="text"
              className="form-control"
              value={latitude}
              onChange={(e) => onChange(e.target.value, longitude)}
              placeholder="9.931200"
              inputMode="decimal"
            />
          </label>
          <label htmlFor={`${mapId}-lng`}>
            Longitude
            <input
              id={`${mapId}-lng`}
              type="text"
              className="form-control"
              value={longitude}
              onChange={(e) => onChange(latitude, e.target.value)}
              placeholder="76.267300"
              inputMode="decimal"
            />
          </label>
          {latNum != null && lngNum != null && (
            <p className="address-map-picker__selected">
              Pin: {formatCoord(latNum)}, {formatCoord(lngNum)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
