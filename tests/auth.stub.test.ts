import { describe, expect, it } from "vitest";
import { MaveoAuthStub } from "../src/auth/maveoAuthStub.js";

describe("MaveoAuthStub", () => {
  it("throws until implemented", async () => {
    const auth = new MaveoAuthStub();
    await expect(auth.loginWithPassword("a@b.c", "pw")).rejects.toThrow(/implement loginWithPassword/);
  });
});
