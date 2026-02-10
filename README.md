# MCP-Logseq

An AI bridge for Logseq graphs using the [Model Context Protocol (MCP)](https://modelcontextprotocol.io). Connect any MCP-compatible AI assistant (Claude, Cursor, Windsurf, etc.) to your Logseq knowledge base with deep integration for **blocks** and **block references**.

Ported from [mcp-obsidian](https://github.com/bitbonsai/mcp-obsidian) with Logseq-specific features:

- **Block-first operations** — Read, append, and reference individual blocks
- **Block references** — Create `((block-uuid))` links between blocks
- **Context graph** — Resolve refs for AI context, get backlinks, build knowledge graphs over time

## Quick Start

1. **Install Node.js** (v18+)

2. **Configure your MCP client** (e.g. Cursor):

   Add to your MCP config (e.g. `~/.cursor/mcp.json` or Cursor Settings → MCP):

   ```json
   {
     "mcpServers": {
       "logseq": {
         "command": "npx",
         "args": ["mcp-logseq", "/path/to/your/logseq/graph"]
       }
     }
   }
   ```

   Replace `/path/to/your/logseq/graph` with your actual Logseq graph directory (the folder containing `journals/`, `pages/`, `.logseq/`).

3. **Test** — Ask your AI:
   - "List files in my Logseq graph"
   - "Read the page journals/2024_01_15.md"
   - "Search for blocks containing 'machine learning'"
   - "Get block abc-123-def and show what references it"

## Logseq Concepts

### Blocks
Logseq content is organized in **blocks** — each bullet (`-`) is a block. Blocks have:
- **UUID** — stable ID (`id:: uuid` in markdown)
- **Content** — main text
- **Properties** — `key:: value` metadata
- **Hierarchy** — indentation = parent/child

### Block References
- **Reference**: `((block-uuid))` — links to a block
- **Embed**: `{{embed ((block-uuid))}}` — renders block content inline

Use `create_block_ref` to add refs and `read_page` with `resolveBlockRefs: true` to expand them for AI context.

## MCP Tools

### Page Operations
| Tool | Description |
|------|-------------|
| `read_page` | Read page with blocks; optional `resolveBlockRefs` for AI context |
| `write_page` | Write page (overwrite/append/prepend) |
| `list_directory` | List files and folders |
| `search_blocks` | Search block content and properties |
| `read_multiple_pages` | Batch read (max 10) |
| `get_frontmatter` | Get frontmatter only |
| `update_frontmatter` | Update frontmatter |
| `delete_note` | Delete page (requires confirmation) |
| `move_note` | Move/rename page |
| `patch_note` | Replace string in page |
| `manage_tags` | Add/remove/list tags |
| `get_notes_info` | Metadata without content |
| `get_graph_stats` | Notes, folders, size, recent files |

### Block Operations (Logseq-specific)
| Tool | Description |
|------|-------------|
| `read_block` | Get block by UUID (searches entire graph) |
| `append_block` | Add block to page (optionally under parent) |
| `get_block_refs` | Get blocks that reference a given block (backlinks) |
| `create_block_ref` | Insert `((uuid))` into a block |

## Example: Building a Context Graph

1. **Search** for relevant blocks: `search_blocks` with query "project ideas"
2. **Read** a block: `read_block` with UUID from results
3. **Get backlinks**: `get_block_refs` to see what links to it
4. **Create links**: `create_block_ref` to connect related blocks
5. **Read with context**: `read_page` with `resolveBlockRefs: true` to expand refs for AI

Over time, the AI can build a map of your knowledge graph by following block references.

## Development

```bash
npm install
npm run build
npm start /path/to/graph   # Run with tsx
```

## Publishing on GitHub

- Ensure `README.md`, `LICENSE`, and `package.json` are in place (they are).
- Run `npm run build` and `npm test` before pushing.
- Create a new repo on GitHub, then:
  ```bash
  git remote add origin https://github.com/YOUR_USERNAME/mcp-logseq.git
  git branch -M main
  git push -u origin main
  ```
- Optional: `npm publish` for [npm](https://www.npmjs.com/) so users can run `npx mcp-logseq /path/to/graph`. See [PENDING.md](PENDING.md) for merging Logseq task syntax from your other machine before or after publishing.

## License

MIT
