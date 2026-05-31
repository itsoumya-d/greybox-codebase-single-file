// SPDX-License-Identifier: Apache-2.0

import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("./dist", { recursive: true, force: true });

await build({
  bundle: true,
  entryNames: "[dir]/[name]",
  entryPoints: [
    "./src/index.ts",
    "./src/client.ts",
    "./src/protocol.ts",
    "./src/server.ts",
    "./src/awareness.ts",
    "./src/persistence.ts",
    "./src/conflict-resolver.ts",
    "./src/websocket-client.ts",
  ],
  format: "esm",
  outbase: "./src",
  outdir: "./dist",
  outExtension: { ".js": ".mjs" },
  packages: "external",
  platform: "node",
  target: "node24",
});
