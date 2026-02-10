/**
 * Logseq block references: ((block-uuid)) and {{embed ((block-uuid))}}
 */

import type { LogseqBlock } from './types.js';

const BLOCK_REF_REGEX = /\(\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)\)/gi;

/** Extract all block ref UUIDs from content */
export function extractBlockRefs(content: string): string[] {
  const uuids: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(BLOCK_REF_REGEX.source, 'gi');
  while ((m = re.exec(content)) !== null) {
    uuids.push(m[1].toLowerCase());
  }
  return [...new Set(uuids)];
}

/** Check if content contains block ref syntax */
export function hasBlockRef(content: string): boolean {
  return BLOCK_REF_REGEX.test(content);
}

/** Replace block refs with resolved content (sync) */
export function resolveBlockRefs(
  content: string,
  resolveUuid: (uuid: string) => LogseqBlock | null
): string {
  return content.replace(BLOCK_REF_REGEX, (_, uuid) => {
    const block = resolveUuid(uuid);
    if (block) {
      return block.content;
    }
    return `((${uuid}))`;
  });
}

/** Replace block refs with resolved content (async) */
export async function resolveBlockRefsAsync(
  content: string,
  resolveUuid: (uuid: string) => Promise<LogseqBlock | null>
): Promise<string> {
  const refs = extractBlockRefs(content);
  let result = content;
  for (const uuid of refs) {
    const block = await resolveUuid(uuid);
    const ref = new RegExp(
      `\\(\\(${uuid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)\\)`,
      'gi'
    );
    result = result.replace(ref, block ? block.content : `((${uuid}))`);
  }
  return result;
}

/** Create block ref string */
export function createBlockRef(uuid: string): string {
  return `((${uuid}))`;
}

/** Validate UUID format */
export function isValidBlockUuid(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    uuid
  );
}
