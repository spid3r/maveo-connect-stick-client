import {
  DescribeThingCommand,
  IoTClient,
  ListPrincipalThingsCommand,
  ListThingsCommand,
} from "@aws-sdk/client-iot";
import type { MaveoSession } from "../auth/types.js";

export type MaveoThingSummary = {
  thingName: string;
  /** AWS thing attributes (e.g. country, version) */
  attributes: Record<string, string>;
};

function sessionCredentials(session: MaveoSession) {
  return {
    accessKeyId: session.accessKeyId,
    secretAccessKey: session.secretAccessKey,
    sessionToken: session.sessionToken,
  };
}

function iotClientForSession(session: MaveoSession): IoTClient {
  return new IoTClient({
    region: session.region,
    credentials: sessionCredentials(session),
  });
}

/**
 * Returns the Connect Stick serials (= AWS IoT thing names) that are **attached
 * to the current Cognito identity** — i.e. the sticks this user actually owns.
 *
 * Uses `iot:ListPrincipalThings` with the session's `identityId` as the principal,
 * which keeps the result scoped to the calling user. This is the right call to
 * power UI like a LoxBerry / Home Assistant "select your stick" dropdown.
 *
 * Pagination is followed transparently. In practice the result is 1–N items,
 * where N is the number of sticks the user has registered in the official app.
 */
export async function listMaveoConnectSticks(session: MaveoSession): Promise<string[]> {
  const client = iotClientForSession(session);
  const out: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.send(
      new ListPrincipalThingsCommand({
        principal: session.identityId,
        maxResults: 100,
        nextToken,
      }),
    );
    for (const name of page.things ?? []) {
      if (typeof name === "string" && name.length > 0) out.push(name);
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return out;
}

export type ListMaveoThingsOptions = {
  /** Stop after N things (useful when the account lists many devices). */
  maxThings?: number;
};

/**
 * Calls account-wide `iot:ListThings` with the federated Cognito credentials and
 * returns each thing's name plus its AWS thing attributes. Pagination is followed
 * transparently (capped via `maxThings`).
 *
 * Whether the result is meaningful for *"show me my devices"* depends entirely on
 * how the upstream IoT account scopes `iot:ListThings` for the calling identity:
 * with a tight resource constraint you get just your own things; without one, the
 * call returns an unbounded slice of the whole AWS account. For end-user UIs
 * (plugins, dashboards, dropdowns) prefer {@link listMaveoConnectSticks}, which
 * uses `iot:ListPrincipalThings` with the Cognito identity as principal and is
 * therefore reliably scoped to the calling user's own sticks.
 */
export async function listMaveoThings(
  session: MaveoSession,
  options?: ListMaveoThingsOptions,
): Promise<MaveoThingSummary[]> {
  const cap = options?.maxThings;
  if (cap !== undefined && cap <= 0) return [];

  const client = iotClientForSession(session);
  const out: MaveoThingSummary[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.send(new ListThingsCommand({ nextToken, maxResults: 100 }));
    for (const t of page.things ?? []) {
      const name = t.thingName;
      if (!name) continue;
      if (cap !== undefined && out.length >= cap) return out;
      out.push({
        thingName: name,
        attributes: { ...(t.attributes as Record<string, string> | undefined) },
      });
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return out;
}

/**
 * Full **DescribeThing** payload (name, id, ARN, attributes, type, billing group, etc.).
 * Pair with {@link listMaveoConnectSticks} so you only describe serials that belong
 * to the calling identity.
 */
export async function describeMaveoThing(
  session: MaveoSession,
  thingName: string,
): Promise<Record<string, unknown>> {
  const client = iotClientForSession(session);
  const out = await client.send(new DescribeThingCommand({ thingName }));
  return { ...out } as Record<string, unknown>;
}
