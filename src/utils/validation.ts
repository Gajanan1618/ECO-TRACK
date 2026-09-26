export function isValidPhoneNumber(phone: string | undefined | null): boolean {
  if (!phone) return false;
  // Accepts +countrycode followed by 10-13 digits
  return /^\+?[0-9]{10,13}$/.test(phone.trim());
}

export function isValidCoordinates(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
