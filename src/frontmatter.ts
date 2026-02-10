/**
 * Frontmatter handling for Logseq pages.
 * Logseq pages support YAML frontmatter like Obsidian.
 */

import matter from 'gray-matter';
import type { ParsedNote } from './types.js';

export interface FrontmatterValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class FrontmatterHandler {
  parse(content: string): ParsedNote {
    try {
      const parsed = matter(content);
      return {
        frontmatter: parsed.data as Record<string, unknown>,
        content: parsed.content,
        originalContent: content,
      };
    } catch {
      return {
        frontmatter: {},
        content,
        originalContent: content,
      };
    }
  }

  stringify(frontmatterData: Record<string, unknown>, content: string): string {
    try {
      if (!frontmatterData || Object.keys(frontmatterData).length === 0) {
        return content;
      }
      return matter.stringify(content, frontmatterData);
    } catch (error) {
      throw new Error(
        `Failed to stringify frontmatter: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  validate(frontmatterData: Record<string, unknown>): FrontmatterValidationResult {
    const result: FrontmatterValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    try {
      matter.stringify('', frontmatterData);
    } catch (error) {
      result.isValid = false;
      result.errors.push(
        `Invalid YAML structure: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    this.checkForProblematicValues(frontmatterData, result, '');
    return result;
  }

  private checkForProblematicValues(
    obj: unknown,
    result: FrontmatterValidationResult,
    path: string
  ): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (typeof obj === 'function') {
      result.errors.push(`Functions are not allowed in frontmatter at path: ${path}`);
      result.isValid = false;
      return;
    }

    if (typeof obj === 'symbol') {
      result.errors.push(`Symbols are not allowed in frontmatter at path: ${path}`);
      result.isValid = false;
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        this.checkForProblematicValues(item, result, `${path}[${index}]`);
      });
      return;
    }

    if (typeof obj === 'object' && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        if (typeof key !== 'string') {
          result.errors.push(`Non-string keys are not allowed: ${key}`);
          result.isValid = false;
        }
        this.checkForProblematicValues(value, result, currentPath);
      }
    }
  }
}
