#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { FileSystemService } from './src/filesystem.js';
import { PathFilter } from './src/pathfilter.js';
import { SearchService } from './src/search.js';
import { resolveBlockRefsAsync } from './src/block-ref.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = __dirname.endsWith('dist')
  ? resolve(__dirname, '../package.json')
  : join(__dirname, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const VERSION = packageJson.version;

const arg = process.argv[2];
if (arg === '--version' || arg === '-v') {
  console.log(VERSION);
  process.exit(0);
}

if (arg === '--help' || arg === '-h') {
  console.log(`
mcp-logseq v${VERSION}

Universal AI bridge for Logseq graphs - connect any MCP-compatible assistant

Usage:
  npx mcp-logseq <graph-path>

Arguments:
  <graph-path>    Path to your Logseq graph directory

Options:
  --version, -v   Show version number
  --help, -h      Show this help message

Examples:
  npx mcp-logseq ~/Documents/MyLogseqGraph
  npx mcp-logseq /path/to/logseq/graph
`);
  process.exit(0);
}

const graphPath = arg;
if (!graphPath) {
  console.error('Usage: npx mcp-logseq /path/to/graph');
  console.error("Run 'npx mcp-logseq --help' for more information");
  process.exit(1);
}

const pathFilter = new PathFilter();
const fileSystem = new FileSystemService(graphPath, pathFilter);
const searchService = new SearchService(graphPath, pathFilter);

const server = new Server(
  {
    name: 'mcp-logseq',
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

function trimPaths(args: Record<string, unknown>): Record<string, unknown> {
  const trimmed = { ...args };
  const pathKeys = ['path', 'oldPath', 'newPath', 'confirmPath'];
  for (const key of pathKeys) {
    if (trimmed[key] && typeof trimmed[key] === 'string') {
      (trimmed as Record<string, unknown>)[key] = (trimmed[key] as string).trim();
    }
  }
  if (trimmed.paths && Array.isArray(trimmed.paths)) {
    (trimmed as Record<string, unknown>).paths = (trimmed.paths as string[]).map(
      (p) => (typeof p === 'string' ? p.trim() : p)
    );
  }
  return trimmed;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'read_page',
        description:
          'Read a page from the Logseq graph with blocks and block structure',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the page relative to graph root (e.g. pages/MyPage.md or journals/2024_01_15.md)',
            },
            resolveBlockRefs: {
              type: 'boolean',
              description:
                'If true, expand ((block-uuid)) references to inline content for AI context (default: false)',
              default: false,
            },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_page',
        description: 'Write a page to the Logseq graph',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to the page' },
            content: { type: 'string', description: 'Page content (Logseq markdown with - blocks)' },
            frontmatter: { type: 'object', description: 'Optional YAML frontmatter' },
            mode: {
              type: 'string',
              enum: ['overwrite', 'append', 'prepend'],
              default: 'overwrite',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_directory',
        description: 'List files and directories in the graph',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', default: '/' },
            prettyPrint: { type: 'boolean', default: false },
          },
        },
      },
      {
        name: 'search_blocks',
        description: 'Search for blocks by content, properties, or frontmatter',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number', default: 5 },
            searchContent: { type: 'boolean', default: true },
            searchFrontmatter: { type: 'boolean', default: false },
            searchBlockProperties: { type: 'boolean', default: true },
            caseSensitive: { type: 'boolean', default: false },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_tasks',
        description:
          'Find blocks with Logseq task markers (TODO, DOING, DONE, LATER, NOW, CANCELED, WAIT, etc.). Optional filter by markers and/or path. See https://docs.logseq.com/#/page/tasks',
        inputSchema: {
          type: 'object',
          properties: {
            markers: {
              type: 'array',
              items: { type: 'string', enum: ['TODO', 'DOING', 'DONE', 'LATER', 'NOW', 'CANCELED', 'CANCELLED', 'IN-PROGRESS', 'WAIT', 'WAITING'] },
              description: 'Filter by task markers; if omitted, return all task blocks',
            },
            path: { type: 'string', description: 'Limit to this page or directory (e.g. pages/MyPage.md or journals/)' },
            limit: { type: 'number', default: 20 },
            prettyPrint: { type: 'boolean', default: false },
          },
        },
      },
      {
        name: 'read_block',
        description:
          'Read a single block by UUID. Resolves across the entire graph.',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: {
              type: 'string',
              description: 'Block UUID (e.g. from block reference ((uuid)))',
            },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['uuid'],
        },
      },
      {
        name: 'append_block',
        description:
          'Append a new block to a page, optionally as child of a parent block',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Page path' },
            content: { type: 'string', description: 'Block content' },
            parentUuid: {
              type: 'string',
              description: 'Optional parent block UUID for nesting',
            },
            properties: {
              type: 'object',
              description: 'Optional block properties (key:: value)',
            },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'get_block_refs',
        description:
          'Get all blocks that reference a given block (backlinks). Useful for context graph.',
        inputSchema: {
          type: 'object',
          properties: {
            uuid: { type: 'string', description: 'Block UUID' },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['uuid'],
        },
      },
      {
        name: 'create_block_ref',
        description:
          'Insert a block reference ((uuid)) into a block\'s content to link blocks',
        inputSchema: {
          type: 'object',
          properties: {
            targetPath: { type: 'string', description: 'Page containing target block' },
            targetBlockUuid: { type: 'string', description: 'Block to add ref to' },
            refUuid: { type: 'string', description: 'UUID of block to reference' },
          },
          required: ['targetPath', 'targetBlockUuid', 'refUuid'],
        },
      },
      {
        name: 'delete_note',
        description: 'Delete a page (requires confirmation)',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            confirmPath: {
              type: 'string',
              description: 'Must exactly match path to confirm',
            },
          },
          required: ['path', 'confirmPath'],
        },
      },
      {
        name: 'move_note',
        description: 'Move or rename a page',
        inputSchema: {
          type: 'object',
          properties: {
            oldPath: { type: 'string' },
            newPath: { type: 'string' },
            overwrite: { type: 'boolean', default: false },
          },
          required: ['oldPath', 'newPath'],
        },
      },
      {
        name: 'read_multiple_pages',
        description: 'Read multiple pages in batch (max 10)',
        inputSchema: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' }, maxItems: 10 },
            includeContent: { type: 'boolean', default: true },
            includeFrontmatter: { type: 'boolean', default: true },
            includeBlocks: { type: 'boolean', default: true },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['paths'],
        },
      },
      {
        name: 'get_frontmatter',
        description: 'Get frontmatter of a page without full content',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['path'],
        },
      },
      {
        name: 'update_frontmatter',
        description: 'Update frontmatter without changing page content',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            frontmatter: { type: 'object' },
            merge: { type: 'boolean', default: true },
          },
          required: ['path', 'frontmatter'],
        },
      },
      {
        name: 'manage_tags',
        description: 'Add, remove, or list tags on a page',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            operation: { type: 'string', enum: ['add', 'remove', 'list'] },
            tags: { type: 'array', items: { type: 'string' } },
          },
          required: ['path', 'operation'],
        },
      },
      {
        name: 'patch_note',
        description:
          'Efficiently update part of a page by replacing a specific string',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            oldString: { type: 'string' },
            newString: { type: 'string' },
            replaceAll: { type: 'boolean', default: false },
          },
          required: ['path', 'oldString', 'newString'],
        },
      },
      {
        name: 'get_notes_info',
        description: 'Get metadata for pages without reading full content',
        inputSchema: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' } },
            prettyPrint: { type: 'boolean', default: false },
          },
          required: ['paths'],
        },
      },
      {
        name: 'get_graph_stats',
        description: 'Get graph statistics (notes, folders, size, recent)',
        inputSchema: {
          type: 'object',
          properties: {
            recentCount: { type: 'number', default: 5 },
            prettyPrint: { type: 'boolean', default: false },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const trimmed = trimPaths((args ?? {}) as Record<string, unknown>);

  try {
    switch (name) {
      case 'read_page': {
        const page = await fileSystem.readPage(trimmed.path as string);
        let content = page.content;
        if (trimmed.resolveBlockRefs) {
          content = await resolveBlockRefsAsync(content, (uuid) =>
            fileSystem.findBlockByUuid(uuid).then((b) => b ?? null)
          );
        }
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  fm: page.frontmatter,
                  content,
                  blocks: page.blocks.map((b) => ({
                    uuid: b.uuid,
                    content: b.content,
                    level: b.level,
                    properties: b.properties,
                    ...(b.marker && { marker: b.marker }),
                    ...(b.priority && { priority: b.priority }),
                  })),
                },
                null,
                indent
              ),
            },
          ],
        };
      }

      case 'write_page': {
        await fileSystem.writePage({
          path: trimmed.path as string,
          content: trimmed.content as string,
          frontmatter: trimmed.frontmatter as Record<string, unknown> | undefined,
          mode: (trimmed.mode as 'overwrite' | 'append' | 'prepend') || 'overwrite',
        });
        return {
          content: [
            {
              type: 'text',
              text: `Wrote page: ${trimmed.path} (mode: ${trimmed.mode ?? 'overwrite'})`,
            },
          ],
        };
      }

      case 'list_directory': {
        const listing = await fileSystem.listDirectory(
          (trimmed.path as string) || ''
        );
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { dirs: listing.directories, files: listing.files },
                null,
                indent
              ),
            },
          ],
        };
      }

      case 'search_blocks': {
        const results = await searchService.search({
          query: trimmed.query as string,
          limit: trimmed.limit as number,
          searchContent: trimmed.searchContent as boolean,
          searchFrontmatter: trimmed.searchFrontmatter as boolean,
          searchBlockProperties: trimmed.searchBlockProperties as boolean,
          caseSensitive: trimmed.caseSensitive as boolean,
        });
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [{ type: 'text', text: JSON.stringify(results, null, indent) }],
        };
      }

      case 'search_tasks': {
        const markers = trimmed.markers as string[] | undefined;
        const taskResults = await searchService.searchTasks({
          markers: markers?.length ? (markers as ('TODO' | 'DOING' | 'DONE' | 'LATER' | 'NOW' | 'CANCELED' | 'CANCELLED' | 'IN-PROGRESS' | 'WAIT' | 'WAITING')[]) : undefined,
          path: trimmed.path as string | undefined,
          limit: (trimmed.limit as number) || 20,
          prettyPrint: trimmed.prettyPrint as boolean | undefined,
        });
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [{ type: 'text', text: JSON.stringify(taskResults, null, indent) }],
        };
      }

      case 'read_block': {
        const block = await fileSystem.findBlockByUuid(trimmed.uuid as string);
        const indent = trimmed.prettyPrint ? 2 : undefined;
        if (!block) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  found: false,
                  uuid: trimmed.uuid,
                  message: 'Block not found in graph',
                }),
              },
            ],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  uuid: block.uuid,
                  content: block.content,
                  level: block.level,
                  properties: block.properties,
                  path: block.sourcePath,
                  ...(block.marker && { marker: block.marker }),
                  ...(block.priority && { priority: block.priority }),
                },
                null,
                indent
              ),
            },
          ],
        };
      }

      case 'append_block': {
        const block = await fileSystem.appendBlock(
          trimmed.path as string,
          trimmed.content as string,
          {
            parentUuid: trimmed.parentUuid as string | undefined,
            properties: trimmed.properties as Record<string, string | number | boolean> | undefined,
          }
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                uuid: block.uuid,
                message: `Appended block to ${trimmed.path}`,
              }),
            },
          ],
        };
      }

      case 'get_block_refs': {
        const refs = await fileSystem.getBlockRefs(trimmed.uuid as string);
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                refs.map((r) => ({
                  path: r.path,
                  block: {
                    uuid: r.block.uuid,
                    content: r.block.content.slice(0, 100),
                  },
                })),
                null,
                indent
              ),
            },
          ],
        };
      }

      case 'create_block_ref': {
        await fileSystem.createBlockRef(
          trimmed.targetPath as string,
          trimmed.targetBlockUuid as string,
          trimmed.refUuid as string
        );
        return {
          content: [
            {
              type: 'text',
              text: `Added block reference ((${trimmed.refUuid})) to block ${trimmed.targetBlockUuid}`,
            },
          ],
        };
      }

      case 'delete_note': {
        const result = await fileSystem.deleteNote({
          path: trimmed.path as string,
          confirmPath: trimmed.confirmPath as string,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        };
      }

      case 'move_note': {
        const result = await fileSystem.moveNote({
          oldPath: trimmed.oldPath as string,
          newPath: trimmed.newPath as string,
          overwrite: trimmed.overwrite as boolean,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        };
      }

      case 'read_multiple_pages': {
        const result = await fileSystem.readMultiplePages({
          paths: trimmed.paths as string[],
          includeContent: trimmed.includeContent as boolean,
          includeFrontmatter: trimmed.includeFrontmatter as boolean,
          includeBlocks: trimmed.includeBlocks as boolean,
        });
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ok: result.successful, err: result.failed }, null, indent),
            },
          ],
        };
      }

      case 'get_frontmatter': {
        const page = await fileSystem.readPage(trimmed.path as string);
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(page.frontmatter, null, indent),
            },
          ],
        };
      }

      case 'update_frontmatter': {
        await fileSystem.updateFrontmatter(
          trimmed.path as string,
          trimmed.frontmatter as Record<string, unknown>,
          (trimmed.merge as boolean) ?? true
        );
        return {
          content: [
            {
              type: 'text',
              text: `Updated frontmatter for ${trimmed.path}`,
            },
          ],
        };
      }

      case 'manage_tags': {
        const result = await fileSystem.manageTags({
          path: trimmed.path as string,
          operation: trimmed.operation as 'add' | 'remove' | 'list',
          tags: trimmed.tags as string[] | undefined,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        };
      }

      case 'patch_note': {
        const result = await fileSystem.patchNote({
          path: trimmed.path as string,
          oldString: trimmed.oldString as string,
          newString: trimmed.newString as string,
          replaceAll: trimmed.replaceAll as boolean,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: !result.success,
        };
      }

      case 'get_notes_info': {
        const result = await fileSystem.getNotesInfo(trimmed.paths as string[]);
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, indent) }],
        };
      }

      case 'get_graph_stats': {
        const count = Math.min((trimmed.recentCount as number) || 5, 20);
        const stats = await fileSystem.getGraphStats(count);
        const indent = trimmed.prettyPrint ? 2 : undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  notes: stats.totalNotes,
                  folders: stats.totalFolders,
                  size: stats.totalSize,
                  recent: stats.recentlyModified,
                },
                null,
                indent
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
