/**
 * Logseq URI generation for graph/page/block references.
 */

export function generateLogseqUri(
  graphPath: string,
  pagePath: string,
  blockUuid?: string
): string {
  const encodedPath = encodeURIComponent(pagePath);
  if (blockUuid) {
    return `logseq://graph/${encodeURIComponent(graphPath)}/page/${encodedPath}/block/${blockUuid}`;
  }
  return `logseq://graph/${encodeURIComponent(graphPath)}/page/${encodedPath}`;
}
