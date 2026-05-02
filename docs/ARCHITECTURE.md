# Architecture

**Human overview:** [README.md](../README.md) · **Auth chain + region table:** [AUTH_FLOW.md](./AUTH_FLOW.md) · **LoxBerry:** [LOXBERRY.md](./LOXBERRY.md) · **Short maintainer index:** [AGENT_HANDOFF.md](./AGENT_HANDOFF.md)

## Purpose

Standalone **TypeScript (Node.js)** library for:

1. **Auth** — email/password → Cognito User Pool → Identity Pool → temporary AWS credentials (as used before IoT).
2. **IoT** — **MQTT over WebSocket** to Marantec hostnames: TLS `wss://`, path `/mqtt`, **SigV4 in upgrade headers** (AWS service name **`iotdata`**), **MQTT v5** CONNECT. **`clientId`** must be the **Connect Stick serial** (thing name), not the Cognito identity id.

Guest **deep-link** flow (`?data=`) is **out of scope** unless you add a separate module later.

## Wire protocol (BlueFi)

| Item | Detail |
|------|--------|
| Subscribe | `<stickId>/rsp` — stick → app JSON (`StoA_*` keys) |
| Publish | `<stickId>/cmd` — app → stick JSON (`AtoS_*` keys) |
| Door | `{"AtoS_g":0}` stop, `1` open, `2` close, `3` ventilate |
| Light | `{"AtoS_l": true \| false}` |

Implementation: `src/iot/maveoBlueFiMqttProtocol.ts`, `MaveoMqttIotClient`, `MaveoConnectStickClient`.

**Prod/test hostnames** (per region) are listed in [AUTH_FLOW.md](./AUTH_FLOW.md).

## Library layout

| Path | Responsibility |
|------|----------------|
| `src/config/env.ts` | Validate `MAVEO_*` env vars (Zod). |
| `src/config/stickSerial.ts` | Resolve stick serial from `MAVEO_THING_NAME` / `MAVEO_MQTT_CLIENT_ID`. |
| `src/config/mqttSessionEnv.ts` | Optional env for reclaim + session contention (`mergeAutomaticMqttReclaimOptionsFromEnv`). |
| `src/auth/*` | Cognito login → `MaveoSession`. |
| `src/iot/*` | WSS + MQTT: connect, subscribe, publish. |
| `src/garage/maveoIotThings.ts` | `ListPrincipalThings` (own-stick discovery), `DescribeThing`, plus account-wide `ListThings` for advanced use (control plane, no MQTT). |
| `src/client/maveoConnectStickClient.ts` | Facade: login + MQTT + BlueFi helpers, auto-reclaim, lifecycle events. |

## Tests

- **Unit / fixture** — default CI path; no cloud.
- **Live** — `tests/live.*.test.ts` only when `MAVEO_LIVE_TEST=1` (and friends); see `.env.example`. Prefer `npm run test:unit` locally when `.env` enables live flags.
