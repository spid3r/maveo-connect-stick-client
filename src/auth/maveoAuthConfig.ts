import { z } from "zod";

/**
 * Strictly env/config-driven auth settings.
 *
 * All four fields must be supplied by the caller (typically from environment variables loaded
 * from `.env` or the host application's secrets store). This library deliberately does **not**
 * embed vendor-specific identifiers (Cognito client / identity-pool ids, region, IoT hostnames)
 * so that:
 *
 * 1. The published npm package never redistributes third-party configuration.
 * 2. Rotation by the upstream vendor does not silently break installed copies.
 *
 * Discover your own values from the official mobile app's `awsconfiguration.json` /
 * `amplifyconfiguration.json` (see `docs/AUTH_FLOW.md`).
 */
export const maveoAuthConfigSchema = z.object({
  cognitoIdentityPoolId: z.string().min(1, "MAVEO_COGNITO_IDENTITY_POOL_ID is required"),
  cognitoClientId: z.string().min(1, "MAVEO_COGNITO_CLIENT_ID is required"),
  /** AWS region for Cognito + IoT (must match your `cognitoClientId` / `cognitoIdentityPoolId`). */
  region: z.string().min(1, "MAVEO_REGION is required"),
  /** Fully-qualified IoT broker hostname for SigV4 WSS connect (no path, no scheme, no port). */
  iotHostname: z.string().min(1, "MAVEO_IOT_HOSTNAME is required"),
});

export type MaveoAuthConfig = z.infer<typeof maveoAuthConfigSchema>;
