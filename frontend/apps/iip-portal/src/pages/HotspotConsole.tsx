import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Bot,
  Layers3,
  Loader2,
  MapPin,
  Search,
  Flame,
  CircleDot,
  RefreshCcw,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.heat';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { AdminButton } from '../components/admin/AdminButton';
import { AdminPageLayout } from '../components/admin/AdminPageLayout';
import { AdminSectionCard } from '../components/admin/AdminSectionCard';
import { assistantHotspotBrief, type AssistantLanguage } from '../api/assistant';
import {
  listHotspotPoints,
  type HotspotAddressScope,
  type HotspotCaseScope,
  type HotspotPoint,
} from '../api/hotspotConsole';
import { OSM_ATTRIBUTION, OSM_TILE_URL, suspectMapMarkerIcon } from '../components/suspects/leafletSetup';
import { SuspectDossierPhotoThumb } from '../components/suspects/SuspectDossierPhotoThumb';
import { parseModusOperandi } from './suspects/suspectFormUtils';
import { renderAssistantMarkdown } from '../utils/renderAssistantMarkdown';

type MapMode = 'markers' | 'clusters' | 'heatmap';

const KERALA_CENTER: [number, number] = [10.8505, 76.2711];
const PANEL_SPACING = 'space-y-5';

function popupHtml(point: HotspotPoint): string {
  const parsed = parseModusOperandi(point.modus_operandi ?? '');
  const addressBits = [point.locality, point.village_town_city, point.district].filter(Boolean).join(', ');
  const tags = parsed.tags.slice(0, 3).join(', ');
  return `
    <div style="min-width: 220px; font-family: Inter, system-ui, sans-serif; color: #0f172a;">
      <div style="font-weight: 700; margin-bottom: 4px;">${point.criminal_name}</div>
      ${point.alias_name ? `<div style="font-size: 12px; margin-bottom: 4px;">Alias: ${point.alias_name}</div>` : ''}
      <div style="font-size: 12px; margin-bottom: 4px;">${point.address_kind === 'present' ? 'Present' : 'Permanent'} address</div>
      <div style="font-size: 12px; margin-bottom: 4px;">${addressBits || 'Location mapped'}</div>
      <div style="font-size: 12px; margin-bottom: 4px;">Cases: ${point.case_count}</div>
      ${tags ? `<div style="font-size: 12px; margin-bottom: 4px;">MO tags: ${tags}</div>` : ''}
      ${point.police_station ? `<div style="font-size: 12px;">PS: ${point.police_station}</div>` : ''}
    </div>
  `;
}

function pointWeight(point: HotspotPoint): number {
  return Math.min(1, 0.2 + point.case_count * 0.15);
}

export default function HotspotConsole() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [addressScope, setAddressScope] = useState<HotspotAddressScope>('both');
  const [caseScope, setCaseScope] = useState<HotspotCaseScope>('all');
  const [districtFilter, setDistrictFilter] = useState('');
  const [policeStationFilter, setPoliceStationFilter] = useState('');
  const [mapMode, setMapMode] = useState<MapMode>('clusters');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [visiblePointIds, setVisiblePointIds] = useState<Set<string>>(new Set());
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingLanguage, setBriefingLanguage] = useState<AssistantLanguage>('english');
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const clusterLayerRef = useRef<L.MarkerClusterGroup | null>(null);
  const heatLayerRef = useRef<L.Layer | null>(null);
  const hasFittedRef = useRef(false);

  const hotspotQuery = useQuery({
    queryKey: ['hotspot-points', query, addressScope, caseScope],
    queryFn: () =>
      listHotspotPoints({
        q: query || undefined,
        addressScope,
        caseScope,
        limit: 5000,
      }),
  });

  const allPoints = hotspotQuery.data?.points ?? [];
  const filteredPoints = useMemo(
    () =>
      allPoints.filter((point) => {
        if (districtFilter && point.district !== districtFilter) return false;
        if (policeStationFilter && point.police_station !== policeStationFilter) return false;
        return true;
      }),
    [allPoints, districtFilter, policeStationFilter]
  );

  const visiblePoints = useMemo(
    () => filteredPoints.filter((point) => visiblePointIds.has(point.point_id)),
    [filteredPoints, visiblePointIds]
  );

  const selectedPoint = useMemo(
    () => filteredPoints.find((point) => point.point_id === selectedPointId) ?? null,
    [filteredPoints, selectedPointId]
  );

  const topTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const point of filteredPoints) {
      const parsed = parseModusOperandi(point.modus_operandi ?? '');
      for (const tag of parsed.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filteredPoints]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      center: KERALA_CENTER,
      zoom: 8,
      scrollWheelZoom: true,
    });
    L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);
    clusterLayerRef.current = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48 });

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
      clusterLayerRef.current = null;
      heatLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const refreshVisible = () => {
      const bounds = map.getBounds();
      setVisiblePointIds(
        new Set(
          filteredPoints
            .filter((point) => bounds.contains(L.latLng(point.latitude, point.longitude)))
            .map((point) => point.point_id)
        )
      );
    };

    refreshVisible();
    map.on('moveend zoomend', refreshVisible);
    return () => {
      map.off('moveend zoomend', refreshVisible);
    };
  }, [filteredPoints]);

  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    const clusterLayer = clusterLayerRef.current;
    if (!map || !markersLayer || !clusterLayer) return;

    markersLayer.clearLayers();
    clusterLayer.clearLayers();
    if (map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
    if (heatLayerRef.current && map.hasLayer(heatLayerRef.current)) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    const markers = filteredPoints.map((point) => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: suspectMapMarkerIcon,
        title: point.criminal_name,
      });
      marker.bindPopup(popupHtml(point));
      marker.on('click', () => setSelectedPointId(point.point_id));
      return marker;
    });

    if (mapMode === 'markers') {
      markers.forEach((marker) => markersLayer.addLayer(marker));
      if (!map.hasLayer(markersLayer)) markersLayer.addTo(map);
    } else if (mapMode === 'clusters') {
      clusterLayer.addLayers(markers);
      clusterLayer.addTo(map);
    } else {
      const heatPoints = filteredPoints.map((point) => [point.latitude, point.longitude, pointWeight(point)] as [number, number, number]);
      heatLayerRef.current = L.heatLayer(heatPoints, {
        radius: 26,
        blur: 18,
        maxZoom: 17,
      });
      heatLayerRef.current.addTo(map);
    }

    if (filteredPoints.length > 0) {
      const bounds = L.latLngBounds(filteredPoints.map((point) => [point.latitude, point.longitude] as [number, number]));
      if (!hasFittedRef.current) {
        map.fitBounds(bounds.pad(0.15), { animate: false });
        hasFittedRef.current = true;
      }
      const currentBounds = map.getBounds();
      setVisiblePointIds(
        new Set(
          filteredPoints
            .filter((point) => currentBounds.contains(L.latLng(point.latitude, point.longitude)))
            .map((point) => point.point_id)
        )
      );
    } else {
      setVisiblePointIds(new Set());
    }
  }, [filteredPoints, mapMode]);

  useEffect(() => {
    setDistrictFilter('');
    setPoliceStationFilter('');
    hasFittedRef.current = false;
  }, [query, addressScope, caseScope]);

  useEffect(() => {
    hasFittedRef.current = false;
  }, [districtFilter, policeStationFilter]);

  const districts = hotspotQuery.data?.districts ?? [];
  const policeStations = useMemo(() => {
    const set = new Set<string>();
    for (const point of allPoints) {
      if (districtFilter && point.district !== districtFilter) continue;
      if (point.police_station) set.add(point.police_station);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allPoints, districtFilter]);

  const handleGenerateBrief = async () => {
    const focusPoints = visiblePoints.length > 0 ? visiblePoints : filteredPoints;
    if (focusPoints.length === 0) return;

    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const result = await assistantHotspotBrief({
        query: query || null,
        address_scope: addressScope,
        case_scope: caseScope,
        point_count: filteredPoints.length,
        visible_count: visiblePoints.length,
        districts: [...new Set(focusPoints.map((point) => point.district).filter(Boolean) as string[])],
        police_stations: [...new Set(focusPoints.map((point) => point.police_station).filter(Boolean) as string[])],
        points: focusPoints.slice(0, 60).map((point) => ({
          criminal_name: point.criminal_name,
          district: point.district,
          police_station: point.police_station,
          address_kind: point.address_kind,
          modus_operandi: point.modus_operandi,
          case_count: point.case_count,
        })),
        language: briefingLanguage,
      });
      setBriefing(result);
    } catch (err: any) {
      setBriefingError(err?.response?.data?.detail || err.message || 'Failed to generate hotspot brief.');
    } finally {
      setBriefingLoading(false);
    }
  };

  return (
    <AdminPageLayout
      title="Hotspot & Risk Console"
      description="OpenStreetMap hotspot view of suspect coordinates with cluster, heat map, and AI operational briefing."
      icon={MapPin}
    >
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-5">
          <AdminSectionCard
            title="Hotspot Filters"
            description="Search hotspot points, narrow the population, and switch how the map emphasizes density."
            className="shadow-sm"
          >
            <div className="p-5 md:p-6 space-y-5">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,1fr))]">
                <div className="xl:col-span-1">
                <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Search</label>
                <div className="flex gap-2">
                  <input
                    className="form-control"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Name, address, modus operandi..."
                  />
                  <AdminButton type="button" variant="primary" onClick={() => setQuery(searchInput.trim())}>
                    <Search size={15} />
                    Apply
                  </AdminButton>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Address Scope</label>
                <select
                  className="form-control"
                  value={addressScope}
                  onChange={(e) => setAddressScope(e.target.value as HotspotAddressScope)}
                >
                  <option value="both">Both</option>
                  <option value="permanent">Permanent</option>
                  <option value="present">Present</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Case Scope</label>
                <select
                  className="form-control"
                  value={caseScope}
                  onChange={(e) => setCaseScope(e.target.value as HotspotCaseScope)}
                >
                  <option value="all">All Suspects</option>
                  <option value="recent_active">Recent / Active Cases</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-iip-text-muted">District</label>
                <select
                  className="form-control"
                  value={districtFilter}
                  onChange={(e) => {
                    setDistrictFilter(e.target.value);
                    setPoliceStationFilter('');
                  }}
                >
                  <option value="">All districts</option>
                  {districts.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-iip-text-muted">Police Station</label>
                <select
                  className="form-control"
                  value={policeStationFilter}
                  onChange={(e) => setPoliceStationFilter(e.target.value)}
                >
                  <option value="">All police stations</option>
                  {policeStations.map((station) => (
                    <option key={station} value={station}>
                      {station}
                    </option>
                  ))}
                </select>
              </div>

              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-iip-border bg-iip-bg/45 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-iip-text-muted">
                    Map Emphasis
                  </p>
                  <p className="mt-1 text-sm text-iip-text-muted">
                    Switch between exact suspect points, grouped hotspot clusters, or raw density.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AdminButton type="button" variant={mapMode === 'markers' ? 'primary' : 'secondary'} onClick={() => setMapMode('markers')}>
                    <CircleDot size={15} />
                    Markers
                  </AdminButton>
                  <AdminButton type="button" variant={mapMode === 'clusters' ? 'primary' : 'secondary'} onClick={() => setMapMode('clusters')}>
                    <Layers3 size={15} />
                    Cluster Hotspots
                  </AdminButton>
                  <AdminButton type="button" variant={mapMode === 'heatmap' ? 'primary' : 'secondary'} onClick={() => setMapMode('heatmap')}>
                    <Flame size={15} />
                    Heat Map
                  </AdminButton>
                  <AdminButton type="button" variant="ghost" onClick={() => hotspotQuery.refetch()}>
                    <RefreshCcw size={15} />
                    Refresh Data
                  </AdminButton>
                </div>
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="OpenStreetMap Hotspot View"
            description="Mapped suspect coordinates with spatial density overlays and live viewport counts."
            className="shadow-sm"
          >
            <div className="p-4 md:p-5">
              <div className="relative overflow-hidden rounded-2xl border border-iip-border bg-iip-bg shadow-inner">
                <div className="absolute left-3 top-3 z-[500] flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-100 backdrop-blur">
                  <span className="font-semibold text-cyan-300">{mapMode === 'markers' ? 'Marker View' : mapMode === 'clusters' ? 'Cluster View' : 'Heat View'}</span>
                  <span className="text-slate-400">•</span>
                  <span>{filteredPoints.length} filtered</span>
                  <span className="text-slate-400">•</span>
                  <span>{visiblePoints.length} in viewport</span>
                </div>
              <div ref={mapContainerRef} className="h-[68vh] w-full" />
              {hotspotQuery.isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-iip-bg/70 backdrop-blur-sm">
                  <div className="flex items-center gap-2 rounded-lg border border-iip-border bg-iip-surface px-4 py-3 text-sm text-iip-text-muted shadow-sm">
                    <Loader2 size={16} className="animate-spin" />
                    Loading hotspot points…
                  </div>
                </div>
              )}
            </div>
            </div>
          </AdminSectionCard>
        </div>

        <div className={PANEL_SPACING}>
          <AdminSectionCard
            title="Situation Summary"
            description="Fast numerical readout and dominant pattern indicators for the current filter state."
            className="shadow-sm"
          >
            <div className="p-5 md:p-6 space-y-5">
            {hotspotQuery.isError && (
              <p className="mb-3 text-sm text-red-600">
                {(hotspotQuery.error as Error)?.message || 'Failed to load hotspot points.'}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-iip-border bg-gradient-to-br from-iip-primary/10 to-transparent p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-iip-text-muted">Filtered Points</p>
                <p className="mt-1 text-2xl font-semibold text-iip-text">{filteredPoints.length}</p>
              </div>
              <div className="rounded-2xl border border-iip-border bg-gradient-to-br from-amber-500/10 to-transparent p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-iip-text-muted">Viewport Points</p>
                <p className="mt-1 text-2xl font-semibold text-iip-text">{visiblePoints.length}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-iip-text-muted">Top MO Tags</p>
              <div className="mt-3 flex flex-wrap gap-2.5">
                {topTags.length > 0 ? (
                  topTags.map(([tag, count]) => (
                    <span key={tag} className="rounded-full border border-iip-primary/15 bg-iip-primary/10 px-3 py-1.5 text-xs font-medium text-iip-primary shadow-sm">
                      {tag} ({count})
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-iip-text-muted">No MO tags available in the current filter.</p>
                )}
              </div>
            </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Selected Point"
            description="Detailed suspect snapshot for the marker currently selected on the map."
            className="shadow-sm"
          >
            <div className="p-5 md:p-6">
            {selectedPoint ? (
              <div className="space-y-4 text-sm text-iip-text-muted">
                <div className="flex items-start gap-4 rounded-2xl border border-iip-border bg-iip-bg/45 p-4 shadow-sm">
                  <SuspectDossierPhotoThumb
                    dossierDraftId={selectedPoint.dossier_draft_id}
                    photoId={selectedPoint.front_photo_id}
                    storageKey={selectedPoint.front_photo_storage_key}
                    alt={selectedPoint.criminal_name}
                    size="thumb"
                    className="shrink-0"
                  />
                  <div className="min-w-0 space-y-2.5">
                    <p className="text-base font-semibold leading-tight text-iip-text">{selectedPoint.criminal_name}</p>
                    {selectedPoint.alias_name && <p>Alias: {selectedPoint.alias_name}</p>}
                    <p>
                      {selectedPoint.address_kind === 'present' ? 'Present' : 'Permanent'} address: {selectedPoint.locality || selectedPoint.village_town_city || 'Mapped point'}
                    </p>
                    <p>District: {selectedPoint.district || '—'}</p>
                    <p>Police Station: {selectedPoint.police_station || '—'}</p>
                    <p>Case Count: {selectedPoint.case_count}</p>
                    <p>Link Status: {selectedPoint.link_status}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-iip-border bg-iip-bg/35 px-4 py-3">
                  <p className="text-xs text-iip-text-muted">Open the full dossier for case history, associates, and documents.</p>
                  <Link to={`/suspects/${selectedPoint.dossier_id}`} className="text-sm font-medium text-iip-primary hover:underline">
                    Open dossier
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-iip-border bg-iip-bg/30 px-4 py-6 text-sm text-iip-text-muted">
                Click any map point to inspect the suspect snapshot here.
              </div>
            )}
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="AI Area Brief"
            description="LLM-assisted operational reading of the visible or filtered hotspot area."
            className="shadow-sm"
          >
            <div className="p-5 md:p-6 space-y-4">
            <div className="flex flex-col gap-3 rounded-2xl border border-iip-border bg-iip-bg/45 p-4 md:flex-row md:items-center">
              <select
                className="form-control"
                value={briefingLanguage}
                onChange={(e) => setBriefingLanguage(e.target.value as AssistantLanguage)}
              >
                <option value="english">English</option>
                <option value="malayalam">Malayalam</option>
              </select>
              <AdminButton
                type="button"
                variant="primary"
                onClick={handleGenerateBrief}
                disabled={briefingLoading || filteredPoints.length === 0}
              >
                <Bot size={15} />
                {briefingLoading ? 'Generating…' : 'Generate Brief'}
              </AdminButton>
            </div>

            {briefingError && <p className="text-sm text-red-600">{briefingError}</p>}

            {briefing ? (
              <div className="rounded-2xl border border-iip-border bg-iip-bg/40 p-4 text-sm leading-6 text-iip-text-muted shadow-inner">
                {renderAssistantMarkdown(briefing)}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-iip-border bg-iip-bg/25 px-4 py-5 text-sm text-iip-text-muted">
                Generate an AI brief for the current map context. If the viewport contains points, the brief focuses on that visible area first.
              </div>
            )}
            </div>
          </AdminSectionCard>
        </div>
      </div>
    </AdminPageLayout>
  );
}
