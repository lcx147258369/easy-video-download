const URL_PATTERN = /^https?:\/\//i;

export function parseTaskUrlInput(rawInput: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const line of rawInput.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || !URL_PATTERN.test(value)) {
      continue;
    }

    try {
      const url = new URL(value);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        continue;
      }
      const normalized = url.toString();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        urls.push(normalized);
      }
    } catch {
      continue;
    }
  }

  return urls;
}
