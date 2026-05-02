import { describe, expect, it } from "vitest";
import { buildMqttWssConnectParams } from "../src/iot/mqttWssConnect.js";

const session = {
  region: "test-region",
  iotHostname: "iot.example.test",
  identityId: "x",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  sessionToken: "tok",
};

describe("buildMqttWssConnectParams", () => {
  it("headers mode: wss with :443 and SigV4 Authorization (iotdata)", async () => {
    const { url, wsOptions, signing } = await buildMqttWssConnectParams(session, {
      signing: "headers",
    });
    expect(signing).toBe("headers");
    expect(url).toBe("wss://iot.example.test:443/mqtt");
    expect(wsOptions.headers?.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
    expect(wsOptions.headers?.["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
    expect(wsOptions.headers?.["x-amz-security-token"]).toBe("tok");
    expect(wsOptions.headers?.host).toBe("iot.example.test:443");
  });

  it("query mode: presigned URL (iotdevicegateway)", async () => {
    const { url, wsOptions, signing } = await buildMqttWssConnectParams(session, {
      signing: "query",
      expiresInSeconds: 60,
    });
    expect(signing).toBe("query");
    expect(url.startsWith("wss://iot.example.test/mqtt?")).toBe(true);
    expect(wsOptions.headers).toBeUndefined();
    const u = new URL(url);
    expect(u.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  });
});
