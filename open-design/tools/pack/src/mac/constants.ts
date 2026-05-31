export const PRODUCT_NAME = "AI Game Design Studio";

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

export const DESKTOP_LOG_ECHO_ENV = "AGDS_DESKTOP_LOG_ECHO";
export const WEB_STANDALONE_HOOK_CONFIG_ENV = "AGDS_TOOLS_PACK_WEB_STANDALONE_HOOK_CONFIG";
export const WEB_STANDALONE_RESOURCE_NAME = "agds-web-standalone";
export const ELECTRON_BUILDER_ASAR = false;
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
// Keep Electron native UI resources aligned with the Web UI locale set.
// Electron uses underscore-separated locale ids; its base "es" resource
// covers the app's es-ES dictionary.
export const MAC_ELECTRON_LANGUAGES = [
  "en",
  "de",
  "zh_CN",
  "zh_TW",
  "pt_BR",
  "es",
  "ru",
  "fa",
  "ar",
  "ja",
  "ko",
  "pl",
  "hu",
  "fr",
  "uk",
  "tr",
] as const;
