import type { MaveoSession } from "./types.js";

/**
 * True when Cognito temporary credentials are missing or expire within `marginMs`.
 * Use this to decide when to call {@link MaveoCognitoAuthClient.loginWithPassword} again before reconnecting MQTT:
 * WSS SigV4 headers are derived from these credentials and go stale after expiry (similar to `maveo-stick-node` refreshing before reconnect).
 */
export function isMaveoSessionCredentialsNearExpiry(session: MaveoSession, marginMs = 120_000): boolean {
  const t = session.credentialsExpireAt;
  if (t == null) return false;
  return Date.now() + marginMs >= t;
}
