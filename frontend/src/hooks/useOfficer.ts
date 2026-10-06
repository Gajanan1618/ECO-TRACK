import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { getSocket } from "../lib/socket";
import type { OfficerState } from "../lib/types";

export function useOfficer(token: string, onAuthLost: () => void) {
  const [state, setState] = useState<OfficerState | null>(null);

  useEffect(() => {
    const s = getSocket();
    const join = () => s.emit("officer:join", token, (r: { status: string }) => { if (r?.status !== "success") onAuthLost(); });
    const onState = (st: OfficerState) => setState(st);
    s.on("connect", join);
    s.on("officer:state", onState);
    if (s.connected) join();
    api<{ status: string } & OfficerState>("/api/officer/overview", { token }).then(setState).catch((e) => { if (e instanceof ApiError && e.status === 401) onAuthLost(); });
    return () => { s.off("connect", join); s.off("officer:state", onState); };
  }, [token, onAuthLost]);

  const call = useCallback(
    async <T,>(path: string, method: string, body?: unknown): Promise<T> => {
      try { return await api<T>(path, { method, body: body ?? (method === "GET" || method === "DELETE" ? undefined : {}), token }); }
      catch (e) { if (e instanceof ApiError && e.status === 401) onAuthLost(); throw e; }
    },
    [token, onAuthLost],
  );

  return { state, call };
}
