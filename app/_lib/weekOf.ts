/**
 * Returns the ISO date string (YYYY-MM-DD) for Monday of the current week
 * in the server's local timezone.
 */
export function currentMondayISO(): string {
  const now = new Date();
  // getDay() returns 0=Sun, 1=Mon ... 6=Sat
  const day = now.getDay();
  // Days since Monday (0 if Mon, 1 if Tue, … 6 if Sun)
  const diff = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const date = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}
