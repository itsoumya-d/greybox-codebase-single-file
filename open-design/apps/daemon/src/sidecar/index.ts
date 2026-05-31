import { APP_KEYS, AGDS_SIDECAR_CONTRACT } from "@ai-game-design-studio/sidecar-proto";
import { bootstrapSidecarRuntime } from "@ai-game-design-studio/sidecar";
import { readProcessStamp } from "@ai-game-design-studio/platform";

import { startDaemonSidecar } from "./server.js";

async function main(): Promise<void> {
  const stamp = readProcessStamp(process.argv.slice(2), AGDS_SIDECAR_CONTRACT);
  if (stamp == null) throw new Error("sidecar stamp is required");

  const runtime = bootstrapSidecarRuntime(stamp, process.env, {
    app: APP_KEYS.DAEMON,
    contract: AGDS_SIDECAR_CONTRACT,
  });
  const server = await startDaemonSidecar(runtime);

  process.stdout.write(`${JSON.stringify(await server.status(), null, 2)}\n`);
  await server.waitUntilStopped();
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
