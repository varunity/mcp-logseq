# Blog Post Draft: MCP-Logseq — Connect Your AI to Your Logseq Graph

*Use this as a starting point; adjust tone and add your own story/experience.*

---

## Title ideas

- **Connect Claude (or Cursor) to Logseq with MCP**
- **MCP-Logseq: An AI Bridge for Your Logseq Knowledge Base**
- **Give Your AI Access to Logseq Blocks and Block References**

---

## Intro

If you use Logseq for notes and an MCP-compatible AI (Claude, Cursor, Windsurf, etc.), you’ve probably wanted the AI to read and work with your graph—not just raw files, but **blocks** and **block references**. I built **MCP-Logseq** to do exactly that: it’s an MCP server that connects any compatible client to your Logseq graph with block-level operations and `((block-uuid))` support.

---

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io) is an open protocol that lets AI assistants talk to external tools and data. Your AI client (e.g. Cursor) runs “MCP servers” that expose tools; the AI calls those tools to read, search, or change your data. MCP-Logseq is one such server, tailored to Logseq’s block-based model.

---

## Why Logseq is different

In Logseq, the main unit isn’t the file—it’s the **block**. Each bullet has an optional UUID and can be linked with `((block-uuid))`. That makes it possible to:

- Point the AI at a specific block or subtree
- Resolve block refs when reading so the AI sees full content, not just `((abc-123))`
- Search blocks, get backlinks, and build a small “context graph” for the AI over time

MCP-Logseq is ported from [mcp-obsidian](https://github.com/bitbonsai/mcp-obsidian), with adaptations for blocks, block references, and Logseq’s outline format.

---

## What you can do

- **Page operations**: Read/write pages, list directories, patch text, manage frontmatter and tags, delete/rename pages.
- **Block operations**: Read a block by UUID from anywhere in the graph, append blocks (optionally under a parent), get blocks that reference a given block (backlinks), and insert `((uuid))` refs into blocks.
- **Context for AI**: Use `read_page` with `resolveBlockRefs: true` so the AI sees expanded block content instead of raw refs. Combine with `search_blocks` and `get_block_refs` to pull in relevant context.

---

## Quick setup (e.g. Cursor)

1. Install Node.js (v18+).
2. In Cursor, add an MCP server (e.g. in Settings → MCP or `~/.cursor/mcp.json`):

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

Replace the path with your actual Logseq graph folder (the one with `journals/`, `pages/`, `.logseq/`).

3. Ask the AI to list files, read a page, search blocks, or resolve a block by UUID.

---

## Example workflow: building context

1. **Search** for blocks: e.g. “project ideas” via `search_blocks`.
2. **Read** a block by UUID from the results.
3. **Backlinks**: use `get_block_refs` to see what links to it.
4. **Link**: use `create_block_ref` to add `((uuid))` in another block.
5. **Read with context**: use `read_page` with `resolveBlockRefs: true` so the AI gets the full content of refs.

Over time, you can build a small graph of blocks the AI understands and can reuse.

---

## Repo and contribution

The project is **[mcp-logseq](https://github.com/YOUR_USERNAME/mcp-logseq)** (replace with your GitHub URL). It’s MIT-licensed. If you use Logseq and MCP, try it and open issues or PRs for improvements—especially around task syntax (TODO/DONE/etc.), which is on the roadmap.

---

## Optional closing

I use this daily with Cursor over my main Logseq graph: search, read, and refs all work without leaving the editor. If you’re at the intersection of Logseq and AI tools, MCP-Logseq might be worth a try.

---

*Before publishing:*
- *Replace YOUR_USERNAME / repo URL with your actual GitHub link.*
- *Add a line or two about task syntax once you’ve merged that feature and released it.*
