import { describe, expect, it, vi } from "vitest";
import { waitForBlueFiRspObject } from "../src/iot/waitForBlueFiRsp.js";

describe("waitForBlueFiRspObject", () => {
  it("resolves when predicate matches", async () => {
    let listener: ((topic: string, payload: Buffer) => void) | undefined;
    const mqtt = {
      onMessage: (h: (topic: string, payload: Buffer) => void) => {
        listener = h;
        return vi.fn();
      },
    };
    const p = waitForBlueFiRspObject(mqtt, "s/rsp", (o) => "StoA_s" in o, 1000);
    queueMicrotask(() => listener?.("s/rsp", Buffer.from('{"StoA_s":4}')));
    await expect(p).resolves.toEqual({ StoA_s: 4 });
  });

  it("rejects on timeout", async () => {
    const mqtt = {
      onMessage: () => vi.fn(),
    };
    await expect(
      waitForBlueFiRspObject(mqtt, "s/rsp", () => true, 20),
    ).rejects.toThrow(/timed out/);
  });
});
