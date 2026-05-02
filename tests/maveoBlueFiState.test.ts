import { describe, expect, it } from "vitest";
import {
  MaveoDoorPosition,
  extractMaveoStickState,
  maveoDoorPositionLabel,
  parseMaveoDoorPosition,
  parseMaveoLightOn,
  rawBlueFiMessageHasDoorOrLightKeys,
} from "../src/iot/maveoBlueFiState.js";

describe("maveoBlueFiState", () => {
  it("parseMaveoDoorPosition maps numeric codes", () => {
    expect(parseMaveoDoorPosition(4)).toBe(MaveoDoorPosition.Closed);
    expect(parseMaveoDoorPosition(1)).toBe(MaveoDoorPosition.Opening);
    expect(maveoDoorPositionLabel(MaveoDoorPosition.Opening)).toBe("opening");
  });

  it("parseMaveoDoorPosition clamps unknown to Stopped", () => {
    expect(parseMaveoDoorPosition(99)).toBe(MaveoDoorPosition.Stopped);
    expect(parseMaveoDoorPosition("x")).toBe(MaveoDoorPosition.Stopped);
  });

  it("parseMaveoLightOn", () => {
    expect(parseMaveoLightOn(1)).toBe(true);
    expect(parseMaveoLightOn(0)).toBe(false);
    expect(parseMaveoLightOn(true)).toBe(true);
    expect(parseMaveoLightOn("1")).toBe(true);
    expect(parseMaveoLightOn(null)).toBeUndefined();
  });

  it("extractMaveoStickState and rawBlueFiMessageHasDoorOrLightKeys", () => {
    expect(rawBlueFiMessageHasDoorOrLightKeys({ StoA_v: "1.0" })).toBe(false);
    expect(rawBlueFiMessageHasDoorOrLightKeys({ StoA_s: 2 })).toBe(true);
    const u = extractMaveoStickState({ StoA_s: 3, StoA_l_r: 0 });
    expect(u.doorPosition).toBe(MaveoDoorPosition.Open);
    expect(u.lightOn).toBe(false);
  });
});
