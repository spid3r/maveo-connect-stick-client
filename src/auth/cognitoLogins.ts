/**
 * Logins map key for Cognito Identity when the user authenticated via a Cognito User Pool.
 * @see https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-integrating-user-pools-with-identity-pools.html
 */
export function cognitoUserPoolLoginsKey(region: string, userPoolId: string): string {
  return `cognito-idp.${region}.amazonaws.com/${userPoolId}`;
}
