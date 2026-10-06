// Tiny role session helper (token lives in sessionStorage for the browser tab).
type Role = "officer" | "driver";
const key = (r: Role) => `ecotrack.${r}`;

export interface Session { token: string; vehicleId?: string }

export function loadSession(role: Role): Session | null {
  try {
    const raw = sessionStorage.getItem(key(role));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}
export function saveSession(role: Role, s: Session) {
  try { sessionStorage.setItem(key(role), JSON.stringify(s)); } catch { /* private mode */ }
}
export function clearSession(role: Role) {
  try { sessionStorage.removeItem(key(role)); } catch { /* ignore */ }
}

export function clientId(): string {
  try {
    let id = localStorage.getItem("ecotrack.clientId");
    if (!id) {
      id = (crypto.randomUUID?.() ?? `c-${Math.random().toString(36).slice(2)}${Date.now()}`);
      localStorage.setItem("ecotrack.clientId", id);
    }
    return id;
  } catch {
    return `c-${Math.random().toString(36).slice(2)}`;
  }
}
