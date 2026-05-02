import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load `.env` from repo root during tests (optional).
 * Unit tests should not depend on real secrets; use `vi.stubEnv` or fixtures.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
// Prefer repo `.env` over inherited shell vars (e.g. stale MAVEO_COGNITO_CLIENT_ID from a prior probe).
config({ path: resolve(__dirname, "..", ".env"), override: true });
