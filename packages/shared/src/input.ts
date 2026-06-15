const URL_PATTERN = /^https?:\/\//i;
const URL_MATCH_PATTERN = /https?:\/\/[^\s]+/gi;
const URL_SEPARATOR_PATTERN = /[,，;；]+(?=\s*https?:\/\/)/gi;
const TRAILING_PUNCTUATION_PATTERN = /[),.;!?\]}>，。；、！？”’]+$/u;

export function parseTaskUrlInput(rawInput: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const normalizedInput = rawInput.replace(URL_SEPARATOR_PATTERN, "\n");

  for (const match of normalizedInput.match(URL_MATCH_PATTERN) ?? []) {
    addUrl(match, seen, urls);
  }

  return urls;
}

function addUrl(rawValue: string, seen: Set<string>, urls: string[]) {
  const value = rawValue.trim().replace(TRAILING_PUNCTUATION_PATTERN, "");
  if (!value || !URL_PATTERN.test(value)) {
    return;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }
    const normalized = url.toString();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      urls.push(normalized);
    }
  } catch {
    return;
  }
}
