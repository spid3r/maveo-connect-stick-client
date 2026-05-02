/**
 * MQTT-over-WebSocket client boundary (AWS IoT compatible signing + `/mqtt` path per app binary).
 */
export type MqttQoS = 0 | 1 | 2;

export interface MaveoIotClient {
  connect(session: import("../auth/types.js").MaveoSession): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(topic: string, qos: MqttQoS): Promise<void>;
  publish(topic: string, payload: Uint8Array | string, qos: MqttQoS): Promise<void>;
}
