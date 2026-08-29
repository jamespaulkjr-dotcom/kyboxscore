/**
 * Brand marks from the approved KY BOXSCORE logo package (docs/assets).
 * Derivatives in /public/brand are cropped to content, re-centred and
 * downscaled with a box filter - the source PNGs have hard 1-bit alpha, so
 * scaling them in the browser aliases badly.
 *
 * Plain <img> rather than next/image: these are fixed-size static marks, and
 * it keeps the native sharp dependency out of the Alpine runtime image.
 */

export function Wordmark({ className = "h-7 sm:h-9" }: { className?: string }) {
  return (
    <img
      src="/brand/wordmark-80.png"
      width={386}
      height={80}
      alt="KY BOXSCORE"
      className={`${className} w-auto`}
      fetchPriority="high"
      decoding="async"
    />
  );
}

/** Compact square mark for tight spaces. */
export function AppMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <img
      src="/brand/app-icon-180.png"
      width={180}
      height={180}
      alt=""
      aria-hidden
      className={className}
      decoding="async"
    />
  );
}

/** Kentucky secondary badge - used once, in the footer. */
export function KentuckyBadge({ className = "h-8" }: { className?: string }) {
  return (
    <img
      src="/brand/kentucky-badge-64.png"
      width={142}
      height={64}
      alt=""
      aria-hidden
      className={`${className} w-auto`}
      loading="lazy"
      decoding="async"
    />
  );
}

/** Full stacked lockup for hero and error states. */
export function Lockup({ className = "h-24" }: { className?: string }) {
  return (
    <img
      src="/brand/lockup-180.png"
      width={364}
      height={180}
      alt="KY BOXSCORE"
      className={`${className} w-auto`}
      decoding="async"
    />
  );
}
