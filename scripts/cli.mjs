#!/usr/bin/env node
/**
 * Dev / debugging helpers. Runs `npm run build` automatically for commands that import `dist/`.
 *
 *   npm run cli -- cognito      Probe Cognito stacks defined in cognito-stacks.local.json
 *   npm run cli -- garage       ListThings + DescribeThing JSON (needs build + .env)
 *   npm run cli -- listen       MQTT subscribe to the stick's /rsp topic, print JSON lines (needs build + .env)
 *
 * All commands rely on env vars in `.env` (gitignored) — never commit credentials or vendor ids.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, "..");
const cmd = process.argv[2];
const passThrough = process.argv.slice(3);

function usage() {
  console.error(`Usage: npm run cli -- <command> [...args]

  cognito   Try USER_PASSWORD_AUTH against stacks listed in cognito-stacks.local.json
  garage    ListThings + DescribeThing JSON (needs build + .env)
  listen    MQTT subscribe to <stickId>/rsp, print JSON lines (needs build + .env)`);
}

function exitSpawn(r) {
  if (r.error) throw r.error;
  if (r.signal) process.exit(1);
  process.exit(typeof r.status === "number" ? r.status : 1);
}

if (!cmd) {
  usage();
  process.exit(0);
}

const needsBuild = cmd === "garage" || cmd === "listen";
if (needsBuild) {
  const br = spawnSync("npm", ["run", "build", "--silent"], {
    stdio: "inherit",
    cwd: repoRoot,
    shell: true,
  });
  if (br.error) throw br.error;
  if (br.status !== 0) process.exit(br.status ?? 1);
}

const node = process.execPath;

if (cmd === "cognito") {
  exitSpawn(spawnSync(node, [join(scriptsDir, "probe-cognito-stacks.mjs"), ...passThrough], { stdio: "inherit" }));
}
if (cmd === "garage" || cmd === "listen") {
  exitSpawn(spawnSync(node, [join(scriptsDir, "iot-tools.mjs"), cmd, ...passThrough], { stdio: "inherit" }));
}

console.error("Unknown command:", cmd);
usage();
process.exit(1);
