import { homedir } from "node:os";
import { join, resolve } from "node:path";

import {
  AGDS_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
} from "@ai-game-design-studio/sidecar-proto";

import type { PackagedConfig } from "./config.js";

export interface HeadlessConfigOptions {
  defaultResourceRoot: string;
  env?: Record<string, string | undefined>;
  homeDir?: string;
}

function readEnvironmentValue(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function expandHomePrefix(raw: string, homeDir: string): string {
  if (raw === "~" || raw === "$HOME" || raw === "${HOME}") return homeDir;
  const match = /^(~|\$\{HOME\}|\$HOME)[/\\](.*)$/.exec(raw);
  return match ? join(homeDir, match[2] ?? "") : raw;
}

export function resolveHeadlessNamespaceBaseRoot(
  env: Record<string, string | undefined> = process.env,
  homeDir: string = homedir(),
): string {
  const dataDir = readEnvironmentValue(env.AGDS_DATA_DIR);
  if (dataDir != null) {
    return join(resolve(expandHomePrefix(dataDir, homeDir)), "namespaces");
  }

  const xdgDataHome = readEnvironmentValue(env.XDG_DATA_HOME);
  const dataBase = xdgDataHome ?? join(homeDir, ".local", "share");
  return join(dataBase, "agds", "namespaces");
}

export function resolveHeadlessConfig(options: HeadlessConfigOptions): PackagedConfig {
  const env = options.env ?? process.env;
  const namespace =
    AGDS_SIDECAR_CONTRACT.normalizeNamespace(
      readEnvironmentValue(env.AGDS_NAMESPACE) ??
      readEnvironmentValue(env.AGDS_SIDECAR_NAMESPACE) ??
      SIDECAR_DEFAULTS.namespace,
    );

  return {
    appVersion: null,
    daemonCliEntry: null,
    daemonSidecarEntry: null,
    namespace,
    namespaceBaseRoot: resolveHeadlessNamespaceBaseRoot(env, options.homeDir),
    nodeCommand: null,
    resourceRoot: readEnvironmentValue(env.AGDS_RESOURCE_ROOT) ?? options.defaultResourceRoot,
    webSidecarEntry: null,
    webStandaloneRoot: null,
    webOutputMode: "server",
  };
}
