import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, test } from "vitest";
import { createJsonIpcServer, type JsonIpcServerHandle } from "@ai-game-design-studio/sidecar";
import { SIDECAR_ENV, SIDECAR_MESSAGES } from "@ai-game-design-studio/sidecar-proto";
import { resolveMcpDaemonUrl, MCP_DEFAULT_DAEMON_URL } from "../src/mcp-daemon-url.js";

// On Windows the sidecar IPC contract switches to named pipes whose
// names are not relocatable via AGDS_SIDECAR_IPC_BASE, so the discovery
// case cannot use a per-test temp socket; skip just that case there.
const ipcTest = process.platform === "win32" ? test.skip : test;
const deprecatedDaemonUrlEnv = ["OD", "DAEMON", "URL"].join("_");
const deprecatedSidecarIpcBaseEnv = ["OD", "SIDECAR", "IPC", "BASE"].join("_");
const deprecatedSidecarNamespaceEnv = ["OD", "SIDECAR", "NAMESPACE"].join("_");

// Verifies the resolution chain: --daemon-url > AGDS_DAEMON_URL >
// sidecar IPC status discovery > AGDS default. Each layer must short-circuit the next so the spawned
// `agds mcp` follows the live daemon across
// restarts without re-pasting the install snippet.

describe("resolveMcpDaemonUrl", () => {
  let ipcBaseDir: string;

  beforeAll(() => {
    ipcBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "agds-mcp-resolve-"));
  });

  afterAll(() => {
    fs.rmSync(ipcBaseDir, { recursive: true, force: true });
  });

  it("prefers the explicit --daemon-url flag", async () => {
    const url = await resolveMcpDaemonUrl({
      flagUrl: "http://flag.example:1111",
      env: {
        AGDS_DAEMON_URL: "http://agds-env.example:3333",
        [deprecatedDaemonUrlEnv]: "http://env.example:2222",
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
      },
    });
    expect(url).toBe("http://flag.example:1111");
  });

  it("prefers AGDS_DAEMON_URL when no flag given", async () => {
    const url = await resolveMcpDaemonUrl({
      env: {
        AGDS_DAEMON_URL: "http://agds-env.example:3333",
        [deprecatedDaemonUrlEnv]: "http://env.example:2222",
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
      },
    });
    expect(url).toBe("http://agds-env.example:3333");
  });

  it("ignores deprecated OD_DAEMON_URL when no AGDS env is present", async () => {
    const url = await resolveMcpDaemonUrl({
      env: {
        [deprecatedDaemonUrlEnv]: "http://env.example:2222",
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
      },
      timeoutMs: 200,
    });
    expect(url).toBe(MCP_DEFAULT_DAEMON_URL);
  });

  it("ignores deprecated OD_DAEMON_URL when AGDS_DAEMON_URL is blank", async () => {
    const url = await resolveMcpDaemonUrl({
      env: {
        AGDS_DAEMON_URL: " ",
        [deprecatedDaemonUrlEnv]: "http://env.example:2222",
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
      },
      timeoutMs: 200,
    });
    expect(url).toBe(MCP_DEFAULT_DAEMON_URL);
  });

  it("returns the AGDS default when no flag/env/socket is available", async () => {
    const url = await resolveMcpDaemonUrl({
      env: {
        // Point IPC discovery at a directory with no socket; discovery
        // should fail silently and we fall back to the default.
        [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
        [SIDECAR_ENV.NAMESPACE]: "missing-ns",
      },
      timeoutMs: 200,
    });
    expect(url).toBe(MCP_DEFAULT_DAEMON_URL);
  });

  ipcTest("discovers the live daemon URL via the sidecar IPC status socket", async () => {
    const namespace = "discover-test";
    const namespaceDir = path.join(ipcBaseDir, namespace);
    fs.mkdirSync(namespaceDir, { recursive: true });
    const socketPath = path.join(namespaceDir, "daemon.sock");
    let ipc: JsonIpcServerHandle | null = null;
    try {
      ipc = await createJsonIpcServer({
        socketPath,
        handler: (message) => {
          if (
            message != null &&
            typeof message === "object" &&
            (message as { type?: unknown }).type === SIDECAR_MESSAGES.STATUS
          ) {
            return {
              pid: 4242,
              state: "running",
              updatedAt: new Date().toISOString(),
              url: "http://127.0.0.1:54321",
            };
          }
          throw new Error("unexpected message");
        },
      });

      const url = await resolveMcpDaemonUrl({
        env: {
          [SIDECAR_ENV.IPC_BASE]: ipcBaseDir,
          [SIDECAR_ENV.NAMESPACE]: namespace,
        },
        timeoutMs: 1000,
      });
      expect(url).toBe("http://127.0.0.1:54321");
    } finally {
      await ipc?.close();
    }
  });

  ipcTest("ignores deprecated sidecar IPC env aliases", async () => {
    const namespace = "deprecated-sidecar";
    const namespaceDir = path.join(ipcBaseDir, namespace);
    fs.mkdirSync(namespaceDir, { recursive: true });
    const socketPath = path.join(namespaceDir, "daemon.sock");
    let ipc: JsonIpcServerHandle | null = null;
    try {
      ipc = await createJsonIpcServer({
        socketPath,
        handler: () => ({
          pid: 4243,
          state: "running",
          updatedAt: new Date().toISOString(),
          url: "http://127.0.0.1:54322",
        }),
      });

      const url = await resolveMcpDaemonUrl({
        env: {
          [SIDECAR_ENV.IPC_BASE]: path.join(ipcBaseDir, "canonical-empty"),
          [deprecatedSidecarIpcBaseEnv]: ipcBaseDir,
          [deprecatedSidecarNamespaceEnv]: namespace,
        },
        timeoutMs: 1000,
      });
      expect(url).toBe(MCP_DEFAULT_DAEMON_URL);
    } finally {
      await ipc?.close();
    }
  });

  ipcTest("ignores deprecated sidecar IPC base even when namespace is canonical", async () => {
    const namespace = "oldbase";
    const namespaceDir = path.join(ipcBaseDir, namespace);
    fs.mkdirSync(namespaceDir, { recursive: true });
    const socketPath = path.join(namespaceDir, "daemon.sock");
    let ipc: JsonIpcServerHandle | null = null;
    try {
      ipc = await createJsonIpcServer({
        socketPath,
        handler: () => ({
          pid: 4244,
          state: "running",
          updatedAt: new Date().toISOString(),
          url: "http://127.0.0.1:54323",
        }),
      });

      const url = await resolveMcpDaemonUrl({
        env: {
          [deprecatedSidecarIpcBaseEnv]: ipcBaseDir,
          [SIDECAR_ENV.NAMESPACE]: namespace,
        },
        timeoutMs: 1000,
      });
      expect(url).toBe(MCP_DEFAULT_DAEMON_URL);
    } finally {
      await ipc?.close();
    }
  });
});
