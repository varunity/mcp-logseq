/**
 * Search service for Logseq blocks and content.
 */

import { join } from 'path';
import { readFile, readdir } from 'node:fs/promises';
import type { PathFilter } from './pathfilter.js';
import type { SearchParams, BlockSearchResult } from './types.js';
import { parseBlocks, flattenBlocks } from './block-parser.js';
import { generateLogseqUri } from './uri.js';

export class SearchService {
  constructor(
    private graphPath: string,
    private pathFilter: PathFilter
  ) {}

  async search(params: SearchParams): Promise<BlockSearchResult[]> {
    const {
      query,
      limit = 5,
      searchContent = true,
      searchFrontmatter = false,
      searchBlockProperties = true,
      caseSensitive = false,
    } = params;

    if (!query || query.trim().length === 0) {
      throw new Error('Search query cannot be empty');
    }

    const results: BlockSearchResult[] = [];
    const maxLimit = Math.min(limit, 20);
    const files = await this.findMarkdownFiles(this.graphPath);

    for (const fullPath of files) {
      const relativePath = fullPath
        .substring(this.graphPath.length + 1)
        .replace(/\\/g, '/');

      if (!this.pathFilter.isAllowed(relativePath)) continue;
      if (results.length >= maxLimit) break;

      try {
        const raw = await readFile(fullPath, 'utf-8');
        const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
        const body = frontmatterMatch ? raw.slice(frontmatterMatch[0].length) : raw;
        const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';

        let searchableText = '';
        if (searchContent && searchFrontmatter && searchBlockProperties) {
          searchableText = raw;
        } else if (searchContent) {
          searchableText = body;
          if (searchBlockProperties) {
            searchableText = body;
          }
        } else if (searchFrontmatter) {
          searchableText = frontmatter;
        } else if (searchBlockProperties) {
          searchableText = body;
        }

        const searchIn = caseSensitive ? searchableText : searchableText.toLowerCase();
        const searchQuery = caseSensitive ? query : query.toLowerCase();
        const index = searchIn.indexOf(searchQuery);

        if (index !== -1) {
          const blocks = parseBlocks(body, relativePath);
          const flat = flattenBlocks(blocks);

          for (const block of flat) {
            const blockText =
              block.content +
              ' ' +
              JSON.stringify(block.properties);
            const blockSearch = caseSensitive ? blockText : blockText.toLowerCase();
            if (blockSearch.includes(searchQuery)) {
              const excerptStart = Math.max(0, block.content.indexOf(query) - 21);
              const excerptEnd = Math.min(
                block.content.length,
                block.content.indexOf(query) + query.length + 21
              );
              let excerpt = block.content.slice(excerptStart, excerptEnd).trim();
              if (excerptStart > 0) excerpt = '...' + excerpt;
              if (excerptEnd < block.content.length) excerpt = excerpt + '...';

              let matchCount = 0;
              let idx = 0;
              while ((idx = blockSearch.indexOf(searchQuery, idx)) !== -1) {
                matchCount++;
                idx += searchQuery.length;
              }

              results.push({
                p: relativePath,
                t: relativePath.split('/').pop()?.replace(/\.md$/, '') ?? relativePath,
                uuid: block.uuid,
                ex: excerpt || block.content.slice(0, 42),
                mc: matchCount,
                ln: 0,
              });

              if (results.length >= maxLimit) break;
            }
          }

          if (results.length === 0 && index !== -1) {
            const excerptStart = Math.max(0, index - 21);
            const excerptEnd = Math.min(
              searchableText.length,
              index + searchQuery.length + 21
            );
            let ex = searchableText.slice(excerptStart, excerptEnd).trim();
            if (excerptStart > 0) ex = '...' + ex;
            if (excerptEnd < searchableText.length) ex = ex + '...';

            const title = relativePath.split('/').pop()?.replace(/\.md$/, '') ?? relativePath;
            results.push({
              p: relativePath,
              t: title,
              ex,
              mc: 1,
              ln: searchableText.slice(0, index).split('\n').length,
            });
          }
        }
      } catch {
        // skip
      }
    }

    return results;
  }

  private async findMarkdownFiles(dirPath: string): Promise<string[]> {
    const out: string[] = [];
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          out.push(...(await this.findMarkdownFiles(full)));
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          out.push(full);
        }
      }
    } catch {
      // skip
    }
    return out;
  }
}
