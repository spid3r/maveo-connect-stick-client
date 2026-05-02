import { Buffer } from "node:buffer";
import mqtt, { type IPublishPacket } from "mqtt";
import type { MaveoSession } from "../auth/types.js";
import {
  maveoBlueFiPublishDoorStatusRead,
  maveoBlueFiPublishGarageDoor,
  maveoBlueFiPublishLight,
  maveoBlueFiPublishLightStateRead,
  maveoBlueFiSubscribeRsp,
} from "./maveoBlueFiMqttProtocol.js";
import type { GarageDoorCommand } from "./maveoBlueFiMqttProtocol.js";
import { buildMqttWssConnectParams } from "./mqttWssConnect.js";
import type { MaveoIotClient, MqttQoS } from "./types.js";

/** Fired once per disconnect wave (`close` / `offline` deduped). */
export type MqttSessionLostEvent = {
  /** True when {@link MaveoMqttIotClient.disconnect} closed the socket; false when the broker or network dropped the session. */
  intentionalDisconnect: boolean;
  /**
   * Same as `!intentionalDisconnect` for IoT: another MQTT client (e.g. Maveo app “reconnect”) often uses the same `clientId` and the broker disconnects this one.
   */
  suspectedRemoteSessionTakeover: boolean;
};

export type MaveoMqttIotClientOptions = {
  /**
   * Marantec broker answers MQTT v4 CONNECT by closing the WebSocket; the app stack uses **MQTT 5**.
   * @default 5
   */
  mqttProtocolVersion?: 4 | 5;
  /**
   * MQTT `clientId`. Resolution order (see `resolveMqttClientId`): `MAVEO_MQTT_CLIENT_ID` → `MAVEO_THING_NAME` → Cognito **identity id**.
   * Marantec’s `iot:Connect` policy expects the **Connect Stick serial** (same as app / thing name), not the identity id.
   */
  mqttClientId?: string | ((session: MaveoSession) => string);
};

export class MaveoMqttIotClient implements MaveoIotClient {
  private client: mqtt.MqttClient | undefined;
  /** True while {@link disconnect} is closing the socket (so {@link MqttSessionLostEvent} can distinguish local vs remote). */
  private intentionalCloseInProgress = false;
  private lossWaveEmitted = false;
  private readonly basicLossHandlers: Array<() => void> = [];
  private readonly detailedLossHandlers: Array<(e: MqttSessionLostEvent) => void> = [];
  private lastSessionLoss: { event: MqttSessionLostEvent; atMs: number } | undefined;

  constructor(private readonly opts?: MaveoMqttIotClientOptions) {}

  private resolveMqttClientId(session: MaveoSession): string {
    const mqttId = process.env.MAVEO_MQTT_CLIENT_ID?.trim();
    if (mqttId) return mqttId;
    const thingName = process.env.MAVEO_THING_NAME?.trim();
    if (thingName) return thingName;
    const o = this.opts?.mqttClientId;
    if (typeof o === "function") return o(session);
    if (typeof o === "string" && o.trim()) return o.trim();
    return session.identityId;
  }

  async connect(session: MaveoSession): Promise<void> {
    await this.disconnect();
    const handshakeMs = 20_000;
    const overallMs = Math.max(45_000, handshakeMs + 15_000);
    const { url, wsOptions } = await buildMqttWssConnectParams(session, {
      handshakeTimeoutMs: handshakeMs,
    });
    const protocolVersion = this.opts?.mqttProtocolVersion ?? 5;
    const clientId = this.resolveMqttClientId(session);
    this.client = mqtt.connect(url, {
      protocolVersion,
      clientId,
      keepalive: 60,
      reconnectPeriod: 0,
      connectTimeout: 30_000,
      wsOptions: {
        ...wsOptions,
        handshakeTimeout: handshakeMs,
      },
    });
    await new Promise<void>((resolve, reject) => {
      const c = this.client!;
      const done = (fn: () => void) => {
        clearTimeout(overallTimer);
        c.off("connect", onOk);
        c.off("error", onErr);
        c.off("close", onClose);
        fn();
      };
      const onErr = (err: Error) => {
        done(() => reject(err));
      };
      const onOk = () => {
        done(() => {
          this.attachPersistentConnectionLoss(c);
          resolve();
        });
      };
      const onClose = () => {
        done(() =>
          reject(
            new Error(
              "MQTT WebSocket closed before CONNACK (wrong MQTT protocol version, network, or WSS auth). " +
                "Use MQTT v5 + header SigV4 (default). If you saw “Not authorized”, the Cognito role may deny iot:Connect for this clientId.",
            ),
          ),
        );
      };
      const overallTimer = setTimeout(() => {
        try {
          c.end(true);
        } catch {
          /* ignore */
        }
        done(() => reject(new Error(`MQTT connect timed out after ${overallMs}ms`)));
      }, overallMs);
      c.once("error", onErr);
      c.once("connect", onOk);
      c.once("close", onClose);
    });
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    this.intentionalCloseInProgress = true;
    const c = this.client;
    this.client = undefined;
    await new Promise<void>((resolve) => {
      c.end(false, {}, () => {
        this.intentionalCloseInProgress = false;
        resolve();
      });
    });
  }

  private attachPersistentConnectionLoss(c: mqtt.MqttClient): void {
    this.lossWaveEmitted = false;
    const notify = () => {
      if (this.lossWaveEmitted) return;
      this.lossWaveEmitted = true;
      const intentional = this.intentionalCloseInProgress;
      const event: MqttSessionLostEvent = {
        intentionalDisconnect: intentional,
        suspectedRemoteSessionTakeover: !intentional,
      };
      this.lastSessionLoss = { event, atMs: Date.now() };
      for (const h of this.basicLossHandlers) {
        try {
          if (!intentional) h();
        } catch {
          /* ignore */
        }
      }
      for (const h of this.detailedLossHandlers) {
        try {
          h(event);
        } catch {
          /* ignore */
        }
      }
    };
    c.on("close", notify);
    c.on("offline", notify);
  }

  /** Last deduped session-loss event (remote takeover vs local disconnect). */
  getLastSessionLoss(): { event: MqttSessionLostEvent; atMs: number } | undefined {
    return this.lastSessionLoss;
  }

  /** True when the underlying `mqtt` client is connected (after CONNACK). */
  isConnected(): boolean {
    return Boolean(this.client?.connected);
  }

  /** MQTT `clientId` in use while connected (normally the Connect Stick serial). */
  getMqttClientId(): string | undefined {
    const id = this.client?.options?.clientId;
    return typeof id === "string" && id.length > 0 ? id : undefined;
  }

  /**
   * Subscribe to **unexpected** broker/session loss (`close` / `offline`, **deduped**).
   * Not invoked for {@link disconnect} (local shutdown) — use {@link onMqttSessionLost} to observe those too.
   * Safe to register before {@link connect}.
   */
  onConnectionLost(handler: () => void): () => void {
    this.basicLossHandlers.push(handler);
    return () => {
      const i = this.basicLossHandlers.indexOf(handler);
      if (i >= 0) this.basicLossHandlers.splice(i, 1);
    };
  }

  /**
   * Like {@link onConnectionLost} but includes {@link MqttSessionLostEvent} so you can tell **local** `disconnect()` from a **remote** kick (same `clientId` as the app).
   */
  onMqttSessionLost(handler: (event: MqttSessionLostEvent) => void): () => void {
    this.detailedLossHandlers.push(handler);
    return () => {
      const i = this.detailedLossHandlers.indexOf(handler);
      if (i >= 0) this.detailedLossHandlers.splice(i, 1);
    };
  }

  /**
   * Subscribe to low-level socket/broker events (`connect`, `close`, `offline`, `error`).
   * Call again after {@link connect} / {@link disconnect} — listeners are bound to the current `mqtt` client instance.
   */
  attachDebugLifecycleLog(log: (line: string) => void): () => void {
    if (!this.client) {
      throw new Error("MaveoMqttIotClient: not connected");
    }
    const c = this.client;
    const unsubs: Array<() => void> = [];
    const sub = (ev: "close" | "offline" | "error" | "connect", fn: (...args: unknown[]) => void) => {
      const wrapped = (...args: unknown[]) => fn(...args);
      c.on(ev, wrapped as never);
      unsubs.push(() => c.off(ev, wrapped as never));
    };
    sub("connect", () => {
      const id = typeof c.options?.clientId === "string" ? c.options.clientId : "?";
      log(`connect/connack connected=${c.connected} clientId=${id}`);
    });
    sub("close", () => log(`close connected=${c.connected}`));
    sub("offline", () => log(`offline connected=${c.connected}`));
    sub("error", (err) => {
      const e = err as Error | undefined;
      log(`error ${e?.message ?? String(err)}`);
    });
    return () => {
      for (const u of unsubs) u();
    };
  }

  /**
   * Fires when the MQTT client emits `close` (network drop, broker kick, or after {@link disconnect}).
   * **SigV4 WSS auth is fixed at connect time** — automatic mqtt.js `reconnectPeriod` would reuse stale headers and fail;
   * on disconnect, refresh Cognito credentials then {@link connect} again (see README / `maveo-stick-node` pattern).
   */
  onDisconnect(handler: () => void): () => void {
    if (!this.client) throw new Error("MaveoMqttIotClient: not connected");
    const c = this.client;
    const fn = () => handler();
    c.on("close", fn);
    return () => {
      c.off("close", fn);
    };
  }

  /**
   * Subscribe to incoming MQTT publishes (e.g. `…/rsp` after `subscribeBlueFiResponses`).
   * Returns an unsubscribe function. Must be called after `connect`.
   */
  onMessage(
    handler: (topic: string, payload: Buffer, packet: IPublishPacket) => void,
  ): () => void {
    if (!this.client) throw new Error("MaveoMqttIotClient: not connected");
    const c = this.client;
    const listener = (topic: string, payload: Buffer, packet: IPublishPacket) => {
      handler(topic, payload, packet);
    };
    c.on("message", listener);
    return () => {
      c.off("message", listener);
    };
  }

  async subscribe(topic: string, qos: MqttQoS): Promise<void> {
    if (!this.client) throw new Error("MaveoMqttIotClient: not connected");
    await new Promise<void>((resolve, reject) => {
      this.client!.subscribe(topic, { qos }, (err) => (err ? reject(err) : resolve()));
    });
  }

  async publish(topic: string, payload: Uint8Array | string, qos: MqttQoS): Promise<void> {
    if (!this.client) throw new Error("MaveoMqttIotClient: not connected");
    const body = typeof payload === "string" ? payload : Buffer.from(payload);
    await new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, body, { qos }, (err) => (err ? reject(err) : resolve()));
    });
  }

  /** Subscribe to `<stickId>/rsp` (QoS 1), same as the official app after MQTT connect. */
  async subscribeBlueFiResponses(stickId: string): Promise<void> {
    await maveoBlueFiSubscribeRsp(this, stickId);
  }

  /** Publish `{"AtoS_g":n}` to `<stickId>/cmd` (QoS 0). */
  async publishGarageDoorCommand(stickId: string, command: GarageDoorCommand): Promise<void> {
    await maveoBlueFiPublishGarageDoor(this, stickId, command);
  }

  /** Publish `{"AtoS_l":1|0}` to `<stickId>/cmd` (QoS 0). */
  async publishLightCommand(stickId: string, on: boolean): Promise<void> {
    await maveoBlueFiPublishLight(this, stickId, on);
  }

  /** Publish `{"AtoS_s":0}` — expect `StoA_s` on `…/rsp`. */
  async publishDoorStatusRead(stickId: string): Promise<void> {
    await maveoBlueFiPublishDoorStatusRead(this, stickId);
  }

  /** Publish `{"AtoS_l_r":0}` — expect `StoA_l_r` on `…/rsp`. */
  async publishLightStateRead(stickId: string): Promise<void> {
    await maveoBlueFiPublishLightStateRead(this, stickId);
  }
}
