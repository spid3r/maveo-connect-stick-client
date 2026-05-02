import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveMaveoStickSerialFromEnv, tryResolveMaveoStickSerialFromEnv } from "../src/config/stickSerial.js";

describe("stickSerial", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolveMaveoStickSerialFromEnv prefers MAVEO_MQTT_CLIENT_ID", () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "mqtt-id");
    vi.stubEnv("MAVEO_THING_NAME", "thing-id");
    expect(resolveMaveoStickSerialFromEnv()).toBe("mqtt-id");
  });

  it("resolveMaveoStickSerialFromEnv uses MAVEO_THING_NAME when MQTT id unset", () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "");
    vi.stubEnv("MAVEO_THING_NAME", "thing-only");
    expect(resolveMaveoStickSerialFromEnv()).toBe("thing-only");
  });

  it("resolveMaveoStickSerialFromEnv throws when missing", () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "");
    vi.stubEnv("MAVEO_THING_NAME", "");
    expect(() => resolveMaveoStickSerialFromEnv()).toThrow(/MAVEO_THING_NAME/);
  });

  it("tryResolveMaveoStickSerialFromEnv returns undefined when missing", () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "");
    vi.stubEnv("MAVEO_THING_NAME", "");
    expect(tryResolveMaveoStickSerialFromEnv()).toBeUndefined();
  });
});
