# Data inbox

Drop raw source files here — schedule PDFs, roster exports, alignment
documents. **Nothing in this folder is committed**, so it will not bloat the
repository or publish source material.

Use it for bulk drops: 219 schedule PDFs belong here, not in git.

A *single* representative sample of a new format belongs in
`docs/reference/` instead, and IS committed. Those files are the ground truth
a parser is written against, and CLAUDE.md is explicit that the format must
not be invented. Keeping one real example under version control is what stops
a future change from quietly breaking against the real thing.
