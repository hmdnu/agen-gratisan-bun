import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    server: {
      deps: {
        // Vite's resolver does not know the `bun:` scheme; externalize so the
        // module is loaded natively by Bun (bun:sqlite in src/notification/state.ts).
        external: [/^bun:/],
      },
    },
  },
});
