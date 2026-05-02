import type { MaveoSession } from "../auth/types.js";
import type { MaveoIotClient, MqttQoS } from "./types.js";

/**
 * Placeholder until WSS + MQTT stack is implemented.
 */
export class MaveoIotStub implements MaveoIotClient {
  async connect(_session: MaveoSession): Promise<void> {
    throw new Error("MaveoIotStub: implement connect (SigV4 WSS + MQTT CONNECT).");
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  async subscribe(_topic: string, _qos: MqttQoS): Promise<void> {
    throw new Error("MaveoIotStub: implement subscribe.");
  }

  async publish(_topic: string, _payload: Uint8Array | string, _qos: MqttQoS): Promise<void> {
    throw new Error("MaveoIotStub: implement publish.");
  }
}
