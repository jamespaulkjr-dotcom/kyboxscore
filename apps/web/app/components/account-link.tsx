"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isStaffRole, roleFromCookies } from "../../lib/who";

const CHROME =
  "shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/**
 * "Sign in", or a way back to your own tools if you are already signed in.
 *
 * The header is server-rendered into a page that is cached and shared by
 * everybody, so it cannot know who is reading it. This reads the `kbs_who`
 * hint cookie in the browser instead and swaps the label after hydration.
 * The cached HTML stays anonymous and correct for every viewer.
 *
 * The hint carries a role and nothing else. If somebody forges it they get a
 * different word in the header and a redirect to the login page, because every
 * page behind it checks the real session on the server.
 */
export function AccountLink() {
  const [role, setRole] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setRole(roleFromCookies(document.cookie));
    } catch {
      // Cookies can be unavailable or throw in some embedded contexts. The
      // signed-out label is the safe answer.
    }
  }, []);

  // Until it is known, render exactly what the cached HTML said, so nothing
  // moves under the reader's thumb on a slow connection.
  if (!mounted || !role) {
    return (
      <Link
        href="/login"
        className={`${CHROME} text-[color:var(--chrome-muted)] hover:bg-white/10 hover:text-white`}
      >
        Sign in
      </Link>
    );
  }

  const isStaff = isStaffRole(role);
  return (
    <Link
      href="/coach"
      className={`${CHROME} bg-gold/15 text-gold hover:bg-gold/25`}
    >
      {isStaff ? "Admin" : "Your teams"}
    </Link>
  );
}
