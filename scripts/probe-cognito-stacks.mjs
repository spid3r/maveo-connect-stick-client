/**
 * Tries InitiateAuth (USER_PASSWORD_AUTH) against a list of Cognito app clients you supply
 * via a local gitignored file (so this repo never redistributes vendor identifiers).
 *
 * Setup:
 *   1. Create `cognito-stacks.local.json` at the repo root with an array of stacks discovered
 *      from your own copy of the official mobile app's `awsconfiguration.json` /
 *      `amplifyconfiguration.json` (see `docs/AUTH_FLOW.md`):
 *
 *        [
 *          { "name": "prod-region-a", "region": "<region>", "clientId": "<app-client-id>" },
 *          { "name": "prod-region-b", "region": "<region>", "clientId": "<app-client-id>" }
 *        ]
 *
 *   2. Set `MAVEO_EMAIL` / `MAVEO_PASSWORD` in `.env` (never commit).
 *   3. Run `npm run cli -- cognito`.
 *
 * Reads MAVEO_EMAIL / MAVEO_PASSWORD from .env — does not print the password.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
config({ path: resolve(repoRoot, ".env"), override: true });

const emailRaw = process.env.MAVEO_EMAIL;
const password = process.env.MAVEO_PASSWORD;
if (!emailRaw?.trim() || !password) {
  console.error("Set MAVEO_EMAIL and MAVEO_PASSWORD in .env");
  process.exit(1);
}

const stacksPath = resolve(repoRoot, "cognito-stacks.local.json");
let stacks;
try {
  const raw = readFileSync(stacksPath, "utf8");
  stacks = JSON.parse(raw);
  if (!Array.isArray(stacks) || stacks.length === 0) {
    throw new Error("must be a non-empty array");
  }
  for (const s of stacks) {
    if (!s?.name || !s?.region || !s?.clientId) {
      throw new Error(`each entry needs { name, region, clientId } — got ${JSON.stringify(s)}`);
    }
  }
} catch (e) {
  const msg = e?.code === "ENOENT" ? "file not found" : (e?.message ?? String(e));
  console.error(
    `Cannot read ${stacksPath}: ${msg}.\n` +
      `Create cognito-stacks.local.json (gitignored) with an array of\n` +
      `  { "name": "...", "region": "...", "clientId": "..." }\n` +
      `entries from your own copy of the official app's awsconfiguration.json (see docs/AUTH_FLOW.md).`,
  );
  process.exit(1);
}

const email = emailRaw.trim();
const emailLower = email.toLowerCase();

async function tryAuth(region, clientId, username) {
  const client = new CognitoIdentityProviderClient({ region });
  return client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: { USERNAME: username, PASSWORD: password },
    }),
  );
}

console.log(
  `Probing ${stacks.length} Cognito stack(s) from cognito-stacks.local.json (password not shown). USERNAME tries: trimmed email, then lowercased.\n`,
);

for (const s of stacks) {
  for (const label of ["as-is", "lower"]) {
    const username = label === "as-is" ? email : emailLower;
    if (label === "lower" && username === email) continue;
    try {
      const out = await tryAuth(s.region, s.clientId, username);
      if (out.AuthenticationResult?.IdToken) {
        console.log(`OK   ${s.name} (${label})`);
        process.exit(0);
      }
      console.log(`CHAL ${s.name} (${label}): ${out.ChallengeName ?? "no token"}`);
    } catch (e) {
      const name = e?.name ?? "?";
      const msg = e?.message ?? String(e);
      console.log(`FAIL ${s.name} (${label}): ${name} — ${msg}`);
    }
  }
}

console.log("\nNone succeeded. Verify your stacks file (region + clientId) against your own awsconfiguration.json.");
