/**
 * Logseq-aware filesystem operations.
 * Supports blocks, block references, and graph structure.
 */

import {
  join,
  resolve,
  relative,
  dirname,
} from 'path';
import {
  readdir,
  stat,
  readFile,
  writeFile,
  unlink,
  mkdir,
} from 'node:fs/promises';
import { FrontmatterHandler } from './frontmatter.js';
import { PathFilter } from './pathfilter.js';
import { parseBlocks, flattenBlocks, findBlockByUuid, serializeBlocks } from './block-parser.js';
import { extractBlockRefs, createBlockRef } from './block-ref.js';
import { generateLogseqUri } from './uri.js';
import type {
  ParsedPage,
  LogseqBlock,
  PageWriteParams,
  DeleteNoteParams,
  DeleteResult,
  MoveNoteParams,
  MoveResult,
  BatchReadParams,
  NoteInfo,
  TagManagementParams,
  TagManagementResult,
  PatchNoteParams,
  PatchNoteResult,
  VaultStats,
} from './types.js';

export class FileSystemService {
  private frontmatterHandler: FrontmatterHandler;
  private pathFilter: PathFilter;

  constructor(
    private graphPath: string,
    pathFilter?: PathFilter,
    frontmatterHandler?: FrontmatterHandler
  ) {
    this.graphPath = resolve(graphPath);
    this.pathFilter = pathFilter ?? new PathFilter();
    this.frontmatterHandler = frontmatterHandler ?? new FrontmatterHandler();
  }

  private resolvePath(relativePath: string): string {
    if (!relativePath) relativePath = '';
    relativePath = relativePath.trim();
    const normalized = relativePath.startsWith('/')
      ? relativePath.slice(1)
      : relativePath;
    const fullPath = resolve(join(this.graphPath, normalized));
    const rel = relative(this.graphPath, fullPath);
    if (rel.startsWith('..')) {
      throw new Error(
        `Path traversal not allowed: ${relativePath}. Paths must be within the graph.`
      );
    }
    return fullPath;
  }

  async readPage(path: string): Promise<ParsedPage> {
    const fullPath = this.resolvePath(path);

    if (!this.pathFilter.isAllowed(path)) {
      throw new Error(
        `Access denied: ${path}. Restricted (e.g. .logseq, .git).`
      );
    }

    const isDir = await this.isDirectory(path);
    if (isDir) {
      throw new Error(`Cannot read directory as file: ${path}.`);
    }

    try {
      const raw = await readFile(fullPath, 'utf-8');
      const note = this.frontmatterHandler.parse(raw);
      const blocks = parseBlocks(note.content, path);
      return {
        ...note,
        blocks,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`File not found: ${path}.`);
        }
      }
      throw error;
    }
  }

  async writePage(params: PageWriteParams): Promise<void> {
    const { path, content, frontmatter, mode = 'overwrite' } = params;
    const fullPath = this.resolvePath(path);

    if (!this.pathFilter.isAllowed(path)) {
      throw new Error(`Access denied: ${path}.`);
    }

    if (frontmatter) {
      const validation = this.frontmatterHandler.validate(frontmatter);
      if (!validation.isValid) {
        throw new Error(`Invalid frontmatter: ${validation.errors.join(', ')}`);
      }
    }

    let finalContent: string;
    if (mode === 'overwrite') {
      finalContent = frontmatter
        ? this.frontmatterHandler.stringify(frontmatter, content)
        : content;
    } else {
      try {
        const existing = await this.readPage(path);
        const merged = frontmatter
          ? { ...existing.frontmatter, ...frontmatter }
          : existing.frontmatter;
        if (mode === 'append') {
          finalContent = this.frontmatterHandler.stringify(
            merged,
            existing.content + '\n\n' + content
          );
        } else {
          finalContent = this.frontmatterHandler.stringify(
            merged,
            content + '\n\n' + existing.content
          );
        }
      } catch {
        finalContent = frontmatter
          ? this.frontmatterHandler.stringify(frontmatter, content)
          : content;
      }
    }

    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, finalContent, 'utf-8');
  }

  async patchNote(params: PatchNoteParams): Promise<PatchNoteResult> {
    const { path, oldString, newString, replaceAll = false } = params;

    if (!this.pathFilter.isAllowed(path)) {
      return {
        success: false,
        path,
        message: `Access denied: ${path}.`,
      };
    }

    if (!oldString?.trim()) {
      return { success: false, path, message: 'oldString cannot be empty' };
    }
    if (newString === undefined) {
      return { success: false, path, message: 'newString required' };
    }
    if (oldString === newString) {
      return { success: false, path, message: 'Strings must differ' };
    }

    try {
      const page = await this.readPage(path);
      const full = page.originalContent;
      const occurrences = full.split(oldString).length - 1;
      if (occurrences === 0) {
        return {
          success: false,
          path,
          message: `String not found: "${oldString.substring(0, 50)}..."`,
          matchCount: 0,
        };
      }
      if (!replaceAll && occurrences > 1) {
        return {
          success: false,
          path,
          message: `Found ${occurrences} matches. Use replaceAll=true.`,
          matchCount: occurrences,
        };
      }
      const updated = replaceAll
        ? full.split(oldString).join(newString)
        : full.replace(oldString, newString);
      const fullPath = this.resolvePath(path);
      await writeFile(fullPath, updated, 'utf-8');
      return {
        success: true,
        path,
        message: `Replaced ${replaceAll ? occurrences : 1} occurrence(s)`,
        matchCount: occurrences,
      };
    } catch (error) {
      return {
        success: false,
        path,
        message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  async listDirectory(path: string = ''): Promise<{ directories: string[]; files: string[] }> {
    const normalized = path === '.' ? '' : path;
    const fullPath = this.resolvePath(normalized);

    const entries = await readdir(fullPath, { withFileTypes: true });
    const files: string[] = [];
    const directories: string[] = [];

    for (const entry of entries) {
      const entryPath = normalized ? `${normalized}/${entry.name}` : entry.name;
      if (!this.pathFilter.isAllowed(entryPath)) continue;
      if (entry.isDirectory()) {
        directories.push(entry.name);
      } else if (entry.isFile()) {
        files.push(entry.name);
      }
    }

    return {
      files: files.sort(),
      directories: directories.sort(),
    };
  }

  async deleteNote(params: DeleteNoteParams): Promise<DeleteResult> {
    const { path, confirmPath } = params;
    if (path !== confirmPath) {
      return {
        success: false,
        path,
        message:
          "Deletion cancelled: path and confirmPath must match exactly.",
      };
    }

    const fullPath = this.resolvePath(path);
    if (!this.pathFilter.isAllowed(path)) {
      return { success: false, path, message: `Access denied: ${path}.` };
    }

    const isDir = await this.isDirectory(path);
    if (isDir) {
      return { success: false, path, message: `${path} is not a file` };
    }

    try {
      await unlink(fullPath);
      return {
        success: true,
        path,
        message: `Deleted: ${path}. Cannot be undone.`,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return { success: false, path, message: `File not found: ${path}.` };
        }
      }
      return {
        success: false,
        path,
        message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }

  async moveNote(params: MoveNoteParams): Promise<MoveResult> {
    const { oldPath, newPath, overwrite = false } = params;

    if (!this.pathFilter.isAllowed(oldPath) || !this.pathFilter.isAllowed(newPath)) {
      return {
        success: false,
        oldPath,
        newPath,
        message: 'Access denied.',
      };
    }

    const oldFull = this.resolvePath(oldPath);
    const newFull = this.resolvePath(newPath);

    try {
      const content = await readFile(oldFull, 'utf-8');
      await mkdir(dirname(newFull), { recursive: true });
      await writeFile(newFull, content, {
        encoding: 'utf-8',
        flag: overwrite ? 'w' : 'wx',
      });
      await unlink(oldFull);
      return {
        success: true,
        oldPath,
        newPath,
        message: `Moved from ${oldPath} to ${newPath}`,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return {
            success: false,
            oldPath,
            newPath,
            message: `Source not found: ${oldPath}.`,
          };
        }
        if (code === 'EEXIST') {
          return {
            success: false,
            oldPath,
            newPath,
            message: `Target exists: ${newPath}. Use overwrite=true.`,
          };
        }
      }
      return {
        success: false,
        oldPath,
        newPath,
        message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      };
    }
  }

  async readMultiplePages(params: BatchReadParams): Promise<{
    successful: Array<{
      path: string;
      frontmatter?: Record<string, unknown>;
      content?: string;
      blocks?: LogseqBlock[];
      logseqUri?: string;
    }>;
    failed: Array<{ path: string; error: string }>;
  }> {
    const { paths, includeContent = true, includeFrontmatter = true, includeBlocks = true } = params;

    if (paths.length > 10) {
      throw new Error('Max 10 files per batch');
    }

    const results = await Promise.allSettled(
      paths.map(async (path) => {
        if (!this.pathFilter.isAllowed(path)) {
          throw new Error(`Access denied: ${path}.`);
        }
        const page = await this.readPage(path);
        const out: {
          path: string;
          frontmatter?: Record<string, unknown>;
          content?: string;
          blocks?: LogseqBlock[];
          logseqUri?: string;
        } = {
          path,
          logseqUri: generateLogseqUri(this.graphPath, path),
        };
        if (includeFrontmatter) out.frontmatter = page.frontmatter;
        if (includeContent) out.content = page.content;
        if (includeBlocks) out.blocks = page.blocks;
        return out;
      })
    );

    const successful: Array<{
      path: string;
      frontmatter?: Record<string, unknown>;
      content?: string;
      blocks?: LogseqBlock[];
      logseqUri?: string;
    }> = [];
    const failed: Array<{ path: string; error: string }> = [];

    results.forEach((r, idx) => {
      const p = paths[idx];
      if (r.status === 'fulfilled') {
        successful.push(r.value);
      } else {
        failed.push({
          path: p,
          error: r.reason instanceof Error ? r.reason.message : 'Unknown',
        });
      }
    });

    return { successful, failed };
  }

  async getNotesInfo(paths: string[]): Promise<NoteInfo[]> {
    const results = await Promise.allSettled(
      paths.map(async (path) => {
        if (!this.pathFilter.isAllowed(path)) {
          throw new Error(`Access denied: ${path}.`);
        }
        const fullPath = this.resolvePath(path);
        const st = await stat(fullPath);
        const raw = await readFile(fullPath, 'utf-8');
        const hasFrontmatter = raw.startsWith('---\n');
        return {
          path,
          size: st.size,
          modified: st.mtime.getTime(),
          hasFrontmatter,
        };
      })
    );

    return results
      .filter((r): r is PromiseFulfilledResult<NoteInfo> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  async updateFrontmatter(
    path: string,
    frontmatter: Record<string, unknown>,
    merge: boolean = true
  ): Promise<void> {
    if (!this.pathFilter.isAllowed(path)) {
      throw new Error(`Access denied: ${path}.`);
    }
    const page = await this.readPage(path);
    const updated = merge
      ? { ...page.frontmatter, ...frontmatter }
      : frontmatter;
    const validation = this.frontmatterHandler.validate(updated);
    if (!validation.isValid) {
      throw new Error(`Invalid frontmatter: ${validation.errors.join(', ')}`);
    }
    await this.writePage({
      path,
      content: page.content,
      frontmatter: updated,
      mode: 'overwrite',
    });
  }

  async manageTags(params: TagManagementParams): Promise<TagManagementResult> {
    const { path, operation, tags = [] } = params;

    if (!this.pathFilter.isAllowed(path)) {
      return {
        path,
        operation,
        tags: [],
        success: false,
        message: `Access denied: ${path}.`,
      };
    }

    try {
      const page = await this.readPage(path);
      let currentTags: string[] = [];

      if (page.frontmatter.tags) {
        const t = page.frontmatter.tags;
        currentTags = Array.isArray(t) ? (t as string[]) : [t as string];
      }
      const inlineTags =
        page.content.match(/#[a-zA-Z0-9_-]+/g)?.map((x) => x.slice(1)) ?? [];
      currentTags = [...new Set([...currentTags, ...inlineTags])];

      if (operation === 'list') {
        return { path, operation, tags: currentTags, success: true };
      }

      let newTags = [...currentTags];
      if (operation === 'add') {
        for (const t of tags) {
          if (!newTags.includes(t)) newTags.push(t);
        }
      } else {
        newTags = newTags.filter((t) => !tags.includes(t));
      }

      const updated = { ...page.frontmatter };
      if (newTags.length > 0) {
        (updated as Record<string, unknown>).tags = newTags;
      } else {
        delete (updated as Record<string, unknown>).tags;
      }

      await this.writePage({
        path,
        content: page.content,
        frontmatter: updated,
        mode: 'overwrite',
      });

      return {
        path,
        operation,
        tags: newTags,
        success: true,
        message: `Successfully ${operation}ed tags`,
      };
    } catch (error) {
      return {
        path,
        operation,
        tags: [],
        success: false,
        message: error instanceof Error ? error.message : 'Unknown',
      };
    }
  }

  /** Find block by UUID across the graph (searches markdown files) */
  async findBlockByUuid(uuid: string): Promise<LogseqBlock | null> {
    const files = await this.findMarkdownFiles(this.graphPath);
    const relGraph = this.graphPath;

    for (const fullPath of files) {
      const rel = relative(relGraph, fullPath).replace(/\\/g, '/');
      if (!this.pathFilter.isAllowed(rel)) continue;
      try {
        const page = await this.readPage(rel);
        const block = findBlockByUuid(page.blocks, uuid);
        if (block) return block;
      } catch {
        // skip
      }
    }
    return null;
  }

  private async findMarkdownFiles(dir: string): Promise<string[]> {
    const out: string[] = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        out.push(...(await this.findMarkdownFiles(full)));
      } else if (e.isFile() && e.name.endsWith('.md')) {
        out.push(full);
      }
    }
    return out;
  }

  /** Append a block to a page or as child of parent */
  async appendBlock(
    path: string,
    content: string,
    options?: {
      parentUuid?: string;
      uuid?: string;
      properties?: Record<string, string | number | boolean>;
    }
  ): Promise<LogseqBlock> {
    const page = await this.readPage(path);
    const { v4: uuidv4 } = await import('uuid');
    const uuid = options?.uuid ?? uuidv4();

    const newBlock: LogseqBlock = {
      uuid,
      content,
      level: 0,
      properties: options?.properties ?? {},
      children: [],
      sourcePath: path,
    };

    if (options?.parentUuid) {
      const parent = findBlockByUuid(page.blocks, options.parentUuid);
      if (!parent) {
        throw new Error(`Parent block not found: ${options.parentUuid}`);
      }
      newBlock.level = parent.level + 1;
      newBlock.parentUuid = parent.uuid;
      parent.children.push(newBlock);
    } else {
      page.blocks.push(newBlock);
    }

    const serialized = serializeBlocks(page.blocks);
    await this.writePage({
      path,
      content: serialized,
      frontmatter: page.frontmatter,
      mode: 'overwrite',
    });

    return newBlock;
  }

  /** Insert block reference into a block's content */
  async createBlockRef(
    targetPath: string,
    targetBlockUuid: string,
    refUuid: string
  ): Promise<void> {
    const page = await this.readPage(targetPath);
    const block = findBlockByUuid(page.blocks, targetBlockUuid);
    if (!block) {
      throw new Error(`Block not found: ${targetBlockUuid}`);
    }
    const ref = createBlockRef(refUuid);
    block.content = (block.content + ' ' + ref).trim();
    const serialized = serializeBlocks(page.blocks);
    await this.writePage({
      path: targetPath,
      content: serialized,
      frontmatter: page.frontmatter,
      mode: 'overwrite',
    });
  }

  /** Get blocks that reference the given block UUID */
  async getBlockRefs(uuid: string): Promise<Array<{ block: LogseqBlock; path: string }>> {
    const files = await this.findMarkdownFiles(this.graphPath);
    const results: Array<{ block: LogseqBlock; path: string }> = [];
    const lower = uuid.toLowerCase();

    for (const fullPath of files) {
      const rel = relative(this.graphPath, fullPath).replace(/\\/g, '/');
      if (!this.pathFilter.isAllowed(rel)) continue;
      try {
        const page = await this.readPage(rel);
        const flat = flattenBlocks(page.blocks);
        for (const b of flat) {
          if (extractBlockRefs(b.content).includes(lower)) {
            results.push({ block: b, path: rel });
          }
        }
      } catch {
        // skip
      }
    }
    return results;
  }

  async isDirectory(path: string): Promise<boolean> {
    try {
      const full = this.resolvePath(path);
      if (!this.pathFilter.isAllowed(path)) return false;
      const st = await stat(full);
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  getGraphPath(): string {
    return this.graphPath;
  }

  async getGraphStats(recentCount: number = 5): Promise<VaultStats> {
    let totalNotes = 0;
    let totalFolders = 0;
    let totalSize = 0;
    const recent: Array<{ path: string; modified: number }> = [];

    const scan = async (dir: string, relPath: string = ''): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const r = relPath ? `${relPath}/${e.name}` : e.name;
        if (!this.pathFilter.isAllowed(r)) continue;
        const full = join(dir, e.name);
        if (e.isDirectory()) {
          totalFolders++;
          await scan(full, r);
        } else if (e.isFile()) {
          totalNotes++;
          const st = await stat(full);
          totalSize += st.size;
          const info = { path: r, modified: st.mtime.getTime() };
          const idx = recent.findIndex((x) => x.modified < info.modified);
          if (idx === -1) {
            if (recent.length < recentCount) recent.push(info);
          } else {
            recent.splice(idx, 0, info);
            if (recent.length > recentCount) recent.pop();
          }
        }
      }
    };

    await scan(this.graphPath);
    return {
      totalNotes,
      totalFolders,
      totalSize,
      recentlyModified: recent,
    };
  }
}
