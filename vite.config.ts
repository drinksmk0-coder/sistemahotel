// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const appVersion =
  process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA ?? new Date().toISOString();
const publicDirectory = resolve(process.cwd(), "public");
mkdirSync(publicDirectory, { recursive: true });
writeFileSync(
  resolve(publicDirectory, "app-version.json"),
  JSON.stringify({ version: appVersion }),
  "utf8",
);

export default defineConfig({
  // When building outside Lovable (e.g. on Vercel via GitHub), target Vercel's
  // Build Output API so SSR + all routes work. Inside a Lovable build this
  // override is ignored and the output is forced back to Cloudflare.
  nitro: { preset: "vercel" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "src/server" },
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  },
});
