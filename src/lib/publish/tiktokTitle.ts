/**
 * Strips any leading paragraph or hook from a TikTok caption if it duplicates the TikTok title,
 * preventing TikTok Photo Mode from displaying the identical headline twice in a row.
 * Pure string helper with zero DOM or browser dependencies so it can safely be imported
 * in both client and serverless API handlers without dragging in canvas/IndexedDB dependencies.
 */
export function stripLeadingDuplicateTikTokTitle(description: string, title?: string): string {
  if (!description || !title) return description || '';
  const cleanTitle = title.trim();
  if (!cleanTitle) return description;

  const normalize = (str: string) =>
    str
      .toLowerCase()
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
      .replace(/[⚡️🔥✨🚀🔹•\n\r\t.,:;!?\-_/\\|()[\]{}'"]+/g, ' ')
      .trim();

  const normTitle = normalize(cleanTitle);
  if (!normTitle) return description;

  const lines = description.split(/\r?\n/);
  let firstNonEmptyIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      firstNonEmptyIdx = i;
      break;
    }
  }

  if (firstNonEmptyIdx === -1) return description;

  const firstLine = lines[firstNonEmptyIdx].trim();
  const normFirstLine = normalize(firstLine);

  // Split title parts (e.g. 'EN | AR')
  const titleParts = cleanTitle.split('|').map((p) => normalize(p)).filter((p) => p.length >= 6);

  const isDuplicate =
    normFirstLine === normTitle ||
    (normFirstLine.length >= 8 && normTitle.includes(normFirstLine)) ||
    (normTitle.length >= 8 && normFirstLine.includes(normTitle)) ||
    titleParts.some(
      (tp) =>
        (tp.length >= 8 && normFirstLine.includes(tp)) ||
        (normFirstLine.length >= 8 && tp.includes(normFirstLine))
    );

  if (isDuplicate) {
    const remainingLines = lines.slice(firstNonEmptyIdx + 1);
    while (remainingLines.length > 0 && remainingLines[0].trim().length === 0) {
      remainingLines.shift();
    }
    const result = remainingLines.join('\n').trim();
    return result || description;
  }

  return description;
}
