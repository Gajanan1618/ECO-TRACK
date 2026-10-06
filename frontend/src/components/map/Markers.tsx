import { Marker, Polyline, Tooltip, Circle } from "react-leaflet";
import L from "leaflet";

import type { LatLng, Stop, StopStatus } from "../../lib/types";

export const STOP_COLOR: Record<StopStatus, string> = {
  PENDING: "#475569",
  ARRIVED: "#f59e0b",
  COVERED: "#059669",
  SKIPPED: "#dc2626",
};

const iconCache = new Map<string, L.DivIcon>();
function stopIcon(n: number, status: StopStatus, request: boolean, highlight: boolean): L.DivIcon {
  const key = `${n}|${status}|${request}|${highlight}`;
  let ic = iconCache.get(key);
  if (!ic) {
    const bg = request && status === "PENDING" ? "#7c3aed" : STOP_COLOR[status];
    const mark = status === "COVERED" ? "✓" : status === "SKIPPED" ? "✕" : String(n);
    ic = L.divIcon({
      className: "",
      html: `<div class="eco-stop" style="background:${bg};${highlight ? "outline:3px solid #10b98155;transform:scale(1.2)" : ""}">${mark}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    iconCache.set(key, ic);
  }
  return ic;
}

export function StopMarkers({
  stops, highlightId, onClick, draggable, onDragEnd,
}: {
  stops: (Pick<Stop, "id" | "name" | "lat" | "lng" | "status"> & { type?: Stop["type"] })[];
  highlightId?: string | null;
  onClick?: (id: string) => void;
  draggable?: boolean;
  onDragEnd?: (id: string, p: LatLng) => void;
}) {
  return (
    <>
      {stops.map((s, i) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          icon={stopIcon(i + 1, s.status, s.type === "PICKUP_REQUEST", highlightId === s.id)}
          draggable={draggable}
          eventHandlers={{
            click: () => onClick?.(s.id),
            dragend: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onDragEnd?.(s.id, { lat: ll.lat, lng: ll.lng });
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -12]}>{s.name}</Tooltip>
        </Marker>
      ))}
    </>
  );
}

/** Road route: white casing + coloured line; optional done/remaining split. */
export function RoutePath({
  geometry, progressIdx = 0, color = "#059669", dashed = false,
}: { geometry: [number, number][]; progressIdx?: number; color?: string; dashed?: boolean }) {
  if (geometry.length < 2) return null;
  const done = geometry.slice(0, progressIdx + 1);
  const rest = geometry.slice(progressIdx);
  return (
    <>
      <Polyline positions={geometry} pathOptions={{ color: "#fff", weight: 10, opacity: 0.95, lineCap: "round", lineJoin: "round" }} />
      {done.length > 1 && <Polyline positions={done} pathOptions={{ color: "#94a3b8", weight: 6, lineCap: "round", lineJoin: "round" }} />}
      <Polyline positions={rest} pathOptions={{ color, weight: 6, lineCap: "round", lineJoin: "round", dashArray: dashed ? "2 10" : undefined }} />
    </>
  );
}

export function TrailPath({ trail }: { trail: [number, number][] }) {
  if (trail.length < 2) return null;
  return <Polyline positions={trail} pathOptions={{ color: "#0ea5e9", weight: 4, opacity: 0.9, dashArray: "1 8", lineCap: "round" }} />;
}

const pinIcon = L.divIcon({ className: "eco-pin", html: '<div class="pulse"></div><div class="dot"></div>', iconSize: [0, 0] });

export function PinMarker({
  position, draggable, onMove, label,
}: { position: LatLng; draggable?: boolean; onMove?: (p: LatLng) => void; label?: string }) {
  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={pinIcon}
      draggable={draggable}
      zIndexOffset={500}
      eventHandlers={{
        dragend: (e) => {
          const ll = (e.target as L.Marker).getLatLng();
          onMove?.({ lat: ll.lat, lng: ll.lng });
        },
      }}
    >
      {label && <Tooltip direction="top" offset={[0, -10]} permanent>{label}</Tooltip>}
    </Marker>
  );
}

const depotIcon = L.divIcon({
  className: "",
  html: '<div class="eco-stop" style="background:#0f172a;border-radius:8px;width:30px;height:30px">D</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});
export function DepotMarker({ position }: { position: LatLng }) {
  return (
    <Marker position={[position.lat, position.lng]} icon={depotIcon}>
      <Tooltip direction="top" offset={[0, -12]}>Municipal depot</Tooltip>
    </Marker>
  );
}

/** Ring showing the "be ready" radius around a point (radius in metres). */
export function RadiusRing({ position, radius }: { position: LatLng; radius: number }) {
  return (
    <Circle
      center={[position.lat, position.lng]}
      radius={radius}
      pathOptions={{ color: "#2563eb", weight: 1.5, fillColor: "#2563eb", fillOpacity: 0.08, dashArray: "4 4" }}
    />
  );
}
