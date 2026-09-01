/**
 * Reading the `kbs_who` hint out of a document cookie string.
 *
 * Pulled out of the header component so it can be tested: parsing
 * `document.cookie` by hand is exactly the kind of thing that works until
 * somebody has a cookie whose name ends in the one you are looking for.
 */
export const WHO_COOKIE = "kbs_who";

const VALID = /^[a-z_]{1,32}$/;

export function roleFromCookies(cookieString: string): string | null {
  for (const part of cookieString.split(";")) {
    const raw = part.trim();
    const eq = raw.indexOf("=");
    if (eq < 1) continue;
    // Exact name match. `startsWith` would happily match "not_kbs_who".
    if (raw.slice(0, eq) !== WHO_COOKIE) continue;
    let value: string;
    try {
      value = decodeURIComponent(raw.slice(eq + 1));
    } catch {
      return null;
    }
    return VALID.test(value) ? value : null;
  }
  return null;
}

/** Whether this role gets the staff label rather than the coach one. */
export function isStaffRole(role: string): boolean {
  return role === "admin" || role === "staff";
}
