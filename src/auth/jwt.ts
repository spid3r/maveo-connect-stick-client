/**
 * Decode JWT payload (no signature verification — used only to read `iss` from Cognito IdToken).
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid JWT: expected at least header and payload segments");
  }
  const payloadB64 = parts[1];
  const json = Buffer.from(payloadB64, "base64url").toString("utf8");
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Cognito IdToken `iss` is `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`.
 */
export function userPoolIdFromIdToken(idToken: string): string {
  const payload = decodeJwtPayload(idToken);
  const iss = payload.iss;
  if (typeof iss !== "string" || !iss.includes("/")) {
    throw new Error('Invalid IdToken: missing or malformed "iss" claim');
  }
  return iss.split("/").pop()!;
}
