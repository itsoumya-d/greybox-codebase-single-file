import { join } from "node:path";

import {
  AGDS_SIDECAR_CONTRACT,
  SIDECAR_DEFAULTS,
} from "@ai-game-design-studio/sidecar-proto";
import { describe, expect, it } from "vitest";

import {
  resolveHeadlessConfig,
  resolveHeadlessNamespaceBaseRoot,
} from "../src/headless-config.js";

const defaultResourceRoot = "/opt/agds/resources";

describe("resolveHeadlessNamespaceBaseRoot", () => {
  it("uses AGDS_DATA_DIR when provided", () => {
    expect(resolveHeadlessNamespaceBaseRoot(
      { AGDS_DATA_DIR: "/custom/data", OD_DATA_DIR: "/legacy/data" },
      "/home/dev",
    )).toBe(join("/custom/data", "namespaces"));
  });

  it("ignores deprecated OD_DATA_DIR when AGDS_DATA_DIR is absent", () => {
    expect(resolveHeadlessNamespaceBaseRoot(
      { OD_DATA_DIR: "/legacy/data" },
      "/home/dev",
    )).toBe(join("/home/dev", ".local", "share", "agds", "namespaces"));
  });

  it("uses XDG_DATA_HOME when AGDS_DATA_DIR is absent", () => {
    expect(resolveHeadlessNamespaceBaseRoot(
      { XDG_DATA_HOME: "/xdg/data", OD_DATA_DIR: "/legacy/data" },
      "/home/dev",
    )).toBe(join("/xdg/data", "agds", "namespaces"));
  });

  it("expands home prefixes in AGDS_DATA_DIR", () => {
    expect(resolveHeadlessNamespaceBaseRoot(
      { AGDS_DATA_DIR: "$HOME/.agds-headless" },
      "/home/dev",
    )).toBe(join("/home/dev", ".agds-headless", "namespaces"));
  });
});

describe("resolveHeadlessConfig", () => {
  it("uses AGDS namespace and resource-root values", () => {
    const config = resolveHeadlessConfig({
      defaultResourceRoot,
      env: {
        AGDS_DATA_DIR: "/custom/data",
        AGDS_NAMESPACE: "studio-headless",
        AGDS_RESOURCE_ROOT: "/custom/resources",
        OD_NAMESPACE: "legacy-headless",
        OD_RESOURCE_ROOT: "/legacy/resources",
      },
      homeDir: "/home/dev",
    });

    expect(config.namespace).toBe("studio-headless");
    expect(config.namespaceBaseRoot).toBe(join("/custom/data", "namespaces"));
    expect(config.resourceRoot).toBe("/custom/resources");
    expect(config.webOutputMode).toBe("server");
  });

  it("falls back to AGDS_SIDECAR_NAMESPACE without accepting deprecated OD namespace aliases", () => {
    const config = resolveHeadlessConfig({
      defaultResourceRoot,
      env: {
        AGDS_SIDECAR_NAMESPACE: "sidecar-headless",
        OD_NAMESPACE: "legacy-primary",
        OD_SIDECAR_NAMESPACE: "legacy-sidecar",
      },
      homeDir: "/home/dev",
    });

    expect(config.namespace).toBe("sidecar-headless");
  });

  it("ignores deprecated OD-only headless env aliases", () => {
    const config = resolveHeadlessConfig({
      defaultResourceRoot,
      env: {
        OD_DATA_DIR: "/legacy/data",
        OD_NAMESPACE: "legacy-primary",
        OD_RESOURCE_ROOT: "/legacy/resources",
        OD_SIDECAR_NAMESPACE: "legacy-sidecar",
      },
      homeDir: "/home/dev",
    });

    expect(config.namespace).toBe(
      AGDS_SIDECAR_CONTRACT.normalizeNamespace(SIDECAR_DEFAULTS.namespace),
    );
    expect(config.namespaceBaseRoot).toBe(join("/home/dev", ".local", "share", "agds", "namespaces"));
    expect(config.resourceRoot).toBe(defaultResourceRoot);
  });
});
