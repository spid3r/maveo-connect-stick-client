import {
  DescribeThingCommand,
  ListPrincipalThingsCommand,
  ListThingsCommand,
} from "@aws-sdk/client-iot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaveoSession } from "../src/auth/types.js";
import {
  describeMaveoThing,
  listMaveoConnectSticks,
  listMaveoThings,
} from "../src/garage/maveoIotThings.js";

const sendSpy = vi.fn();

vi.mock("@aws-sdk/client-iot", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-iot")>();
  // Must be a constructable (function declaration / class), not an arrow function.
  function IoTClientMock(this: { send: (cmd: unknown) => unknown }) {
    this.send = (cmd: unknown) => sendSpy(cmd);
  }
  return {
    ...actual,
    IoTClient: IoTClientMock as unknown as typeof actual.IoTClient,
  };
});

const session: MaveoSession = {
  region: "eu-central-1",
  iotHostname: "iot.example.test",
  identityId: "eu-central-1:abc-123",
  accessKeyId: "AKIATEST",
  secretAccessKey: "secret",
  sessionToken: "st",
};

beforeEach(() => {
  sendSpy.mockReset();
});

describe("listMaveoConnectSticks (iot:ListPrincipalThings, identity-scoped)", () => {
  it("returns only thing names attached to the cognito identity, paginated transparently", async () => {
    sendSpy.mockImplementation(async (cmd: unknown) => {
      expect(cmd).toBeInstanceOf(ListPrincipalThingsCommand);
      const input = (cmd as ListPrincipalThingsCommand).input;
      expect(input.principal).toBe("eu-central-1:abc-123");
      expect(input.maxResults).toBe(100);

      if (!input.nextToken) {
        return { things: ["stick-fake-001", "stick-fake-002"], nextToken: "page2" };
      }
      if (input.nextToken === "page2") {
        return { things: ["stick-fake-003"], nextToken: undefined };
      }
      throw new Error(`unexpected nextToken ${input.nextToken}`);
    });

    const result = await listMaveoConnectSticks(session);

    expect(result).toEqual([
      "stick-fake-001",
      "stick-fake-002",
      "stick-fake-003",
    ]);
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });

  it("returns an empty array when no sticks are attached", async () => {
    sendSpy.mockImplementation(async () => ({ things: [] }));
    const result = await listMaveoConnectSticks(session);
    expect(result).toEqual([]);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("filters out null/empty entries defensively", async () => {
    sendSpy.mockImplementation(async () => ({
      // SDK types allow `string[] | undefined`, but defend against falsy holes.
      things: ["valid", "", null as unknown as string, undefined as unknown as string],
    }));
    const result = await listMaveoConnectSticks(session);
    expect(result).toEqual(["valid"]);
  });
});

describe("listMaveoThings (account-wide iot:ListThings, advanced use)", () => {
  it("uses account-wide ListThings and respects maxThings cap", async () => {
    sendSpy.mockImplementation(async (cmd: unknown) => {
      expect(cmd).toBeInstanceOf(ListThingsCommand);
      return {
        things: [
          { thingName: "thing-1", attributes: { country: "DE" } },
          { thingName: "thing-2", attributes: { country: "AT" } },
          { thingName: "thing-3", attributes: {} },
        ],
        nextToken: "more",
      };
    });

    const result = await listMaveoThings(session, { maxThings: 2 });
    expect(result).toEqual([
      { thingName: "thing-1", attributes: { country: "DE" } },
      { thingName: "thing-2", attributes: { country: "AT" } },
    ]);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it("paginates fully when no cap is given", async () => {
    sendSpy.mockImplementation(async (cmd: unknown) => {
      const input = (cmd as ListThingsCommand).input;
      if (!input.nextToken) {
        return { things: [{ thingName: "a" }], nextToken: "p2" };
      }
      if (input.nextToken === "p2") {
        return { things: [{ thingName: "b" }] };
      }
      throw new Error("unexpected");
    });
    const result = await listMaveoThings(session);
    expect(result.map((t) => t.thingName)).toEqual(["a", "b"]);
    expect(sendSpy).toHaveBeenCalledTimes(2);
  });
});

describe("describeMaveoThing", () => {
  it("forwards the thing name and returns the SDK output as a plain object", async () => {
    sendSpy.mockImplementation(async (cmd: unknown) => {
      expect(cmd).toBeInstanceOf(DescribeThingCommand);
      expect((cmd as DescribeThingCommand).input.thingName).toBe("stick-fake-001");
      return {
        thingName: "stick-fake-001",
        thingId: "id-1",
        thingArn: "arn:aws:iot:eu-central-1:1:thing/stick-fake-001",
        attributes: { foo: "bar" },
      };
    });

    const out = await describeMaveoThing(session, "stick-fake-001");
    expect(out).toMatchObject({
      thingName: "stick-fake-001",
      thingId: "id-1",
      attributes: { foo: "bar" },
    });
  });
});
