export const PRODUCT_NAME = "AI Game Design Studio";
export const DESKTOP_LOG_ECHO_ENV = "AGDS_DESKTOP_LOG_ECHO";
export const WEB_STANDALONE_HOOK_CONFIG_ENV = "AGDS_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
export const WEB_STANDALONE_RESOURCE_NAME = "agds-web-standalone";
export const ELECTRON_BUILDER_ASAR = false;
export const ELECTRON_BUILDER_BUILD_DEPENDENCIES_FROM_SOURCE = false;
export const ELECTRON_BUILDER_NODE_GYP_REBUILD = false;
export const ELECTRON_BUILDER_NPM_REBUILD = false;
export const ELECTRON_REBUILD_MODE = "sequential" as const;
export const ELECTRON_REBUILD_NATIVE_MODULES = ["better-sqlite3"] as const;
export const ELECTRON_BUILDER_FILE_PATTERNS = [
  "**/*",
  "!**/node_modules/.bin",
  "!**/node_modules/electron{,/**/*}",
  "!**/*.map",
  "!**/*.tsbuildinfo",
  "!**/.next/cache",
  "!**/.next/cache/**",
  "!**/node_modules/better-sqlite3/build/Release/obj",
  "!**/node_modules/better-sqlite3/build/Release/obj/**",
  "!**/node_modules/better-sqlite3/deps",
  "!**/node_modules/better-sqlite3/deps/**",
] as const;
export const NSIS_INSTALLER_LANGUAGE_BY_WEB_LOCALE = {
  en: "en_US",
  fa: "fa_IR",
  "pt-BR": "pt_BR",
  ru: "ru_RU",
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
} as const;
export const INTERNAL_PACKAGES = [
  { directory: "packages/contracts", name: "@ai-game-design-studio/contracts" },
  { directory: "packages/sidecar-proto", name: "@ai-game-design-studio/sidecar-proto" },
  { directory: "packages/sidecar", name: "@ai-game-design-studio/sidecar" },
  { directory: "packages/platform", name: "@ai-game-design-studio/platform" },
  { directory: "apps/daemon", name: "@ai-game-design-studio/daemon" },
  { directory: "apps/web", name: "@ai-game-design-studio/web" },
  { directory: "apps/desktop", name: "@ai-game-design-studio/desktop" },
  { directory: "apps/packaged", name: "@ai-game-design-studio/packaged" },
] as const;
