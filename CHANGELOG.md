# [1.1.0-beta.1](https://github.com/spid3r/maveo-connect-stick-client/compare/v1.0.1...v1.1.0-beta.1) (2026-05-25)


### Features

* **readme:** add npm [@beta](https://github.com/beta) install instructions for pre-release testers ([ce60e32](https://github.com/spid3r/maveo-connect-stick-client/commit/ce60e32da33ece8ad55d0fb314cee6d321ec5800))

## [1.0.1](https://github.com/spid3r/maveo-connect-stick-client/compare/v1.0.0...v1.0.1) (2026-05-02)


### Bug Fixes

* **garage:** respect maxThings cap before pushing items in listMaveoThings ([f26598c](https://github.com/spid3r/maveo-connect-stick-client/commit/f26598cae5879a1520a62832ba779ec0da3b1e7e))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

From v1.0.1 onward, release notes in this file are appended automatically by
[semantic-release](https://github.com/semantic-release/semantic-release) on
every push to `main` (and `beta` for prereleases).

## [1.0.0] - 2026-05-02

First public release on [npmjs.com](https://www.npmjs.com/package/maveo-connect-stick-client).

### Features

- **Identity-scoped device discovery** — `listMaveoConnectSticks(session)` returns only the sticks attached to the calling Cognito identity (uses `iot:ListPrincipalThings`), suitable for end-user "pick your stick" UIs. `describeMaveoThing(session, name)` returns AWS IoT thing metadata for a single stick.
- **MQTT over WSS** — header-based SigV4 with the official wire format (`iotdata` service, `wss://…:443/mqtt`); MQTT v5 by default.
- **BlueFi protocol** — open / close / dwell / light / read door position / read light state, with response timeouts and poll intervals exposed as options.
- **Long-running session helpers** — `recoverMqttSession()`, `reclaimMqttSessionWithRetries()`, `enableAutomaticMqttReclaim()` with session contention back-off (coexists with the official mobile app).
- **Strict configuration** — no vendor IDs ship with the package; users supply their own `MAVEO_*` env vars derived from the official mobile app's `awsconfiguration.json`.

### Security

- Repo `.npmrc` enables `ignore-scripts=true` to mitigate dependency-side supply-chain attacks (e.g. malicious `postinstall` scripts in transitive deps).
- CI `release.yml` is gated behind a `NPM_PUBLISHING_ENABLED` repo variable; once npm Trusted Publishing is configured, every push to `main` / `beta` publishes via OIDC with provenance attestations and no long-lived tokens.

### Disclaimer

This is an independent, unaffiliated open-source library implemented purely on top of publicly observable endpoints. Marantec / Maveo does **not** support, endorse, or warrant this project. Use at your own risk.

[1.0.0]: https://github.com/spid3r/maveo-connect-stick-client/releases/tag/v1.0.0
