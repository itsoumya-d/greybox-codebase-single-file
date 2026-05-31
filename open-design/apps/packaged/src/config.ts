import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { app } from "electron";

import { SIDECAR_DEFAULTS, normalizeNamespace } from "@ai-game-design-studio/sidecar-proto";

export const PACKAGED_CONFIG_PATH_ENV = "AGDS_PACKAGED_CONFIG_PATH";
export const PACKAGED_NAMESPACE_ENV = "AGDS_PACKAGED_NAMESPACE";
export const PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV = "AGDS_PACKAGED_ALLOW_WEB_OUTPUT_MODE_OVERRIDE";
export const PACKAGED_WEB_STANDALONE_ROOT_ENV = "AGDS_WEB_STANDALONE_ROOT";
export const PACKAGED_WEB_OUTPUT_MODE_ENV = "AGDS_WEB_OUTPUT_MODE";

export type PackagedWebOutputMode = "server" | "standalone";

export type RawPackagedConfig = {
  appVersion?: string;
  daemonCliEntryRelative?: string;
  daemonSidecarEntryRelative?: string;
  namespace?: string;
  namespaceBaseRoot?: string;
  nodeCommandRelative?: string;
  resourceRoot?: string;
  webSidecarEntryRelative?: string;
  webStandaloneRoot?: string;
  webOutputMode?: string;
};

export type PackagedConfig = {
  appVersion: string | null;
  daemonCliEntry: string | null;
  daemonSidecarEntry: string | null;
  namespace: string;
  namespaceBaseRoot: string;
  nodeCommand: string | null;
  resourceRoot: string;
  webSidecarEntry: string | null;
  webStandaloneRoot: string | null;
  webOutputMode: PackagedWebOutputMode;
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath: string): Promise<RawPackagedConfig | null> {
  if (!(await pathExists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8")) as RawPackagedConfig;
}

function resolveDefaultConfigPath(): string {
  return join(process.resourcesPath, "agds-config.json");
}

function readEnvironmentValue(value: string | undefined): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

async function readRawPackagedConfig(): Promise<RawPackagedConfig> {
  const explicit = readEnvironmentValue(process.env[PACKAGED_CONFIG_PATH_ENV]);
  if (explicit != null) {
    const config = await readJsonIfExists(resolve(explicit));
    if (config == null) throw new Error(`packaged config not found at ${explicit}`);
    return config;
  }

  return (
    (await readJsonIfExists(resolveDefaultConfigPath())) ??
    (await readJsonIfExists(join(app.getAppPath(), "agds-config.json"))) ??
    {}
  );
}

function resolveOptionalPath(value: string | undefined): string | undefined {
  return value == null || value.length === 0 ? undefined : resolve(value);
}

// Config DTOs use null for optional scalar values consumed by runtime options;
// optional paths use undefined so callers can distinguish "no path" from a resolved path string.
function cleanOptionalString(value: string | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function resolvePackagedWebOutputMode(value: string | undefined): PackagedWebOutputMode {
  if (value == null || value.length === 0) return "server";
  if (value === "server" || value === "standalone") return value;
  throw new Error(`unsupported packaged web output mode: ${value}`);
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function resolvePackagedWebStandaloneRoot(
  webOutputMode: PackagedWebOutputMode,
  value: string | undefined,
): string | null {
  const configured = resolveOptionalPath(value);
  if (configured != null) return configured;
  if (webOutputMode !== "standalone") return null;
  return join(process.resourcesPath, "agds-web-standalone");
}

async function resolvePackagedRelativeEntry(value: string | undefined): Promise<string | null> {
  const cleaned = cleanOptionalString(value);
  if (cleaned == null) return null;
  const entry = join(process.resourcesPath, cleaned);
  if (!(await pathExists(entry))) {
    throw new Error(`configured packaged entry not found at ${entry}`);
  }
  return entry;
}

export async function readPackagedConfig(): Promise<PackagedConfig> {
  const raw = await readRawPackagedConfig();
  const namespace = normalizeNamespace(
    readEnvironmentValue(process.env[PACKAGED_NAMESPACE_ENV]) ??
      raw.namespace ??
      SIDECAR_DEFAULTS.namespace,
  );
  const namespaceBaseRoot =
    resolveOptionalPath(raw.namespaceBaseRoot) ?? join(app.getPath("userData"), "namespaces");
  const resourceRoot = resolveOptionalPath(raw.resourceRoot) ?? join(process.resourcesPath, "agds");
  const relativeNodeCommand =
    raw.nodeCommandRelative == null || raw.nodeCommandRelative.length === 0
      ? join("agds", "bin", "node")
      : raw.nodeCommandRelative;
  const nodeCommandCandidate = join(process.resourcesPath, relativeNodeCommand);
  const nodeCommand = (await pathExists(nodeCommandCandidate)) ? nodeCommandCandidate : null;
  const allowWebOutputModeOverride = isTruthyEnv(
    readEnvironmentValue(process.env[PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV]),
  );
  const webOutputMode = resolvePackagedWebOutputMode(
    allowWebOutputModeOverride
      ? readEnvironmentValue(process.env[PACKAGED_WEB_OUTPUT_MODE_ENV]) ?? raw.webOutputMode
      : raw.webOutputMode,
  );
  const webStandaloneRoot = resolvePackagedWebStandaloneRoot(
    webOutputMode,
    allowWebOutputModeOverride
      ? readEnvironmentValue(process.env[PACKAGED_WEB_STANDALONE_ROOT_ENV]) ?? raw.webStandaloneRoot
      : raw.webStandaloneRoot,
  );
  const daemonCliEntry = await resolvePackagedRelativeEntry(raw.daemonCliEntryRelative);
  const daemonSidecarEntry = await resolvePackagedRelativeEntry(raw.daemonSidecarEntryRelative);
  const webSidecarEntry = await resolvePackagedRelativeEntry(raw.webSidecarEntryRelative);

  return {
    appVersion: cleanOptionalString(raw.appVersion),
    daemonCliEntry,
    daemonSidecarEntry,
    namespace,
    namespaceBaseRoot,
    nodeCommand,
    resourceRoot,
    webSidecarEntry,
    webStandaloneRoot,
    webOutputMode,
  };
}
