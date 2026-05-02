/**
 * Connect Stick serial (IoT thing name) from env — same value the Maveo app shows and the broker expects as MQTT `clientId`.
 */
export function resolveMaveoStickSerialFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const mqttId = env.MAVEO_MQTT_CLIENT_ID?.trim();
  if (mqttId) return mqttId;
  const thing = env.MAVEO_THING_NAME?.trim();
  if (thing) return thing;
  throw new Error(
    "Set MAVEO_THING_NAME or MAVEO_MQTT_CLIENT_ID to your Connect Stick serial (from the Maveo app). " +
      "The MQTT broker requires this as clientId for iot:Connect.",
  );
}

/**
 * Same resolution as {@link resolveMaveoStickSerialFromEnv}, but returns `undefined` if unset (for optional features).
 */
export function tryResolveMaveoStickSerialFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const mqttId = env.MAVEO_MQTT_CLIENT_ID?.trim();
  if (mqttId) return mqttId;
  const thing = env.MAVEO_THING_NAME?.trim();
  return thing || undefined;
}
