import { describe, expect, it } from "vitest";
import { MaveoMqttIotClient } from "../src/iot/maveoMqttIotClient.js";

describe("MaveoMqttIotClient", () => {
  it("onMessage throws when not connected", () => {
    const iot = new MaveoMqttIotClient();
    expect(() => iot.onMessage(() => {})).toThrow(/not connected/);
  });

  it("onDisconnect throws when not connected", () => {
    const iot = new MaveoMqttIotClient();
    expect(() => iot.onDisconnect(() => {})).toThrow(/not connected/);
  });

  it("isConnected is false before connect", () => {
    expect(new MaveoMqttIotClient().isConnected()).toBe(false);
  });

  it("onConnectionLost can register before connect; returns unsubscribe", () => {
    const iot = new MaveoMqttIotClient();
    const un = iot.onConnectionLost(() => {});
    expect(typeof un).toBe("function");
    un();
  });
});
