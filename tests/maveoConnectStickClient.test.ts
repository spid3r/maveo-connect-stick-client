import { afterEach, describe, expect, it, vi } from "vitest";
import { MaveoConnectStickClient } from "../src/client/maveoConnectStickClient.js";
import type { MaveoLibraryConfig } from "../src/config/env.js";
import { MaveoDoorPosition } from "../src/iot/maveoBlueFiState.js";
import type { MqttSessionLostEvent } from "../src/iot/maveoMqttIotClient.js";

const minimalLibraryConfig: MaveoLibraryConfig = {
  email: "a@b.c",
  password: "pw",
  cognitoIdentityPoolId: "test-region:00000000-0000-0000-0000-000000000000",
  cognitoClientId: "test-client-id",
  region: "test-region",
  iotHostname: "iot.example.test",
};

describe("MaveoConnectStickClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("stickSerial reads env resolution order", () => {
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "m1");
    vi.stubEnv("MAVEO_THING_NAME", "t1");
    expect(c.stickSerial()).toBe("m1");
  });

  it("requireSession throws before login", () => {
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    expect(() => c.requireSession()).toThrow(/login/);
  });

  it("getDoorPosition waits for StoA_s after publishDoorStatusRead", async () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "");
    vi.stubEnv("MAVEO_THING_NAME", "stick99");
    let msgHandler: ((topic: string, payload: Buffer) => void) | undefined;
    const mqtt = {
      onMessage: vi.fn((h: (topic: string, payload: Buffer) => void) => {
        msgHandler = h;
        return vi.fn();
      }),
      publishDoorStatusRead: vi.fn(async () => {
        queueMicrotask(() => msgHandler?.("stick99/rsp", Buffer.from('{"StoA_s":4}')));
      }),
    };
    const c = new MaveoConnectStickClient(minimalLibraryConfig, { blueFiReadTimeoutMs: 2000 });
    (c as unknown as { mqtt: typeof mqtt }).mqtt = mqtt;
    await expect(c.getDoorPosition()).resolves.toBe(MaveoDoorPosition.Closed);
    expect(mqtt.publishDoorStatusRead).toHaveBeenCalledWith("stick99");
  });

  it("onStickState ignores non door/light keys", async () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "");
    vi.stubEnv("MAVEO_THING_NAME", "stick99");
    let msgHandler: ((topic: string, payload: Buffer) => void) | undefined;
    const mqtt = {
      onMessage: vi.fn((h: (topic: string, payload: Buffer) => void) => {
        msgHandler = h;
        return vi.fn();
      }),
    };
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    (c as unknown as { mqtt: typeof mqtt }).mqtt = mqtt;
    const fn = vi.fn();
    c.onStickState(fn);
    msgHandler?.("stick99/rsp", Buffer.from('{"StoA_v":"1.2.0"}'));
    expect(fn).not.toHaveBeenCalled();
    msgHandler?.("stick99/rsp", Buffer.from('{"StoA_s":1}'));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].doorPosition).toBe(MaveoDoorPosition.Opening);
  });

  it("reclaimMqttSessionWithRetries repeats recover until connected", async () => {
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    let recoverCalls = 0;
    vi.spyOn(c as unknown as { recoverMqttSessionCore: () => Promise<void> }, "recoverMqttSessionCore").mockImplementation(
      async () => {
        recoverCalls += 1;
        if (recoverCalls < 2) throw new Error("connect failed");
      },
    );
    vi.spyOn(c, "isMqttConnected").mockImplementation(() => recoverCalls >= 2);
    const r = await c.reclaimMqttSessionWithRetries({
      maxAttempts: 4,
      delayMsBetweenAttempts: 1,
    });
    expect(r.ok).toBe(true);
    expect(recoverCalls).toBe(2);
    expect(c.getMqttTransportState()).toBe("connected");
  });

  it("onMaveoLifecycle forwards stick_state and tears down when unsubscribed", () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "");
    vi.stubEnv("MAVEO_THING_NAME", "stick99");
    let msgHandler: ((topic: string, payload: Buffer) => void) | undefined;
    const mqtt = {
      onMessage: vi.fn((h: (topic: string, payload: Buffer) => void) => {
        msgHandler = h;
        return vi.fn();
      }),
      onConnectionLost: vi.fn(() => vi.fn()),
      onMqttSessionLost: vi.fn(() => vi.fn()),
    };
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    (c as unknown as { mqtt: typeof mqtt }).mqtt = mqtt;
    const life = vi.fn();
    const un = c.onMaveoLifecycle(life);
    msgHandler?.("stick99/rsp", Buffer.from('{"StoA_s":1}'));
    expect(life).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "stick_state",
        update: expect.objectContaining({ doorPosition: MaveoDoorPosition.Opening }),
      }),
    );
    un();
    life.mockClear();
    msgHandler?.("stick99/rsp", Buffer.from('{"StoA_s":1}'));
    expect(life).not.toHaveBeenCalled();
  });

  it("recoverMqttSession emits manual_recover_finished on success", async () => {
    vi.stubEnv("MAVEO_MQTT_CLIENT_ID", "");
    vi.stubEnv("MAVEO_THING_NAME", "stick99");
    const mqtt = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      onMessage: vi.fn(() => vi.fn()),
      onConnectionLost: vi.fn(() => vi.fn()),
      onMqttSessionLost: vi.fn(() => vi.fn()),
      subscribeBlueFiResponses: vi.fn().mockResolvedValue(undefined),
      isConnected: vi.fn(() => true),
      getMqttClientId: vi.fn(),
      getLastSessionLoss: vi.fn(),
    };
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    (c as unknown as { mqtt: typeof mqtt }).mqtt = mqtt;
    vi.spyOn(c as unknown as { requireSession: () => unknown }, "requireSession").mockReturnValue({});
    const life = vi.fn();
    c.onMaveoLifecycle(life);
    await c.recoverMqttSession({ resetSessionContention: false });
    expect(life).toHaveBeenCalledWith({ kind: "manual_recover_started" });
    expect(life).toHaveBeenCalledWith({ kind: "manual_recover_finished", ok: true });
  });

  it("reclaimMqttSessionWithRetries returns lastError when exhausted", async () => {
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    vi.spyOn(c as unknown as { recoverMqttSessionCore: () => Promise<void> }, "recoverMqttSessionCore").mockRejectedValue(
      new Error("always"),
    );
    vi.spyOn(c, "isMqttConnected").mockReturnValue(false);
    const r = await c.reclaimMqttSessionWithRetries({
      maxAttempts: 2,
      delayMsBetweenAttempts: 1,
    });
    expect(r.ok).toBe(false);
    expect((r.lastError as Error)?.message).toBe("always");
    expect(c.getMqttTransportState()).toBe("disconnected");
  });

  it("enableAutomaticMqttReclaim runs reclaim after burst backoff without a new session-lost event", async () => {
    vi.useFakeTimers();
    const lostEv: MqttSessionLostEvent = {
      intentionalDisconnect: false,
      suspectedRemoteSessionTakeover: true,
    };
    const sessionLostHandlers: Array<(e: MqttSessionLostEvent) => void> = [];
    const mqtt = {
      onMessage: vi.fn(() => vi.fn()),
      onConnectionLost: vi.fn(() => vi.fn()),
      onMqttSessionLost: vi.fn((h: (e: MqttSessionLostEvent) => void) => {
        sessionLostHandlers.push(h);
        return vi.fn();
      }),
    };
    const c = new MaveoConnectStickClient(minimalLibraryConfig);
    (c as unknown as { mqtt: typeof mqtt }).mqtt = mqtt;

    let connected = false;
    const reclaimSpy = vi.spyOn(c, "reclaimMqttSessionWithRetries").mockImplementation(async () => {
      connected = true;
      return { ok: true };
    });
    vi.spyOn(c, "isMqttConnected").mockImplementation(() => connected);

    c.enableAutomaticMqttReclaim({
      sessionContention: {
        burstThreshold: 1,
        burstWindowMs: 60_000,
        backoffAfterBurstMs: 10_000,
      },
      maxAttempts: 2,
      delayMsBetweenAttempts: 1,
    });

    for (const h of sessionLostHandlers) {
      h(lostEv);
    }
    expect(reclaimSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(reclaimSpy).toHaveBeenCalledTimes(1);
  });
});
