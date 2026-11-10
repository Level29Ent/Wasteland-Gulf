import { defineConfig } from "vite";
import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const s = (f: string) => resolve(here, f);
// koota is a dependency of the engine; find it wherever the package manager put it.
function koota() {
  const direct = resolve(here, "../node_modules/koota");
  if (existsSync(direct)) return direct;
  const pnpm = resolve(here, "../node_modules/.pnpm");
  const d = readdirSync(pnpm).find((n) => n.startsWith("koota@"));
  return resolve(pnpm, d!, "node_modules/koota");
}
export default defineConfig({
  root: here,
  base: "./",
  resolve: {
    alias: [
      { find: /^koota$/, replacement: koota() },
      { find: /^@trhs\/wildwood$/, replacement: s("shim-wildwood.ts") },
      { find: /^@trhs\/wildwood\/replicate$/, replacement: s("shim-wildwood.ts") },
      { find: /^@trhs\/wildwood\/server$/, replacement: s("shim-server.ts") },
      { find: /^@trhs\/wildwood\/client$/, replacement: s("shim-client.ts") },
      { find: /^@trhs\/wildwood\/replicate\/server$/, replacement: s("shim-replicate-server.ts") },
      { find: /^@trhs\/wildwood\/replicate\/client$/, replacement: s("shim-replicate-client.ts") },
      { find: /^@trhs\/wildwood\/platform$/, replacement: s("shim-platform.ts") },
      { find: /^@trhs\/wildwood\/audio$/, replacement: s("shim-audio.ts") },
      { find: /^@trhs\/wildwood\/controls$/, replacement: s("shim-controls.ts") },
      { find: /^@trhs\/wildwood\/follow$/, replacement: s("shim-follow.ts") },
    ],
  },
  build: { outDir: resolve(here, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 3000 },
});
