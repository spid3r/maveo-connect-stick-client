/**
 * Result of a successful login suitable for opening an IoT connection.
 * Field names align with what the official app derives (Cognito identity + STS-style session creds).
 */
export type MaveoSession = {
  /** AWS IoT / API region (matches the Cognito user / identity pool you configured). */
  region: string;
  /** Fully-qualified IoT broker hostname (no scheme, no path), as supplied via `MAVEO_IOT_HOSTNAME`. */
  iotHostname: string;
  identityId: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  /** Milliseconds since epoch when temporary creds expire (from Cognito), if returned */
  credentialsExpireAt?: number;
  /** Cognito User Pool Id token — needed to refresh Identity credentials; treat as secret */
  idToken?: string;
};

export interface MaveoAuthClient {
  loginWithPassword(email: string, password: string): Promise<MaveoSession>;
}
