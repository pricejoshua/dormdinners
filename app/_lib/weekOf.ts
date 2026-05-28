/**
 * Returns the ISO date string (YYYY-MM-DD) for a Date in local time.
 */
export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for Monday of the current week
 * in the server's local timezone.
 */
export function currentMondayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  return toISODate(monday);
}

/**
 * True when `value` is a YYYY-MM-DD string naming a real calendar date
 * that falls on a Monday.
 */
export function isMondayISO(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  // Round-trip guard rejects rolled-over dates like 2026-02-30.
  if (toISODate(d) !== value) return false;
  return d.getDay() === 1;
}

/**
 * Returns the ISO date `weeks` weeks away from `weekOf` (negative = earlier).
 * `weekOf` must be a Monday YYYY-MM-DD string (see {@link isMondayISO}).
 */
export function addWeeksISO(weekOf: string, weeks: number): string {
  const d = new Date(`${weekOf}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toISODate(d);
}
