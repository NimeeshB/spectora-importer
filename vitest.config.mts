import { defineConfig } from "vitest/config";

try { process.loadEnvFile(".env.local"); } catch {} // optional: enables the DB integration test

export default defineConfig({ test: { include: ["tests/**/*.test.ts"], testTimeout: 30000 } });
