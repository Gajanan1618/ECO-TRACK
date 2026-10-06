import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Vehicle } from "../../lib/types";

const html = (label: string, heading: number) => `
  <div style="position:relative;width:44px;height:44px">
    <svg class="rot" viewBox="0 0 44 44" style="transform:rotate(${heading}deg)">
      <circle cx="22" cy="22" r="19" fill="#fff" stroke="currentColor" stroke-width="3"/>
      <path d="M22 9 L31 31 L22 26.5 L13 31 Z" fill="currentColor"/>
    </svg>
    <div class="tag">${label}</div>
  </div>`;

interface Props {
  vehicle: Vehicle;
  selected?: boolean;
  onClick?: (id: string) => void;
}

/** Smoothly animated vehicle marker that rotates with its heading. */
export default function VehicleMarker({ vehicle, selected, onClick }: Props) {
  const map = useMap();
  const marker = useRef<L.Marker | null>(null);
  const raf = useRef<number | null>(null);
  const shown = useRef<[number, number] | null>(null);
  const angle = useRef(0);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  const offline = vehicle.status === "OFFLINE" || vehicle.status === "MAINTENANCE";
  const color = offline ? "#64748b" : vehicle.status === "ON_ROUTE" ? "#059669" : "#2563eb";

  // create once
  useEffect(() => {
    if (!vehicle.coordinates) return;
    const pos: [number, number] = [vehicle.coordinates.lat, vehicle.coordinates.lng];
    shown.current = pos;
    angle.current = vehicle.heading;
    const m = L.marker(pos, {
      icon: L.divIcon({ className: "eco-vehicle", html: html(vehicle.vehicleNumber.slice(-4), vehicle.heading), iconSize: [44, 44], iconAnchor: [22, 22] }),
      zIndexOffset: 1000,
    }).addTo(map);
    m.on("click", () => clickRef.current?.(vehicle.id));
    marker.current = m;
    return () => { if (raf.current) cancelAnimationFrame(raf.current); m.remove(); marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, vehicle.id, !!vehicle.coordinates]);

  // style state
  useEffect(() => {
    const el = marker.current?.getElement();
    if (!el) return;
    el.style.color = color;
    el.classList.toggle("sel", !!selected);
    el.classList.toggle("off", offline);
    marker.current?.setZIndexOffset(selected ? 2000 : 1000);
  }, [color, selected, offline, vehicle.coordinates === null]);

  // move + rotate
  useEffect(() => {
    const m = marker.current;
    const to = vehicle.coordinates;
    if (!m || !to || !shown.current) return;
    const from = shown.current;
    const dest: [number, number] = [to.lat, to.lng];
    const start = performance.now();
    const dur = 1000;
    if (raf.current) cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const p: [number, number] = [from[0] + (dest[0] - from[0]) * k, from[1] + (dest[1] - from[1]) * k];
      shown.current = p;
      m.setLatLng(p);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);

    // shortest-path rotation
    let diff = ((vehicle.heading - angle.current) % 360 + 540) % 360 - 180;
    if (Math.abs(diff) < 1) diff = 0;
    angle.current += diff;
    const rot = m.getElement()?.querySelector<SVGElement>(".rot");
    if (rot) rot.style.transform = `rotate(${angle.current}deg)`;
  }, [vehicle.coordinates?.lat, vehicle.coordinates?.lng, vehicle.heading]);

  return null;
}
