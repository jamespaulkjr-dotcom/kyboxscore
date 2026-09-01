import type { GameStatus } from "@kyboxscore/db";

/**
 * Status is carried by weight and shape together, never color alone: final is
 * full-contrast bold, scheduled recedes, and a game being played right now
 * gets the red LIVE pill every sports app uses, with a pulsing dot.
 *
 * The pill is a badge rather than red text on purpose. Postponed and canceled
 * are already red text, and "canceled" and "happening right now" are the two
 * things that must never be confused at a glance.
 */
export function StatusLabel({
  status,
  detail,
  isLive = true,
}: {
  status: GameStatus;
  detail: string;
  /**
   * An in-progress game nobody has touched for hours is not live. Saying LIVE
   * at three in the morning is worse than saying nothing, so it falls back to
   * the score with an honest label.
   */
  isLive?: boolean;
}) {
  if (status === "in_progress" && !isLive) {
    return <span className="text-scheduled">{detail}</span>;
  }
  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-live-fill px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-on-live">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-on-live motion-safe:animate-pulse"
            aria-hidden
          />
          Live
        </span>
        {detail !== "In progress" && (
          <span className="font-semibold text-fg">{detail}</span>
        )}
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
