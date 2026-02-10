#!/usr/bin/env node
/**
 * Quick test script - exercises mcp-logseq against a graph without MCP protocol.
 * Usage: node test-graph.mjs /path/to/graph
 */
import { FileSystemService } from './dist/src/filesystem.js';
import { PathFilter } from './dist/src/pathfilter.js';
import { SearchService } from './dist/src/search.js';

const graphPath = process.argv[2] || '/Users/varunbaker/Documents/VeeBrain';

async function main() {
  const pathFilter = new PathFilter();
  const fs = new FileSystemService(graphPath, pathFilter);
  const search = new SearchService(graphPath, pathFilter);

  console.log('=== MCP-Logseq Graph Test ===\n');
  console.log('Graph path:', graphPath);

  try {
    // 1. List root
    console.log('\n--- list_directory("/") ---');
    const listing = await fs.listDirectory('');
    console.log('Directories:', listing.directories);
    console.log('Files:', listing.files);

    // 2. Get stats
    console.log('\n--- get_graph_stats ---');
    const stats = await fs.getGraphStats(3);
    console.log('Notes:', stats.totalNotes);
    console.log('Folders:', stats.totalFolders);
    console.log('Size:', stats.totalSize, 'bytes');
    console.log('Recent:', stats.recentlyModified);

    // 3. Read a page if we have one
    const allFiles = [...listing.files];
    if (listing.directories.includes('journals')) {
      const j = await fs.listDirectory('journals');
      allFiles.push(...j.files.map((f) => 'journals/' + f));
    }
    if (listing.directories.includes('pages')) {
      const p = await fs.listDirectory('pages');
      allFiles.push(...p.files.map((f) => 'pages/' + f));
    }

    if (allFiles.length > 0) {
      const firstPage = allFiles.find((f) => f.endsWith('.md')) || allFiles[0];
      console.log('\n--- read_page("' + firstPage + '") ---');
      const page = await fs.readPage(firstPage);
      console.log('Frontmatter keys:', Object.keys(page.frontmatter));
      console.log('Blocks count:', page.blocks?.length ?? 0);
      if (page.blocks?.length > 0) {
        const b = page.blocks[0];
        console.log('First block:', { uuid: b.uuid, content: b.content?.slice(0, 60) + '...' });
      }
    }

    // 4. Search
    console.log('\n--- search_blocks("the") ---');
    const results = await search.search({ query: 'the', limit: 3 });
    console.log('Results:', results.length);
    results.forEach((r, i) => console.log(`  ${i + 1}. ${r.p} - ${r.ex?.slice(0, 50)}...`));

    console.log('\n=== All tests passed ===');
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  }
}

main();
