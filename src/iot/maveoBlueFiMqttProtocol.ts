import type { MaveoIotClient, MqttQoS } from "./types.js";

/** JSON object key for garage motor commands (app → stick). */
export const MAVEO_ATOS_G = "AtoS_g";

/** JSON object key for light (app → stick). */
export const MAVEO_ATOS_L = "AtoS_l";

/** Read door position / movement — response key `StoA_s` on `…/rsp`. */
export const MAVEO_ATOS_S = "AtoS_s";

/** Read light state — response key `StoA_l_r` on `…/rsp`. */
export const MAVEO_ATOS_L_R = "AtoS_l_r";

/** QoS used by the app for `…/rsp` subscription (`BlueFiController::mqttConnected`). */
export const MAVEO_SUBSCRIBE_QOS: MqttQoS = 1;

/** QoS used for door/light commands in `openGarageDoor` / `closeGarageDoor` / etc. */
export const MAVEO_GARAGE_PUBLISH_QOS: MqttQoS = 0;

export type GarageDoorCommand = "stop" | "open" | "close" | "ventilate";

const GARAGE_VALUES: Record<GarageDoorCommand, 0 | 1 | 2 | 3> = {
  stop: 0,
  open: 1,
  close: 2,
  ventilate: 3,
};

function assertStickId(stickId: string): string {
  const id = stickId.trim();
  if (!id) throw new Error("stickId is required");
  return id;
}

/** Publish topic template `%1/cmd` from the native binary. */
export function maveoStickCmdTopic(stickId: string): string {
  return `${assertStickId(stickId)}/cmd`;
}

/** Subscribe topic template `%1/rsp` from the native binary. */
export function maveoStickRspTopic(stickId: string): string {
  return `${assertStickId(stickId)}/rsp`;
}

/** Numeric `AtoS_g` value (matches guest HTTP and `BlueFiController::*GarageDoor`). */
export function garageDoorCommandValue(command: GarageDoorCommand): 0 | 1 | 2 | 3 {
  return GARAGE_VALUES[command];
}

/** Single-key JSON for `AtoS_g` on `<stickId>/cmd`. */
export function buildGarageDoorCommandPayload(command: GarageDoorCommand): string {
  return JSON.stringify({ [MAVEO_ATOS_G]: garageDoorCommandValue(command) });
}

/**
 * Single-key JSON for `AtoS_l` on `<stickId>/cmd`.
 * Use **0 / 1** (not booleans): `maveo-stick-node` `LightCommand` and fielded devices expect numeric commands; `false`/`true` can be ignored.
 */
export function buildLightCommandPayload(on: boolean): string {
  return JSON.stringify({ [MAVEO_ATOS_L]: on ? 1 : 0 });
}

/** Request door status (`StoA_s` on `…/rsp`). Value `0` matches app / ha-maveo. */
export function buildDoorStatusReadPayload(): string {
  return JSON.stringify({ [MAVEO_ATOS_S]: 0 });
}

/** Request light readback (`StoA_l_r` on `…/rsp`). */
export function buildLightStateReadPayload(): string {
  return JSON.stringify({ [MAVEO_ATOS_L_R]: 0 });
}

/** Parse UTF-8 JSON object payloads from `…/rsp` (single top-level object). */
export function parseBlueFiJsonObject(payload: Buffer | Uint8Array | string): Record<string, unknown> {
  const s = typeof payload === "string" ? payload : Buffer.from(payload).toString("utf8");
  const v = JSON.parse(s) as unknown;
  if (v === null || typeof v !== "object" || Array.isArray(v)) {
    throw new Error("BlueFi JSON: expected a single object");
  }
  return v as Record<string, unknown>;
}

/** Subscribe to stick → app responses (`StoA_*` traffic) at QoS 1. */
export async function maveoBlueFiSubscribeRsp(client: MaveoIotClient, stickId: string): Promise<void> {
  await client.subscribe(maveoStickRspTopic(stickId), MAVEO_SUBSCRIBE_QOS);
}

/** Publish a garage command at QoS 0. */
export async function maveoBlueFiPublishGarageDoor(
  client: MaveoIotClient,
  stickId: string,
  command: GarageDoorCommand,
): Promise<void> {
  await client.publish(
    maveoStickCmdTopic(stickId),
    buildGarageDoorCommandPayload(command),
    MAVEO_GARAGE_PUBLISH_QOS,
  );
}

/** Publish light on/off at QoS 0. */
export async function maveoBlueFiPublishLight(
  client: MaveoIotClient,
  stickId: string,
  on: boolean,
): Promise<void> {
  await client.publish(maveoStickCmdTopic(stickId), buildLightCommandPayload(on), MAVEO_GARAGE_PUBLISH_QOS);
}

/** Publish door status read request at QoS 0. */
export async function maveoBlueFiPublishDoorStatusRead(client: MaveoIotClient, stickId: string): Promise<void> {
  await client.publish(maveoStickCmdTopic(stickId), buildDoorStatusReadPayload(), MAVEO_GARAGE_PUBLISH_QOS);
}

/** Publish light state read request at QoS 0. */
export async function maveoBlueFiPublishLightStateRead(client: MaveoIotClient, stickId: string): Promise<void> {
  await client.publish(maveoStickCmdTopic(stickId), buildLightStateReadPayload(), MAVEO_GARAGE_PUBLISH_QOS);
}
