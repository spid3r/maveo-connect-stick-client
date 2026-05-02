/**
 * **Real MQTT + real stick** — only runs when env flags are set (see `.env.example`).
 *
 * - Default `npm test`: these suites are **skipped** (same as other live tests).
 * - Unit tests elsewhere use **mocks** (`vi.fn`, stub `mqtt`, in-memory protocol checks).
 *
 * **Safety:** `MAVEO_LIVE_BLUEFI_DOOR=1` **opens and closes** the physical door. Clear the area.
 * **Passive:** `MAVEO_LIVE_BLUEFI_PASSIVE=1` does not command the door — use wall/handheld; asserts you saw MQTT state (unless `…_ALLOW_SILENT=1`). Uses **`enableAutomaticMqttReclaim(mergeAutomaticMqttReclaimOptionsFromEnv(…))`** only for reconnects (no parallel idle `recoverMqttSession` loop). Tune contention / reclaim via **`MAVEO_MQTT_CONTENTION_*`** / **`MAVEO_MQTT_RECLAIM_*`** — e.g. **`MAVEO_MQTT_CONTENTION_BACKOFF_MS=10000`** for a 10s post-burst pause instead of 120s. Run: **`npm run bluefi:passive`**.
 * **Start delay (e.g. walk to garage):** `MAVEO_LIVE_BLUEFI_START_DELAY_MS=20000` sleeps once at the beginning of each BlueFi live test before `login()` / actions.
 * **Guided scenario:** `MAVEO_RUN_BLUEFI_SCENARIO=1` (plus live base flags) — open → dwell → **stop** → light → **close** (waits for `StoA_s` **Closed**, not only “closing”). Run `npm test` or `npm run bluefi:scenario`.
 * **Debug MQTT / light waits:** `MAVEO_SCENARIO_DEBUG_LOG=1` — logs `close`/`offline`/`connect`, `getLightOn` probes, and light-wait ticks. Timeouts always include a `Last context: {…}` JSON snapshot.
 */
import { describe, expect, it } from "vitest";
import { createMaveoConnectStickClientFromEnv } from "../src/client/maveoConnectStickClient.js";
import { mergeAutomaticMqttReclaimOptionsFromEnv } from "../src/config/mqttSessionEnv.js";
import { MaveoDoorPosition, maveoDoorPositionLabel } from "../src/iot/maveoBlueFiState.js";

type ScenarioClient = ReturnType<typeof createMaveoConnectStickClientFromEnv>;

const poolOk = Boolean(process.env.MAVEO_COGNITO_IDENTITY_POOL_ID?.trim());
const authLive = process.env.MAVEO_LIVE_TEST === "1" && poolOk;
const mqttLive =
  authLive &&
  process.env.MAVEO_RUN_LIVE_MQTT === "1" &&
  Boolean(process.env.MAVEO_THING_NAME?.trim() || process.env.MAVEO_MQTT_CLIENT_ID?.trim());

/** Full guided flow: open → dwell → stop → light → close (same flag as before the standalone script was removed). */
const scenarioLive = mqttLive && process.env.MAVEO_RUN_BLUEFI_SCENARIO === "1";

function scenarioOpenDwellMs(): number {
  const n = Number(process.env.MAVEO_SCENARIO_OPEN_DWELL_MS ?? "10000");
  return Number.isFinite(n) && n >= 0 ? n : 10_000;
}

function scenarioLightDwellMs(): number {
  const n = Number(process.env.MAVEO_SCENARIO_LIGHT_DWELL_MS ?? "5000");
  return Number.isFinite(n) && n >= 0 ? n : 5000;
}

function scenarioDoorTimeoutMs(): number {
  const n = Number(process.env.MAVEO_SCENARIO_DOOR_TIMEOUT_MS ?? "90000");
  return Number.isFinite(n) && n >= 5000 ? n : 90_000;
}

function scenarioReadTimeoutMs(): number {
  const n = Number(process.env.MAVEO_SCENARIO_READ_TIMEOUT_MS ?? "15000");
  return Number.isFinite(n) && n >= 3000 ? n : 15_000;
}

/** Extra MQTT + light-wait logging (`[live scenario][diag]…`). Set `MAVEO_SCENARIO_DEBUG_LOG=1` in `.env`. */
function scenarioDiagEnabled(): boolean {
  return process.env.MAVEO_SCENARIO_DEBUG_LOG === "1";
}

/** Moves the real garage door (open → close). */
const doorCycleLive = mqttLive && process.env.MAVEO_LIVE_BLUEFI_DOOR === "1";

/** Turns the real stick light on and off. */
const lightToggleLive = mqttLive && process.env.MAVEO_LIVE_BLUEFI_LIGHT === "1";

/**
 * Passive listen: you operate the door/light with the handheld or wall button; test records `StoA_*` pushes.
 */
const passiveListenLive = mqttLive && process.env.MAVEO_LIVE_BLUEFI_PASSIVE === "1";

function passiveListenMs(): number {
  const n = Number(process.env.MAVEO_LIVE_BLUEFI_LISTEN_MS ?? "120000");
  return Number.isFinite(n) && n >= 5000 ? n : 120_000;
}

/** If set (e.g. `1`), require at least this many door `StoA_s` updates during the listen window. */
function passiveMinDoorEvents(): number | null {
  const raw = process.env.MAVEO_LIVE_BLUEFI_PASSIVE_MIN_DOOR_EVENTS?.trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.trunc(n) : null;
}

const passiveAllowSilent = process.env.MAVEO_LIVE_BLUEFI_PASSIVE_ALLOW_SILENT === "1";

/**
 * If set, light test passes when readback (`getLightOn`) matches even when no `StoA_l_r`
 * push arrived (some setups are read-heavy).
 */
const lightRelaxed = process.env.MAVEO_LIVE_BLUEFI_LIGHT_RELAXED === "1";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pause before any BlueFi live actions (e.g. reach the garage). Default 0; capped at 10 minutes. */
function liveBlueFiStartDelayMs(): number {
  const n = Number(process.env.MAVEO_LIVE_BLUEFI_START_DELAY_MS ?? "0");
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.trunc(n), 600_000);
}

async function liveBlueFiStartDelay(label: string): Promise<void> {
  const ms = liveBlueFiStartDelayMs();
  if (ms <= 0) return;
  console.warn(
    `[live BlueFi] start delay ${ms}ms (${(ms / 1000).toFixed(1)}s) — ${label} (MAVEO_LIVE_BLUEFI_START_DELAY_MS)`,
  );
  await sleep(ms);
}

async function waitUntil(cond: () => boolean, timeoutMs: number, intervalMs = 250): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (cond()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

async function waitUntilAsync(
  cond: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 300,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await cond()) return;
    await sleep(intervalMs);
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}

/** AWS IoT: one online session per MQTT `clientId` (stick serial). Phone app + test client fight for it. */
const MQTT_CLIENT_ID_COMPETITION_HINT =
  "Only one client may use the stick serial as MQTT clientId at a time — the Maveo app reconnecting usually kicks this session. Close the app (or force-stop) while running integration tests.";

async function waitForDoorNotifyWithDisconnectGuard(
  client: ScenarioClient,
  getLastDoor: () => MaveoDoorPosition | undefined,
  matches: (d: MaveoDoorPosition) => boolean,
  timeoutMs: number,
  label: string,
  recoverAndRebind?: () => Promise<void>,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!client.isMqttConnected()) {
      if (recoverAndRebind) {
        console.warn(`[live scenario] MQTT down; recover + rebind while waiting for ${label}`);
        await recoverAndRebind();
        await sleep(400);
        continue;
      }
      throw new Error(`MQTT disconnected while waiting for ${label}. ${MQTT_CLIENT_ID_COMPETITION_HINT}`);
    }
    const d = getLastDoor();
    if (d !== undefined && matches(d)) return;
    await sleep(250);
  }
  if (!client.isMqttConnected()) {
    if (recoverAndRebind) {
      await recoverAndRebind();
      await sleep(400);
    }
    if (!client.isMqttConnected()) {
      throw new Error(`MQTT disconnected while waiting for ${label}. ${MQTT_CLIENT_ID_COMPETITION_HINT}`);
    }
  }
  try {
    const d = await client.getDoorPosition({ timeoutMs: 15_000 });
    if (matches(d)) return;
  } catch {
    /* ignore */
  }
  throw new Error(
    `Timeout (${timeoutMs}ms) waiting for ${label}. ${MQTT_CLIENT_ID_COMPETITION_HINT}`,
  );
}

type LightWaitOptions = {
  readTimeoutMs: number;
  /** After phone app steals `clientId`, reconnect drops `message` listeners — rebind `onStickState` here. */
  recoverAndRebind?: () => Promise<void>;
  /** QoS 0 cmd may be lost while disconnected — re-issue light command and refresh push gate (`tOff` / `tOn`). */
  afterRecover?: () => Promise<void>;
  /** Appended to timeout errors; updated periodically for debugging. */
  getFailureContext?: () => Record<string, unknown>;
};

function formatLightWaitContext(
  client: ScenarioClient,
  start: number,
  extra?: () => Record<string, unknown>,
): string {
  const base = {
    elapsedMs: Date.now() - start,
    mqttConnected: client.isMqttConnected(),
    mqttClientId: client.getMqttClientId() ?? null,
  };
  const more = extra?.() ?? {};
  try {
    return JSON.stringify({ ...base, ...more });
  } catch {
    return String(base);
  }
}

/** Wait until `predicate()` is true; probe `getLightOn` occasionally; final fallback read. */
async function waitForLightNotifyWithDisconnectGuard(
  client: ScenarioClient,
  predicate: () => boolean,
  fallbackMatches: (v: boolean) => boolean,
  timeoutMs: number,
  label: string,
  opts: LightWaitOptions,
): Promise<void> {
  const { readTimeoutMs, recoverAndRebind, afterRecover, getFailureContext } = opts;
  const probeEveryMs = 4000;
  const diagEveryMs = scenarioDiagEnabled() ? 5000 : 12_000;
  const start = Date.now();
  /** First `getLightOn` probe soon after entering the wait (then every `probeEveryMs`). */
  let lastProbeAt = start - probeEveryMs;
  let lastDiagAt = start;
  let lastContextLine = formatLightWaitContext(client, start, getFailureContext);
  const dbg = scenarioDiagEnabled();

  async function tryRecover(): Promise<void> {
    if (!recoverAndRebind) {
      throw new Error(`MQTT disconnected while waiting for ${label}. ${MQTT_CLIENT_ID_COMPETITION_HINT}`);
    }
    console.warn(`[live scenario] MQTT down; recover + rebind while waiting for ${label}`);
    if (dbg) {
      console.warn(`[live scenario][diag] before recover ctx=${formatLightWaitContext(client, start, getFailureContext)}`);
    }
    await recoverAndRebind();
    if (afterRecover) await afterRecover();
    if (dbg) {
      console.warn(`[live scenario][diag] after recover ctx=${formatLightWaitContext(client, start, getFailureContext)}`);
    }
    await sleep(400);
  }

  if (dbg) {
    console.warn(`[live scenario][diag] light-wait start label=${JSON.stringify(label)} ctx=${lastContextLine}`);
  }

  while (Date.now() - start < timeoutMs) {
    if (!client.isMqttConnected()) {
      await tryRecover();
      continue;
    }
    if (predicate()) {
      if (dbg) console.warn(`[live scenario][diag] light-wait predicate ok label=${JSON.stringify(label)}`);
      return;
    }

    const now = Date.now();
    if (now - lastDiagAt >= diagEveryMs) {
      lastDiagAt = now;
      lastContextLine = formatLightWaitContext(client, start, getFailureContext);
      if (dbg) {
        console.warn(`[live scenario][diag] light-wait tick label=${JSON.stringify(label)} ctx=${lastContextLine}`);
      }
    }

    if (now - lastProbeAt >= probeEveryMs) {
      lastProbeAt = now;
      try {
        const v = await client.getLightOn({ timeoutMs: Math.min(12_000, readTimeoutMs) });
        if (dbg) {
          console.warn(
            `[live scenario][diag] getLightOn probe → ${v} (fallbackMatches=${fallbackMatches(v)}) label=${JSON.stringify(label)}`,
          );
        }
        if (fallbackMatches(v)) return;
      } catch (e) {
        if (dbg) {
          console.warn(
            `[live scenario][diag] getLightOn probe failed label=${JSON.stringify(label)} err=${(e as Error)?.message ?? e}`,
          );
        }
      }
    }
    await sleep(250);
  }

  if (!client.isMqttConnected() && recoverAndRebind) {
    await tryRecover();
  }
  if (!client.isMqttConnected()) {
    throw new Error(`MQTT disconnected while waiting for ${label}. ${MQTT_CLIENT_ID_COMPETITION_HINT}`);
  }
  try {
    const v = await client.getLightOn({ timeoutMs: readTimeoutMs });
    if (dbg) {
      console.warn(`[live scenario][diag] final getLightOn → ${v} fallbackMatches=${fallbackMatches(v)}`);
    }
    if (fallbackMatches(v)) return;
  } catch (e) {
    if (dbg) {
      console.warn(`[live scenario][diag] final getLightOn failed err=${(e as Error)?.message ?? e}`);
    }
  }
  lastContextLine = formatLightWaitContext(client, start, getFailureContext);
  throw new Error(
    `Timeout (${timeoutMs}ms) waiting for ${label}. Last context: ${lastContextLine}. ${MQTT_CLIENT_ID_COMPETITION_HINT}`,
  );
}

describe.runIf(scenarioLive)("live: BlueFi guided scenario", () => {
  it(
    "guided scenario: open → dwell → stop → light → close",
    async () => {
      const openDwellMs = scenarioOpenDwellMs();
      const lightDwellMs = scenarioLightDwellMs();
      const doorTimeoutMs = scenarioDoorTimeoutMs();
      const readTimeoutMs = scenarioReadTimeoutMs();

      const client = createMaveoConnectStickClientFromEnv(undefined, {
        blueFiReadTimeoutMs: readTimeoutMs,
      });

      let lastDoor: MaveoDoorPosition | undefined;
      let lastLight: boolean | undefined;
      let lastLightAtMs = 0;
      let lastLightLogged: boolean | undefined;
      let off: () => void = () => {};
      let unlost: (() => void) | undefined;

      const bindStickState = () => {
        off();
        off = client.onStickState((u) => {
          if (u.doorPosition !== undefined) {
            lastDoor = u.doorPosition;
            console.log(
              `[live scenario] StoA_s → ${maveoDoorPositionLabel(u.doorPosition)} (${u.doorPosition})`,
            );
          }
          if (u.lightOn !== undefined) {
            lastLight = u.lightOn;
            lastLightAtMs = Date.now();
            if (lastLightLogged !== u.lightOn) {
              lastLightLogged = u.lightOn;
              console.log(`[live scenario] StoA_l_r → ${u.lightOn}`);
            }
          }
        });
      };

      let undiagMqtt: () => void = () => {};
      const attachMqttLifecycleDiag = () => {
        undiagMqtt();
        if (!scenarioDiagEnabled()) return;
        try {
          undiagMqtt = client.mqtt.attachDebugLifecycleLog((line) => {
            console.warn(`[live scenario][diag][mqtt] ${new Date().toISOString()} ${line}`);
          });
        } catch {
          /* not connected */
        }
      };

      /** Manual-style reconnect for wait helpers (clears session-contention backoff; queued with auto-reclaim). */
      const recoverForWait = async (): Promise<void> => {
        console.warn(
          `[live scenario] MQTT recover (wait helper): reconnect + resubscribe + rebind listeners`,
        );
        await client.recoverMqttSession();
        bindStickState();
        attachMqttLifecycleDiag();
      };

      let stopAutoReclaim: (() => void) | undefined;

      const dbg = scenarioDiagEnabled();

      try {
        await liveBlueFiStartDelay("guided scenario");
        await client.login();
        await client.connectMqtt();
        await client.subscribeBlueFiResponses();

        bindStickState();
        attachMqttLifecycleDiag();

        unlost = client.onMqttConnectionLost(() => {
          const ts = new Date().toISOString();
          console.warn(`[live scenario] MQTT connection lost (${ts}) — ${MQTT_CLIENT_ID_COMPETITION_HINT}`);
          if (dbg) {
            console.warn(
              `[live scenario][diag] onMqttConnectionLost fired at ${ts} isMqttConnected=${client.isMqttConnected()} clientId=${client.getMqttClientId() ?? "?"}`,
            );
          }
        });

        stopAutoReclaim = client.enableAutomaticMqttReclaim(
          mergeAutomaticMqttReclaimOptionsFromEnv(process.env, {
            sessionContention: true,
            maxAttempts: 4,
            delayMsBetweenAttempts: 2000,
            onRecovered: () => {
              bindStickState();
              attachMqttLifecycleDiag();
            },
            onSessionContentionBurst: (info) => {
              console.warn(
                `[live scenario] Session contention — ${info.burstThreshold} remote kick(s) within ${info.burstWindowMs}ms → auto-reclaim paused ${info.backoffAfterBurstMs}ms (until ${new Date(info.backoffUntilMs).toISOString()}). Call recoverMqttSession() / “Reconnect” to retry sooner.`,
              );
            },
          }),
        );

        console.warn(`[live scenario] ${MQTT_CLIENT_ID_COMPETITION_HINT}`);
        console.log(
          `[live scenario] BlueFi: stop = publishGarageDoor("stop") (AtoS_g 0), not a second "open".`,
        );

        await client.publishGarageDoor("open");
        await waitForDoorNotifyWithDisconnectGuard(
          client,
          () => lastDoor,
          (d) => d === MaveoDoorPosition.Opening || d === MaveoDoorPosition.Open,
          doorTimeoutMs,
          "Opening or Open after open command",
          recoverForWait,
        );

        console.log(`[live scenario] Dwell ${openDwellMs}ms`);
        await sleep(openDwellMs);

        await client.publishGarageDoor("stop");
        try {
          await waitUntil(() => lastDoor === MaveoDoorPosition.Stopped, 25_000);
        } catch {
          const p = await client.getDoorPosition();
          console.warn(
            `[live scenario] No Stopped within 25s (ok if already at endpoint). getDoorPosition → ${maveoDoorPositionLabel(p)}`,
          );
        }

        // One read is OK; do not poll getLightOn() in a loop — each call adds an mqtt onMessage waiter.
        const lightBefore = await client.getLightOn();
        if (dbg) {
          console.warn(
            `[live scenario][diag] light phase: lightBefore=${lightBefore} mqtt=${client.isMqttConnected()} clientId=${client.getMqttClientId() ?? "?"}`,
          );
        }
        if (lightBefore) {
          if (dbg) console.warn(`[live scenario][diag] publishLight(false) starting…`);
          await client.publishLight(false);
          let tOff = Date.now();
          if (dbg) console.warn(`[live scenario][diag] publishLight(false) publish() resolved tOff=${tOff}`);
          await sleep(lightDwellMs);
          await waitForLightNotifyWithDisconnectGuard(
            client,
            () => lastLight === false && lastLightAtMs >= tOff,
            (v) => v === false,
            40_000,
            "light off after publishLight(false)",
            {
              readTimeoutMs,
              recoverAndRebind: recoverForWait,
              afterRecover: async () => {
                await client.publishLight(false);
                tOff = Date.now();
              },
              getFailureContext: () => ({
                phase: "lightOff",
                lastLight,
                lastLightAtMs,
                tOff,
                pushAfterGate: lastLightAtMs >= tOff,
                wantPredicate: lastLight === false && lastLightAtMs >= tOff,
              }),
            },
          );
        }

        if (dbg) console.warn(`[live scenario][diag] publishLight(true) starting…`);
        await client.publishLight(true);
        let tOn = Date.now();
        if (dbg) console.warn(`[live scenario][diag] publishLight(true) publish() resolved tOn=${tOn}`);
        await sleep(Math.min(3000, lightDwellMs));
        await waitForLightNotifyWithDisconnectGuard(
          client,
          () => lastLight === true && lastLightAtMs >= tOn,
          (v) => v === true,
          45_000,
          "light on after publishLight(true)",
          {
            readTimeoutMs,
            recoverAndRebind: recoverForWait,
            afterRecover: async () => {
              await client.publishLight(true);
              tOn = Date.now();
            },
            getFailureContext: () => ({
              phase: "lightOn",
              lastLight,
              lastLightAtMs,
              tOn,
              pushAfterGate: lastLightAtMs >= tOn,
              wantPredicate: lastLight === true && lastLightAtMs >= tOn,
            }),
          },
        );

        lastDoor = undefined;
        await client.publishGarageDoor("close");
        await waitForDoorNotifyWithDisconnectGuard(
          client,
          () => lastDoor,
          (d) => d === MaveoDoorPosition.Closed,
          doorTimeoutMs,
          "Closed (fully) after close command",
          recoverForWait,
        );
        expect(lastDoor).toBe(MaveoDoorPosition.Closed);
      } finally {
        stopAutoReclaim?.();
        undiagMqtt();
        off();
        unlost?.();
        await client.disconnectMqtt();
      }
    },
    400_000,
  );
});

describe.runIf(doorCycleLive)("live: BlueFi door cycle (opens/closes real hardware)", () => {
  it(
    "after open: StoA_s shows opening or open; after close: closing or closed",
    async () => {
      const client = createMaveoConnectStickClientFromEnv();
      await liveBlueFiStartDelay("door cycle");
      await client.login();
      await client.connectMqtt();
      await client.subscribeBlueFiResponses();

      const doorPositions: MaveoDoorPosition[] = [];
      const off = client.onStickState((u) => {
        if (u.doorPosition !== undefined) doorPositions.push(u.doorPosition);
      });

      try {
        await client.publishGarageDoor("open");
        await waitUntil(
          () =>
            doorPositions.some(
              (p) => p === MaveoDoorPosition.Opening || p === MaveoDoorPosition.Open,
            ),
          75_000,
        );

        const afterOpenCount = doorPositions.length;
        await client.publishGarageDoor("close");
        await waitUntil(
          () =>
            doorPositions
              .slice(afterOpenCount)
              .some(
                (p) => p === MaveoDoorPosition.Closing || p === MaveoDoorPosition.Closed,
              ),
          90_000,
        );

        expect(doorPositions.length).toBeGreaterThan(0);
      } finally {
        off();
        await client.disconnectMqtt();
      }
    },
    200_000,
  );
});

describe.runIf(lightToggleLive)("live: BlueFi light toggle", () => {
  it(
    "turn light on then off; expect StoA_l_r notifications unless relaxed mode",
    async () => {
      const client = createMaveoConnectStickClientFromEnv(undefined, {
        blueFiReadTimeoutMs: 15_000,
      });
      await liveBlueFiStartDelay("light toggle");
      await client.login();
      await client.connectMqtt();
      await client.subscribeBlueFiResponses();

      let sawLightTrueOnNotify = false;
      let sawLightFalseOnNotify = false;
      const off = client.onStickState((u) => {
        if (u.lightOn === true) sawLightTrueOnNotify = true;
        if (u.lightOn === false) sawLightFalseOnNotify = true;
      });

      try {
        await client.publishLight(true);
        if (lightRelaxed) {
          await waitUntilAsync(async () => {
            if (sawLightTrueOnNotify) return true;
            try {
              return (await client.getLightOn({ timeoutMs: 12_000 })) === true;
            } catch {
              return false;
            }
          }, 45_000);
        } else {
          await waitUntil(() => sawLightTrueOnNotify, 35_000);
          expect(sawLightTrueOnNotify).toBe(true);
        }

        await client.publishLight(false);
        if (lightRelaxed) {
          await waitUntilAsync(async () => {
            if (sawLightFalseOnNotify) return true;
            try {
              return (await client.getLightOn({ timeoutMs: 12_000 })) === false;
            } catch {
              return false;
            }
          }, 45_000);
        } else {
          await waitUntil(() => sawLightFalseOnNotify, 35_000);
          expect(sawLightFalseOnNotify).toBe(true);
        }
      } finally {
        off();
        await client.disconnectMqtt();
      }
    },
    120_000,
  );
});

describe.runIf(passiveListenLive)("live: BlueFi passive listen (handheld / wall — no SDK door commands)", () => {
  it(
    "subscribes and records StoA_s / StoA_l_r while you operate the door or light",
    async () => {
      const dwell = passiveListenMs();
      const minDoor = passiveMinDoorEvents();
      const client = createMaveoConnectStickClientFromEnv();
      await liveBlueFiStartDelay("passive listen");
      await client.login();
      await client.connectMqtt();
      await client.subscribeBlueFiResponses();

      let doorEvents = 0;
      let lightEvents = 0;
      let off: () => void = () => {};
      let unlost: (() => void) | undefined;
      let stopAutoReclaim: (() => void) | undefined;
      let lastSkipLog = 0;

      const bindStickState = () => {
        off();
        if (!client.isMqttConnected()) {
          return;
        }
        try {
          off = client.onStickState((u) => {
            if (u.doorPosition !== undefined) {
              doorEvents += 1;
              console.log(
                `[live BlueFi passive] door StoA_s → ${maveoDoorPositionLabel(u.doorPosition)} (${u.doorPosition})`,
              );
            }
            if (u.lightOn !== undefined) {
              lightEvents += 1;
              console.log(`[live BlueFi passive] light StoA_l_r → ${u.lightOn}`);
            }
          });
        } catch (e) {
          console.warn(`[live BlueFi passive] bindStickState skipped: ${(e as Error)?.message ?? e}`);
        }
      };

      /**
       * Same pattern as the guided scenario: session-contention counts **remote** kicks; after a burst, auto-reclaim
       * backs off (tune via env / {@link mergeAutomaticMqttReclaimOptionsFromEnv}). Do **not** chain recover on
       * `onMqttConnectionLost` — that clears backoff and fights the app → CONNACK quota / rate limits.
       */
      const reclaimOpts = mergeAutomaticMqttReclaimOptionsFromEnv(process.env, {
        sessionContention: true,
        maxAttempts: 4,
        delayMsBetweenAttempts: 2000,
        onRecovered: () => bindStickState(),
        onSessionContentionBurst: (info) => {
          console.warn(
            `[live BlueFi passive] Manual / external MQTT takeover burst recognized — ${info.burstThreshold} remote session loss(es) within ${info.burstWindowMs}ms. Pausing auto-reclaim for ${info.backoffAfterBurstMs}ms (resume ~${new Date(info.backoffUntilMs).toISOString()}).`,
          );
        },
        onSessionContentionSkipped: (info) => {
          const now = Date.now();
          if (now - lastSkipLog < 15_000) return;
          lastSkipLog = now;
          console.warn(
            `[live BlueFi passive] Still in session-contention backoff until ${new Date(info.backoffUntilMs).toISOString()} — skipping auto-reclaim (official app likely holds MQTT).`,
          );
        },
        onReclaimExhausted: (err) => {
          console.error(`[live BlueFi passive] auto-reclaim gave up:`, err);
        },
      });

      bindStickState();

      unlost = client.onMqttConnectionLost(() => {
        console.warn(`[live BlueFi passive] MQTT connection lost — ${MQTT_CLIENT_ID_COMPETITION_HINT}`);
      });

      console.log(
        `[live BlueFi passive] listening ${dwell}ms — use wireless or wall control; min door events required: ${minDoor ?? "none"}`,
      );
      console.warn(
        `[live BlueFi passive] Session-contention backoff is ON (defaults: 3 remote kicks / 10s window; pause ms from MAVEO_MQTT_CONTENTION_BACKOFF_MS or 120s). Reconnecting from the Maveo app repeatedly should trigger the burst message and stop auto-reclaim spam.`,
      );
      console.warn(
        `[live BlueFi passive] Only auto-reclaim reconnects here — no idle recoverMqttSession loop (that would race the app for clientId and block burst detection).`,
      );

      try {
        stopAutoReclaim = client.enableAutomaticMqttReclaim(reclaimOpts);
        await sleep(dwell);
        if (minDoor != null) {
          expect(
            doorEvents,
            `Expected at least ${minDoor} door state message(s) (StoA_s). Increase window or operate the door.`,
          ).toBeGreaterThanOrEqual(minDoor);
        } else if (!passiveAllowSilent) {
          expect(
            doorEvents + lightEvents,
            "No door or light state messages in window — operate the door/light, set MAVEO_LIVE_BLUEFI_PASSIVE_MIN_DOOR_EVENTS, or MAVEO_LIVE_BLUEFI_PASSIVE_ALLOW_SILENT=1",
          ).toBeGreaterThan(0);
        }
      } finally {
        stopAutoReclaim?.();
        unlost?.();
        off();
        await client.disconnectMqtt();
      }
    },
    Math.min(passiveListenMs() + 90_000, 600_000),
  );
});
