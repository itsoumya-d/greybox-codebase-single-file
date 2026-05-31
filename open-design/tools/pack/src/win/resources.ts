import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { hashJson, hashPath, ToolPackCache } from "../cache.js";
import type { ToolPackConfig } from "../config.js";
import { copyBundledResourceTrees, winResources } from "../resources.js";
import type { WinPaths, ResourceTreeCacheMetadata } from "./types.js";

async function createResourceTreeCacheKey(config: ToolPackConfig): Promise<string> {
  return hashJson({
    assetsCommunityPets: await hashPath(join(config.workspaceRoot, "assets", "community-pets")),
    assetsFrames: await hashPath(join(config.workspaceRoot, "assets", "frames")),
    assetsPromptTemplates: await hashPath(join(config.workspaceRoot, "assets", "prompt-templates")),
    craft: await hashPath(join(config.workspaceRoot, "craft")),
    gameArtBibles: await hashPath(join(config.workspaceRoot, "game-art-bibles")),
    node: "win.resource-tree",
    promptTemplates: await hashPath(join(config.workspaceRoot, "prompt-templates")),
    schemaVersion: 1,
    skills: await hashPath(join(config.workspaceRoot, "skills")),
  });
}

export type ResourceTreeResult = {
  key: string;
  resourceRoot: string;
};

export async function prepareResourceTree(
  config: ToolPackConfig,
  paths: WinPaths,
  cache: ToolPackCache,
  options: { materialize: boolean },
): Promise<ResourceTreeResult> {
  const key = await createResourceTreeCacheKey(config);
  const node = {
    id: "win.resource-tree",
    key,
    outputs: ["agds"],
    invalidate: async () => null,
    build: async ({ entryRoot }: { entryRoot: string }): Promise<ResourceTreeCacheMetadata> => {
      const resourceRoot = join(entryRoot, "agds");
      await mkdir(resourceRoot, { recursive: true });
      await copyBundledResourceTrees({
        workspaceRoot: config.workspaceRoot,
        resourceRoot,
      });
      return { resourceName: "agds" };
    },
  };
  const manifest = await cache.acquire({
    materialize: options.materialize ? [{ from: "agds", to: paths.resourceRoot }] : [],
    node,
  });
  return {
    key,
    resourceRoot: options.materialize ? paths.resourceRoot : join(manifest.entryPath, "agds"),
  };
}

export async function copyWinIcon(paths: WinPaths): Promise<void> {
  await mkdir(dirname(paths.winIconPath), { recursive: true });
  await cp(winResources.icon, paths.winIconPath);
}
