import type { MaveoSession } from "../auth/types.js";
import { buildMqttWssConnectParams } from "./mqttWssConnect.js";

/**
 * Presigned WSS URL for MQTT over WebSocket (`iotdevicegateway`, SigV4 in query string).
 * Prefer `buildMqttWssConnectParams` with default **headers** signing to match the Maveo app.
 */
export async function presignMqttWsUrl(
  session: MaveoSession,
  options?: { expiresInSeconds?: number },
): Promise<string> {
  const { url } = await buildMqttWssConnectParams(session, {
    signing: "query",
    expiresInSeconds: options?.expiresInSeconds,
  });
  return url;
}
