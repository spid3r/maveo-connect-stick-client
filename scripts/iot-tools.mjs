#!/usr/bin/env node
/**
 * Invoked by scripts/cli.mjs after build. argv[2] = garage | listen
 */
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env"), override: true });

const mode = process.argv[2];

if (mode === "garage") {
  const {
    describeMaveoThing,
    listMaveoThings,
    loadMaveoLibraryConfigFromEnv,
    MaveoCognitoAuthClient,
  } = await import("../dist/index.js");

  const cfg = loadMaveoLibraryConfigFromEnv();
  const auth = new MaveoCognitoAuthClient({ authConfig: cfg });
  const session = await auth.loginWithPassword(cfg.email, cfg.password);
  console.log("IoT endpoint:", session.iotHostname);

  const preview = await listMaveoThings(session, { maxThings: 5 });
  console.log("First things (max 5):", preview.map((t) => t.thingName).join(", "));
  const pick = process.env.MAVEO_THING_NAME?.trim() || preview[0]?.thingName;
  if (!pick) {
    console.error(
      "Set MAVEO_THING_NAME to your Connect Stick serial (see Maveo app) or ensure ListThings returns data.",
    );
    process.exit(1);
  }
  console.log("DescribeThing:", pick);
  const detail = await describeMaveoThing(session, pick);
  console.log(JSON.stringify(detail, null, 2));
  process.exit(0);
}

if (mode === "listen") {
  const { createMaveoConnectStickClientFromEnv, parseBlueFiJsonObject } = await import("../dist/index.js");

  const dwellMs = Number(process.env.MAVEO_LISTEN_MS ?? "12000");
  const client = createMaveoConnectStickClientFromEnv();
  const serial = client.stickSerial();
  console.error(`Stick serial: ${serial} (listening ${dwellMs}ms on …/rsp)\n`);

  await client.login();
  await client.connectMqtt();
  await client.subscribeBlueFiResponses();

  const off = client.onMqttMessage((topic, payload) => {
    try {
      const obj = parseBlueFiJsonObject(payload);
      console.log(JSON.stringify({ topic, ...obj }));
    } catch {
      console.log(JSON.stringify({ topic, raw: payload.toString("utf8").slice(0, 500) }));
    }
  });

  if (process.env.MAVEO_RUN_OPEN === "1") {
    console.error("(MAVEO_RUN_OPEN=1) publishing open command once\n");
    await client.publishGarageDoor("open");
  }

  await new Promise((r) => setTimeout(r, dwellMs));
  off();
  await client.disconnectMqtt();
  console.error("done");
  process.exit(0);
}

console.error("iot-tools: expected garage | listen (via cli.mjs)");
process.exit(1);
