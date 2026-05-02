import type { MaveoAuthClient, MaveoSession } from "./types.js";

/**
 * Placeholder until real Cognito/HTTP login is implemented (TDD against captured fixtures).
 */
export class MaveoAuthStub implements MaveoAuthClient {
  async loginWithPassword(_email: string, _password: string): Promise<MaveoSession> {
    throw new Error(
      "MaveoAuthStub: implement loginWithPassword (see docs/ARCHITECTURE.md and tests/fixtures).",
    );
  }
}
