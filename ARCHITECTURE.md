# MCP-Logseq Architecture

An AI bridge for Logseq graphs using the Model Context Protocol (MCP). Ported from [mcp-obsidian](https://github.com/bitbonsai/mcp-obsidian) with deep integration for Logseq's block system, block references, and graph structure.

## Logseq vs Obsidian: Key Differences

| Aspect | Obsidian | Logseq |
|--------|----------|--------|
| **Unit of content** | Note (file) | Block (smallest addressable unit) |
| **Structure** | Flat/hierarchical files | Outline with indented blocks |
| **Block IDs** | N/A | UUID per block via `id::` property |
| **References** | Page links `[[page]]` | Block refs `((uuid))`, page links `[[page]]` |
| **Hierarchy** | Folders, headings | Indentation (tabs) = parent/child |
| **Graph layout** | `pages/` flat or nested | `journals/`, `pages/` (configurable) |
| **Properties** | Frontmatter only | Block-level `key:: value` + frontmatter |

## Logseq File Format (Markdown)

### Block Structure
- Every block starts with `-` (hyphen)
- Indentation = hierarchy: 0 tabs = top-level, 1 tab = child, etc.
- Block properties: `key:: value` at end of block content line

```
- Top-level block
- Block with id:: 634hj47f-2304g6dfe-a767-e365473gf638
- Block with properties
  prop:: value
  another:: 123
	- Child block (one tab)
	- Another child
- Sibling at top level
```

### Block References
- **Block reference**: `((block-uuid))` — links to a specific block
- **Block embed**: `{{embed ((block-uuid))}}` — renders block content inline
- UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### Page Links
- `[[page name]]` — links to/create page
- `[[page name\|alias]]` — page link with custom display text

### Journals
- Stored in `journals/` folder
- Filename typically `YYYY_MM_DD.md`
- Same block format as regular pages

## MCP Tool Design

### Ported from mcp-obsidian (file-level)
| Tool | Adaptation |
|------|------------|
| `read_note` | → `read_page` — parse into blocks with UUIDs |
| `write_note` | → `write_page` — preserve block structure and IDs |
| `list_directory` | Same, adapt path filter for Logseq |
| `search_notes` | → `search_blocks` — search block content + properties |
| `delete_note` | Same |
| `move_note` | Same |
| `read_multiple_notes` | → `read_multiple_pages` |
| `get_frontmatter` | Same (pages have frontmatter) |
| `update_frontmatter` | Same |
| `manage_tags` | Adapt for Logseq tags (#tag in content) |
| `patch_note` | Same for small edits |

### New: Block-First Tools (Logseq-specific)
| Tool | Purpose |
|------|----------|
| `read_block` | Read a single block by UUID (resolve from any file) |
| `get_block_by_ref` | Resolve `((uuid))` ref, return block content + context |
| `write_block` | Create/update block at path + position, assign UUID |
| `append_block` | Add block as child of parent block |
| `create_block_ref` | Insert `((uuid))` reference in target block |
| `resolve_block_refs` | Expand `((uuid))` refs in content to inline text (for AI context) |
| `get_block_refs` | List all blocks that reference a given block |
| `get_block_tree` | Get block + children as tree (for context graph) |
| `search_blocks` | Search by content, properties, tags; return block UUIDs |

### Context Graph for AI
To let an AI build a context graph over time:
1. **`resolve_block_refs`** — When reading, optionally expand `((uuid))` to show full block content
2. **`get_block_refs`** — Find what references a block (backlinks)
3. **`get_block_tree`** — Get a block and its subtree for hierarchical context
4. **`search_blocks`** — Find blocks by topic, then fetch their trees
5. Block UUIDs enable stable references across sessions — AI can "remember" `((abc-123))` and request it again

## Module Layout

```
src/
├── pathfilter.ts    # Logseq paths: .logseq/, .git/, etc.
├── types.ts         # Block, Page, BlockRef, etc.
├── frontmatter.ts   # Reuse from mcp-obsidian (gray-matter)
├── block-parser.ts  # Parse markdown → blocks with level, content, id::
├── block-ref.ts     # Parse ((uuid)), create refs, resolve
├── filesystem.ts    # Logseq-aware read/write, block operations
├── search.ts        # Search blocks + content
└── uri.ts           # logseq:// graph/page/block URIs
server.ts            # MCP server entry
```

## Block Parser Design

```typescript
interface LogseqBlock {
  uuid: string;           // From id:: or generated
  content: string;        // Main text (before properties)
  level: number;          // 0 = top, 1 = 1 tab, etc.
  properties: Record<string, string | number | boolean>;
  children: LogseqBlock[];
  parentUuid?: string;
  sourcePath: string;     // File containing this block
}
```

**Parsing rules:**
1. Split by `\n- ` (newline + hyphen) to get raw blocks
2. Count leading tabs for `level`
3. Extract `id:: uuid` and other `key:: value` from content
4. Build tree from levels
5. Generate UUID for blocks without `id::` when writing

## Path Filter (Logseq)

- Ignore: `.logseq/**`, `.git/**`, `node_modules/**`, `.DS_Store`
- Allow: `.md`, `.markdown`, `.txt`
- Journals: `journals/*.md`
- Pages: `pages/*.md` or root `*.md` (graph-dependent)

## Security

- Path traversal protection (same as mcp-obsidian)
- Block UUID validation (must be valid UUID format)
- No execution of embedded code
- Read-only mode option for sensitive graphs
