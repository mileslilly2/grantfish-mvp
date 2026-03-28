export function safeArray<T>(value: T[] | null | undefined): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is T => item != null);
}

export function ensureArray(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  if (typeof value !== "string") {
    return [String(value).trim()].filter(Boolean);
  }

  const trimmed = value.trim();

  try {
    const parsed = JSON.parse(trimmed);

    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v).trim()).filter(Boolean);
    }

    if (typeof parsed === "string") {
      return ensureArray(parsed);
    }
  } catch {
    // ignore invalid JSON and fall through
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((v) => v.replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim())
      .filter(Boolean);
  }

  return trimmed
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
