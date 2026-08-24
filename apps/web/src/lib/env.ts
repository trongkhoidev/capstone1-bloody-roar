import path from "path";
import { existsSync } from "fs";

// Load environment variables from the root .env file, independent of cwd
// @ts-expect-error - import.meta.dir is injected by Bun
const envPath = path.join(import.meta.dir, "../../../../.env");

try {
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
} catch (error) {
  console.warn("Failed to load .env file:", error);
}
