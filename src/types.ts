/**
 * MCP-Logseq type definitions.
 * Logseq uses blocks as the fundamental unit; pages are containers of blocks.
 */

/** A parsed Logseq block with UUID, content, level, and properties */
export interface LogseqBlock {
  uuid: string;
  content: string;
  level: number;
  properties: Record<string, string | number | boolean>;
  children: LogseqBlock[];
  parentUuid?: string;
  sourcePath: string;
}

/** Page = file with frontmatter + block tree */
export interface ParsedPage {
  frontmatter: Record<string, unknown>;
  content: string;
  blocks: LogseqBlock[];
  originalContent: string;
}

/** Raw parsed note (content only, before block parsing) */
export interface ParsedNote {
  frontmatter: Record<string, unknown>;
  content: string;
  originalContent: string;
}

export interface PageWriteParams {
  path: string;
  content: string;
  frontmatter?: Record<string, unknown>;
  mode?: 'overwrite' | 'append' | 'prepend';
}

export interface BlockWriteParams {
  path: string;
  content: string;
  parentUuid?: string;
  uuid?: string;
  position?: 'first' | 'last' | number;
  properties?: Record<string, string | number | boolean>;
}

export interface PatchNoteParams {
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export interface PatchNoteResult {
  success: boolean;
  path: string;
  message: string;
  matchCount?: number;
}

export interface DeleteNoteParams {
  path: string;
  confirmPath: string;
}

export interface DeleteResult {
  success: boolean;
  path: string;
  message: string;
}

export interface DirectoryListing {
  files: string[];
  directories: string[];
}

export interface SearchParams {
  query: string;
  limit?: number;
  searchContent?: boolean;
  searchFrontmatter?: boolean;
  searchBlockProperties?: boolean;
  caseSensitive?: boolean;
}

export interface BlockSearchResult {
  p: string;
  t: string;
  uuid?: string;
  ex: string;
  mc: number;
  ln?: number;
}

export interface MoveNoteParams {
  oldPath: string;
  newPath: string;
  overwrite?: boolean;
}

export interface MoveResult {
  success: boolean;
  oldPath: string;
  newPath: string;
  message: string;
}

export interface BatchReadParams {
  paths: string[];
  includeContent?: boolean;
  includeFrontmatter?: boolean;
  includeBlocks?: boolean;
}

export interface BatchReadResult {
  successful: Array<{
    path: string;
    frontmatter?: Record<string, unknown>;
    content?: string;
    blocks?: LogseqBlock[];
  }>;
  failed: Array<{ path: string; error: string }>;
}

export interface NoteInfo {
  path: string;
  size: number;
  modified: number;
  hasFrontmatter: boolean;
}

export interface TagManagementParams {
  path: string;
  operation: 'add' | 'remove' | 'list';
  tags?: string[];
}

export interface TagManagementResult {
  path: string;
  operation: string;
  tags: string[];
  success: boolean;
  message?: string;
}

export interface VaultStats {
  totalNotes: number;
  totalFolders: number;
  totalSize: number;
  recentlyModified: Array<{ path: string; modified: number }>;
}

/** Block reference resolution result */
export interface ResolvedBlockRef {
  uuid: string;
  content: string;
  path: string;
  level: number;
}
