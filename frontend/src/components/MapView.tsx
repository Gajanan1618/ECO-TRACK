import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
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
  html: "🚛",
  iconSize: [28, 28],
});

const userIcon = new L.DivIcon({
  className: "user-marker",
  html: "📍",
  iconSize: [26, 26],
});

interface Props {
  vehicles: Vehicle[];
  userLocation: UserLocation | null;
  selectedVehicleId: string | null;
  onSelect: (id: string) => void;
}

function RecenterOnSelect({ vehicles, selectedVehicleId }: { vehicles: Vehicle[]; selectedVehicleId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const v = vehicles.find((x) => x.id === selectedVehicleId);
    if (v) map.flyTo([v.coordinates.lat, v.coordinates.lng], 15, { duration: 0.6 });
  }, [selectedVehicleId]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function MapView({ vehicles, userLocation, selectedVehicleId, onSelect }: Props) {
  const center: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lng]
    : [21.0077, 75.5626];

  return (
    <MapContainer center={center} zoom={14} className="map-container" scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
          <Popup>You are here</Popup>
        </Marker>
      )}

      {vehicles.map((v) => (
        <Marker
          key={v.id}
          position={[v.coordinates.lat, v.coordinates.lng]}
          icon={truckIcon}
          eventHandlers={{ click: () => onSelect(v.id) }}
        >
          <Popup>
            <strong>{v.vehicleNumber}</strong>
            <br />
            {v.areaName}
            <br />
            Status: {v.status}
          </Popup>
        </Marker>
      ))}

      <RecenterOnSelect vehicles={vehicles} selectedVehicleId={selectedVehicleId} />
    </MapContainer>
  );
}
