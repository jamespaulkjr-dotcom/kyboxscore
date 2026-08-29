import type { GameStatus } from "@kyboxscore/db";

/**
 * Status is carried by weight and color together, never color alone: final is
 * full-contrast bold, in progress is goldenrod with a slow pulse, scheduled
 * recedes. Readable at a glance and readable to a screen reader.
 */
export function StatusLabel({
  status,
  detail,
}: {
  status: GameStatus;
  detail: string;
}) {
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-live">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-live motion-safe:animate-pulse"
          aria-hidden
        />
        <span className="sr-only">In progress: </span>
        {detail}
      </span>
    );
  }
  if (status === "final" || status === "forfeit") {
    return <span className="font-semibold text-fg">{detail}</span>;
  }
  if (status === "postponed" || status === "canceled") {
    return <span className="text-loss">{detail}</span>;
  }
  return <span className="text-scheduled">{detail}</span>;
}
