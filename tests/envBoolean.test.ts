import { describe, expect, it } from "vitest";
import { parseMaveoEnvBoolean } from "../src/config/envBoolean.js";

describe("parseMaveoEnvBoolean", () => {
  it("treats string false as false (Zod coerce does not)", () => {
    expect(parseMaveoEnvBoolean("false", true)).toBe(false);
    expect(parseMaveoEnvBoolean("FALSE", true)).toBe(false);
  });

  it("defaults when unset", () => {
    expect(parseMaveoEnvBoolean(undefined, false)).toBe(false);
    expect(parseMaveoEnvBoolean(undefined, true)).toBe(true);
    expect(parseMaveoEnvBoolean("", false)).toBe(false);
  });

  it("parses truthy tokens", () => {
    expect(parseMaveoEnvBoolean("true", false)).toBe(true);
    expect(parseMaveoEnvBoolean("1", false)).toBe(true);
    expect(parseMaveoEnvBoolean("yes", false)).toBe(true);
  });
});
