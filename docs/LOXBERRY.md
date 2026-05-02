# LoxBerry 3 and Node.js

## Can we use Node.js on LoxBerry 3?

**Yes.** LoxBerry 3 ships with a **modern Node.js** runtime (community docs reference **Node 18.12.x** as bundled), and the project explicitly supports **Node.js plugin development** (npm/yarn, Express-based plugins, etc.).

Official / community references:

- [Node.js for plugins (LoxBerry Wiki)](https://wiki.loxberry.de/entwickler/advanced_developers/nodejs_for_plugins)
- [Node JS Plugin Entwicklung (LoxBerry Wiki)](https://wiki.loxberry.de/entwickler/node_js_plugin_entwicklung)
- [Express Server plugin](https://wiki.loxberry.de/plugins/express_server/start) (LoxBerry 3–oriented examples)

## Implications for this library

- Target **`engines.node": ">=18.12.0"`** so the same build runs on **Windows dev**, **CI**, and **LoxBerry 3**.
- **LoxBerry plugin** (separate repo later) should:
  - `npm ci --omit=dev` (or ship `dist/` only) inside the plugin directory.
  - Store secrets in LoxBerry plugin config or a **`.env` file with restrictive permissions** (not world-readable).
  - Invoke a small **CLI entry** or **long-running service** that uses `maveo-connect-stick-client` as a dependency.

## Architecture split (recommended)

1. **`maveo-connect-stick-client`** (this repo) — pure library + tests, no LoxBerry specifics.
2. **`loxberry-plugin-maveo`** (future) — Perl/PHP shell + Node service that depends on the library via `file:../` or npm git/registry.

This keeps the garage logic **decoupled** and testable on any machine.

**Code sketch:** see [README.md](../README.md) → *LoxBerry plugin: long-running Node service* (`createMaveoConnectStickClientFromEnv`, `mergeAutomaticMqttReclaimOptionsFromEnv`, re-bind `onStickState` in `onRecovered`).
