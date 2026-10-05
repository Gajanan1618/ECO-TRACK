import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { Vehicle, UserLocation } from "../types/vehicle";

// Fix default marker icons (Vite doesn't bundle Leaflet's default image paths correctly)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const truckIcon = new L.DivIcon({
  className: "truck-marker",
  html: '<div style="font-size: 28px; line-height: 1; transform: translate(-14px, -14px);">🚛</div>',
  iconSize: [28, 28],
});

const userIcon = new L.DivIcon({
  className: "user-marker",
  html: '<div style="font-size: 26px; line-height: 1; transform: translate(-13px, -13px);">📍</div>',
  iconSize: [26, 26],
});

interface Props {
  vehicles: Vehicle[];
  userLocation: UserLocation | null;
  selectedVehicleId: string | null;
  onSelect: (id: string) => void;
}

// Sub-component: Recenter map smoothly when a vehicle is clicked/selected
function RecenterOnSelect({
  vehicles,
  selectedVehicleId,
}: {
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
}) {
  const map = useMap();
  const previousVehicleId = useRef<string | null>(null);
  const selectedVehicle = vehicles.find(
    (vehicle) => vehicle.id === selectedVehicleId
  );
  const selectedLatitude = selectedVehicle?.coordinates.lat;
  const selectedLongitude = selectedVehicle?.coordinates.lng;

  useEffect(() => {
    if (selectedLatitude === undefined || selectedLongitude === undefined)
      return;
    const position: [number, number] = [selectedLatitude, selectedLongitude];
    if (previousVehicleId.current !== selectedVehicleId) {
      map.flyTo(position, 15, { duration: 0.6 });
      previousVehicleId.current = selectedVehicleId;
    } else {
      map.panTo(position, { animate: true, duration: 0.35 });
    }
  }, [map, selectedVehicleId, selectedLatitude, selectedLongitude]);

  return null;
}

// Sub-component: Animated Moving Vehicle Marker
function AnimatedVehicleMarker({
  vehicle,
  targetPos,
  isSelected,
  onSelect,
}: {
  vehicle: Vehicle;
  targetPos?: [number, number];
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const [currentPos, setCurrentPos] = useState<[number, number]>([
    vehicle.coordinates.lat,
    vehicle.coordinates.lng,
  ]);
  const animFrameRef = useRef<number | null>(null);

  // Animate towards new position when targetPos changes (e.g. on map click)
  useEffect(() => {
    if (!targetPos) return;

    const startPos = currentPos;
    const endPos = targetPos;
    const duration = 2500; // 2.5 seconds move animation
    let startTime: number | null = null;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Linear interpolation between start and destination
      const lat = startPos[0] + (endPos[0] - startPos[0]) * progress;
      const lng = startPos[1] + (endPos[1] - startPos[1]) * progress;
      setCurrentPos([lat, lng]);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [targetPos]);

  return (
    <Marker
      position={currentPos}
      icon={truckIcon}
      eventHandlers={{ click: () => onSelect(vehicle.id) }}
    >
      <Popup>
        <strong>{vehicle.vehicleNumber}</strong> {isSelected ? "(Active)" : ""}
        <br />
        {vehicle.areaName}
        <br />
        Status: <b>{vehicle.status}</b>
        <br />
        <small style={{ color: "#2563eb" }}>Click map to reroute truck</small>
      </Popup>
    </Marker>
  );
}

// Sub-component: Handles user clicks on the map to dispatch/move truck
function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function MapView({
  vehicles,
  userLocation,
  selectedVehicleId,
  onSelect,
}: Props) {
  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [21.0077, 75.5626];

  // Store custom target coordinates for animated truck rerouting
  const [truckTargets, setTruckTargets] = useState<Record<string, [number, number]>>({});
  const [routeLine, setRouteLine] = useState<[number, number][] | null>(null);

  const handleMapClick = (lat: number, lng: number) => {
    // Choose selected truck or default to the first vehicle
    const activeId = selectedVehicleId || vehicles[0]?.id;
    if (!activeId) return;

    const activeVehicle = vehicles.find((v) => v.id === activeId);
    const startLat = truckTargets[activeId]?.[0] ?? activeVehicle?.coordinates.lat ?? center[0];
    const startLng = truckTargets[activeId]?.[1] ?? activeVehicle?.coordinates.lng ?? center[1];

    // Show path line from current position to clicked destination
    setRouteLine([
      [startLat, startLng],
      [lat, lng],
    ]);

    // Trigger moving animation towards clicked point
    setTruckTargets((prev) => ({
      ...prev,
      [activeId]: [lat, lng],
    }));
  };

  return (
    <MapContainer
      center={center}
      zoom={14}
      className="map-container"
      scrollWheelZoom
      style={{ height: "100%", width: "100%", minHeight: "80vh" }}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MapClickHandler onMapClick={handleMapClick} />

      {/* Route trajectory line when dispatching */}
      {routeLine && (
        <Polyline positions={routeLine} color="#2563eb" dashArray="6, 8" />
      )}

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
          <Popup>You are here</Popup>
        </Marker>
      )}

      {vehicles.map((v) => (
        <AnimatedVehicleMarker
          key={v.id}
          vehicle={v}
          targetPos={truckTargets[v.id]}
          isSelected={v.id === selectedVehicleId}
          onSelect={onSelect}
        />
      ))}

      <RecenterOnSelect
        vehicles={vehicles}
        selectedVehicleId={selectedVehicleId}
      />
    </MapContainer>
  );
}
