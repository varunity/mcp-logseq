# Pending: Merge from Other Machine

## Logseq task syntax support

Functionality for **Logseq task syntax** was added on another machine and needs to be copied into this repo.

### What to merge

- **Task syntax**: Logseq uses `TODO`, `DOING`, `DONE`, `LATER`, `CANCELED` (and similar) as block content prefixes to represent task state. The other machine likely has:
  - Parsing/recognition of task markers in block content
  - Possibly new MCP tools or options (e.g. filter by task state, update task state)
  - Updates to `block-parser.ts` and/or `types.ts` if blocks carry a `taskState` or similar field

### Where to look in the other codebase

- `src/block-parser.ts` — task prefix parsing (e.g. `- TODO `, `- DONE `)
- `src/types.ts` — any new fields on `LogseqBlock` (e.g. `taskState?: string`)
- `server.ts` — new tools or tool parameters for task-related operations
- `src/search.ts` — search by task state if added
- `README.md` / `ARCHITECTURE.md` — docs for new tools

### After merging

1. Run `npm run build` and `npm test`.
2. Update README and ARCHITECTURE if you added tools or behavior.
3. Remove or shorten this PENDING.md section once merged.
