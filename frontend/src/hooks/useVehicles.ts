import { useEffect, useState } from "react";
import { getSocket } from "../lib/socket";
import type { Vehicle } from "../lib/types";

export function useVehicles() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = getSocket();
    const onList = (list: Vehicle[]) => { setVehicles(list); setReady(true); };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("vehicles:update", onList);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    if (s.connected) setConnected(true);
    return () => {
      s.off("vehicles:update", onList);
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
    };
  }, []);

  return { vehicles, connected, ready };
}
