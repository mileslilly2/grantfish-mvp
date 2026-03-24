export function safeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (value == null) {
    return [];
  }

  return [value as T];
}

export function ensureArray(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (Array.isArray(value)) {
    return safeArray<unknown>(value)
      .map((entry) => String(entry).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return safeArray<string>(value.split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
}
