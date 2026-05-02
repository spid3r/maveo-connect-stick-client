# Security Policy

## Supported Versions

This package follows [semantic-release](https://github.com/semantic-release/semantic-release) on the `main` (stable) and `beta` (prerelease) branches. Only the latest stable major / minor receives security patches.

| Version | Supported |
|---------|-----------|
| latest stable | ✅ |
| latest `beta` | ✅ (best-effort) |
| anything older | ❌ |

## Reporting a vulnerability in **this library**

Please **do not** open public GitHub issues for sensitive reports. Instead:

1. Open a [private security advisory](https://docs.github.com/en/code-security/security-advisories) on the GitHub repo, **or**
2. Email the repository maintainer (see the `author` / `bugs` fields in [`package.json`](package.json)).

You should expect:

- Acknowledgement within **5 working days**.
- A coordinated fix and CVE filing if applicable.
- Credit in the changelog (opt-out available).

The bar for "vulnerability in this library" is the usual one: code in this repo (or its compiled `dist/`) that puts your secrets, credentials, host, or downstream user data at unintended risk.

## Issues outside this library

This package interacts with third-party cloud endpoints. Issues that affect those services (or the device firmware behind them) are **out of scope** for this repository. Please report such findings directly to the relevant vendor following their own published security or responsible-disclosure process, not via this repo's issue tracker.
