import type {
  AutomaticMqttReclaimOptions,
  MqttSessionContentionPolicy,
} from "../client/maveoConnectStickClient.js";

function parseOptionalInt(
  raw: string | undefined,
  opts: { min: number; max?: number; integer?: boolean },
): number | undefined {
  if (raw === undefined || !raw.trim()) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  const v = opts.integer !== false ? Math.trunc(n) : n;
  if (v < opts.min) return undefined;
  if (opts.max !== undefined && v > opts.max) return undefined;
  return v;
}

/**
 * Read session-contention settings from env (LoxBerry / CLI). See README “MQTT session lifecycle”.
 *
 * - `MAVEO_MQTT_SESSION_CONTENTION=0|false` → disable (explicit).
 * - `MAVEO_MQTT_SESSION_CONTENTION=1|true` or any `MAVEO_MQTT_CONTENTION_*` set → enable (object or `true`).
 */
export function loadMqttSessionContentionFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): boolean | MqttSessionContentionPolicy | undefined {
  const flag = env.MAVEO_MQTT_SESSION_CONTENTION?.trim().toLowerCase();
  if (flag === "0" || flag === "false" || flag === "off" || flag === "no") {
    return false;
  }
  const policy: MqttSessionContentionPolicy = {};
  const burstWindowMs = parseOptionalInt(env.MAVEO_MQTT_CONTENTION_BURST_WINDOW_MS, {
    min: 1000,
    max: 3_600_000,
  });
  const burstThreshold = parseOptionalInt(env.MAVEO_MQTT_CONTENTION_BURST_THRESHOLD, {
    min: 1,
    max: 100,
  });
  const backoffAfterBurstMs = parseOptionalInt(env.MAVEO_MQTT_CONTENTION_BACKOFF_MS, {
    min: 5000,
    max: 24 * 60 * 60_000,
  });
  if (burstWindowMs !== undefined) policy.burstWindowMs = burstWindowMs;
  if (burstThreshold !== undefined) policy.burstThreshold = burstThreshold;
  if (backoffAfterBurstMs !== undefined) policy.backoffAfterBurstMs = backoffAfterBurstMs;

  const hasPolicyKeys = Object.keys(policy).length > 0;
  if (flag === "1" || flag === "true" || flag === "on" || flag === "yes") {
    return hasPolicyKeys ? policy : true;
  }
  if (hasPolicyKeys) return policy;
  return undefined;
}

/** `maxAttempts` / `delayMsBetweenAttempts` for reclaim (env defaults only where set). */
export function loadMqttReclaimRetryOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Pick<AutomaticMqttReclaimOptions, "maxAttempts" | "delayMsBetweenAttempts"> {
  const out: Pick<AutomaticMqttReclaimOptions, "maxAttempts" | "delayMsBetweenAttempts"> = {};
  const maxAttempts = parseOptionalInt(env.MAVEO_MQTT_RECLAIM_MAX_ATTEMPTS, { min: 1, max: 50 });
  const delayMsBetweenAttempts = parseOptionalInt(env.MAVEO_MQTT_RECLAIM_DELAY_MS, {
    min: 0,
    max: 300_000,
  });
  if (maxAttempts !== undefined) out.maxAttempts = maxAttempts;
  if (delayMsBetweenAttempts !== undefined) out.delayMsBetweenAttempts = delayMsBetweenAttempts;
  return out;
}

/**
 * Combine env + explicit `sessionContention`.
 * When code passes `sessionContention: true` (library defaults), env **policy fields** such as
 * `MAVEO_MQTT_CONTENTION_BACKOFF_MS` must still apply — otherwise `true` would erase `{ backoffAfterBurstMs: … }` from env.
 */
function mergeSessionContention(
  fromEnv: boolean | MqttSessionContentionPolicy | undefined,
  explicit: boolean | MqttSessionContentionPolicy | undefined,
): boolean | MqttSessionContentionPolicy | undefined {
  if (explicit === undefined) return fromEnv;
  if (explicit === false) return false;
  if (typeof explicit === "object") {
    if (fromEnv && typeof fromEnv === "object") {
      return { ...fromEnv, ...explicit };
    }
    return explicit;
  }
  // explicit === true
  if (fromEnv === false) return true;
  if (fromEnv && typeof fromEnv === "object") {
    return { ...fromEnv };
  }
  return true;
}

/**
 * Merge **env** reclaim/contention defaults with **explicit** options (explicit wins).
 * Use when wiring `enableAutomaticMqttReclaim` in a plugin without duplicating numbers.
 */
export function mergeAutomaticMqttReclaimOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: AutomaticMqttReclaimOptions,
): AutomaticMqttReclaimOptions {
  const fromEnv: AutomaticMqttReclaimOptions = {
    ...loadMqttReclaimRetryOptionsFromEnv(env),
  };
  const contention = loadMqttSessionContentionFromEnv(env);
  if (contention !== undefined) {
    fromEnv.sessionContention = contention;
  }
  if (!explicit) return fromEnv;
  return {
    ...fromEnv,
    ...explicit,
    sessionContention: mergeSessionContention(fromEnv.sessionContention, explicit.sessionContention),
  };
}

/** Poll interval for `getDoorPosition` / `getLightOn` disconnect detection (ms). */
export function loadBlueFiRspPollIntervalMsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fallback = 400,
): number {
  const v = parseOptionalInt(env.MAVEO_BLUEFI_RSP_POLL_MS, { min: 100, max: 30_000 });
  return v ?? fallback;
}
