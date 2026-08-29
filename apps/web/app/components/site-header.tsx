import Link from "next/link";
import { Wordmark } from "./logo";

/**
 * The header is always brand navy, in both themes, so the navy-grounded logo
 * always sits on the ground it was drawn for. Sport and season stay visible
 * and changeable from every page.
 */
export function SiteHeader({
  sports,
  activeSport,
}: {
  sports: { slug: string; name: string; urlYear: number }[];
  activeSport?: string;
}) {
  return (
    <header className="chrome sticky top-0 z-20 border-b-2 border-gold">
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-2 sm:gap-5">
        <Link
          href="/"
          aria-label="KY BOXSCORE home"
          className="shrink-0 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        >
          <Wordmark />
        </Link>
        <nav aria-label="Sport" className="-mx-1 flex items-center gap-1 overflow-x-auto px-1">
          {sports.map((s) => (
            <Link
              key={s.slug}
              href={`/${s.slug}/scores`}
              aria-current={activeSport === s.slug ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                activeSport === s.slug
                  ? "bg-gold text-navy"
                  : "text-[color:var(--chrome-muted)] hover:bg-white/10 hover:text-white"
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
