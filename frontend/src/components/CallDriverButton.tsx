import { isValidPhoneNumber } from "../utils/validation";
import { callDriver } from "../services/callService";

export default function CallDriverButton({ phone }: { phone: string }) {
  const disabled = !isValidPhoneNumber(phone);

  return (
    <button
      className="call-button"
      disabled={disabled}
      onClick={() => callDriver(phone)}
      title={disabled ? "No valid phone number for this driver" : "Call driver"}
    >
      {disabled ? "Contact unavailable" : "📞 Call Driver"}
    </button>
  );
}
