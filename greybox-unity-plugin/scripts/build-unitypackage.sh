#!/usr/bin/env bash
# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
#
# Build the Asset Store .unitypackage for com.greybox.studio.
#
# Invokes Unity in batch mode and calls
# Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine
# to stage the package under Assets/GreyboxStudio and emit a .unitypackage to
# the configured output path.
#
# Requirements:
#   - Unity 2022.3 LTS or newer installed via Unity Hub.
#   - A valid Unity license activated for the editor account running this
#     script.
#   - The repository must be a valid Unity project root (or the export will
#     create a temporary smoke project automatically via
#     Validation~/unity-package-export.mjs - see below).
#
# Environment variables:
#   UNITY_PATH                 - absolute path to the Unity executable.
#                                Defaults to a macOS Unity Hub install.
#   UNITY_VERSION              - Unity stream tag (default 2022.3.74f1).
#   GREYBOX_PACKAGE_VERSION    - Override package version (default reads
#                                package.json).
#   GREYBOX_OUTPUT             - Override output path (default
#                                dist/greybox-studio-<version>.unitypackage).
#   GREYBOX_PROJECT_PATH       - Override staging project (default
#                                .tmp/asset-store-export).
#   GREYBOX_MANIFEST           - Override manifest path (default
#                                Validation~/artifacts/unitypackage-export.json).
#
# Exit codes:
#   0  - export produced a non-empty .unitypackage; size + sha256 printed.
#   1  - Unity not found, export failed, or the output is missing/empty.

set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEFAULT_UNITY_MAC="/Applications/Unity/Hub/Editor/2022.3.74f1/Unity.app/Contents/MacOS/Unity"
DEFAULT_UNITY_LINUX="/opt/unity/Editor/Unity"
DEFAULT_UNITY_WIN="/c/Program Files/Unity/Hub/Editor/2022.3.74f1/Editor/Unity.exe"

resolve_default_unity_path() {
  case "$(uname -s)" in
    Darwin) echo "${DEFAULT_UNITY_MAC}" ;;
    Linux) echo "${DEFAULT_UNITY_LINUX}" ;;
    MINGW*|MSYS*|CYGWIN*) echo "${DEFAULT_UNITY_WIN}" ;;
    *) echo "" ;;
  esac
}

read_package_version() {
  node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('${PACKAGE_ROOT}/package.json','utf8')).version);"
}

UNITY_PATH="${UNITY_PATH:-$(resolve_default_unity_path)}"
UNITY_VERSION="${UNITY_VERSION:-2022.3.74f1}"
GREYBOX_PACKAGE_VERSION="${GREYBOX_PACKAGE_VERSION:-$(read_package_version)}"
GREYBOX_OUTPUT="${GREYBOX_OUTPUT:-${PACKAGE_ROOT}/dist/greybox-studio-${GREYBOX_PACKAGE_VERSION}.unitypackage}"
GREYBOX_PROJECT_PATH="${GREYBOX_PROJECT_PATH:-${PACKAGE_ROOT}/.tmp/asset-store-export}"
GREYBOX_MANIFEST="${GREYBOX_MANIFEST:-${PACKAGE_ROOT}/Validation~/artifacts/unitypackage-export.json}"

echo "Greybox Unity Asset Store .unitypackage build"
echo "  package:        com.greybox.studio @ ${GREYBOX_PACKAGE_VERSION}"
echo "  unity:          ${UNITY_PATH}"
echo "  unity version:  ${UNITY_VERSION}"
echo "  output:         ${GREYBOX_OUTPUT}"
echo "  staging:        ${GREYBOX_PROJECT_PATH}"
echo "  manifest:       ${GREYBOX_MANIFEST}"

if [ -z "${UNITY_PATH}" ] || [ ! -x "${UNITY_PATH}" ]; then
  echo "ERROR: Unity executable not found at '${UNITY_PATH}'." >&2
  echo "Set UNITY_PATH=/path/to/Unity (e.g. /Applications/Unity/Hub/Editor/<version>/Unity.app/Contents/MacOS/Unity)." >&2
  exit 1
fi

mkdir -p "$(dirname "${GREYBOX_OUTPUT}")"
mkdir -p "$(dirname "${GREYBOX_MANIFEST}")"

# Delegate to Validation~/unity-package-export.mjs which already knows how to
# build a smoke project that installs com.greybox.studio via UPM and call
# Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine.
node "${PACKAGE_ROOT}/Validation~/unity-package-export.mjs" \
  --unity "${UNITY_PATH}" \
  --unity-version "${UNITY_VERSION}" \
  --project-path "${GREYBOX_PROJECT_PATH}" \
  --output "${GREYBOX_OUTPUT}" \
  --manifest "${GREYBOX_MANIFEST}"

if [ ! -s "${GREYBOX_OUTPUT}" ]; then
  echo "ERROR: Unity did not produce a .unitypackage at ${GREYBOX_OUTPUT}." >&2
  exit 1
fi

BYTES=$(wc -c < "${GREYBOX_OUTPUT}" | tr -d ' ')
if command -v shasum >/dev/null 2>&1; then
  SHA=$(shasum -a 256 "${GREYBOX_OUTPUT}" | awk '{print $1}')
elif command -v sha256sum >/dev/null 2>&1; then
  SHA=$(sha256sum "${GREYBOX_OUTPUT}" | awk '{print $1}')
else
  SHA="(no sha256 tool available)"
fi

echo "PASS Asset Store .unitypackage produced"
echo "  path:   ${GREYBOX_OUTPUT}"
echo "  bytes:  ${BYTES}"
echo "  sha256: ${SHA}"
