import { z } from "zod";
import { maveoAuthConfigSchema, type MaveoAuthConfig } from "../auth/maveoAuthConfig.js";

/**
 * Schema for credentials loaded from process.env (e.g. via dotenv in a CLI or LoxBerry wrapper).
 */
export const maveoCredentialsSchema = z.object({
  email: z.string().min(1, "MAVEO_EMAIL is required"),
  password: z.string().min(1, "MAVEO_PASSWORD is required"),
});

export type MaveoCredentials = z.infer<typeof maveoCredentialsSchema>;

/**
 * Email/password plus auth config (everything required to log in and open MQTT).
 *
 * All Cognito / region / IoT hostname values must be supplied via env (no library defaults). Discover
 * them in the official mobile app's `awsconfiguration.json` / `amplifyconfiguration.json` (see
 * `docs/AUTH_FLOW.md`).
 */
export type MaveoLibraryConfig = MaveoCredentials & MaveoAuthConfig;

/**
 * Read Marantec/Maveo login credentials from environment variables.
 */
export function loadMaveoCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MaveoCredentials {
  return maveoCredentialsSchema.parse({
    email: env.MAVEO_EMAIL,
    password: env.MAVEO_PASSWORD,
  });
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const v = env[key]?.trim();
  if (!v) {
    throw new Error(
      `${key} is required (no library default; see docs/AUTH_FLOW.md to discover the value from your own awsconfiguration.json)`,
    );
  }
  return v;
}

/**
 * Credentials + Cognito Identity Pool id, region, IoT hostname.
 *
 * All `MAVEO_COGNITO_CLIENT_ID`, `MAVEO_COGNITO_IDENTITY_POOL_ID`, `MAVEO_REGION`, and
 * `MAVEO_IOT_HOSTNAME` are **required** — this library does not embed any vendor defaults.
 */
export function loadMaveoLibraryConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): MaveoLibraryConfig {
  const creds = loadMaveoCredentialsFromEnv(env);
  const auth = maveoAuthConfigSchema.parse({
    cognitoIdentityPoolId: requireEnv(env, "MAVEO_COGNITO_IDENTITY_POOL_ID"),
    cognitoClientId: requireEnv(env, "MAVEO_COGNITO_CLIENT_ID"),
    region: requireEnv(env, "MAVEO_REGION"),
    iotHostname: requireEnv(env, "MAVEO_IOT_HOSTNAME"),
  });
  return { ...creds, ...auth };
}
