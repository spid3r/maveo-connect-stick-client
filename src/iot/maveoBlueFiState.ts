/**
 * Parsed stick → app state from `…/rsp` JSON (`StoA_*` keys).
 * Door positions align with values used by the official app and common community integrations.
 */

/** Numeric door position from `StoA_s`. */
export enum MaveoDoorPosition {
  Stopped = 0,
  Opening = 1,
  Closing = 2,
  Open = 3,
  Closed = 4,
  IntermediateOpen = 5,
  IntermediateClosed = 6,
}

export const MAVEO_STOA_S = "StoA_s";
export const MAVEO_STOA_L_R = "StoA_l_r";

export type MaveoStickStateUpdate = {
  /** Present when the message contained a parseable `StoA_s`. */
  doorPosition?: MaveoDoorPosition;
  /** Present when the message contained a parseable `StoA_l_r` (light on/off). */
  lightOn?: boolean;
  /** Full parsed object (other `StoA_*` keys may be present). */
  raw: Record<string, unknown>;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Map raw `StoA_s` to {@link MaveoDoorPosition}. Unknown values clamp to {@link MaveoDoorPosition.Stopped}.
 */
export function parseMaveoDoorPosition(value: unknown): MaveoDoorPosition {
  if (!isFiniteNumber(value)) return MaveoDoorPosition.Stopped;
  const n = Math.trunc(value);
  if (n < 0 || n > MaveoDoorPosition.IntermediateClosed) return MaveoDoorPosition.Stopped;
  return n as MaveoDoorPosition;
}

/**
 * Map raw `StoA_l_r` to light on (true/false). Returns `undefined` if not a known encoding.
 */
export function parseMaveoLightOn(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  if (isFiniteNumber(value)) {
    const n = Math.trunc(value);
    if (n === 0) return false;
    if (n === 1) return true;
  }
  return undefined;
}

/**
 * Extract door/light fields from one `…/rsp` JSON object. Other keys remain in `raw`.
 */
export function extractMaveoStickState(raw: Record<string, unknown>): MaveoStickStateUpdate {
  let doorPosition: MaveoDoorPosition | undefined;
  if (Object.prototype.hasOwnProperty.call(raw, MAVEO_STOA_S)) {
    doorPosition = parseMaveoDoorPosition(raw[MAVEO_STOA_S]);
  }
  let lightOn: boolean | undefined;
  if (Object.prototype.hasOwnProperty.call(raw, MAVEO_STOA_L_R)) {
    lightOn = parseMaveoLightOn(raw[MAVEO_STOA_L_R]);
  }
  return { doorPosition, lightOn, raw };
}

/** True if the payload may carry door/light UI state (opening, light on, etc.). */
export function rawBlueFiMessageHasDoorOrLightKeys(raw: Record<string, unknown>): boolean {
  return (
    Object.prototype.hasOwnProperty.call(raw, MAVEO_STOA_S) ||
    Object.prototype.hasOwnProperty.call(raw, MAVEO_STOA_L_R)
  );
}

export function maveoDoorPositionLabel(pos: MaveoDoorPosition): string {
  switch (pos) {
    case MaveoDoorPosition.Stopped:
      return "stopped";
    case MaveoDoorPosition.Opening:
      return "opening";
    case MaveoDoorPosition.Closing:
      return "closing";
    case MaveoDoorPosition.Open:
      return "open";
    case MaveoDoorPosition.Closed:
      return "closed";
    case MaveoDoorPosition.IntermediateOpen:
      return "intermediateOpen";
    case MaveoDoorPosition.IntermediateClosed:
      return "intermediateClosed";
    default:
      return "unknown";
  }
}
