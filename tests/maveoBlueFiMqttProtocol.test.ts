import { describe, expect, it, vi } from "vitest";
import type { MaveoIotClient } from "../src/iot/types.js";
import {
  MAVEO_ATOS_G,
  MAVEO_ATOS_L,
  MAVEO_ATOS_L_R,
  MAVEO_ATOS_S,
  MAVEO_GARAGE_PUBLISH_QOS,
  MAVEO_SUBSCRIBE_QOS,
  buildDoorStatusReadPayload,
  buildGarageDoorCommandPayload,
  buildLightCommandPayload,
  buildLightStateReadPayload,
  garageDoorCommandValue,
  maveoBlueFiPublishDoorStatusRead,
  maveoBlueFiPublishGarageDoor,
  maveoBlueFiPublishLight,
  maveoBlueFiPublishLightStateRead,
  maveoBlueFiSubscribeRsp,
  maveoStickCmdTopic,
  maveoStickRspTopic,
  parseBlueFiJsonObject,
} from "../src/iot/maveoBlueFiMqttProtocol.js";

describe("maveoBlueFiMqttProtocol", () => {
  it("builds cmd/rsp topics with trimmed stick id", () => {
    expect(maveoStickCmdTopic(" ABC123 ")).toBe("ABC123/cmd");
    expect(maveoStickRspTopic("ABC123")).toBe("ABC123/rsp");
  });

  it("rejects empty stick id", () => {
    expect(() => maveoStickCmdTopic("")).toThrow(/stickId/);
    expect(() => maveoStickRspTopic("  ")).toThrow(/stickId/);
  });

  it("maps garage commands to AtoS_g values", () => {
    expect(garageDoorCommandValue("stop")).toBe(0);
    expect(garageDoorCommandValue("open")).toBe(1);
    expect(garageDoorCommandValue("close")).toBe(2);
    expect(garageDoorCommandValue("ventilate")).toBe(3);
  });

  it("serializes payloads as single-key JSON", () => {
    expect(buildGarageDoorCommandPayload("open")).toBe(`{"${MAVEO_ATOS_G}":1}`);
    expect(buildLightCommandPayload(true)).toBe(`{"${MAVEO_ATOS_L}":1}`);
    expect(buildLightCommandPayload(false)).toBe(`{"${MAVEO_ATOS_L}":0}`);
    expect(buildDoorStatusReadPayload()).toBe(`{"${MAVEO_ATOS_S}":0}`);
    expect(buildLightStateReadPayload()).toBe(`{"${MAVEO_ATOS_L_R}":0}`);
  });

  it("parseBlueFiJsonObject accepts buffer and string", () => {
    expect(parseBlueFiJsonObject('{"StoA_g_r":1}')).toEqual({ StoA_g_r: 1 });
    expect(parseBlueFiJsonObject(Buffer.from('{"a":true}', "utf8"))).toEqual({ a: true });
    expect(() => parseBlueFiJsonObject("[1]")).toThrow(/object/);
  });

  it("delegates subscribe/publish with expected QoS and topics", async () => {
    const calls: { method: string; args: unknown[] }[] = [];
    const client: MaveoIotClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      subscribe: vi.fn(async (topic, qos) => {
        calls.push({ method: "subscribe", args: [topic, qos] });
      }),
      publish: vi.fn(async (topic, payload, qos) => {
        calls.push({ method: "publish", args: [topic, payload, qos] });
      }),
    };

    await maveoBlueFiSubscribeRsp(client, "stick1");
    await maveoBlueFiPublishGarageDoor(client, "stick1", "close");
    await maveoBlueFiPublishLight(client, "stick1", true);
    await maveoBlueFiPublishDoorStatusRead(client, "stick1");
    await maveoBlueFiPublishLightStateRead(client, "stick1");

    expect(calls[0]).toEqual({
      method: "subscribe",
      args: ["stick1/rsp", MAVEO_SUBSCRIBE_QOS],
    });
    expect(calls[1]).toEqual({
      method: "publish",
      args: ["stick1/cmd", buildGarageDoorCommandPayload("close"), MAVEO_GARAGE_PUBLISH_QOS],
    });
    expect(calls[2]).toEqual({
      method: "publish",
      args: ["stick1/cmd", buildLightCommandPayload(true), MAVEO_GARAGE_PUBLISH_QOS],
    });
    expect(calls[3]).toEqual({
      method: "publish",
      args: ["stick1/cmd", buildDoorStatusReadPayload(), MAVEO_GARAGE_PUBLISH_QOS],
    });
    expect(calls[4]).toEqual({
      method: "publish",
      args: ["stick1/cmd", buildLightStateReadPayload(), MAVEO_GARAGE_PUBLISH_QOS],
    });
  });
});
