/**
 * **Live integration tests** (real Cognito / AWS IoT / MQTT). Skipped unless `MAVEO_LIVE_TEST=1` etc.
 *
 * All other `tests/*.test.ts` files use **mocks** or pure logic — no network — unless you opt in here.
 */
import { describe, expect, it } from "vitest";
import { loadMaveoLibraryConfigFromEnv } from "../src/config/env.js";
import { MaveoCognitoAuthClient } from "../src/auth/maveoCognitoAuthClient.js";
import { listMaveoConnectSticks } from "../src/garage/maveoIotThings.js";
import { MaveoMqttIotClient } from "../src/iot/maveoMqttIotClient.js";

const poolOk = Boolean(process.env.MAVEO_COGNITO_IDENTITY_POOL_ID?.trim());
const authLive = process.env.MAVEO_LIVE_TEST === "1" && poolOk;
/** MQTT needs stick serial in env for iot:Connect (MAVEO_THING_NAME or MAVEO_MQTT_CLIENT_ID). */
const mqttLive =
  authLive &&
  process.env.MAVEO_RUN_LIVE_MQTT === "1" &&
  Boolean(process.env.MAVEO_THING_NAME?.trim() || process.env.MAVEO_MQTT_CLIENT_ID?.trim());

function authFromEnv() {
  const cfg = loadMaveoLibraryConfigFromEnv();
  return new MaveoCognitoAuthClient({
    authConfig: {
      cognitoIdentityPoolId: cfg.cognitoIdentityPoolId,
      cognitoClientId: cfg.cognitoClientId,
      region: cfg.region,
      iotHostname: cfg.iotHostname,
    },
  });
}

describe.runIf(authLive)("live: Cognito (requires .env)", () => {
  it(
    "logs in (InitiateAuth + GetCredentialsForIdentity)",
    async () => {
      const cfg = loadMaveoLibraryConfigFromEnv();
      const session = await authFromEnv().loginWithPassword(cfg.email, cfg.password);
      expect(session.accessKeyId).toMatch(/^[\w]+$/);
      expect(session.iotHostname).toBe(cfg.iotHostname);
    },
    25_000,
  );
});

describe.runIf(mqttLive)("live: MQTT over WSS (optional)", () => {
  it(
    "connects and disconnects (MQTT v5 + header SigV4 + stick serial as clientId)",
    async () => {
      const cfg = loadMaveoLibraryConfigFromEnv();
      const session = await authFromEnv().loginWithPassword(cfg.email, cfg.password);
      const iot = new MaveoMqttIotClient();
      await iot.connect(session);
      await iot.disconnect();
    },
    60_000,
  );
});

const garageLive = authLive && process.env.MAVEO_LIVE_GARAGE === "1";

describe.runIf(garageLive)("live: garage (iot:ListPrincipalThings)", () => {
  it(
    "lists at least one Connect Stick attached to this identity",
    async () => {
      const cfg = loadMaveoLibraryConfigFromEnv();
      const session = await authFromEnv().loginWithPassword(cfg.email, cfg.password);
      const sticks = await listMaveoConnectSticks(session);
      expect(sticks.length).toBeGreaterThan(0);
      for (const s of sticks) {
        expect(typeof s).toBe("string");
        expect(s.length).toBeGreaterThan(0);
      }
    },
    30_000,
  );
});
