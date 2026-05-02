import { DescribeThingCommand, IoTClient, ListThingsCommand } from "@aws-sdk/client-iot";
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

export type ListMaveoThingsOptions = {
  /** Stop after N things (useful when the account lists many devices). */
  maxThings?: number;
};

/**
 * List IoT things visible to this Cognito session.
 * On shared infrastructure this can return **many** rows — prefer {@link describeMaveoThing} when you know the stick serial (`thingName`).
 */
export async function listMaveoThings(
  session: MaveoSession,
  options?: ListMaveoThingsOptions,
): Promise<MaveoThingSummary[]> {
  const client = new IoTClient({
    region: session.region,
    credentials: sessionCredentials(session),
  });
  const out: MaveoThingSummary[] = [];
  let nextToken: string | undefined;
  const cap = options?.maxThings;
  do {
    const page = await client.send(new ListThingsCommand({ nextToken, maxResults: 100 }));
    for (const t of page.things ?? []) {
      const name = t.thingName;
      if (!name) continue;
      out.push({
        thingName: name,
        attributes: { ...(t.attributes as Record<string, string> | undefined) },
      });
      if (cap !== undefined && out.length >= cap) {
        return out;
      }
    }
    nextToken = page.nextToken;
  } while (nextToken);
  return out;
}

/**
 * Full **DescribeThing** payload (name, id, ARN, attributes, type, billing group, etc.).
 * This is the reliable way to read stick metadata with the same credentials as {@link listMaveoThings}.
 */
export async function describeMaveoThing(
  session: MaveoSession,
  thingName: string,
): Promise<Record<string, unknown>> {
  const client = new IoTClient({
    region: session.region,
    credentials: sessionCredentials(session),
  });
  const out = await client.send(new DescribeThingCommand({ thingName }));
  return { ...out } as Record<string, unknown>;
}
