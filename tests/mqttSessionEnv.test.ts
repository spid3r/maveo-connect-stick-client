import { describe, expect, it } from "vitest";
import {
  loadBlueFiRspPollIntervalMsFromEnv,
  loadMqttReclaimRetryOptionsFromEnv,
  loadMqttSessionContentionFromEnv,
  mergeAutomaticMqttReclaimOptionsFromEnv,
} from "../src/config/mqttSessionEnv.js";

/** Avoid flaky tests when the developer shell already exports `MAVEO_MQTT_*`. */
function env(p: Record<string, string> = {}): NodeJS.ProcessEnv {
  const e = { ...process.env } as Record<string, string | undefined>;
  for (const k of [
    "MAVEO_MQTT_SESSION_CONTENTION",
    "MAVEO_MQTT_CONTENTION_BURST_WINDOW_MS",
    "MAVEO_MQTT_CONTENTION_BURST_THRESHOLD",
    "MAVEO_MQTT_CONTENTION_BACKOFF_MS",
    "MAVEO_MQTT_RECLAIM_MAX_ATTEMPTS",
    "MAVEO_MQTT_RECLAIM_DELAY_MS",
    "MAVEO_BLUEFI_RSP_POLL_MS",
  ]) {
    delete e[k];
  }
  return { ...e, ...p } as NodeJS.ProcessEnv;
}

describe("mqttSessionEnv", () => {
  it("loadMqttSessionContentionFromEnv: unset is undefined", () => {
    expect(loadMqttSessionContentionFromEnv(env({}))).toBeUndefined();
  });

  it("loadMqttSessionContentionFromEnv: explicit false", () => {
    expect(loadMqttSessionContentionFromEnv(env({ MAVEO_MQTT_SESSION_CONTENTION: "false" }))).toBe(false);
  });

  it("loadMqttSessionContentionFromEnv: true uses defaults when no policy keys", () => {
    expect(loadMqttSessionContentionFromEnv(env({ MAVEO_MQTT_SESSION_CONTENTION: "1" }))).toBe(true);
  });

  it("loadMqttSessionContentionFromEnv: policy from partial env", () => {
    const c = loadMqttSessionContentionFromEnv(
      env({ MAVEO_MQTT_CONTENTION_BURST_THRESHOLD: "5", MAVEO_MQTT_CONTENTION_BACKOFF_MS: "30000" }),
    );
    expect(c).toEqual({ burstThreshold: 5, backoffAfterBurstMs: 30_000 });
  });

  it("loadMqttReclaimRetryOptionsFromEnv: parses integers", () => {
    expect(
      loadMqttReclaimRetryOptionsFromEnv(
        env({ MAVEO_MQTT_RECLAIM_MAX_ATTEMPTS: "7", MAVEO_MQTT_RECLAIM_DELAY_MS: "900" }),
      ),
    ).toEqual({ maxAttempts: 7, delayMsBetweenAttempts: 900 });
  });

  it("mergeAutomaticMqttReclaimOptionsFromEnv: explicit overrides env", () => {
    const m = mergeAutomaticMqttReclaimOptionsFromEnv(
      env({
        MAVEO_MQTT_SESSION_CONTENTION: "1",
        MAVEO_MQTT_RECLAIM_MAX_ATTEMPTS: "9",
      }),
      { maxAttempts: 2, sessionContention: false },
    );
    expect(m.maxAttempts).toBe(2);
    expect(m.sessionContention).toBe(false);
  });

  it("mergeAutomaticMqttReclaimOptionsFromEnv: env fills when explicit omits sessionContention", () => {
    const m = mergeAutomaticMqttReclaimOptionsFromEnv(env({ MAVEO_MQTT_SESSION_CONTENTION: "true" }), {
      maxAttempts: 4,
    });
    expect(m.maxAttempts).toBe(4);
    expect(m.sessionContention).toBe(true);
  });

  it("mergeAutomaticMqttReclaimOptionsFromEnv: explicit sessionContention true keeps env policy keys", () => {
    const m = mergeAutomaticMqttReclaimOptionsFromEnv(
      env({ MAVEO_MQTT_CONTENTION_BACKOFF_MS: "10000" }),
      { sessionContention: true, maxAttempts: 4 },
    );
    expect(m.maxAttempts).toBe(4);
    expect(m.sessionContention).toEqual({ backoffAfterBurstMs: 10_000 });
  });

  it("loadBlueFiRspPollIntervalMsFromEnv", () => {
    expect(loadBlueFiRspPollIntervalMsFromEnv(env({}), 400)).toBe(400);
    expect(loadBlueFiRspPollIntervalMsFromEnv(env({ MAVEO_BLUEFI_RSP_POLL_MS: "1000" }), 400)).toBe(1000);
  });
});
