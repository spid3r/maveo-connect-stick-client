export {
  loadMaveoCredentialsFromEnv,
  loadMaveoLibraryConfigFromEnv,
  maveoCredentialsSchema,
} from "./config/env.js";
export type { MaveoCredentials, MaveoLibraryConfig } from "./config/env.js";

export type { MaveoAuthClient, MaveoSession } from "./auth/types.js";
export { MaveoAuthStub } from "./auth/maveoAuthStub.js";
export { maveoAuthConfigSchema } from "./auth/maveoAuthConfig.js";
export type { MaveoAuthConfig } from "./auth/maveoAuthConfig.js";
export { MaveoCognitoAuthClient } from "./auth/maveoCognitoAuthClient.js";
export { cognitoUserPoolLoginsKey } from "./auth/cognitoLogins.js";
export { decodeJwtPayload, userPoolIdFromIdToken } from "./auth/jwt.js";
export { isMaveoSessionCredentialsNearExpiry } from "./auth/sessionExpiry.js";

export type { MaveoIotClient, MqttQoS } from "./iot/types.js";
export { MaveoIotStub } from "./iot/maveoIotStub.js";
export { MaveoMqttIotClient } from "./iot/maveoMqttIotClient.js";
export type { MaveoMqttIotClientOptions, MqttSessionLostEvent } from "./iot/maveoMqttIotClient.js";
export { presignMqttWsUrl } from "./iot/presignMqttWsUrl.js";
export { buildMqttWssConnectParams } from "./iot/mqttWssConnect.js";
export type { BuildMqttWssConnectParamsOptions, MqttWssSigning } from "./iot/mqttWssConnect.js";
export {
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
} from "./iot/maveoBlueFiMqttProtocol.js";
export type { GarageDoorCommand } from "./iot/maveoBlueFiMqttProtocol.js";

export {
  MAVEO_STOA_L_R,
  MAVEO_STOA_S,
  MaveoDoorPosition,
  extractMaveoStickState,
  maveoDoorPositionLabel,
  parseMaveoDoorPosition,
  parseMaveoLightOn,
  rawBlueFiMessageHasDoorOrLightKeys,
} from "./iot/maveoBlueFiState.js";
export type { MaveoStickStateUpdate } from "./iot/maveoBlueFiState.js";

export { waitForBlueFiRspObject } from "./iot/waitForBlueFiRsp.js";
export type { MqttMessageSubscriber, WaitForBlueFiRspWatchOptions } from "./iot/waitForBlueFiRsp.js";

export { describeMaveoThing, listMaveoThings } from "./garage/maveoIotThings.js";
export type { ListMaveoThingsOptions, MaveoThingSummary } from "./garage/maveoIotThings.js";
export { parseMaveoEnvBoolean } from "./config/envBoolean.js";
export { resolveMaveoStickSerialFromEnv, tryResolveMaveoStickSerialFromEnv } from "./config/stickSerial.js";
export {
  loadBlueFiRspPollIntervalMsFromEnv,
  loadMqttReclaimRetryOptionsFromEnv,
  loadMqttSessionContentionFromEnv,
  mergeAutomaticMqttReclaimOptionsFromEnv,
} from "./config/mqttSessionEnv.js";

export {
  createMaveoConnectStickClientFromEnv,
  MaveoConnectStickClient,
} from "./client/maveoConnectStickClient.js";
export type {
  AutomaticMqttReclaimOptions,
  MaveoConnectStickClientOptions,
  MaveoConnectStickLifecycleEvent,
  MqttSessionContentionBackoffInfo,
  MqttSessionContentionPolicy,
  MqttTransportState,
  ReclaimMqttSessionOptions,
} from "./client/maveoConnectStickClient.js";
