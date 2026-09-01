"use client";

import { useEffect, useState } from "react";
import { isFollowing, toggleFollowing } from "../../lib/favorites";

/**
 * Rendered as nothing until mounted: the answer lives in localStorage, which
 * the server cannot know, and flashing the wrong state is worse than a beat of
 * blankness.
 */
export function FollowButton({
  slug,
  name,
  sport,
}: {
  slug: string;
  name: string;
  sport: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    setMounted(true);
    setFollowing(isFollowing(slug, sport));
  }, [slug, sport]);

  // The accessible name starts with the visible label so voice control
  // ("click Follow") still works, then adds the school for anyone who lands on
  // the button out of context.
  const label = following ? `Following ${name}` : `Follow ${name}`;

  if (!mounted) {
    return <span className="inline-block h-9 w-28" aria-hidden />;
  }

  return (
    <button
      type="button"
      onClick={() => setFollowing(toggleFollowing({ slug, name, sport }))}
      aria-pressed={following}
      aria-label={label}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link ${
        following
          ? "border-accent bg-accent/10 text-accent"
          : "border-border text-fg-muted hover:bg-surface-raised"
      }`}
    >
      <span aria-hidden>{following ? "★" : "☆"}</span>
      {following ? "Following" : "Follow"}
    </button>
  );
}
