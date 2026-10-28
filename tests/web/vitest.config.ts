import { defineConfig } from "vitest/config";
import { realpathSync } from "node:fs";
import * as path from "node:path";

// The app's own copy of a package, so a vi.mock() here and the app's import
// name the same module (pnpm gives apps/web a copy peered with its Next).
const fromApp = (pkg: string) => realpathSync(path.resolve(__dirname, "../../apps/web/node_modules", pkg));

export default defineConfig({
  resolve: {
    alias: {
      "@opennextjs/cloudflare": fromApp("@opennextjs/cloudflare"),
      "@": path.resolve(__dirname, "../../apps/web"),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
  },
});
