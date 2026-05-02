import { describe, expect, it } from "vitest";
import { isMaveoSessionCredentialsNearExpiry } from "../src/auth/sessionExpiry.js";
import type { MaveoSession } from "../src/auth/types.js";

function baseSession(over: Partial<MaveoSession> = {}): MaveoSession {
  return {
    region: "test-region",
    iotHostname: "iot.example.test",
    identityId: "id",
    accessKeyId: "a",
    secretAccessKey: "s",
    sessionToken: "t",
    ...over,
  };
}

describe("isMaveoSessionCredentialsNearExpiry", () => {
  it("false when expiry unknown", () => {
    expect(isMaveoSessionCredentialsNearExpiry(baseSession(), 120_000)).toBe(false);
  });

  it("true when inside margin of expiry", () => {
    const soon = Date.now() + 30_000;
    expect(isMaveoSessionCredentialsNearExpiry(baseSession({ credentialsExpireAt: soon }), 120_000)).toBe(true);
  });

  it("false when expiry far ahead", () => {
    const later = Date.now() + 7200_000;
    expect(isMaveoSessionCredentialsNearExpiry(baseSession({ credentialsExpireAt: later }), 120_000)).toBe(false);
  });
});
