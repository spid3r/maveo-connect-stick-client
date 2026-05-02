/**
 * Conventional commits — required for semantic-release.
 *
 * First stable bump from 0.x: use a BREAKING header when appropriate, e.g.
 *   feat!: short description
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [2, "always", 120],
  },
};
