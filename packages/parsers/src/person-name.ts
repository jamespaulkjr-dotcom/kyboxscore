/**
 * Normalising a person's name as a roster writes it.
 *
 * Rosters arrive with some names shouted - MAKHAI BAYLOR next to Noah Harris -
 * because whoever typed that row had caps lock on. Fixing it is worth doing:
 * a record book that shouts a third of its names looks unmaintained.
 *
 * The danger is over-correcting. Real people are called AJ, TJ and D.K, and
 * "Aj" is worse than "AJ". Names also carry capitals that a naive title case
 * destroys: McLeroy, O'Brien, DeShields, DuLany-Waugh. So this only touches a
 * part that is entirely uppercase AND long enough not to be initials, and it
 * leaves every mixed-case name exactly as it was found.
 */

/**
 * Initials: "AJ", "T.J.", "D.K" - short, or punctuated.
 *
 * This also catches generational suffixes, which is the right outcome: "III"
 * and "IV" are left as written, and "JR" is genuinely ambiguous between a
 * suffix and a boy called J.R. Leaving it alone is the only answer that cannot
 * be wrong about a person's name.
 */
function looksLikeInitials(part: string): boolean {
  const letters = part.replace(/[^A-Za-z]/g, "");
  if (letters.length <= 3 && part.includes(".")) return true;
  return letters.length <= 3;
}

/** Capitalises one word, respecting the prefixes that carry a second capital. */
function capitalizeWord(word: string): string {
  if (word === "") return word;
  const lower = word.toLowerCase();

  // Mc and Mac take a capital on the following letter: McLeroy, MacArthur.
  const mc = /^(ma?c)(.+)$/.exec(lower);
  if (mc && mc[2].length >= 2) {
    return mc[1][0].toUpperCase() + mc[1].slice(1) + mc[2][0].toUpperCase() + mc[2].slice(1);
  }

  return lower[0].toUpperCase() + lower.slice(1);
}

/**
 * Title-cases a single name part, splitting on the separators that carry
 * capitals of their own: hyphens, apostrophes and spaces.
 */
function titleCase(part: string): string {
  return part
    .split(/([ \-'’])/)
    .map((piece, i) => (i % 2 === 1 ? piece : capitalizeWord(piece)))
    .join("");
}

/**
 * Returns the name as it should be stored, or the original if it should not be
 * touched. Never invents capitals inside a name that already has lower case.
 */
export function normalizePersonName(part: string): string {
  const trimmed = part.trim();
  if (trimmed === "") return trimmed;
  // Only shouted names are candidates. Anything with a lower-case letter was
  // typed deliberately - MeJean, DeShields, van Dyke - and is left alone.
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  if (looksLikeInitials(trimmed)) return trimmed;
  return titleCase(trimmed);
}
