# Maintainer / agent pointers

Read **[README.md](../README.md)** first: install, env vars, MQTT lifecycle (tables + Mermaid), and **LoxBerry plugin-style sample code**.

| Document | Use |
|----------|-----|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Package layout, wire protocol summary |
| [AUTH_FLOW.md](./AUTH_FLOW.md) | Cognito → Identity → MQTT chain; how to discover your stack values from your own copy of the official app's `awsconfiguration.json` |
| [LOXBERRY.md](./LOXBERRY.md) | Node.js on LoxBerry 3, how to depend on this library |

**Secrets:** never commit `.env`. The library does not embed any vendor-specific identifiers — all four `MAVEO_COGNITO_*`, `MAVEO_REGION`, and `MAVEO_IOT_HOSTNAME` values are required env vars discovered from your own configuration. Live hardware tests are gated by flags in [`.env.example`](../.env.example).
