import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useEffect, type ReactNode } from "react";
import type { LatLng } from "../../lib/types";

interface Props {
  center: LatLng;
  zoom?: number;
  children?: ReactNode;
  className?: string;
}

export default function BaseMap({ center, zoom = 16, children, className = "" }: Props) {
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      zoomControl={false}
      className={`h-full w-full ${className}`}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      <ZoomPosition />
      {children}
    </MapContainer>
  );
}

function ZoomPosition() {
  const map = useMap();
  useEffect(() => {
    const c = L.control.zoom({ position: "bottomright" });
    c.addTo(map);
    return () => { c.remove(); };
  }, [map]);
  return null;
}

/** Fit the map to the given points whenever `fitKey` changes. */
export function FitBounds({ points, fitKey, padding = 60 }: { points: LatLng[]; fitKey: string | number; padding?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) { map.setView([points[0].lat, points[0].lng], Math.max(map.getZoom(), 16)); return; }
    map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [padding, padding], maxZoom: 18 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

export function FlyTo({ target, zoom }: { target: LatLng | null; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], zoom ?? map.getZoom(), { duration: 0.6 });
  }, [map, target, zoom]);
  return null;
}

/** Keeps the map centred on a moving point (Uber/Ola-style follow mode). */
export function Follow({ target, enabled, onUserDrag }: { target: LatLng | null; enabled: boolean; onUserDrag?: () => void }) {
  const map = useMap();
  useMapEvents({ dragstart: () => onUserDrag?.() });
  useEffect(() => {
    if (enabled && target) map.panTo([target.lat, target.lng], { animate: true, duration: 0.9, easeLinearity: 1 });
  }, [map, enabled, target]);
  return null;
}

export function ClickHandler({ onClick }: { onClick: (p: LatLng) => void }) {
  useMapEvents({ click: (e) => onClick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}
