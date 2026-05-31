import {
  APP_KEYS,
  AGDS_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
  SIDECAR_ENV,
  SIDECAR_MESSAGES,
  type DaemonStatusSnapshot,
} from "@ai-game-design-studio/sidecar-proto";
import { requestJsonIpc, resolveAppIpcPath } from "@ai-game-design-studio/sidecar";

export const MCP_DEFAULT_DAEMON_URL = "http://127.0.0.1:7456";

export interface ResolveMcpDaemonUrlOptions {
  /** Value passed via `--daemon-url`. Empty string is treated as unset. */
  flagUrl?: string | null;
  /** Defaults to `process.env`; injected for tests. */
  env?: NodeJS.ProcessEnv;
  /** IPC discovery timeout. Short by default so an absent daemon does not stall MCP startup. */
  timeoutMs?: number;
}

function resolveNonEmptyValue(value: string | null | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Resolve the daemon HTTP base URL for `agds mcp`.
 *
 * Spawn order: explicit `--daemon-url` flag, `AGDS_DAEMON_URL` env,
 * then a STATUS roundtrip to the sidecar IPC socket the running daemon
 * already publishes (`/tmp/agds/ipc/<namespace>/daemon.sock`).
 * Falls back to the AGDS default for direct `agds` launches that do
 * not run as a sidecar. Discovery means the install snippet never has
 * to bake a port: every spawn rediscovers the live URL, so an
 * ephemeral daemon port (tools-dev, packaged) cannot invalidate a
 * previously-installed MCP client config.
 */
export async function resolveMcpDaemonUrl(
  options: ResolveMcpDaemonUrlOptions = {},
): Promise<string> {
  const env = options.env ?? process.env;
  const flagUrl = options.flagUrl ?? null;
  const explicitUrl = resolveNonEmptyValue(flagUrl);
  if (explicitUrl != null) return explicitUrl;
  const envUrl = resolveNonEmptyValue(env.AGDS_DAEMON_URL);
  if (envUrl != null) return envUrl;
  const discovered = await discoverDaemonUrlFromIpc(env, options.timeoutMs ?? 800);
  if (discovered != null) return discovered;
  return MCP_DEFAULT_DAEMON_URL;
}

async function discoverDaemonUrlFromIpc(
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const namespace = resolveNonEmptyValue(env[SIDECAR_ENV.NAMESPACE]) ?? SIDECAR_DEFAULTS.namespace;
    const canonicalSidecarEnv: NodeJS.ProcessEnv = {};
    const ipcBase = resolveNonEmptyValue(env[SIDECAR_ENV.IPC_BASE]);
    if (ipcBase != null) canonicalSidecarEnv[SIDECAR_ENV.IPC_BASE] = ipcBase;

    const socketPath = resolveAppIpcPath({
      app: APP_KEYS.DAEMON,
      contract: AGDS_SIDECAR_CONTRACT,
      env: canonicalSidecarEnv,
      namespace,
    });
    const status = await requestJsonIpc<DaemonStatusSnapshot>(
      socketPath,
      { type: SIDECAR_MESSAGES.STATUS },
      { timeoutMs },
    );
    return status?.url ?? null;
  } catch {
    return null;
  }
}
