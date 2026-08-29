import { KentuckyBadge } from "./logo";

export function SiteFooter() {
  return (
    <footer className="chrome mt-12 border-t-2 border-gold">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <KentuckyBadge />
        <p className="text-sm text-[color:var(--chrome-muted)]">
          An independent Kentucky high school sports record.
          <br className="hidden sm:block" /> Not affiliated with the KHSAA.
        </p>
      </div>
    </footer>
  );
}
