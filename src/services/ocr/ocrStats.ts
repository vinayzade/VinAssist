import type { OCRBlock, OCRStats } from './types';

/** Counts words as whitespace-separated runs containing a letter or digit. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Drops BCP-47 "undetermined" tags (`und`, `und-Latn`) that engines emit. */
function usableLanguage(tag: string | undefined): string | undefined {
  if (!tag || /^und(-|$)/i.test(tag)) {
    return undefined;
  }
  return tag;
}

/** Derives summary figures from recognised blocks. Pure; safe to memoise. */
export function computeStats(blocks: OCRBlock[], text: string): OCRStats {
  let lineCount = 0;
  let confidenceSum = 0;
  let confidenceCount = 0;
  const languages = new Map<string, number>();

  for (const block of blocks) {
    for (const line of block.lines) {
      lineCount += 1;
      if (typeof line.confidence === 'number' && line.confidence > 0) {
        confidenceSum += line.confidence;
        confidenceCount += 1;
      }
      const language = usableLanguage(line.language ?? block.language);
      if (language) {
        languages.set(language, (languages.get(language) ?? 0) + 1);
      }
    }
  }

  let language: string | undefined;
  let best = 0;
  for (const [tag, count] of languages) {
    if (count > best) {
      best = count;
      language = tag;
    }
  }

  return {
    lineCount,
    wordCount: countWords(text),
    meanConfidence:
      confidenceCount > 0 ? confidenceSum / confidenceCount : undefined,
    language,
  };
}
