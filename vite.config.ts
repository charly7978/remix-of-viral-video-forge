import type { Plugin } from "vite";

// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Populate `process.env` for server-only (.server.ts / *.functions.ts) code in Vite dev.
// Vite only auto-loads VITE_-prefixed vars; the generated Supabase client reads
// `process.env.SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. This is dev-only (configureServer)
// and only sets vars that aren't already present, so host/CI env always wins. Prod Nitro
// (node-server) already loads `.env` into process.env at runtime — no change there.
// Secrets never reach the client bundle: process.env is Node-only, and the secret keys
// (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) are not in the VITE_ prefix set.
function syncServerEnvToProcessEnv(): Plugin {
  return {
    name: "sync-server-env-to-process-env",
    async configureServer(server: { config: { mode: string } }) {
      const { loadEnv } = await import("vite");
      const env = loadEnv(server.config.mode, process.cwd(), [
        "VITE_",
        "SUPABASE_",
        "GEMINI_API_KEY",
      ]);
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
    },
  };
}

export default defineConfig({
  // Force the free ffmpeg render to work anywhere: build a Node server
  // (nitro "node-server") so `node:child_process`/`ffmpeg` run in production.
  // The @lovable wrapper defaults to cloudflare-module, which cannot spawn ffmpeg.
  nitro: { preset: "node" },
  vite: {
    plugins: [syncServerEnvToProcessEnv()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
