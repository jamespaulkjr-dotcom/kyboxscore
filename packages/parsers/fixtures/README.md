# Parser fixtures

**These are the ground truth. The MaxPreps `.txt` parser cannot be written
until real exports land here.**

`CLAUDE.md` is explicit: *"Real exports from Hudl and GameChanger are the
ground truth. Do not invent the format."* A parser written against a guessed
format looks tested and fails on the first coach upload, which is exactly the
failure that kills adoption.

## What is needed

- One Hudl MaxPreps-formatted `.txt` export (football or basketball).
- One GameChanger MaxPreps TXT export from a game box score (baseball,
  softball or basketball).
- Optionally a GameChanger season-totals CSV.

Any sport, any game, any season. Anonymising player names before committing is
fine - the parser cares about the format, not the people.

## Naming

`<vendor>-<sport>-<what>.txt`, e.g. `hudl-basketball-game.txt`,
`gamechanger-baseball-game.txt`, `gamechanger-baseball-season.csv`.
