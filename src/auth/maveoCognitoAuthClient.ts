import {
  CognitoIdentityClient,
  GetCredentialsForIdentityCommand,
  GetIdCommand,
} from "@aws-sdk/client-cognito-identity";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  type AuthenticationResultType,
  type InitiateAuthCommandOutput,
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoUserPoolLoginsKey } from "./cognitoLogins.js";
import type { MaveoAuthConfig } from "./maveoAuthConfig.js";
import type { MaveoAuthClient, MaveoSession } from "./types.js";
import { userPoolIdFromIdToken } from "./jwt.js";

export type MaveoCognitoAuthClientOptions = {
  authConfig: MaveoAuthConfig;
  /** Override for tests */
  identityProviderClient?: CognitoIdentityProviderClient;
  identityClient?: CognitoIdentityClient;
};

function assertAuthenticationResult(out: InitiateAuthCommandOutput): AuthenticationResultType {
  const ar = out.AuthenticationResult;
  const idToken = ar?.IdToken;
  if (!ar || !idToken) {
    const challenge = out.ChallengeName;
    throw new Error(
      challenge
        ? `Cognito returned challenge "${challenge}" (only USER_PASSWORD_AUTH without MFA is supported).`
        : "Cognito InitiateAuth succeeded but IdToken is missing.",
    );
  }
  return ar;
}

export class MaveoCognitoAuthClient implements MaveoAuthClient {
  private readonly authConfig: MaveoAuthConfig;
  private readonly idp: CognitoIdentityProviderClient;
  private readonly identity: CognitoIdentityClient;

  constructor(opts: MaveoCognitoAuthClientOptions) {
    this.authConfig = opts.authConfig;
    this.idp =
      opts.identityProviderClient ??
      new CognitoIdentityProviderClient({ region: this.authConfig.region });
    this.identity =
      opts.identityClient ?? new CognitoIdentityClient({ region: this.authConfig.region });
  }

  async loginWithPassword(email: string, password: string): Promise<MaveoSession> {
    const { region, cognitoClientId, cognitoIdentityPoolId, iotHostname } = this.authConfig;
    const username = email.trim();

    let initiateOut: InitiateAuthCommandOutput;
    try {
      initiateOut = await this.idp.send(
        new InitiateAuthCommand({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: cognitoClientId,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
          },
        }),
      );
    } catch (e: unknown) {
      const name = e && typeof e === "object" && "name" in e ? String((e as { name: string }).name) : "";
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e);
      throw new Error(`Cognito InitiateAuth failed${name ? ` (${name})` : ""}: ${msg}`);
    }

    const authResult = assertAuthenticationResult(initiateOut);
    const idToken = authResult.IdToken!;
    const userPoolId = userPoolIdFromIdToken(idToken);
    const loginsKey = cognitoUserPoolLoginsKey(region, userPoolId);
    const logins: Record<string, string> = { [loginsKey]: idToken };

    let identityId: string;
    try {
      const getIdOut = await this.identity.send(
        new GetIdCommand({
          IdentityPoolId: cognitoIdentityPoolId,
          Logins: logins,
        }),
      );
      identityId = getIdOut.IdentityId!;
      if (!identityId) {
        throw new Error("GetId returned empty IdentityId");
      }
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e);
      throw new Error(
        `Cognito GetId failed: ${msg}. Check MAVEO_COGNITO_IDENTITY_POOL_ID and that the pool trusts this user pool.`,
      );
    }

    let accessKeyId: string;
    let secretAccessKey: string;
    let sessionToken: string;
    let credentialsExpireAt: number | undefined;
    try {
      const credsOut = await this.identity.send(
        new GetCredentialsForIdentityCommand({
          IdentityId: identityId,
          Logins: logins,
        }),
      );
      const c = credsOut.Credentials;
      if (!c?.AccessKeyId || !c.SecretKey || !c.SessionToken) {
        throw new Error("GetCredentialsForIdentity returned incomplete Credentials");
      }
      accessKeyId = c.AccessKeyId;
      secretAccessKey = c.SecretKey;
      sessionToken = c.SessionToken;
      if (c.Expiration) {
        credentialsExpireAt = c.Expiration.getTime();
      }
    } catch (e: unknown) {
      const msg = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e);
      throw new Error(`Cognito GetCredentialsForIdentity failed: ${msg}`);
    }

    return {
      region,
      iotHostname,
      identityId,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      credentialsExpireAt,
      idToken,
    };
  }
}
