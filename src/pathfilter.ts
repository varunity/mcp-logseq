/**
 * Path filter for Logseq graphs.
 * Excludes .logseq, .git, and other system files.
 */

export interface PathFilterConfig {
  ignoredPatterns: string[];
  allowedExtensions: string[];
}

export class PathFilter {
  private ignoredPatterns: string[];
  private allowedExtensions: string[];

  constructor(config?: Partial<PathFilterConfig>) {
    this.ignoredPatterns = [
      '.logseq/**',
      '.git/**',
      'node_modules/**',
      '.DS_Store',
      'Thumbs.db',
      ...(config?.ignoredPatterns ?? []),
    ];

    this.allowedExtensions = [
      '.md',
      '.markdown',
      '.txt',
      ...(config?.allowedExtensions ?? []),
    ];
  }

  private simpleGlobMatch(pattern: string, path: string): boolean {
    const normalizedPattern = pattern.replace(/\\/g, '/');
    let regexPattern = normalizedPattern
      .replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
      .replace(/\\\*\\\*/g, '.*')
      .replace(/\\\*/g, '[^/]*')
      .replace(/\\\?/g, '[^/]');
    regexPattern = '^' + regexPattern + '$';
    const regex = new RegExp(regexPattern);
    return regex.test(path);
  }

  isAllowed(path: string): boolean {
    const normalizedPath = path.replace(/\\/g, '/');

    for (const pattern of this.ignoredPatterns) {
      if (this.simpleGlobMatch(pattern, normalizedPath)) {
        return false;
      }
    }

    if (
      this.allowedExtensions.length > 0 &&
      this.isFile(normalizedPath)
    ) {
      const hasAllowedExtension = this.allowedExtensions.some((ext) =>
        normalizedPath.toLowerCase().endsWith(ext.toLowerCase())
      );
      if (!hasAllowedExtension) {
        return false;
      }
    }

    return true;
  }

  private isFile(path: string): boolean {
    if (path.endsWith('/')) {
      return false;
    }
    const lastSlashIndex = path.lastIndexOf('/');
    const lastComponent =
      lastSlashIndex === -1 ? path : path.substring(lastSlashIndex + 1);
    const lastDotIndex = lastComponent.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
      return false;
    }
    const extension = lastComponent.substring(lastDotIndex + 1);
    return (
      extension.length >= 1 &&
      extension.length <= 10 &&
      /^[a-zA-Z0-9]+$/.test(extension)
    );
  }

  filterPaths(paths: string[]): string[] {
    return paths.filter((path) => this.isAllowed(path));
  }
}
