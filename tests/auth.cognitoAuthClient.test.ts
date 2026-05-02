import {
  GetCredentialsForIdentityCommand,
  GetIdCommand,
  type CognitoIdentityClient,
} from "@aws-sdk/client-cognito-identity";
import {
  InitiateAuthCommand,
  type CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { describe, expect, it, vi } from "vitest";
import { MaveoCognitoAuthClient } from "../src/auth/maveoCognitoAuthClient.js";

function makeIdToken(userPoolId: string, region: string): string {
  const iss = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ iss })}.sig`;
}

describe("MaveoCognitoAuthClient", () => {
  it("chains InitiateAuth → GetId → GetCredentialsForIdentity", async () => {
    const idToken = makeIdToken("us-west-2_pool", "us-west-2");

    const idpSend = vi.fn(async (cmd: unknown) => {
      expect(cmd).toBeInstanceOf(InitiateAuthCommand);
      return {
        AuthenticationResult: {
          IdToken: idToken,
          AccessToken: "at",
          RefreshToken: "rt",
        },
      };
    });

    const identitySend = vi.fn(async (cmd: unknown) => {
      if (cmd instanceof GetIdCommand) {
        expect(cmd.input.IdentityPoolId).toBe("pool-west-2:111");
        expect(cmd.input.Logins).toEqual({
          "cognito-idp.us-west-2.amazonaws.com/us-west-2_pool": idToken,
        });
        return { IdentityId: "us-west-2:identity-1" };
      }
      if (cmd instanceof GetCredentialsForIdentityCommand) {
        expect(cmd.input.IdentityId).toBe("us-west-2:identity-1");
        return {
          Credentials: {
            AccessKeyId: "AKIATEST",
            SecretKey: "secret",
            SessionToken: "st",
            Expiration: new Date("2030-01-01T00:00:00.000Z"),
          },
        };
      }
      throw new Error(`unexpected command ${cmd?.constructor?.name}`);
    });

    const auth = new MaveoCognitoAuthClient({
      authConfig: {
        region: "us-west-2",
        cognitoIdentityPoolId: "pool-west-2:111",
        cognitoClientId: "client",
        iotHostname: "iot.example.test",
      },
      identityProviderClient: { send: idpSend } as unknown as CognitoIdentityProviderClient,
      identityClient: { send: identitySend } as unknown as CognitoIdentityClient,
    });

    const session = await auth.loginWithPassword("a@b.c", "pw");

    expect(idpSend).toHaveBeenCalledTimes(1);
    expect(identitySend).toHaveBeenCalledTimes(2);
    expect(session).toMatchObject({
      region: "us-west-2",
      iotHostname: "iot.example.test",
      identityId: "us-west-2:identity-1",
      accessKeyId: "AKIATEST",
      secretAccessKey: "secret",
      sessionToken: "st",
      idToken,
    });
    expect(session.credentialsExpireAt).toBe(new Date("2030-01-01T00:00:00.000Z").getTime());
  });
});
