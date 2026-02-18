/**
 * Parse Logseq markdown into blocks.
 * Logseq blocks: start with "-", indentation = hierarchy, id:: uuid for block ID.
 * Properties appear on subsequent indented lines as key:: value.
 */

import { v4 as uuidv4 } from 'uuid';
import type { LogseqBlock, TaskMarker, TaskPriority } from './types.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Match key:: value property (after trim) */
const PROPERTY_REGEX = /^([a-zA-Z0-9_-]+)::\s*(.*)$/;

/** Logseq task markers (https://docs.logseq.com/#/page/tasks) */
const TASK_MARKERS: TaskMarker[] = [
  'TODO',
  'DOING',
  'DONE',
  'LATER',
  'NOW',
  'CANCELED',
  'CANCELLED',
  'IN-PROGRESS',
  'WAIT',
  'WAITING',
];

/** Regex: optional task marker at start (word boundary), optional [#A]/[#B]/[#C], rest is content */
const TASK_MARKER_REGEX = new RegExp(
  `^(${TASK_MARKERS.join('|')})\\b\\s*` +
    `(?:\\[#([ABC])\\]\\s*)?` +
    `(.*)$`,
  'i'
);

/**
 * Parse task marker and priority from block content (Logseq tasks syntax).
 * Content is unchanged; returns marker/priority for the block.
 */
function parseTaskFromContent(
  content: string
): { marker?: TaskMarker; priority?: TaskPriority } {
  const trimmed = content.trim();
  const match = trimmed.match(TASK_MARKER_REGEX);
  if (!match) return {};
  const marker = match[1].toUpperCase() as TaskMarker;
  const normalizedMarker =
    marker === 'CANCELLED' ? 'CANCELED' : marker === 'WAITING' ? 'WAIT' : marker;
  if (!TASK_MARKERS.includes(normalizedMarker as TaskMarker)) return {};
  const priority = match[2] as TaskPriority | undefined;
  return {
    marker: normalizedMarker as TaskMarker,
    ...(priority && { priority }),
  };
}

function parsePropertyValue(v: string): string | number | boolean {
  const t = v.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

/** Build block tree from flat list of { level, content, properties } */
function buildBlockTree(
  items: Array<{
    level: number;
    content: string;
    properties: Record<string, string | number | boolean>;
  }>,
  sourcePath: string
): LogseqBlock[] {
  const blocks: LogseqBlock[] = [];
  const stack: Array<{ block: LogseqBlock; level: number }> = [];

  for (const item of items) {
    const uuid =
      (typeof item.properties.id === 'string' &&
      UUID_REGEX.test(item.properties.id)
        ? item.properties.id
        : null) ?? uuidv4();
    const { id: _id, ...rest } = item.properties;
    const task = parseTaskFromContent(item.content);

    const block: LogseqBlock = {
      uuid,
      content: item.content,
      level: item.level,
      properties: rest as Record<string, string | number | boolean>,
      children: [],
      sourcePath,
      ...(task.marker && { marker: task.marker }),
      ...(task.priority && { priority: task.priority }),
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }

    if (stack.length > 0) {
      const parent = stack[stack.length - 1];
      block.parentUuid = parent.block.uuid;
      parent.block.children.push(block);
    } else {
      blocks.push(block);
    }

    stack.push({ block, level: item.level });
  }

  return blocks;
}

/**
 * Parse Logseq markdown content into blocks.
 * Content is the markdown body (without frontmatter).
 * Handles property lines (indented key:: value) following each block.
 */
export function parseBlocks(
  content: string,
  sourcePath: string = ''
): LogseqBlock[] {
  const lines = content.split('\n');
  const items: Array<{
    level: number;
    content: string;
    properties: Record<string, string | number | boolean>;
  }> = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(/^(\t*)-\s+(.*)$/);
    if (match) {
      const level = match[1].length;
      const mainContent = match[2];
      const properties: Record<string, string | number | boolean> = {};
      i += 1;

      while (i < lines.length) {
        const next = lines[i];
        const nextIndent = (next.match(/^\t*/)?.[0] ?? '').length;
        if (nextIndent <= level && next.trim()) {
          break;
        }
        const propMatch = next.trim().match(PROPERTY_REGEX);
        if (propMatch && nextIndent > level) {
          const [, key, value] = propMatch;
          properties[key] = parsePropertyValue(value);
          i += 1;
        } else {
          break;
        }
      }

      items.push({
        level,
        content: mainContent.trim(),
        properties,
      });
    } else {
      i += 1;
    }
  }

  return buildBlockTree(items, sourcePath);
}

/**
 * Flatten block tree to array (depth-first).
 */
export function flattenBlocks(blocks: LogseqBlock[]): LogseqBlock[] {
  const result: LogseqBlock[] = [];
  function visit(b: LogseqBlock) {
    result.push(b);
    for (const c of b.children) {
      visit(c);
    }
  }
  for (const b of blocks) {
    visit(b);
  }
  return result;
}

/**
 * Find block by UUID in tree.
 */
export function findBlockByUuid(
  blocks: LogseqBlock[],
  uuid: string
): LogseqBlock | null {
  const flat = flattenBlocks(blocks);
  return flat.find((b) => b.uuid === uuid) ?? null;
}

/**
 * Serialize blocks back to Logseq markdown.
 */
export function serializeBlocks(blocks: LogseqBlock[]): string {
  const lines: string[] = [];

  function visit(b: LogseqBlock, indent: number) {
    const prefix = '\t'.repeat(indent) + '- ';
    const propLines: string[] = [];
    if (b.uuid) {
      propLines.push(`id:: ${b.uuid}`);
    }
    for (const [k, v] of Object.entries(b.properties)) {
      if (typeof v === 'boolean') {
        propLines.push(`${k}:: ${v}`);
      } else if (typeof v === 'number') {
        propLines.push(`${k}:: ${v}`);
      } else {
        propLines.push(`${k}:: ${v}`);
      }
    }
    const mainContent = b.content.trim();
    lines.push(prefix + mainContent);
    for (const p of propLines) {
      lines.push('\t'.repeat(indent + 1) + p);
    }
    for (const c of b.children) {
      visit(c, indent + 1);
    }
  }

  for (const b of blocks) {
    visit(b, 0);
  }

  return lines.join('\n');
}
