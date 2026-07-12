export const EXPIRY_WINDOW_DAYS = 60;

export function daysUntil(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
}

/** True when endDate falls within today..+EXPIRY_WINDOW_DAYS (inclusive). */
export function isExpiring(endDate?: string | null): boolean {
  if (!endDate) return false;
  const d = daysUntil(endDate);
  return d >= 0 && d <= EXPIRY_WINDOW_DAYS;
}
