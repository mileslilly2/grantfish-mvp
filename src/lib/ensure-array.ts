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
  if (!value) return [];

  // Already correct
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }

  // 🔥 Handle Postgres array string: {"WV","VA"}
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((v) => v.replace(/"/g, "").trim())
      .filter(Boolean);
  }

  // Normal comma string
  if (typeof value === "string") {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [String(value)];
}