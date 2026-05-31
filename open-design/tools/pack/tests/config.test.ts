import { afterEach, describe, expect, it } from "vitest";

import { resolveToolPackConfig } from "../src/config.js";

const ENV_KEYS = ["AGDS_WEB_OUTPUT_MODE", "OD_WEB_OUTPUT_MODE"] as const;
const originalEnv = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  originalEnv.clear();
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string): void {
  if (!originalEnv.has(key)) originalEnv.set(key, process.env[key]);
  process.env[key] = value;
}

describe("resolveToolPackConfig", () => {
  it("uses AGDS_WEB_OUTPUT_MODE for desktop packaged web output", () => {
    setEnv("AGDS_WEB_OUTPUT_MODE", "server");

    expect(resolveToolPackConfig("mac").webOutputMode).toBe("server");
    expect(resolveToolPackConfig("win").webOutputMode).toBe("server");
  });

  it("ignores deprecated OD_WEB_OUTPUT_MODE", () => {
    setEnv("OD_WEB_OUTPUT_MODE", "server");

    expect(resolveToolPackConfig("mac").webOutputMode).toBe("standalone");
    expect(resolveToolPackConfig("win").webOutputMode).toBe("standalone");
  });
});
