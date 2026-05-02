/**
 * Parse typical shell / .env booleans. Avoid `z.coerce.boolean()` — in Zod/JS, any non-empty string
 * (including `"false"`) coerces to `true`.
 */
export function parseMaveoEnvBoolean(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === "") return defaultValue;
  const s = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return defaultValue;
}
