import 'leaflet';

declare module 'leaflet.markercluster';
declare module 'leaflet.markercluster/dist/MarkerCluster.css';
declare module 'leaflet.markercluster/dist/MarkerCluster.Default.css';
declare module 'leaflet.heat';

declare module 'leaflet' {
  interface MarkerClusterGroup extends LayerGroup {
    clearLayers(): this;
    addLayer(layer: Layer): this;
    addLayers(layers: Layer[]): this;
  }

  function markerClusterGroup(options?: Record<string, unknown>): MarkerClusterGroup;

  function heatLayer(
    latlngs: Array<[number, number, number?]>,
    options?: Record<string, unknown>
  ): Layer;
}
