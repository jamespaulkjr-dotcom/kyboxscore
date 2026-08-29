# KY BOXSCORE brand usage on the website

Companion to `docs/README.md`. That file is the package inventory; this one
records which asset is used where on the site, and why. **No original file in
`docs/assets/` was renamed, moved or modified.** Everything the site serves is
a derivative written to `apps/web/public/brand/`.

## Asset decisions

| Use | Asset | Rendered as |
|---|---|---|
| Main website header | `logo/ky-boxscore-wordmark-horizontal.png` | `brand/wordmark-80.png`, 36px tall |
| Mobile header | same asset, same file | 28px tall (CSS `h-7`) |
| Favicon | `icons/ky-boxscore-icon-gold-512.png` | `app/icon.png`, 32×32 |
| App / PWA icon | `icons/ky-boxscore-icon-navy-512.png` | `app/apple-icon.png` 180, `brand/app-icon-{192,512}.png` |
| Social / OG image | `logo/ky-boxscore-lockup-wide.png` + `logo/ky-boxscore-score-strip.png` | `app/opengraph-image.png`, 1200×630 on navy |
| Footer | `logo/ky-boxscore-kentucky-badge.png` | `brand/kentucky-badge-64.png`, 32px tall |
| Dark backgrounds | horizontal wordmark, round icon, gold icon, Kentucky badge | all verified legible on `#00152E` |
| Light backgrounds | horizontal wordmark, navy icon | all verified legible on `#FEFEFE` |

Reasoning for the two least obvious picks:

- **Favicon is the gold tile, not the navy one.** Composited at 32px against
  both a light and a dark tab strip, the navy tile disappears into dark
  browser chrome. The gold tile is unmistakable at 16px either way.
- **Header is the horizontal wordmark, not the wide lockup.** At 40px tall the
  lockup's scoreboard detail turns to mud and "KY BOXSCORE" becomes
  unreadable. The wordmark holds at 28px. The lockup is used at 180px on the
  OG card, where it earns the space.

The header and footer are pinned to brand navy in **both** light and dark
themes, so the navy-grounded logo always sits on the ground it was drawn for.

## Two deliberate colour derivations

The package palette is navy `#00152E`, gold `#FCB526`, white `#FEFEFE`. Both
derivations below exist because the brief requires WCAG 2.2 AA.

1. **Gold on white is 1.77:1** and cannot be used for text. `--accent` keeps
   the gold hue (40°) darkened to `#9C6902` (4.69:1) for text on light
   grounds. True brand gold stays as `--gold` and is used only as a *fill*,
   always with navy on top (10.27:1).
2. **The package has no link colour.** `--link` is derived from the navy hue
   (213°) so links read as the same family rather than an imported blue.

Gold on navy is 10.27:1 and white on navy 18.16:1, so the brand needs no
adaptation at all on dark grounds.

## Known limitations of the source files

Worth knowing before these go anywhere near print or a large screen.

- **No antialiasing.** Every asset has hard 1-bit alpha — pixels are either
  fully opaque or fully transparent, 0.0% partial. Scaled by a browser they
  alias visibly, which is why the site serves pre-sized derivatives
  downscaled with a box filter rather than resizing the originals in CSS.
- **The `-512` icons contain about 179×174 of real artwork** centred in a
  512×512 transparent canvas, offset up and left with a drop shadow baked in.
  `brand/app-icon-512.png` is therefore an upscale and is soft. A true 512
  icon needs a re-export from the master.
- **Not vector.** `docs/README.md` already flags this. The header wordmark is
  36KB as a PNG; vectorised it would be roughly 4KB and crisp at every size.
  That is the single highest-value follow-up on the brand.
