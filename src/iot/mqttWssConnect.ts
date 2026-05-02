import { Sha256 } from "@aws-crypto/sha256-js";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";
import type { MaveoSession } from "../auth/types.js";

/** How to authenticate the MQTT-over-WebSocket HTTP upgrade (header SigV4, AWS service `iotdata` — Marantec / AWS IoT WSS pattern). */
export type MqttWssSigning = "headers" | "query";

function httpRequestToWssUrl(req: { hostname: string; path?: string; query?: Record<string, unknown> }): string {
  const q = req.query ?? {};
  const parts: string[] = [];
  for (const key of Object.keys(q).sort()) {
    const val = q[key];
    if (val === undefined || val === null) continue;
    const values = Array.isArray(val) ? val : [val];
    for (const v of values) {
      if (v == null) continue;
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  const qs = parts.length ? `?${parts.join("&")}` : "";
  return `wss://${req.hostname}${req.path ?? "/mqtt"}${qs}`;
}

function headersToRecord(headers: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined || v === null) continue;
    out[k] = Array.isArray(v) ? String(v[0]) : String(v);
  }
  return out;
}

function signingFromEnv(env: NodeJS.ProcessEnv): MqttWssSigning | undefined {
  const v = env.MAVEO_MQTT_WSS_SIGNING?.trim().toLowerCase();
  if (v === "query" || v === "headers") return v;
  return undefined;
}

export type BuildMqttWssConnectParamsOptions = {
  /** Default: `headers` (Maveo Qt / `iotdata` + `Authorization`). Override with `MAVEO_MQTT_WSS_SIGNING=query`. */
  signing?: MqttWssSigning;
  /** Presigned query mode only. */
  expiresInSeconds?: number;
  handshakeTimeoutMs?: number;
};

/**
 * Build `mqtt.connect(url, { wsOptions })` parameters for Marantec IoT WSS `/mqtt`.
 *
 * **headers** (default): SigV4 **`Authorization`** + `x-amz-*` on the WebSocket upgrade, service **`iotdata`**,
 * `Host: <hostname>:443` — matches `BlueFiController::initiateConnection` + `SigV4Utils::signRequest` in the app binary.
 *
 * **query**: Legacy AWS-style presigned URL, service **`iotdevicegateway`** (no extra ws headers).
 */
export async function buildMqttWssConnectParams(
  session: MaveoSession,
  options?: BuildMqttWssConnectParamsOptions,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{
  url: string;
  wsOptions: { handshakeTimeout?: number; headers?: Record<string, string> };
  signing: MqttWssSigning;
}> {
  const signing = options?.signing ?? signingFromEnv(env) ?? "headers";
  const handshakeTimeout = options?.handshakeTimeoutMs ?? 20_000;
  const { region, iotHostname, accessKeyId, secretAccessKey, sessionToken } = session;
  const credentials = { accessKeyId, secretAccessKey, sessionToken };

  if (signing === "query") {
    const signer = new SignatureV4({
      service: "iotdevicegateway",
      region,
      credentials,
      sha256: Sha256,
      applyChecksum: false,
    });
    const request = new HttpRequest({
      method: "GET",
      protocol: "https:",
      hostname: iotHostname,
      path: "/mqtt",
      headers: {
        host: iotHostname,
      },
    });
    const signed = await signer.presign(request, {
      expiresIn: options?.expiresInSeconds ?? 900,
    });
    return {
      url: httpRequestToWssUrl(signed),
      wsOptions: { handshakeTimeout },
      signing: "query",
    };
  }

  const signer = new SignatureV4({
    service: "iotdata",
    region,
    credentials,
    sha256: Sha256,
    applyChecksum: false,
  });
  const hostHeader = `${iotHostname}:443`;
  const request = new HttpRequest({
    method: "GET",
    protocol: "https:",
    hostname: iotHostname,
    path: "/mqtt",
    headers: {
      host: hostHeader,
    },
  });
  const signed = await signer.sign(request);
  return {
    url: `wss://${iotHostname}:443/mqtt`,
    wsOptions: {
      handshakeTimeout,
      headers: headersToRecord(signed.headers as Record<string, unknown>),
    },
    signing: "headers",
  };
}

