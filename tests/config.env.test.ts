import { describe, expect, it } from "vitest";
import {
  loadMaveoCredentialsFromEnv,
  loadMaveoLibraryConfigFromEnv,
  maveoCredentialsSchema,
} from "../src/config/env.js";

const fullEnv = {
  MAVEO_EMAIL: "a@b.c",
  MAVEO_PASSWORD: "secret",
  MAVEO_COGNITO_IDENTITY_POOL_ID: "test-region:00000000-0000-0000-0000-000000000000",
  MAVEO_COGNITO_CLIENT_ID: "test-client-id",
  MAVEO_REGION: "test-region",
  MAVEO_IOT_HOSTNAME: "iot.example.test",
} as unknown as NodeJS.ProcessEnv;

describe("loadMaveoCredentialsFromEnv", () => {
  it("parses valid env", () => {
    const c = loadMaveoCredentialsFromEnv({
      MAVEO_EMAIL: "a@b.c",
      MAVEO_PASSWORD: "secret",
    });
    expect(c).toEqual({ email: "a@b.c", password: "secret" });
  });

  it("rejects missing email", () => {
    expect(() =>
      loadMaveoCredentialsFromEnv({
        MAVEO_PASSWORD: "x",
      } as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it("schema shape documents credential fields", () => {
    expect(Object.keys(maveoCredentialsSchema.shape)).toEqual(
      expect.arrayContaining(["email", "password"]),
    );
  });
});

describe("loadMaveoLibraryConfigFromEnv", () => {
  it("merges credentials and auth config", () => {
    const c = loadMaveoLibraryConfigFromEnv(fullEnv);
    expect(c.email).toBe("a@b.c");
    expect(c.cognitoIdentityPoolId).toBe("test-region:00000000-0000-0000-0000-000000000000");
    expect(c.cognitoClientId).toBe("test-client-id");
    expect(c.region).toBe("test-region");
    expect(c.iotHostname).toBe("iot.example.test");
  });

  it("rejects missing region", () => {
    const env = { ...fullEnv } as Record<string, string | undefined>;
    delete env.MAVEO_REGION;
    expect(() => loadMaveoLibraryConfigFromEnv(env as NodeJS.ProcessEnv)).toThrow(/MAVEO_REGION/);
  });

  it("rejects missing iot hostname", () => {
    const env = { ...fullEnv } as Record<string, string | undefined>;
    delete env.MAVEO_IOT_HOSTNAME;
    expect(() => loadMaveoLibraryConfigFromEnv(env as NodeJS.ProcessEnv)).toThrow(
      /MAVEO_IOT_HOSTNAME/,
    );
  });

  it("rejects missing cognito client id", () => {
    const env = { ...fullEnv } as Record<string, string | undefined>;
    delete env.MAVEO_COGNITO_CLIENT_ID;
    expect(() => loadMaveoLibraryConfigFromEnv(env as NodeJS.ProcessEnv)).toThrow(
      /MAVEO_COGNITO_CLIENT_ID/,
    );
  });

  it("rejects missing identity pool id", () => {
    const env = { ...fullEnv } as Record<string, string | undefined>;
    delete env.MAVEO_COGNITO_IDENTITY_POOL_ID;
    expect(() => loadMaveoLibraryConfigFromEnv(env as NodeJS.ProcessEnv)).toThrow(
      /MAVEO_COGNITO_IDENTITY_POOL_ID/,
    );
  });
});
