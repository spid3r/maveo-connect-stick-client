import { describe, expect, it } from "vitest";
import { presignMqttWsUrl } from "../src/iot/presignMqttWsUrl.js";

describe("presignMqttWsUrl", () => {
  it("returns wss URL with SigV4 query params", async () => {
    const url = await presignMqttWsUrl(
      {
        region: "test-region",
        iotHostname: "iot.example.test",
        identityId: "x",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        sessionToken: "token",
      },
      { expiresInSeconds: 60 },
    );
    expect(url.startsWith("wss://iot.example.test/mqtt?")).toBe(true);
    const u = new URL(url);
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(u.searchParams.get("X-Amz-Security-Token")).toBe("token");
    expect(u.searchParams.has("X-Amz-Signature")).toBe(true);
  });
});
