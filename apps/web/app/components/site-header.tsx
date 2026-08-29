import Link from "next/link";
import { Logo } from "./logo";

/**
 * Sport and season stay visible and changeable from every page. Switching
 * sport keeps you on the same kind of page rather than dumping you home.
 */
export function SiteHeader({
  sports,
  activeSport,
}: {
  sports: { slug: string; name: string; urlYear: number }[];
  activeSport?: string;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-2.5">
        <Link href="/" className="shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
          <Logo className="text-base" />
        </Link>
        <nav aria-label="Sport" className="flex items-center gap-1 overflow-x-auto">
          {sports.map((s) => (
            <Link
              key={s.slug}
              href={`/${s.slug}/scores`}
              aria-current={activeSport === s.slug ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                activeSport === s.slug
                  ? "bg-brand-fill text-on-brand"
                  : "text-fg-muted hover:bg-surface hover:text-fg"
              }`}
            >
              {s.name}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
