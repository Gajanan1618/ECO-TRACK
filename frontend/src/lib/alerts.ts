let ctx: AudioContext | null = null;

/** Call from a user gesture once so sounds/notifications are allowed later. */
export function primeAlerts() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume();
  } catch { /* unsupported */ }
  if ("Notification" in window && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export function alertUser(title: string, body: string, loud = false) {
  try { navigator.vibrate?.(loud ? [250, 120, 250, 120, 400] : [120]); } catch { /* ignore */ }
  try {
    if (ctx) {
      const beeps = loud ? 3 : 1;
      for (let i = 0; i < beeps; i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = loud ? 880 : 660;
        const t = ctx.currentTime + i * 0.28;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.start(t); o.stop(t + 0.24);
      }
    }
  } catch { /* ignore */ }
  try {
    if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
      new Notification(title, { body, icon: "/favicon.svg", tag: "ecotrack" });
    }
  } catch { /* ignore */ }
}
