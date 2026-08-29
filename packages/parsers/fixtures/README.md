# Parser fixtures

Real vendor exports. These are the ground truth for the MaxPreps `.txt`
parser — the format was never guessed.

## `gamechanger-baseball-game.txt`

GameChanger export, Caverna at John Hardin, 13 May 2024 (John Hardin won
17-4 in five). This is **Caverna's half** of the box score; one file is one
team. The PDF of the same game is at
`docs/reference/CavernaColonelsVarsity_vs_JohnHardinBulldogs_May_13_2024.pdf`
and every expected value in the tests is taken from it, not from the `.txt`.

### What the format actually is

```
line 1   vendor game id (UUID)
line 2   pipe-delimited column names
line 3+  one row per player, 31 fields, keyed by JERSEY
```

Three properties shape the whole importer:

1. **No player names.** Rows carry a jersey and nothing else identifying.
   Matching is jersey-to-roster, not fuzzy name matching, and a file cannot
   create players — the roster has to exist first.
2. **No team, opponent or date.** Not anywhere in the file. The filename has
   the two team names (`<Away> Varsity_vs_<Home>.txt`) and nothing else. Which
   game a file belongs to has to be confirmed by the coach at upload.
3. **Blank is absent, not zero.** Non-pitchers have an empty pitching block,
   and a jersey-only row means the player did not record a stat. Writing zeroes
   for those would invent a 0-for-0 batting line.

Innings pitched arrive split across `InningsPitched` and
`PartialInningPitched` because "6.2" means six and two thirds, not 6.2. We
store outs.

### Known defect in this export

Jersey **22** has `InningsPitched=0, PartialInningPitched=0`, but
GameChanger's own PDF shows **0.2 IP** for that pitcher. Every other column
for #22 matches the PDF exactly. The team therefore accounts for only 10 outs
where the linescore shows the opponent batted four complete innings, i.e. 12.

The parser reports this faithfully rather than inferring the missing outs —
which pitcher they belong to is not knowable from the file.
`reconcileTeamPitching()` surfaces the gap for the coach to resolve in the
import preview. There is a test pinning this behaviour; do not "fix" it.

## Still wanted

- A **Hudl** export, to confirm the two vendors really do emit the same shape.
- **Football** and **basketball** exports — the column set is per sport, and
  only baseball is mapped so far (`packages/parsers/src/mapping.ts`).
- A GameChanger **season-totals CSV**.

Anonymised files are fine. The `.txt` contains no names at all, so it is
inherently anonymous already.
