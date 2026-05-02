import { parseBlueFiJsonObject } from "./maveoBlueFiMqttProtocol.js";

/** Minimal surface for registering `message` handlers (e.g. {@link MaveoMqttIotClient}). */
export type MqttMessageSubscriber = {
  onMessage(handler: (topic: string, payload: Buffer) => void): () => void;
};

/** Poll while waiting — aborts if the MQTT socket drops (e.g. another client took the same `clientId`). */
export type WaitForBlueFiRspWatchOptions = {
  isConnected: () => boolean;
  intervalMs?: number;
};

/**
 * Wait until the next `…/rsp` message parses as JSON and satisfies `predicate`, or `timeoutMs`.
 * Register the listener **before** publishing the matching read command to avoid races.
 */
export async function waitForBlueFiRspObject(
  mqtt: MqttMessageSubscriber,
  rspTopic: string,
  predicate: (obj: Record<string, unknown>) => boolean,
  timeoutMs: number,
  watch?: WaitForBlueFiRspWatchOptions,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    const cleanup = () => {
      clearTimeout(timer);
      if (pollTimer !== undefined) clearInterval(pollTimer);
      unsub?.();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`BlueFi: timed out after ${timeoutMs}ms waiting for rsp on ${rspTopic}`));
    }, timeoutMs);
    if (watch?.isConnected) {
      const every = watch.intervalMs ?? 400;
      pollTimer = setInterval(() => {
        try {
          if (!watch.isConnected()) {
            cleanup();
            reject(
              new Error(
                `BlueFi: MQTT disconnected while waiting for rsp on ${rspTopic} (no rsp will arrive until reconnected)`,
              ),
            );
          }
        } catch {
          /* ignore */
        }
      }, every);
    }
    unsub = mqtt.onMessage((topic, payload) => {
      if (topic !== rspTopic) return;
      try {
        const o = parseBlueFiJsonObject(payload);
        if (!predicate(o)) return;
        cleanup();
        resolve(o);
      } catch {
        /* ignore non-object JSON */
      }
    });
  });
}
