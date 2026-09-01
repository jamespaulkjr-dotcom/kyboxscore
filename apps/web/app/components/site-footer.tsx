import Link from "next/link";
import { KentuckyBadge } from "./logo";

export function SiteFooter() {
  return (
    <footer className="chrome mt-12 border-t-2 border-gold">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <KentuckyBadge />
        <div className="text-sm text-[color:var(--chrome-muted)]">
          <p>
            An independent Kentucky high school sports record.
            <br className="hidden sm:block" /> Not affiliated with the KHSAA.
          </p>
          {/* The only route to the about page from a page that is not the
              front page, which is most of them. */}
          <p className="mt-1 flex flex-wrap gap-x-4">
            <Link href="/about" className="underline hover:text-white">
              About
            </Link>
            <Link href="/sports" className="underline hover:text-white">
              Sports
            </Link>
            <a href="mailto:help@kyboxscore.com" className="underline hover:text-white">
              Report a correction
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
