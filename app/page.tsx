import { KentuckyMark, Logo } from "./components/logo";

/**
 * Placeholder home page. This route becomes the statewide scoreboard once the
 * data layer lands; for now it establishes the identity and proves the game
 * status colors are distinguishable at a glance, which the brief requires.
 */

type Row = {
  status: "final" | "live" | "scheduled";
  away: string;
  awayScore?: number;
  home: string;
  homeScore?: number;
  detail: string;
};

const SAMPLE: Row[] = [
  {
    status: "final",
    away: "Covington Catholic",
    awayScore: 62,
    home: "Highlands",
    homeScore: 58,
    detail: "Final",
  },
  {
    status: "live",
    away: "Paul Laurence Dunbar",
    awayScore: 41,
    home: "Frederick Douglass",
    homeScore: 44,
    detail: "3rd · 4:12",
  },
  {
    status: "scheduled",
    away: "Murray",
    home: "Marshall County",
    detail: "7:30 PM CT",
  },
];

function StatusBadge({ status, detail }: { status: Row["status"]; detail: string }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 text-live font-semibold">
        <span
          className="h-1.5 w-1.5 rounded-full bg-live motion-safe:animate-pulse"
          aria-hidden
        />
        {detail}
      </span>
    );
  }
  if (status === "final") {
    return <span className="font-semibold text-fg">{detail}</span>;
  }
  return <span className="text-scheduled">{detail}</span>;
}

function GameRow({ row }: { row: Row }) {
  const homeWon =
    row.homeScore !== undefined &&
    row.awayScore !== undefined &&
    row.homeScore > row.awayScore;

  return (
    <li className="border-b border-border last:border-0">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1">
          {[
            { name: row.away, score: row.awayScore, won: !homeWon },
            { name: row.home, score: row.homeScore, won: homeWon },
          ].map((t) => (
            <div key={t.name} className="flex items-baseline justify-between gap-3">
              <span
                className={`truncate ${
                  row.status === "scheduled"
                    ? "text-fg"
                    : t.won
                      ? "font-semibold text-fg"
                      : "text-fg-muted"
                }`}
              >
                {t.name}
              </span>
              {t.score !== undefined && (
                <span
                  className={`tabular text-lg leading-none ${
                    t.won ? "font-bold text-fg" : "text-fg-muted"
                  }`}
                >
                  {t.score}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="w-24 shrink-0 text-right text-sm">
          <StatusBadge status={row.status} detail={row.detail} />
        </div>
      </div>
    </li>
  );
}

export default function Home() {
  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo className="text-lg" />
          <span className="text-xs font-medium uppercase tracking-widest text-fg-muted">
            Preview
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="flex items-start gap-5">
          <KentuckyMark
            className="mt-1 hidden h-12 w-auto shrink-0 text-accent-fill sm:block"
            title="Kentucky"
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Kentucky High School Sports
            </h1>
            <p className="mt-2 text-lg text-fg-muted">Every game. Every box score.</p>
          </div>
        </div>

        <p className="mt-6 max-w-prose text-fg-muted">
          Scores and schedules draw the traffic. Statistics are the moat: coach
          entered box scores, statewide leaderboards, KHSAA classification and
          district structure, and an RPI you can actually audit.
        </p>

        <section className="mt-10" aria-labelledby="sample-heading">
          <h2
            id="sample-heading"
            className="mb-3 text-xs font-semibold uppercase tracking-widest text-fg-muted"
          >
            Scoreboard preview
          </h2>
          <ul className="overflow-hidden rounded-lg border border-border bg-surface">
            {SAMPLE.map((row) => (
              <GameRow key={`${row.away}-${row.home}`} row={row} />
            ))}
          </ul>
          <p className="mt-3 text-sm text-fg-muted">
            Sample data for layout only. Final, in progress and scheduled are
            distinguishable without reading the label.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-fg-muted">
          kyboxscore.com — an independent Kentucky high school sports record.
          Not affiliated with the KHSAA.
        </div>
      </footer>
    </>
  );
}
