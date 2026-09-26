import { isValidPhoneNumber } from "../utils/validation";

/**
 * Handles initiating a call. On web this opens a tel: link where supported.
 * A masked/VoIP bridge (Twilio/Exotel) is NOT wired up in this prototype —
 * see README for how to add that later.
 */
export function callDriver(phone: string): { success: boolean; message: string } {
  if (!isValidPhoneNumber(phone)) {
    return { success: false, message: "Invalid or missing phone number" };
  }
  // Never auto-dial without explicit user action — this is only ever
  // called from an onClick handler.
  window.location.href = `tel:${phone}`;
  return { success: true, message: "Opening dialer..." };
}
