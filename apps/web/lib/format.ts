const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Parse a YYYY-MM-DD date without dragging the server's zone into it. */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatSlateDate(iso: string): string {
  const d = parseLocalDate(iso);
  return `${DAY[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function formatShortDate(iso: string): string {
  const d = parseLocalDate(iso);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export function shiftDate(iso: string, days: number): string {
  const d = parseLocalDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Kentucky spans Eastern and Central. Tip times are rendered in the home
 * school's own zone with the abbreviation shown, so a 7:30 CT game in Paducah
 * never reads as 7:30 in Pikeville.
 */
export function formatTipTime(startsAt: string | null, timeZone: string): string | null {
  if (!startsAt) return null;
  const dt = new Date(startsAt);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(dt);
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  })
    .formatToParts(dt)
    .find((p) => p.type === "timeZoneName")?.value;
  return `${time} ${zone ?? ""}`.trim();
}

export function zoneAbbrev(timeZone: string): string {
  return timeZone === "America/Chicago" ? "CT" : "ET";
}

/** 0.462 -> ".462" — the way a box score prints a percentage. */
export function pct(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(3).replace(/^0/, "");
}

export function num(value: number | undefined, digits = 0): string {
  if (value === undefined || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

/**
 * Inches to the way a roster prints a height: 72 -> 6'0".
 *
 * Football rosters are read by people who think in feet and inches; 72 means
 * nothing at a glance.
 */
export function formatHeight(inches: number | null): string | null {
  if (inches === null || inches <= 0) return null;
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}
