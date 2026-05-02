# Auth flow (vendor-agnostic configuration)

> **Important:** This repository **does not redistribute vendor-specific identifiers**
> (Cognito user pool / app client ids, identity pool ids, IoT broker hostnames, regions).
> All of those values must be supplied via environment variables and are looked up by **you**
> in the official mobile app's bundled AWS configuration. See
> [Discovering your stack values](#discovering-your-stack-values) below.

## Ordered chain (logged-in app path)

1. **Cognito User Pools** — `POST https://cognito-idp.<region>.amazonaws.com/?Action=InitiateAuth&Version=2016-04-18` with `X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth`, body `AuthFlow: USER_PASSWORD_AUTH`, `ClientId: <MAVEO_COGNITO_CLIENT_ID>`, `USERNAME` / `PASSWORD`.
2. **Cognito Identity** — `GetId` + `GetCredentialsForIdentity` with **logins** key `cognito-idp.<region>.amazonaws.com/<userPoolId>` and value = **Cognito IdToken** (`userPoolId` is taken from the IdToken `iss` claim; **no separate env var** for user pool id).
3. **MQTT over WebSocket** — HTTP upgrade uses **SigV4 in `Authorization` + `x-amz-*` headers**, AWS SigV4 service name **`iotdata`** (not `iotdevicegateway`), `Host: <MAVEO_IOT_HOSTNAME>:443`, URL `wss://<MAVEO_IOT_HOSTNAME>:443/mqtt`. The broker expects **MQTT v5** CONNECT; v4 causes the server to drop the socket without CONNACK. Optional legacy mode: presigned query string + `iotdevicegateway` (`MAVEO_MQTT_WSS_SIGNING=query`).

## SDK mapping (as implemented)

| Step | Package |
|------|---------|
| InitiateAuth | `@aws-sdk/client-cognito-identity-provider` |
| GetId / GetCredentialsForIdentity | `@aws-sdk/client-cognito-identity` |
| Presigned WSS + MQTT | `@smithy/signature-v4` + `mqtt` |
| BlueFi topics + payloads | `maveoBlueFiMqttProtocol` + `MaveoMqttIotClient.subscribeBlueFiResponses` / `publishGarageDoorCommand` |

## Required environment variables

All four are mandatory — there are **no library defaults**:

| Variable | Description |
|----------|-------------|
| `MAVEO_COGNITO_CLIENT_ID` | Cognito User Pool **app client id** for the stack your account belongs to. |
| `MAVEO_COGNITO_IDENTITY_POOL_ID` | Cognito **Identity Pool id** (Amplify `PoolId` shape: `<region>:<uuid>`). |
| `MAVEO_REGION` | AWS region matching the two ids above (e.g. an `awsRegion` in the bundled config). |
| `MAVEO_IOT_HOSTNAME` | Fully-qualified IoT broker hostname (no scheme, no path). |

Plus credentials:

| Variable | Description |
|----------|-------------|
| `MAVEO_EMAIL` / `MAVEO_PASSWORD` | Your own account credentials. |
| `MAVEO_THING_NAME` (or `MAVEO_MQTT_CLIENT_ID`) | Your Connect Stick serial (visible in the official app). |

## Discovering your stack values

The official mobile app ships a JSON configuration file (Amplify-style
`awsconfiguration.json` / `amplifyconfiguration.json`) that lists every required identifier
for the stack your account uses. On Android this lives inside the APK; on iOS it lives
inside the IPA.

Standard, legitimate ways to obtain it from your **own** installed copy include:

1. Pulling the APK from your own device (e.g. with `adb backup` / `adb pull`) and inspecting it
   with [Apktool](https://apktool.org/) so you can read `assets/awsconfiguration.json`.
2. Inspecting the iOS `.ipa` similarly.

Inside that file, map:

- `CognitoUserPool.Default.AppClientId` → `MAVEO_COGNITO_CLIENT_ID`
- `CognitoUserPool.Default.Region` (or `CredentialsProvider.CognitoIdentity.Default.Region`) → `MAVEO_REGION`
- `CredentialsProvider.CognitoIdentity.Default.PoolId` → `MAVEO_COGNITO_IDENTITY_POOL_ID`
- IoT endpoint configured for the app → `MAVEO_IOT_HOSTNAME` (a fully-qualified host).

If you maintain notes on multiple stacks (e.g. prod / test, region A / region B), keep them
in a local `cognito-stacks.local.json` next to this repo (gitignored) and use
`npm run cli -- cognito` to probe which one accepts your password.

## Troubleshooting

- **`UserNotFoundException`** on `InitiateAuth` → wrong stack: re-verify `MAVEO_COGNITO_CLIENT_ID` + `MAVEO_REGION` against the JSON above.
- **`NotAuthorizedException`** with the right username → password mismatch; reset in the app.
- **`GetId` returns `NotAuthorizedException`** → identity pool does not trust this user pool. Re-verify `MAVEO_COGNITO_IDENTITY_POOL_ID` is from the same stack as the user pool.
- **`MQTT WebSocket closed before CONNACK`** → either MQTT v4 was used (this library defaults to v5), or the IAM role bound to the Cognito identity does not allow `iot:Connect` for your `clientId`.

## Env: `MAVEO_USE_TEST_ENDPOINTS`

> Removed. The library no longer derives the IoT hostname from a region + tier template;
> supply the full hostname via `MAVEO_IOT_HOSTNAME` instead.

## Garage / stick without MQTT

To discover **only the user's own** Connect Sticks, call **`iot:ListPrincipalThings(principal=<cognitoIdentityId>)`** — wrapped by `listMaveoConnectSticks(session)`. This is identity-scoped and returns 0–N stick serials belonging to the caller. Per-stick metadata (ARN, attributes, `thingId`) is then available via `iot:DescribeThing` (`describeMaveoThing`).

The library also exposes `listMaveoThings(session)` which calls account-wide `iot:ListThings`; the result depends on the IAM scope the IoT account grants to authenticated Cognito identities. Prefer `listMaveoConnectSticks` for end-user UIs.

**MQTT WSS** and per-thing operations rely on the published `iot:Connect` / `iot:Publish` / `iot:Subscribe` policy bound to the Cognito identity. Connecting with a thing name that is not attached to the calling identity returns CONNACK *Not authorized*.
