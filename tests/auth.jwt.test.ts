import { describe, expect, it } from "vitest";
import { decodeJwtPayload, userPoolIdFromIdToken } from "../src/auth/jwt.js";

function makeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return `${b64({ alg: "none" })}.${b64(payload)}.x`;
}

describe("jwt helpers", () => {
  it("decodes payload", () => {
    const jwt = makeJwt({ sub: "u1", iss: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_AbC" });
    expect(decodeJwtPayload(jwt)).toMatchObject({
      sub: "u1",
      iss: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_AbC",
    });
  });

  it("extracts user pool id from IdToken iss", () => {
    const jwt = makeJwt({ iss: "https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_xyz" });
    expect(userPoolIdFromIdToken(jwt)).toBe("eu-central-1_xyz");
  });
});
