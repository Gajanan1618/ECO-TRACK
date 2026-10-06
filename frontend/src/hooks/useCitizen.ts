import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { alertUser } from "../lib/alerts";
import type { LatLng, Notice, PickupRequest } from "../lib/types";

const ACTIVE = ["PENDING", "ASSIGNED", "ARRIVING"];

export function useCitizen(clientId: string, location: LatLng | null) {
  const [requests, setRequests] = useState<PickupRequest[]>([]);
  const [notices, setNotices] = useState<(Notice & { id: number })[]>([]);
  const idRef = useRef(0);
  const loc = useRef(location);
  loc.current = location;

  const merge = useCallback((r: PickupRequest) => {
    setRequests((prev) => {
      const i = prev.findIndex((x) => x.id === r.id);
      if (i === -1) return [r, ...prev];
      const next = [...prev];
      // keep last known path if this update carries none
      next[i] = { ...r, path: r.path ?? prev[i].path };
      return next;
    });
  }, []);

  useEffect(() => {
    api<{ requests: PickupRequest[] }>(`/api/requests?clientId=${encodeURIComponent(clientId)}`)
      .then((d) => setRequests(d.requests))
      .catch(() => {});
  }, [clientId]);

  // register for proximity alerts (re-sent on reconnect and whenever the pin moves)
  useEffect(() => {
    const s = getSocket();
    const send = () => {
      if (loc.current) s.emit("citizen:watch", { clientId, lat: loc.current.lat, lng: loc.current.lng });
    };
    s.on("connect", send);
    send();
    return () => { s.off("connect", send); };
  }, [clientId]);
  useEffect(() => {
    if (location) getSocket().emit("citizen:watch", { clientId, lat: location.lat, lng: location.lng });
  }, [clientId, location?.lat, location?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = getSocket();
    const onReq = (r: PickupRequest) => merge(r);
    const onNotify = (n: Notice) => {
      const id = ++idRef.current;
      setNotices((p) => [{ ...n, id }, ...p].slice(0, 3));
      const title = n.type === "nearby" ? "Be ready with your bins!" : n.type === "approaching" ? "Vehicle approaching" : n.type === "collected" ? "Pickup complete" : n.type === "assigned" ? "Vehicle assigned" : "Pickup update";
      alertUser(title, n.message, n.type === "nearby");
      setTimeout(() => setNotices((p) => p.filter((x) => x.id !== id)), n.type === "nearby" ? 40000 : 9000);
    };
    s.on("request:update", onReq);
    s.on("notify", onNotify);
    return () => { s.off("request:update", onReq); s.off("notify", onNotify); };
  }, [merge]);

  const dismiss = (id: number) => setNotices((p) => p.filter((n) => n.id !== id));
  const active = requests.find((r) => ACTIVE.includes(r.status)) || null;

  const create = async (body: { name: string; phone: string; wasteType: string; note: string; lat: number; lng: number }) => {
    const d = await api<{ request: PickupRequest }>("/api/requests", { body: { ...body, clientId } });
    merge(d.request);
    return d.request;
  };
  const cancel = async (id: string) => {
    const d = await api<{ request: PickupRequest }>(`/api/requests/${id}/cancel`, { body: { clientId } });
    merge(d.request);
  };

  return { requests, active, notices, dismiss, create, cancel };
}
