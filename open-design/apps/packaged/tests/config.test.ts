import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const electronMock = vi.hoisted(() => ({
  app: {
    getAppPath: vi.fn<() => string>(() => ""),
    getPath: vi.fn<(name: string) => string>(() => ""),
  },
}));

vi.mock("electron", () => electronMock);

import {
  PACKAGED_CONFIG_PATH_ENV,
  PACKAGED_NAMESPACE_ENV,
  PACKAGED_WEB_OUTPUT_MODE_ENV,
  PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV,
  PACKAGED_WEB_STANDALONE_ROOT_ENV,
  readPackagedConfig,
} from "../src/config.js";

const PACKAGED_ENV_KEYS = [
  PACKAGED_CONFIG_PATH_ENV,
  PACKAGED_NAMESPACE_ENV,
  PACKAGED_WEB_OUTPUT_MODE_ENV,
  PACKAGED_WEB_OUTPUT_MODE_OVERRIDE_ENV,
  PACKAGED_WEB_STANDALONE_ROOT_ENV,
  "OD_PACKAGED_CONFIG_PATH",
  "OD_PACKAGED_NAMESPACE",
  "OD_PACKAGED_ALLOW_WEB_OUTPUT_MODE_OVERRIDE",
  "OD_WEB_OUTPUT_MODE",
  "OD_WEB_STANDALONE_ROOT",
] as const;

let tempRoot = "";
let originalResourcesPath: string | undefined;
const originalEnv = new Map<string, string | undefined>();

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "agds-packaged-config-"));
  const resourcesPath = join(tempRoot, "resources");
  const appPath = join(tempRoot, "app");
  const userDataPath = join(tempRoot, "user-data");
  await mkdir(resourcesPath, { recursive: true });
  await mkdir(appPath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });

  originalResourcesPath = process.resourcesPath;
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: resourcesPath,
  });
  electronMock.app.getAppPath.mockReturnValue(appPath);
  electronMock.app.getPath.mockImplementation((name: string) => {
    if (name === "userData") return userDataPath;
    return join(tempRoot, name);
  });

  for (const key of PACKAGED_ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of PACKAGED_ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: originalResourcesPath,
  });
  vi.clearAllMocks();
  await rm(tempRoot, { force: true, recursive: true });
});

describe("readPackagedConfig", () => {
  it("loads the canonical AGDS packaged config and env overrides", async () => {
    await writeJson(join(process.resourcesPath, "agds-config.json"), {
      namespace: "from-file",
      webOutputMode: "server",
    });
    process.env.AGDS_PACKAGED_NAMESPACE = "from-env";
    process.env.AGDS_PACKAGED_ALLOW_WEB_OUTPUT_MODE_OVERRIDE = "1";
    process.env.AGDS_WEB_OUTPUT_MODE = "standalone";
    process.env.AGDS_WEB_STANDALONE_ROOT = join(tempRoot, "standalone");

    const config = await readPackagedConfig();

    expect(config.namespace).toBe("from-env");
    expect(config.webOutputMode).toBe("standalone");
    expect(config.webStandaloneRoot).toBe(join(tempRoot, "standalone"));
  });

  it("ignores deprecated OD packaged config env aliases", async () => {
    const legacyConfigPath = join(tempRoot, "legacy-config.json");
    await writeJson(legacyConfigPath, {
      namespace: "legacy-config",
      webOutputMode: "standalone",
    });

    process.env.OD_PACKAGED_CONFIG_PATH = legacyConfigPath;
    process.env.OD_PACKAGED_NAMESPACE = "legacy-env";
    process.env.OD_PACKAGED_ALLOW_WEB_OUTPUT_MODE_OVERRIDE = "1";
    process.env.OD_WEB_OUTPUT_MODE = "standalone";
    process.env.OD_WEB_STANDALONE_ROOT = join(tempRoot, "legacy-standalone");

    const config = await readPackagedConfig();

    expect(config.namespace).toBe("default");
    expect(config.webOutputMode).toBe("server");
    expect(config.webStandaloneRoot).toBeNull();
  });

  it("ignores the retired open-design packaged config filename", async () => {
    await writeJson(join(process.resourcesPath, "open-design-config.json"), {
      namespace: "legacy-resource",
      webOutputMode: "standalone",
    });
    await writeJson(join(electronMock.app.getAppPath(), "open-design-config.json"), {
      namespace: "legacy-app",
      webOutputMode: "standalone",
    });

    const config = await readPackagedConfig();

    expect(config.namespace).toBe("default");
    expect(config.webOutputMode).toBe("server");
  });
});
