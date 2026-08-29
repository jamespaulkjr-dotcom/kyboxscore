import Link from "next/link";

/**
 * Persistent mobile navigation. Four destinations, always reachable, so no
 * page is ever more than two taps from any other.
 */
const ITEMS = [
  { key: "scores", label: "Scores", href: (s: string) => `/${s}/scores` },
  { key: "teams", label: "Teams", href: (s: string) => `/${s}/teams` },
  { key: "stats", label: "Stats", href: (s: string) => `/${s}/stats` },
  { key: "search", label: "Search", href: () => `/search` },
] as const;

export function BottomNav({
  sportSlug,
  active,
}: {
  sportSlug: string;
  active?: string;
}) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 border-t border-border bg-bg/95 backdrop-blur sm:hidden"
    >
      <ul className="mx-auto flex max-w-4xl">
        {ITEMS.map((item) => (
          <li key={item.key} className="flex-1">
            <Link
              href={item.href(sportSlug)}
              aria-current={active === item.key ? "page" : undefined}
              className={`flex min-h-12 items-center justify-center px-2 py-3 text-sm font-medium ${
                active === item.key ? "text-brand" : "text-fg-muted"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
