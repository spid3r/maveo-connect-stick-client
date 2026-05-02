import type { MaveoAuthConfig } from "../auth/maveoAuthConfig.js";
import { MaveoCognitoAuthClient } from "../auth/maveoCognitoAuthClient.js";
import { isMaveoSessionCredentialsNearExpiry } from "../auth/sessionExpiry.js";
import type { MaveoSession } from "../auth/types.js";
import type { MaveoLibraryConfig } from "../config/env.js";
import { loadMaveoLibraryConfigFromEnv } from "../config/env.js";
import { loadBlueFiRspPollIntervalMsFromEnv } from "../config/mqttSessionEnv.js";
import { resolveMaveoStickSerialFromEnv, tryResolveMaveoStickSerialFromEnv } from "../config/stickSerial.js";
import {
  type GarageDoorCommand,
  maveoStickRspTopic,
  parseBlueFiJsonObject,
} from "../iot/maveoBlueFiMqttProtocol.js";
import {
  type MaveoDoorPosition,
  type MaveoStickStateUpdate,
  MAVEO_STOA_L_R,
  MAVEO_STOA_S,
  extractMaveoStickState,
  parseMaveoDoorPosition,
  parseMaveoLightOn,
  rawBlueFiMessageHasDoorOrLightKeys,
} from "../iot/maveoBlueFiState.js";
import {
  MaveoMqttIotClient,
  type MaveoMqttIotClientOptions,
  type MqttSessionLostEvent,
} from "../iot/maveoMqttIotClient.js";
import { waitForBlueFiRspObject } from "../iot/waitForBlueFiRsp.js";
import {
  listMaveoThings,
  type ListMaveoThingsOptions,
  type MaveoThingSummary,
} from "../garage/maveoIotThings.js";

function authSlice(cfg: MaveoLibraryConfig): MaveoAuthConfig {
  return {
    cognitoIdentityPoolId: cfg.cognitoIdentityPoolId,
    cognitoClientId: cfg.cognitoClientId,
    region: cfg.region,
    iotHostname: cfg.iotHostname,
  };
}

export type MaveoConnectStickClientOptions = {
  mqtt?: MaveoMqttIotClientOptions;
  /** Default for {@link getDoorPosition} / {@link getLightOn} when `timeoutMs` is omitted. */
  blueFiReadTimeoutMs?: number;
  /**
   * How often {@link getDoorPosition} / {@link getLightOn} poll {@link MaveoMqttIotClient.isConnected} while waiting (ms).
   * {@link createMaveoConnectStickClientFromEnv} also reads `MAVEO_BLUEFI_RSP_POLL_MS` when this is omitted.
   * @default 400
   */
  blueFiRspPollIntervalMs?: number;
};

/** Reported by {@link MaveoConnectStickClient.getMqttTransportState}. */
export type MqttTransportState = "connected" | "disconnected" | "reclaiming";

export type ReclaimMqttSessionOptions = {
  /** @default 5 */
  maxAttempts?: number;
  /** @default 1500 */
  delayMsBetweenAttempts?: number;
  stickId?: string;
  /** Force Cognito `login()` before each reconnect attempt (default: only near expiry, same as {@link recoverMqttSession}). */
  refreshCredentials?: boolean;
};

/** Coexistence with the official app: after this many **remote** kicks inside {@link MqttSessionContentionPolicy.burstWindowMs}, pause auto-reclaim for {@link MqttSessionContentionPolicy.backoffAfterBurstMs}. Manual {@link recoverMqttSession} still works. */
export type MqttSessionContentionPolicy = {
  /** Rolling window for counting remote session losses. @default 10000 */
  burstWindowMs?: number;
  /** Remote losses in the window that trigger backoff. @default 3 */
  burstThreshold?: number;
  /** How long auto-reclaim stays off after a burst (ms). @default 120000 */
  backoffAfterBurstMs?: number;
};

/** Passed to {@link AutomaticMqttReclaimOptions.onSessionContentionBurst} / `onSessionContentionSkipped` (resolved policy + wall time). */
export type MqttSessionContentionBackoffInfo = {
  backoffUntilMs: number;
  burstWindowMs: number;
  burstThreshold: number;
  backoffAfterBurstMs: number;
};

const DEFAULT_SESSION_CONTENTION: Required<MqttSessionContentionPolicy> = {
  burstWindowMs: 10_000,
  burstThreshold: 3,
  backoffAfterBurstMs: 120_000,
};

function resolveSessionContentionPolicy(
  v: boolean | MqttSessionContentionPolicy | undefined,
): Required<MqttSessionContentionPolicy> | undefined {
  if (v === undefined || v === false) return undefined;
  if (v === true) return { ...DEFAULT_SESSION_CONTENTION };
  return {
    burstWindowMs: v.burstWindowMs ?? DEFAULT_SESSION_CONTENTION.burstWindowMs,
    burstThreshold: v.burstThreshold ?? DEFAULT_SESSION_CONTENTION.burstThreshold,
    backoffAfterBurstMs:
      v.backoffAfterBurstMs ?? DEFAULT_SESSION_CONTENTION.backoffAfterBurstMs,
  };
}

export type AutomaticMqttReclaimOptions = ReclaimMqttSessionOptions & {
  /**
   * `true` = defaults (3 kicks / 10s → 2 min auto-reclaim pause). Lets the app keep MQTT while your plugin backs off.
   * Manual {@link recoverMqttSession} ignores backoff and clears burst state (use for a “Reconnect” button).
   */
  sessionContention?: boolean | MqttSessionContentionPolicy;
  onStateChange?: (state: MqttTransportState) => void;
  onRecovered?: () => void;
  onReclaimExhausted?: (lastError: unknown) => void;
  /** Fired when a burst just triggered backoff (log / UI). */
  onSessionContentionBurst?: (info: MqttSessionContentionBackoffInfo) => void;
  /** Fired on each remote loss while still inside a backoff window (optional; can be noisy). */
  onSessionContentionSkipped?: (info: MqttSessionContentionBackoffInfo) => void;
};

/**
 * Unified stream for UIs / LoxBerry plugins. Subscribe with {@link MaveoConnectStickClient.onMaveoLifecycle}.
 * Also enable {@link MaveoConnectStickClient.enableAutomaticMqttReclaim} for contention + auto-reclaim events.
 */
export type MaveoConnectStickLifecycleEvent =
  | { kind: "stick_state"; update: MaveoStickStateUpdate }
  | { kind: "mqtt_session_lost"; event: MqttSessionLostEvent }
  | { kind: "mqtt_connection_lost" }
  | { kind: "transport_state"; state: MqttTransportState }
  | { kind: "automatic_reclaim_recovered" }
  | { kind: "automatic_reclaim_exhausted"; lastError?: unknown }
  | { kind: "session_contention_burst"; info: MqttSessionContentionBackoffInfo }
  | { kind: "session_contention_skipped"; info: MqttSessionContentionBackoffInfo }
  | { kind: "manual_recover_started" }
  | { kind: "manual_recover_finished"; ok: true }
  | { kind: "manual_recover_finished"; ok: false; error: unknown };

function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * High-level facade: Cognito login + MQTT to your Connect Stick using `MAVEO_THING_NAME` / `MAVEO_MQTT_CLIENT_ID`.
 */
export class MaveoConnectStickClient {
  readonly mqtt: MaveoMqttIotClient;
  private readonly auth: MaveoCognitoAuthClient;
  private readonly cfg: MaveoLibraryConfig;
  private readonly blueFiReadTimeoutMs: number;
  private readonly blueFiRspPollIntervalMs: number;
  private session: MaveoSession | undefined;
  private mqttTransportState: MqttTransportState = "disconnected";
  private automaticReclaimUnsub: (() => void) | undefined;
  private autoReclaimInFlight = false;
  /** Serializes {@link recoverMqttSession} and {@link reclaimMqttSessionWithRetries} so concurrent reconnects don’t fight each other. */
  private recoveryTail: Promise<void> = Promise.resolve();
  private remoteKickTimestamps: number[] = [];
  private autoReclaimBackoffUntilMs = 0;
  /** After a contention burst we pause reclaim; when backoff ends the connection is often already down, so no new `onMqttSessionLost` fires — this timer performs one reclaim attempt. */
  private autoReclaimResumeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly lifecycleListeners = new Set<(e: MaveoConnectStickLifecycleEvent) => void>();
  private lifecycleBridgeUnsubs: Array<() => void> = [];
  private lifecycleBridgeActive = false;

  constructor(libraryConfig: MaveoLibraryConfig, options?: MaveoConnectStickClientOptions) {
    this.cfg = libraryConfig;
    this.auth = new MaveoCognitoAuthClient({ authConfig: authSlice(libraryConfig) });
    this.mqtt = new MaveoMqttIotClient(options?.mqtt);
    this.blueFiReadTimeoutMs = options?.blueFiReadTimeoutMs ?? 10_000;
    this.blueFiRspPollIntervalMs = options?.blueFiRspPollIntervalMs ?? 400;
  }

  /** Stick serial from env (`MAVEO_MQTT_CLIENT_ID` or `MAVEO_THING_NAME`). */
  stickSerial(env: NodeJS.ProcessEnv = process.env): string {
    return resolveMaveoStickSerialFromEnv(env);
  }

  /** Same as {@link stickSerial} when set; otherwise `undefined`. */
  tryStickSerial(env: NodeJS.ProcessEnv = process.env): string | undefined {
    return tryResolveMaveoStickSerialFromEnv(env);
  }

  async login(): Promise<MaveoSession> {
    this.session = await this.auth.loginWithPassword(this.cfg.email, this.cfg.password);
    return this.session;
  }

  requireSession(): MaveoSession {
    if (!this.session) {
      throw new Error("MaveoConnectStickClient: call login() before connectMqtt() or commands.");
    }
    return this.session;
  }

  get sessionSnapshot(): MaveoSession | undefined {
    return this.session;
  }

  /**
   * AWS IoT `ListThings` for this account session — **no stick serial (`MAVEO_THING_NAME`) required yet**.
   * Typical account has one garage stick; callers can offer a picker when several names are returned.
   */
  async listThings(options?: ListMaveoThingsOptions): Promise<MaveoThingSummary[]> {
    const sess = this.sessionSnapshot ?? (await this.login());
    return listMaveoThings(sess, options);
  }

  private enqueueRecovery<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.recoveryTail.then(fn);
    this.recoveryTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  /** Clears burst counter and auto-reclaim backoff (also called when {@link recoverMqttSession} runs with default options). */
  clearSessionContentionState(): void {
    this.remoteKickTimestamps = [];
    this.autoReclaimBackoffUntilMs = 0;
  }

  private pruneRemoteKicks(now: number, windowMs: number): void {
    const cut = now - windowMs;
    this.remoteKickTimestamps = this.remoteKickTimestamps.filter((t) => t >= cut);
  }

  /** Wall time (ms) until automatic reclaim resumes after a contention burst; `0` if not in backoff. */
  getAutoReclaimBackoffUntilMs(): number {
    return this.autoReclaimBackoffUntilMs;
  }

  private clearAutoReclaimResumeTimer(): void {
    if (this.autoReclaimResumeTimer !== undefined) {
      clearTimeout(this.autoReclaimResumeTimer);
      this.autoReclaimResumeTimer = undefined;
    }
  }

  /** Shared by `onMqttSessionLost` and the post-burst backoff timer. */
  private tryStartAutomaticMqttReclaimBatch(options?: AutomaticMqttReclaimOptions): void {
    if (this.autoReclaimInFlight) return;
    this.autoReclaimInFlight = true;
    void (async () => {
      try {
        options?.onStateChange?.("reclaiming");
        const r = await this.reclaimMqttSessionWithRetries(options);
        options?.onStateChange?.(r.ok ? "connected" : "disconnected");
        if (r.ok) {
          if (this.isMqttConnected()) {
            try {
              options?.onRecovered?.();
            } catch {
              /* listener must not break reclaim */
            }
            this.emitLifecycle({ kind: "automatic_reclaim_recovered" });
          }
        } else {
          options?.onReclaimExhausted?.(r.lastError);
          this.emitLifecycle({ kind: "automatic_reclaim_exhausted", lastError: r.lastError });
        }
      } finally {
        this.autoReclaimInFlight = false;
      }
    })();
  }

  private setMqttTransportState(next: MqttTransportState): void {
    if (this.mqttTransportState === next) return;
    this.mqttTransportState = next;
    this.emitLifecycle({ kind: "transport_state", state: next });
  }

  private emitLifecycle(event: MaveoConnectStickLifecycleEvent): void {
    if (this.lifecycleListeners.size === 0) return;
    for (const h of [...this.lifecycleListeners]) {
      try {
        h(event);
      } catch {
        /* subscriber errors must not break the client */
      }
    }
  }

  /**
   * Single registration point for plugin / UI wiring: door & light pushes, MQTT loss, transport state,
   * manual {@link recoverMqttSession} outcomes, and (when {@link enableAutomaticMqttReclaim} is active)
   * contention backoff + auto-reclaim success/failure.
   *
   * Bridges are installed on first subscriber and removed when the last subscriber unsubscribes.
   * You can still use {@link onStickState} / {@link onMqttSessionLost} separately; those are independent.
   */
  onMaveoLifecycle(handler: (event: MaveoConnectStickLifecycleEvent) => void): () => void {
    this.lifecycleListeners.add(handler);
    if (!this.lifecycleBridgeActive) {
      this.lifecycleBridgeActive = true;
      this.lifecycleBridgeUnsubs = [
        this.onStickState((update) => this.emitLifecycle({ kind: "stick_state", update })),
        this.onMqttConnectionLost(() => this.emitLifecycle({ kind: "mqtt_connection_lost" })),
        this.onMqttSessionLost((event) => this.emitLifecycle({ kind: "mqtt_session_lost", event })),
      ];
    }
    return () => {
      this.lifecycleListeners.delete(handler);
      if (this.lifecycleListeners.size === 0) {
        for (const u of this.lifecycleBridgeUnsubs) u();
        this.lifecycleBridgeUnsubs = [];
        this.lifecycleBridgeActive = false;
      }
    };
  }

  async connectMqtt(): Promise<void> {
    try {
      await this.mqtt.connect(this.requireSession());
      this.setMqttTransportState("connected");
    } catch (e) {
      this.setMqttTransportState("disconnected");
      throw e;
    }
  }

  async disconnectMqtt(): Promise<void> {
    this.disableAutomaticMqttReclaim();
    await this.mqtt.disconnect();
    this.setMqttTransportState("disconnected");
  }

  /**
   * Drops MQTT and opens a new WSS connection using the current {@link MaveoSession}.
   * If the session is old, call {@link login} first (or use {@link isMaveoSessionCredentialsNearExpiry}) so SigV4 headers stay valid.
   */
  async reconnectMqtt(): Promise<void> {
    await this.mqtt.disconnect();
    await this.mqtt.connect(this.requireSession());
    this.setMqttTransportState("connected");
  }

  /**
   * High-level MQTT lifecycle for UIs/plugins: `reclaiming` while {@link reclaimMqttSessionWithRetries} runs.
   * Prefer this over raw {@link isMqttConnected} when you show status during automatic reclaim.
   */
  getMqttTransportState(): MqttTransportState {
    return this.mqttTransportState;
  }

  /** Last {@link MqttSessionLostEvent} from the transport (local vs remote), with wall time. */
  getLastMqttSessionLoss(): { event: MqttSessionLostEvent; atMs: number } | undefined {
    return this.mqtt.getLastSessionLoss();
  }

  /** Whether the MQTT transport is up (use after {@link connectMqtt}). */
  isMqttConnected(): boolean {
    return this.mqtt.isConnected();
  }

  /**
   * Same `clientId` the broker sees while connected — usually the stick serial; **only one** such session should be online
   * (the Maveo app and this client compete; the last connect wins).
   */
  getMqttClientId(): string | undefined {
    return this.mqtt.getMqttClientId();
  }

  /**
   * After an unexpected drop ({@link onMqttConnectionLost}), refresh credentials if needed, reconnect, and re-subscribe `…/rsp`.
   * **Re-attach** {@link onStickState} / {@link onMqttMessage} afterward — listeners were on the old socket.
   * Queued behind other recovery work; clears {@link clearSessionContentionState} by default (manual “Reconnect”).
   */
  async recoverMqttSession(options?: {
    /** Force `login()` even if expiry is not near (default: only when near expiry). */
    refreshCredentials?: boolean;
    stickId?: string;
    /**
     * When true (default), reset session-contention backoff / burst counter — use for an explicit UI “Reconnect”.
     * Use **`false`** for background / idle reconnect loops so remote-kick history is kept and
     * {@link enableAutomaticMqttReclaim} can still detect a session-contention burst after repeated app takeovers.
     */
    resetSessionContention?: boolean;
  }): Promise<void> {
    if (options?.resetSessionContention !== false) {
      this.clearSessionContentionState();
    }
    const softContention =
      options?.resetSessionContention === false
        ? { resetContentionOnSuccess: false as const }
        : {};
    await this.enqueueRecovery(async () => {
      this.emitLifecycle({ kind: "manual_recover_started" });
      try {
        await this.recoverMqttSessionCore({
          refreshCredentials: options?.refreshCredentials,
          stickId: options?.stickId,
          ...softContention,
        });
        this.emitLifecycle({ kind: "manual_recover_finished", ok: true });
      } catch (e) {
        this.emitLifecycle({ kind: "manual_recover_finished", ok: false, error: e });
        throw e;
      }
    });
  }

  private async recoverMqttSessionCore(options?: {
    refreshCredentials?: boolean;
    stickId?: string;
    /**
     * Default true: successful reconnect clears burst + backoff (manual {@link recoverMqttSession}).
     * Auto-reclaim / soft recover pass `false`: do **not** clear contention state or the in-memory kick
     * timestamps — kicks are pruned only by the rolling burst window on each new loss,
     * so “app took MQTT three times in 10s” can still be detected after intervening reconnect wins.
     */
    resetContentionOnSuccess?: boolean;
  }): Promise<void> {
    try {
      const sess = this.requireSession();
      const refresh =
        options?.refreshCredentials === true || isMaveoSessionCredentialsNearExpiry(sess, 120_000);
      if (refresh) {
        await this.login();
      }
      await this.reconnectMqtt();
      await this.subscribeBlueFiResponses(options?.stickId);
      this.setMqttTransportState("connected");
      if (options?.resetContentionOnSuccess !== false) {
        this.clearSessionContentionState();
      }
    } catch (e) {
      this.setMqttTransportState(this.isMqttConnected() ? "connected" : "disconnected");
      throw e;
    }
  }

  /**
   * Try {@link recoverMqttSessionCore} up to `maxAttempts` times with pauses between attempts — useful when
   * competing with the Maveo app for the same MQTT `clientId` (last `CONNECT` wins).
   * Serialized with other recovery; does **not** reset session-contention state on each attempt.
   */
  async reclaimMqttSessionWithRetries(
    options?: ReclaimMqttSessionOptions,
  ): Promise<{ ok: boolean; lastError?: unknown }> {
    return this.enqueueRecovery(async () => {
      const maxAttempts = options?.maxAttempts ?? 5;
      const delayMs = options?.delayMsBetweenAttempts ?? 1500;
      this.setMqttTransportState("reclaiming");
      let lastErr: unknown;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await this.recoverMqttSessionCore({
            stickId: options?.stickId,
            refreshCredentials: options?.refreshCredentials === true,
            resetContentionOnSuccess: false,
          });
          if (this.isMqttConnected()) {
            this.setMqttTransportState("connected");
            return { ok: true };
          }
        } catch (e) {
          lastErr = e;
        }
        if (attempt < maxAttempts) await sleepMs(delayMs);
      }
      this.setMqttTransportState("disconnected");
      return { ok: false, lastError: lastErr };
    });
  }

  /**
   * On **remote** session loss ({@link MqttSessionLostEvent.suspectedRemoteSessionTakeover}), run {@link reclaimMqttSessionWithRetries}
   * unless {@link AutomaticMqttReclaimOptions.sessionContention} says we are in backoff or just hit a burst.
   * After a **burst**, reclaim stays off for {@link MqttSessionContentionPolicy.backoffAfterBurstMs}; when that elapses,
   * one reclaim attempt runs **even if no new disconnect event occurs** (you were already offline).
   * Re-bind {@link onStickState} in `onRecovered`. Call {@link disableAutomaticMqttReclaim} or `disconnectMqtt` to stop.
   */
  enableAutomaticMqttReclaim(options?: AutomaticMqttReclaimOptions): () => void {
    this.disableAutomaticMqttReclaim();
    const contention = resolveSessionContentionPolicy(options?.sessionContention);
    const un = this.mqtt.onMqttSessionLost((ev) => {
      if (ev.intentionalDisconnect) return;
      const now = Date.now();
      if (contention && now < this.autoReclaimBackoffUntilMs) {
        const skipInfo: MqttSessionContentionBackoffInfo = {
          backoffUntilMs: this.autoReclaimBackoffUntilMs,
          burstWindowMs: contention.burstWindowMs,
          burstThreshold: contention.burstThreshold,
          backoffAfterBurstMs: contention.backoffAfterBurstMs,
        };
        options?.onSessionContentionSkipped?.(skipInfo);
        this.emitLifecycle({ kind: "session_contention_skipped", info: skipInfo });
        return;
      }
      /**
       * Count **every** remote kick toward the burst window **before** the `autoReclaimInFlight` gate.
       * Otherwise kicks that arrive while a reclaim is already running were dropped and “3 app reconnects”
       * never registered as a burst.
       */
      if (contention) {
        this.remoteKickTimestamps.push(now);
        this.pruneRemoteKicks(now, contention.burstWindowMs);
        if (this.remoteKickTimestamps.length >= contention.burstThreshold) {
          this.autoReclaimBackoffUntilMs = now + contention.backoffAfterBurstMs;
          this.remoteKickTimestamps = [];
          const burstInfo: MqttSessionContentionBackoffInfo = {
            backoffUntilMs: this.autoReclaimBackoffUntilMs,
            burstWindowMs: contention.burstWindowMs,
            burstThreshold: contention.burstThreshold,
            backoffAfterBurstMs: contention.backoffAfterBurstMs,
          };
          options?.onSessionContentionBurst?.(burstInfo);
          this.emitLifecycle({ kind: "session_contention_burst", info: burstInfo });
          this.clearAutoReclaimResumeTimer();
          const delayMs = contention.backoffAfterBurstMs;
          this.autoReclaimResumeTimer = setTimeout(() => {
            this.autoReclaimResumeTimer = undefined;
            if (!this.isMqttConnected()) {
              this.tryStartAutomaticMqttReclaimBatch(options);
            }
          }, delayMs);
          return;
        }
      }
      if (this.autoReclaimInFlight) return;
      this.tryStartAutomaticMqttReclaimBatch(options);
    });
    this.automaticReclaimUnsub = un;
    return () => this.disableAutomaticMqttReclaim();
  }

  disableAutomaticMqttReclaim(): void {
    this.clearAutoReclaimResumeTimer();
    this.automaticReclaimUnsub?.();
    this.automaticReclaimUnsub = undefined;
  }

  async subscribeBlueFiResponses(stickId?: string): Promise<void> {
    await this.mqtt.subscribeBlueFiResponses(stickId ?? this.stickSerial());
  }

  onMqttMessage(handler: (topic: string, payload: Buffer) => void): () => void {
    return this.mqtt.onMessage(handler);
  }

  /**
   * MQTT `close` (same semantics as {@link MaveoMqttIotClient.onDisconnect}).
   * Prefer {@link onMqttConnectionLost} to also see `offline`.
   */
  onMqttDisconnect(handler: () => void): () => void {
    return this.mqtt.onDisconnect(handler);
  }

  /**
   * Unexpected transport loss only (not {@link disconnectMqtt} / internal reconnect). Same as {@link MaveoMqttIotClient.onConnectionLost}.
   * For cause details, use {@link onMqttSessionLost}.
   */
  onMqttConnectionLost(handler: () => void): () => void {
    return this.mqtt.onConnectionLost(handler);
  }

  /** Full {@link MqttSessionLostEvent} for every disconnect wave (local and remote). */
  onMqttSessionLost(handler: (event: MqttSessionLostEvent) => void): () => void {
    return this.mqtt.onMqttSessionLost(handler);
  }

  /**
   * Subscribe to door/light-related `…/rsp` messages (`StoA_s`, `StoA_l_r`).
   * Call after {@link connectMqtt} and {@link subscribeBlueFiResponses}. Returns unsubscribe.
   */
  onStickState(handler: (update: MaveoStickStateUpdate) => void, stickId?: string): () => void {
    const id = stickId ?? this.stickSerial();
    const rsp = maveoStickRspTopic(id);
    return this.mqtt.onMessage((topic, payload) => {
      if (topic !== rsp) return;
      try {
        const raw = parseBlueFiJsonObject(payload);
        if (!rawBlueFiMessageHasDoorOrLightKeys(raw)) return;
        handler(extractMaveoStickState(raw));
      } catch {
        /* ignore */
      }
    });
  }

  /** Publish `{"AtoS_s":0}` to refresh door position (response on `…/rsp`). */
  async requestDoorStatus(stickId?: string): Promise<void> {
    await this.mqtt.publishDoorStatusRead(stickId ?? this.stickSerial());
  }

  /** Publish `{"AtoS_l_r":0}` to refresh light state (response on `…/rsp`). */
  async requestLightState(stickId?: string): Promise<void> {
    await this.mqtt.publishLightStateRead(stickId ?? this.stickSerial());
  }

  /**
   * Ask for door status and wait for the next `StoA_s` on `…/rsp`.
   * Requires an active subscription on `…/rsp` (see {@link subscribeBlueFiResponses}).
   */
  async getDoorPosition(options?: { timeoutMs?: number; stickId?: string }): Promise<MaveoDoorPosition> {
    const stickId = options?.stickId ?? this.stickSerial();
    const rsp = maveoStickRspTopic(stickId);
    const timeoutMs = options?.timeoutMs ?? this.blueFiReadTimeoutMs;
    const pending = waitForBlueFiRspObject(
      this.mqtt,
      rsp,
      (o) => Object.prototype.hasOwnProperty.call(o, MAVEO_STOA_S),
      timeoutMs,
      {
        isConnected: () => this.mqtt.isConnected(),
        intervalMs: this.blueFiRspPollIntervalMs,
      },
    );
    await this.mqtt.publishDoorStatusRead(stickId);
    const o = await pending;
    return parseMaveoDoorPosition(o[MAVEO_STOA_S]);
  }

  /**
   * Ask for light readback and wait for the next `StoA_l_r` on `…/rsp`.
   * Requires an active subscription on `…/rsp`.
   */
  async getLightOn(options?: { timeoutMs?: number; stickId?: string }): Promise<boolean> {
    const stickId = options?.stickId ?? this.stickSerial();
    const rsp = maveoStickRspTopic(stickId);
    const timeoutMs = options?.timeoutMs ?? this.blueFiReadTimeoutMs;
    const pending = waitForBlueFiRspObject(
      this.mqtt,
      rsp,
      (o) => Object.prototype.hasOwnProperty.call(o, MAVEO_STOA_L_R),
      timeoutMs,
      {
        isConnected: () => this.mqtt.isConnected(),
        intervalMs: this.blueFiRspPollIntervalMs,
      },
    );
    await this.mqtt.publishLightStateRead(stickId);
    const o = await pending;
    const on = parseMaveoLightOn(o[MAVEO_STOA_L_R]);
    if (on === undefined) {
      throw new Error("BlueFi: StoA_l_r was present but could not be parsed as boolean");
    }
    return on;
  }

  async publishGarageDoor(command: GarageDoorCommand, stickId?: string): Promise<void> {
    await this.mqtt.publishGarageDoorCommand(stickId ?? this.stickSerial(), command);
  }

  async publishLight(on: boolean, stickId?: string): Promise<void> {
    await this.mqtt.publishLightCommand(stickId ?? this.stickSerial(), on);
  }
}

export function createMaveoConnectStickClientFromEnv(
  env?: NodeJS.ProcessEnv,
  options?: MaveoConnectStickClientOptions,
): MaveoConnectStickClient {
  const e = env ?? process.env;
  const cfg = loadMaveoLibraryConfigFromEnv(e);
  const blueFiRspPollIntervalMs =
    options?.blueFiRspPollIntervalMs ?? loadBlueFiRspPollIntervalMsFromEnv(e);
  return new MaveoConnectStickClient(cfg, { ...options, blueFiRspPollIntervalMs });
}
