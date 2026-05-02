import { describe, expect, it } from "vitest";
import { cognitoUserPoolLoginsKey } from "../src/auth/cognitoLogins.js";

describe("cognitoUserPoolLoginsKey", () => {
  it("matches AWS documented format", () => {
    expect(cognitoUserPoolLoginsKey("us-west-2", "us-west-2_abcd")).toBe(
      "cognito-idp.us-west-2.amazonaws.com/us-west-2_abcd",
    );
  });
});
