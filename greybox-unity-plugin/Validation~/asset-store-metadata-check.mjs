#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateReleaseWorkflowPolicy } from './release-workflow-policy.mjs';

const REQUIRED_DEPENDENCIES = {
  'com.unity.editorcoroutines': '1.0.0',
  'com.unity.nuget.newtonsoft-json': '3.2.1',
  'com.unity.inputsystem': '1.7.0',
  'com.unity.addressables': '1.21.21',
  'com.unity.ugui': '1.0.0',
  'com.unity.ui': '1.0.0',
};

const ASMDEF_REFERENCE_DEPENDENCIES = {
  'Unity.Addressables.Editor': 'com.unity.addressables',
  'Unity.EditorCoroutines.Editor': 'com.unity.editorcoroutines',
  'Unity.InputSystem': 'com.unity.inputsystem',
  'Unity.Newtonsoft.Json': 'com.unity.nuget.newtonsoft-json',
  'Unity.TextMeshPro': 'com.unity.textmeshpro',
  'UnityEngine.UI': 'com.unity.ugui',
};

const REQUIRED_SAMPLES = [
  'Samples~/2D Platformer',
  'Samples~/Top-Down Roguelike',
  'Samples~/Mobile Idle',
];

const REQUIRED_SAMPLE_EXTENSIONS = ['.gameview', '.design', '.gbhud', '.levelboard'];

const REQUIRED_MCP_TOOLS = [
  'unity.getSceneHierarchy',
  'unity.createGameObject',
  'unity.addComponent',
  'unity.setField',
  'unity.assignAsset',
  'unity.runEditModeTest',
  'unity.captureGameViewScreenshot',
  'unity.buildAddressables',
];
const CONTROL_FREE_STRING_PATTERN = '^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$';
const CONTROL_CHAR_FREE_STRING_PATTERN = '^(?!.*[\\x00-\\x1F\\x7F-\\x9F]).*$';
const SAFE_ASSET_PATH_PATTERN = '^(?!.*[\\x00-\\x1F\\x7F-\\x9F])Assets/(?!.*//)(?!.*\\\\)(?!.*(?:^|/)\\.\\.?(?:/|$)).+$';

const REQUIRED_DOCS = [
  'README.md',
  'STORE_LISTING.md',
  'LICENSE.md',
  'LICENSE.proprietary',
  'Third-Party Notices.txt',
  'CHANGELOG.md',
  'Documentation~/round-trip-sync.md',
];

const REQUIRED_TIER_LINES = [
  '- Free Personal: 3 projects max, watermarked artifacts, no round-trip sync.',
  '- Indie: $149 one-time. Unlimited projects, no watermark, one-way import only.',
  '- Pro: $399 one-time + $9/mo. Round-trip sync, MCP bridge, priority queue.',
  '- Studio site license: $2,999 one-time + $499/yr. Up to 25 seats, SSO, custom skill packs.',
];

const AI_ASSISTED_PATTERN = /\bAI-assisted\b/i;
const UNQUALIFIED_AI_GENERATED_PATTERN = /\bAI-generated\b/i;
const HUMAN_DESIGNER_CREDIT_PATTERN = /Human designer credit:\s*[^.\n,"\]]+|Generator credit:\s*Greybox \+ [^.\n]+|<meta\s+name="generator"\s+content="Greybox \+ [^"]+"/i;
const GREYBOX_DERIVED_GENERIC_PATTERN = /\b(?:greyboxed|greyboxing|greyboxes)\b/i;

const BANNED_ARCHIVE_OR_EXECUTABLE_EXTENSIONS = new Set([
  '.apk',
  '.app',
  '.dll',
  '.dmg',
  '.exe',
  '.msi',
  '.pkg',
  '.tgz',
  '.unitypackage',
  '.zip',
]);
const PROPRIETARY_SOURCE_HEADER = 'Proprietary and confidential. Copyright (c) 2026 Greybox Studio.';
const PROPRIETARY_SOURCE_EXTENSIONS = new Set(['.cs', '.mjs']);
const APACHE_OR_SPDX_PATTERN = /\bSPDX-License-Identifier\b|\bApache-2\.0\b/u;

export function isValidSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(String(value ?? ''));
}

export function isSemverAtLeast(value, minimum) {
  const left = semverCore(value);
  const right = semverCore(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return true;
    if (left[index] < right[index]) return false;
  }
  return true;
}

function semverCore(value) {
  const match = String(value ?? '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function packageSizeBytes(root) {
  let total = 0;
  for (const file of walkFiles(root)) total += statSync(join(root, file)).size;
  return total;
}

export function validatePackage(root, options = {}) {
  const errors = [];
  const warnings = [];
  const manifest = readJson(join(root, 'package.json'), errors);
  const files = walkFiles(root);

  if (manifest) {
    expectEqual(errors, manifest.name, 'com.greybox.studio', 'package name');
    expectEqual(errors, manifest.displayName, 'Greybox Studio', 'displayName');
    expectString(errors, manifest.description, 'description');
    expectEqual(errors, manifest.unity, '2022.3', 'lowest Unity version');
    const version = String(manifest.version ?? '');
    if (!isValidSemver(version)) {
      errors.push('version must be semantic versioning');
    } else {
      if (options.submission && version.includes('-')) {
        errors.push('submission mode requires a stable package version without prerelease suffix');
      }
      if (options.submission && !isSemverAtLeast(version, '1.0.0')) {
        errors.push('submission mode requires package version 1.0.0 or later');
      }
      if (!options.submission && version.includes('-')) {
        warnings.push('version is prerelease; switch to a stable MAJOR.MINOR.PATCH before final Asset Store submission');
      }
    }
    expectEqual(errors, manifest.license, 'See LICENSE.md file', 'license');
    expectString(errors, manifest.documentationUrl, 'documentationUrl');
    expectString(errors, manifest.changelogUrl, 'changelogUrl');
    expectString(errors, manifest.licensesUrl, 'licensesUrl');
    if (!Array.isArray(manifest.keywords) || manifest.keywords.length < 5) {
      errors.push('keywords must include at least five discoverability terms');
    } else {
      validateKeywordBrandHygiene(manifest.keywords, errors);
    }
    if (manifest.author?.name !== 'Greybox Studio' || manifest.author?.url !== 'https://greybox.studio') {
      errors.push('author must name Greybox Studio and https://greybox.studio');
    }
    for (const [name, version] of Object.entries(REQUIRED_DEPENDENCIES)) {
      if (manifest.dependencies?.[name] !== version) {
        errors.push(`dependency ${name} must be pinned to ${version}`);
      }
    }
    const samplePaths = new Set(Array.isArray(manifest.samples) ? manifest.samples.map((sample) => sample?.path) : []);
    for (const sample of REQUIRED_SAMPLES) {
      if (!samplePaths.has(sample)) errors.push(`missing package sample manifest entry: ${sample}`);
    }
  }

  for (const doc of REQUIRED_DOCS) {
    if (!files.includes(doc)) errors.push(`missing required documentation/legal file: ${doc}`);
  }
  for (const sample of REQUIRED_SAMPLES) {
    if (!files.includes(`${sample}/README.md`)) errors.push(`missing sample README: ${sample}/README.md`);
  }

  validateListing(root, errors);
  validateHonestAiSurfaces(root, files, errors);
  validateRuntimeProvenance(root, files, errors);
  validateSamples(root, files, errors);
  validatePlayablePlatformerSample(root, files, errors);
  validateUnityTestAssemblies(root, files, errors);
  validateAsmdefDependencyReferences(root, files, manifest, errors);
  validateThirdPartyNotices(root, files, manifest, errors);
  validateMcpBridge(root, files, manifest, errors);
  validateMcpTransformRoundTrip(root, files, errors);
  validateMcpTileRecordFieldRoundTrip(root, files, errors);
  validateMcpFieldTypeRoundTrip(root, files, errors);
  validateMcpObjectCreationRoundTrip(root, files, errors);
  validateMcpAssetAssignmentRoundTrip(root, files, errors);
  validateCiWorkflow(root, files, errors);
  validateReleaseWorkflow(root, files, errors);
  validateAssetStoreUnityPackageExporter(root, files, errors);
  validateSecretStorage(root, files, errors);
  validateLicenseCapabilities(root, files, errors);
  validateWatermarkEnforcement(root, files, errors);
  validateRoundTripMarkers(root, files, errors);
  validateDiffApplier(root, files, errors);
  validateRoundTripLatency(root, files, errors);
  validateArtifactRefresher(root, files, errors);
  validateProjectArtifactImportMenu(root, files, errors);
  validateConflictInbox(root, files, errors);
  validateProModuleEngineTargetSurface(root, files, errors);
  validateEnginePackagePreflightSurface(root, files, errors);
  validateHudImporter(root, files, errors);
  validateArtBibleImporter(root, files, errors);
  validatePrefabAssetRealization(root, files, errors);
  validateUnityPackageImportContract(root, files, errors);
  validateAddressablesTagging(root, files, errors);
  validateFilesystem(files, errors);
  validateProprietarySourceHygiene(root, files, errors);
  validateCSharpNamespaces(root, files, errors);

  const totalBytes = packageSizeBytes(root);
  if (totalBytes > 6 * 1024 * 1024 * 1024) errors.push('package exceeds Unity Asset Store 6GB submission limit');

  return { errors, warnings, totalBytes };
}

function validateMcpBridge(root, files, manifest, errors) {
  const definitionsPath = 'Editor/McpBridge/McpToolDefinitions.cs';
  const serverPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const testPath = 'Tests/EditMode/McpBridgeTests.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (!files.includes(definitionsPath)) errors.push(`missing MCP bridge definitions: ${definitionsPath}`);
  if (!files.includes(serverPath)) errors.push(`missing MCP bridge server: ${serverPath}`);
  if (!files.includes(definitionsPath) || !files.includes(serverPath)) return;

  const definitions = readFileSync(join(root, definitionsPath), 'utf8');
  const server = readFileSync(join(root, serverPath), 'utf8');
  const packageVersion = String(manifest?.version ?? '');
  if (!packageVersion || !server.includes(`private const string McpServerVersion = "${packageVersion}";`) || !/\["version"\]\s*=\s*McpServerVersion/u.test(server)) {
    errors.push('MCP initialize serverInfo.version must match package.json version');
  }
  const toolsJson = parseMcpToolsJson(definitions, errors);
  if (toolsJson) {
    const tools = Array.isArray(toolsJson.tools) ? toolsJson.tools : [];
    const toolNames = tools.map((tool) => tool?.name).filter(Boolean);
    for (const tool of REQUIRED_MCP_TOOLS) {
      if (!toolNames.includes(tool)) errors.push(`MCP tools/list missing required tool: ${tool}`);
    }
    for (const name of toolNames) {
      if (!REQUIRED_MCP_TOOLS.includes(name)) errors.push(`MCP tools/list exposes unexpected tool: ${name}`);
    }
    for (const tool of tools) {
      if (tool?.inputSchema?.additionalProperties !== false) errors.push(`MCP tool schema must reject unknown arguments: ${tool?.name}`);
      const annotations = tool?.annotations ?? {};
      if (typeof annotations.title !== 'string'
        || annotations.title.trim().length === 0
        || typeof annotations.readOnlyHint !== 'boolean'
        || typeof annotations.destructiveHint !== 'boolean'
        || typeof annotations.idempotentHint !== 'boolean'
        || typeof annotations.openWorldHint !== 'boolean') {
        errors.push(`MCP tool must advertise safety annotations: ${tool?.name}`);
      }
    }
    const byName = new Map(tools.map((tool) => [tool?.name, tool]));
    if (byName.get('unity.getSceneHierarchy')?.annotations?.readOnlyHint !== true
      || byName.get('unity.getSceneHierarchy')?.annotations?.idempotentHint !== true
      || tools.filter((tool) => tool?.name !== 'unity.getSceneHierarchy').some((tool) => tool?.annotations?.readOnlyHint !== false)
      || tools.some((tool) => tool?.annotations?.destructiveHint !== false || tool?.annotations?.openWorldHint !== false)) {
      errors.push('MCP tool annotations must distinguish read-only hierarchy inspection from mutating Unity actions');
    }
    const screenshot = byName.get('unity.captureGameViewScreenshot')?.inputSchema?.properties ?? {};
    if (screenshot.width?.type !== 'integer' || screenshot.height?.type !== 'integer' || screenshot.width?.maximum !== 4096 || screenshot.height?.maximum !== 4096) {
      errors.push('MCP screenshot schema must advertise bounded integer dimensions');
    }
    const runTest = byName.get('unity.runEditModeTest')?.inputSchema?.properties?.testName;
    if (runTest?.minLength !== 1 || runTest?.maxLength !== 256 || runTest?.pattern !== CONTROL_FREE_STRING_PATTERN) {
      errors.push('MCP runEditModeTest schema must advertise bounded control-free testName');
    }
    const boundedStringArgs = [
      ['unity.createGameObject', 'name', 128],
      ['unity.createGameObject', 'parent', 512],
      ['unity.createGameObject', 'parentId', 512],
      ['unity.addComponent', 'gameObjectId', 512],
      ['unity.addComponent', 'componentType', 512],
      ['unity.setField', 'gameObjectId', 512],
      ['unity.setField', 'componentType', 512],
      ['unity.setField', 'fieldName', 128],
      ['unity.assignAsset', 'gameObjectId', 512],
      ['unity.assignAsset', 'componentType', 512],
      ['unity.assignAsset', 'fieldName', 128],
    ];
    for (const [toolName, propName, maxLength] of boundedStringArgs) {
      const schema = byName.get(toolName)?.inputSchema?.properties?.[propName];
      if (schema?.type !== 'string' || schema?.minLength !== 1 || schema?.maxLength !== maxLength || schema?.pattern !== CONTROL_FREE_STRING_PATTERN) {
        errors.push(`MCP ${toolName}.${propName} schema must advertise bounded control-free strings`);
      }
    }
    const setField = byName.get('unity.setField')?.inputSchema;
    const setFieldValueVariants = Array.isArray(setField?.properties?.value?.oneOf) ? setField.properties.value.oneOf : [];
    const setFieldStringValue = setFieldValueVariants.find((variant) => variant?.type === 'string');
    const setFieldStringArrayValue = setFieldValueVariants.find((variant) => variant?.type === 'array' && variant?.items?.type === 'string');
    if (
      setFieldStringValue?.maxLength !== 4096
      || setFieldStringArrayValue?.maxItems !== 64
      || setFieldStringArrayValue?.items?.maxLength !== 256
      || setFieldStringArrayValue?.items?.pattern !== CONTROL_CHAR_FREE_STRING_PATTERN
      || !setFieldValueVariants.some((variant) => variant?.$ref === '#/$defs/vector3')
      || !setFieldValueVariants.some((variant) => variant?.$ref === '#/$defs/color')
    ) {
      errors.push('MCP setField schema must advertise scalar, string array, Vector3, and Color value shapes');
    }
    const assetPath = byName.get('unity.assignAsset')?.inputSchema?.properties?.assetPath;
    if (assetPath?.pattern !== SAFE_ASSET_PATH_PATTERN || assetPath?.maxLength !== 512) {
      errors.push('MCP assignAsset schema must advertise canonical project-relative Assets/ paths');
    }
  }

  for (const tool of REQUIRED_MCP_TOOLS) {
    if (!definitions.includes(tool)) errors.push(`MCP definitions missing tool name: ${tool}`);
    if (!server.includes(`"${tool}"`)) errors.push(`MCP server does not route tool: ${tool}`);
  }
  const requiredServerSnippets = [
    'http://127.0.0.1:',
    'McpListenerPrefix',
    'TryStartMcpListener',
    'ResetMcpListenerStateAfterStartFailure',
    'failed to bind',
    'IsAuthorizedMcpRequest',
    'mcp_auth_required',
    'Authorization',
    'X-Greybox-Mcp-Token',
    'GreyboxSettings.GetOrCreateMcpBridgeToken',
    'GreyboxSettings.IsSafeMcpBridgeToken',
    'MaxMcpAuthorizationHeaderChars',
    'MaxMcpBrowserHeaderChars',
    'IsSafeMcpAuthHeader',
    'IsSafeMcpBrowserRequest',
    'IsSafeMcpBrowserUrlHeader',
    'IsSafeMcpFetchSiteHeader',
    'IPAddress.IsLoopback',
    'Sec-Fetch-Site',
    'mcp_browser_origin_forbidden',
    'McpAuthorizationHeaderMatches',
    'McpTokenMatches',
    'FixedTimeEquals',
    'StatusCode = statusCode',
    'IsAllowedMcpContentType',
    'mcp_unsupported_media_type',
    'Content-Type application/json',
    '"/mcp" => await HandleMcpJsonRpcAsync',
    'HandleMcpJsonRpcMessage',
    'HandleMcpJsonRpcMessageAsync',
    'JsonReaderException',
    'MaxMcpJsonRpcBatchItems',
    'empty JSON-RPC batch',
    'JSON-RPC batch may contain at most',
    'MaxMcpSceneHierarchyNodes',
    'MaxMcpSceneHierarchyDepth',
    'MaxMcpTilemapRecordReadback',
    'McpHierarchyBudget',
    'childrenTruncated',
    'nodeBudgetExceeded',
    'depthExceeded',
    'mcpHierarchy',
    'expectsResponse',
    'jsonrpc must be a string',
    'method must be a string',
    'tools/call params.name is required',
    'tools/call params.name must be a string',
    'TryReadDirectToolCallRequest',
    'mcp_invalid_tool_call',
    'tools/call body must be an object',
    'tools/call name must be a string',
    'tools/call arguments must be an object',
    'jsonrpc',
    'protocolVersion',
    'serverInfo',
    'tools/list',
    'tools/call',
    'McpToolSuccess',
    'DirectToolSuccess',
    'McpToolError',
    'structuredContent',
    'isError',
    'JsonRpcResult(id, McpToolError(ex.Message))',
    'DirectToolSuccess(structured)',
    'McpToolError(ex.Message).ToString(Formatting.None)',
    'ValidateMcpArguments',
    'Unexpected argument for',
    'Missing required argument for',
    'RequireMcpIntegerArgument',
    'go.transform.SetParent',
    'DescribeRoundTripEdit',
    'sourceFileName',
    'markerId',
    'DescribeRoundTripTransform',
    'roundTripTransform',
    'nameof(Transform.localPosition)',
    'DescribeAddableComponents',
    'addableComponents',
    'RecommendedMcpAddableComponentTypes',
    'ResolveMcpAddableComponentType',
    'IsRecommendedMcpAddableComponentType',
    'Component type is not advertised by scene hierarchy addableComponents',
    'AllowsMultipleMcpComponent',
    'RequireCanAddMcpComponent',
    'canAdd',
    'componentDetail',
    'DescribeWritableProperties',
    'writableProperties',
    'DescribeWritableFields',
    'writableFields',
    'DescribeWritableField',
    'DescribeWritableProperty',
    'DescribeMcpValueSchema',
    'valueSchema',
    'setTool',
    'allowedEnumValues',
    'Enum.GetNames',
    'DescribeAssetReferenceFields',
    'assetReferenceFields',
    'DescribeAssetReferenceMember',
    'assignTool',
    'DescribeGreyboxTilemap',
    'greyboxTilemap',
    'recordsTruncated',
    'tileAssetCount',
    'DescribeGreyboxDesignNode',
    'greyboxDesign',
    'DescribeGreyboxImportedArtifact',
    'greyboxImport',
    'canonicalGeneratedAssetPath',
    'exportedAssetPath',
    'exportedToIncomingSidecar',
    'DescribeUnityPrefabMetadata',
    'unityPrefab',
    'GetPrefabAssetPathOfNearestInstanceRoot',
    'nearestPrefabAssetPath',
    'sourcePrefabAssetPath',
    'DescribeWritableGameObjectFields',
    'writableGameObjectFields',
    'DescribeWritableGameObjectField',
    'acceptedAliases',
    'propagatesToChildren',
    'DefinedUnityTags',
    'allowedTags',
    'DefinedUnityLayers',
    'allowedLayers',
    'GreyboxDesignProperty',
    'roundTripFields',
    'GreyboxRoundTripFieldMapper.TryMap',
    'authoredPosition',
    'authoredRotationEuler',
    'authoredScale',
    'RequireComponentType',
    'typeof(Component).IsAssignableFrom',
    'type.IsAbstract',
    'ResolveAssignableMember',
    'RequireMcpSetFieldValueType',
    'field.IsInitOnly',
    'GetIndexParameters().Length',
    'GetSetMethod(false)',
    'ReadMcpCreateGameObjectParentId',
    'parent and parentId must match',
    'ConvertValue',
    'simpleNameMatches',
    'Type name is ambiguous',
    'fully qualified component type name',
    'ReadVector3',
    'ReadColor',
    'Undo.RecordObject',
    'PrefabUtility.RecordPrefabInstancePropertyModifications',
    'MarkMcpEditedSceneDirty',
    'EditorSceneManager.MarkSceneDirty',
    'sceneDirty',
    'RunEditModeTest',
    'NormalizeMcpTestName',
    'MaxMcpTestNameLength',
    'TestRunnerApi',
    'NormalizeMcpScreenshotDimension',
    'MaxMcpScreenshotDimension',
    'MaxMcpScreenshotFiles',
    'McpScreenshotPollAfterMs',
    'McpScreenshotDirectory',
    'CreateMcpScreenshotPath',
    'DescribeMcpScreenshotCapture',
    'absolutePath',
    'Path.GetFullPath(path)',
    'fileName',
    'asyncCapture',
    'pollAfterMs',
    'PruneMcpScreenshotCache',
    'IsSafeMcpScreenshotFileName',
    'Directory.CreateDirectory',
    'Temp/Greybox/McpScreenshots',
    'MaxMcpSetFieldStringValueLength',
    'MaxMcpSetFieldStringArrayItems',
    'MaxMcpSetFieldStringArrayItemLength',
    'ValidateMcpSetFieldValueArgument',
    'ValidateMcpSetFieldValueShape',
    'CanReadVector3',
    'CanReadColor',
    'CanReadMcpStringArray',
    'string array items may not contain control characters',
    'string, string array, number, boolean, Vector3, or Color',
    'MaxMcpEnumValueLength',
    'ConvertEnumValue',
    'ReadMcpStringFieldValue',
    'ReadMcpStringArrayValue',
    'ReadMcpIntFieldValue',
    'ReadMcpInt32Value',
    'ReadMcpFloatFieldValue',
    'ReadMcpBoolFieldValue',
    'must be a JSON string',
    'must be a JSON integer',
    '32-bit integer',
    'finite JSON number',
    'must be a JSON boolean',
    'IsJsonFiniteNumber',
    'ReadFiniteFloat',
    'ReadFiniteDouble',
    'double.IsNaN',
    'double.IsInfinity',
    'float.IsNaN',
    'float.IsInfinity',
    'numeric value must be finite',
    'Enum.IsDefined',
    'named enum value',
    'Enum value must be a string',
    'ValidateMcpStringArguments',
    'RequireMcpStringArgument',
    'ValidateOptionalMcpStringArgument',
    'must be a string',
    'characters or fewer',
    'ValidateMcpVector3Arguments',
    'ValidateOptionalMcpVector3Argument',
    'IsJsonNumber',
    'exactly 3 numbers',
    'exactly 3 or 4 numbers',
    'numeric x/y/z',
    'numeric r/g/b',
    '6- or 8-digit',
    'TryApplyGameViewSize',
    'UnityEditor.GameViewSizes',
    'UnityEditor.GameViewSizeType',
    'FixedResolution',
    'selectedSizeIndex',
    'GetTotalCount',
    'AddCustomSize',
    'gameViewSized',
    'SafeGetTypes',
  ];
  for (const snippet of requiredServerSnippets) {
    if (!server.includes(snippet)) errors.push(`MCP server missing required implementation detail: ${snippet}`);
  }
  if (/runEditModeTest"\s*=>\s*new JObject\s*\{\s*\["queued"\]\s*=\s*true/.test(server)) {
    errors.push('MCP runEditModeTest must invoke the Unity Test Runner, not return a stub queue response');
  }
  for (const snippet of ['SubmitMcpEditModeTestRun', 'DescribeMcpEditModeTestSubmission', 'CreateMcpEditModeTestRunId', 'NormalizeMcpUnityRunGuid', 'sanitizedTestName', 'testNameLength', 'submittedAtUtc', 'editModeFilter', 'resultContract', 'finalResultInResponse', 'ContainsMcpSensitiveText', 'testName may not contain paths or secrets']) {
    if (!server.includes(snippet)) errors.push(`MCP runEditModeTest must return the async Unity Test Runner submission contract without leaking unsafe names: ${snippet}`);
  }
  if (server.includes('http://0.0.0.0:')) errors.push('MCP bridge must bind loopback only, never 0.0.0.0');
  if (files.includes(smokePath)) {
    const smoke = readFileSync(join(root, smokePath), 'utf8');
    const smokeSnippets = [
      'McpBridgeHandlesProtocolAndHierarchySmoke', 'InvokeMcpJsonRpc', 'HandleMcpJsonRpc',
      'greybox-unity-mcp', 'GreyboxMcpServer.DescribeForMcp', 'roundTripTransform',
      'sourceFileName', 'greyboxDesign', 'greyboxImport', 'unityPrefab', 'addableComponents',
      'canAdd', 'writableGameObjectFields', 'phaseCount', 'componentDetails',
      'writableProperties', 'writableFields', 'valueSchema', 'componentDetail',
      'assetReferenceFields', 'roundTripFields', '$.actors[id=boss].position',
      '$.actors[id=boss].health', '$.actors[actorId=smoke-boss]',
      'Value<string>("actorId")', 'Value<int>("health")', 'Value<float>("moveSpeed")',
      'connectionDefault', 'createdConnection.ConnectionType', 'Value<float>("travelCost")',
      'spawnDefault', 'createdSpawn.SpawnRadius', 'Value<float>("spawnRadius")',
      'objectiveDefault', 'createdObjective.ObjectiveType', 'Value<string>("objectiveType")',
      'Value<int>("requiredCount")', 'hazardDefault', 'createdHazard.TickSeconds',
      'Value<float>("tickSeconds")', 'roomDefault', 'createdRoom.Size',
      'Value<string>("roomType")', 'encounterDefault', 'createdEncounter.EncounterType',
      'Value<string>("encounterType")', 'Value<float>("radius")',
      'tileDefault', 'createdTile.TileType', 'GetTile(new Vector3Int(3, 4, 0))',
      'generatedTileDefault', 'generatedSmokeTile.sprite', 'TileTextures.Length',
      'TileSprites.Length', 'Value<string>("type")', 'Value<int>("x")',
      'Value<bool>("isHazard")', 'Value<bool>("blocksMovement")',
      'goalDefault', 'createdGoal.SourceArtifactKind', 'checkpointDefault',
      'createdCheckpoint.RespawnPoint', 'Value<int>("maxActivations")',
      'Value<bool>("spawnOnStart")', 'coinDefault', 'createdCoin.SourceObjectiveDisplayName',
      'Value<string>("sourceObjectiveType")', 'McpBridgeCreatesAndEditsRoundTripObjects',
      'InvokeMcpTool', 'unity.createGameObject', 'unity.addComponent', 'unity.setField',
      'unity.assignAsset', 'sceneDirty', 'SmokeBossMesh', 'meshAssetPath',
      'PendingMcpRoundTripEditCount',
    ];
    for (const snippet of smokeSnippets) {
      if (!smoke.includes(snippet)) errors.push(`Unity import smoke must exercise MCP protocol and scene hierarchy behavior: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const tests = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['SceneHierarchyDescriptionIncludesGreyboxMetadataAndEditableFields', 'SceneHierarchyDescriptionIncludesBoundedTilemapReadback', 'SceneHierarchyDescriptionBoundsStringArrayReadbacks', 'SceneHierarchyDescriptionMarksDepthTruncation', 'SceneHierarchyDescriptionIncludesPrefabMetadataForPrefabInstances', 'SceneHierarchyDescriptionListsAssignableAssetReferenceFields', 'SceneHierarchyDescriptionListsWritablePropertiesForUnityComponents', 'SceneHierarchyDescriptionListsWritableGameObjectMetadata', 'AddComponentRejectsDuplicateMcpSingletonComponents', 'mcpHierarchy', 'childrenTruncated', 'depthExceeded', 'roundTripTransform', 'sourceFileName', 'markerId', 'greyboxDesign', 'greyboxImport', 'unityPrefab', 'addableComponents', 'FindAddableComponent', 'canAdd', 'writableGameObjectFields', 'acceptedAliases', 'propagatesToChildren', 'allowedTags', 'allowedLayers', 'unityTag', 'unityLayer', 'unityStatic', 'unityActive', 'writableProperties', 'writableFields', 'valueSchema', 'stringArray', 'new string(\'x\', 300)', 'allowedEnumValues', 'Light.intensity', 'Light.color', 'Light.type', 'nameof(GreyboxActorDefinition.Health)', 'nameof(GreyboxActorDefinition.AbilityIds)', 'assetReferenceFields', 'sharedMesh', 'sharedMaterial', 'nameof(Renderer.material)', 'LegacyMeshReference', 'componentDetail', 'canonicalGeneratedAssetPath', 'exportedAssetPath', 'exportedToIncomingSidecar', 'nearestPrefabAssetPath', 'sourcePrefabAssetPath', 'GreyboxDesignPropertyKind.Number', 'phaseCount', 'greyboxTilemap', 'tileAssetCount', 'tileTextureCount', 'tileSpriteCount', 'recordsTruncated', 'maxRecords', 'GreyboxLevelTilemap', 'GreyboxLevelTileRecord', '$.tilemap.tiles[tileId=spike-a]', 'roundTripFields', '$.actors[id=boss].position', '$.actors[id=boss].health', '$.actors[id=boss].abilities', 'nameof(Light)', 'not advertised']) {
      if (!tests.includes(snippet)) errors.push(`McpBridgeTests must cover Greybox design metadata in scene hierarchy: ${snippet}`);
    }
    for (const snippet of ['McpRunAndScreenshotInputsAreBounded', 'McpRunEditModeTestSubmissionContractInvokesRunnerAndTargetsEditMode', 'McpRunEditModeTestRejectsUnsafeNamesWithoutLeakingSensitiveText', 'InvokeSubmitMcpEditModeTestRun', 'runId', 'unityRunGuid', 'sanitizedTestName', 'testNameLength', 'submittedAtUtc', 'editModeFilter', 'resultContract', 'followUpIdentifier', 'finalResultInResponse', 'InvokeDescribeMcpScreenshotCapture', 'screenshot["absolutePath"]', 'screenshot["fileName"]', 'screenshot["asyncCapture"]', 'screenshot["pollAfterMs"]', 'Path.GetFullPath(screenshotPath)', 'McpAuthTokenMatchingIsStrictAndFixedTimeBacked', 'McpBrowserOriginHeadersMustBeLoopback', 'McpListenerPrefixIsLoopbackAndStartupFailureResetsState', 'McpPostContentTypeRequiresJson', 'McpJsonRpcBatchSizeIsBounded', 'McpJsonRpcEnvelopeStringsAreStrict', 'McpJsonRpcToolsCallParamsAreObjectShaped', 'McpToolResultEnvelopesExposeMcpErrorState', 'McpToolCallsRouteExecutionFailuresAsMcpResults', 'CreateLicensedMcpConfig', 'ClearLicensedMcpConfig', 'SetMcpActiveConfig', 'Assert.IsNull(failure["error"])', 'failure["result"]["isError"]', 'directFailure["isError"]', 'mcp-route-project', 'InvokeMcpToolSuccess', 'InvokeDirectToolSuccess', 'InvokeMcpToolError', 'InvokePrivateJObject', 'McpDirectToolCallRequestShapeIsValidatedBeforeLicense', 'McpRuntimeRejectsUnknownToolArguments', 'CreateGameObjectRejectsConflictingParentAliases', 'McpBuildAddressablesSummaryIncludesGeneratedLabels', 'McpAddressablesEntryReportsAssetResolution', 'McpAddressablesBuildTimingMetadataIsBounded', 'InvokeDescribeAddressablesBuild', 'AddressablesTagger.PlatformerSampleLabel', 'generatedEntryCount', 'labelCounts', 'missingLabels', 'assetExists', 'assetType', 'buildDurationMs', 'buildCompletedAtUtc', 'AnnotateAddressablesBuildTiming', 'CountAddressableLabels', 'DescribeMissingAddressableLabels', 'generatedEntriesTruncated', 'maxGeneratedEntries', 'CompareAddressableEntriesForMcp', 'DescribeAddressableEntryLabels', 'CreateGameObjectRejectsConflictingParentAliases', 'McpVector3InputsMatchAdvertisedSchema', 'McpColorInputsMatchAdvertisedSchema', 'McpSetFieldRejectsSchemaInvalidValueShapes', 'McpSetFieldRejectsScalarTypeCoercion', 'McpRejectsNonFiniteNumericValues', 'McpRejectsOutOfRangeIntegerValues', 'McpSetFieldRejectsUnnamedEnumValues', 'InvokeUnityTool', 'InvokeMcpJsonRpc', 'InvokeHandleToolCall', 'InvokeNormalizeMcpTestName', 'InvokeNormalizeMcpScreenshotDimension', 'InvokeCreateMcpScreenshotPath', 'InvokeIsSafeMcpScreenshotFileName', 'InvokeMcpAuthorizationHeaderMatches', 'InvokeMcpTokenMatches', 'InvokeFixedTimeEquals', 'InvokeIsAllowedMcpContentType', 'InvokeIsSafeMcpBrowserUrlHeader', 'InvokeIsSafeMcpFetchSiteHeader', 'InvokePrivateStringConstant', 'GreyboxSettings.IsSafeMcpBridgeToken', 'short-token', 'Injected: true', '43', 'Temp/Greybox/McpScreenshots', 'not-greybox-game-view-1280x720.png', '127.0.0.1.evil.example', 'cross-site', '0.0.0.0', 'localhost', 'sceneDirty', 'Assert.True(result["sceneDirty"].Value<bool>())', 'application/x-www-form-urlencoded', 'multipart/form-data', 'Unexpected argument', 'Missing required argument', 'parent and parentId', 'must be an integer', 'must be a string', 'characters or fewer', '4096 characters or fewer', '256 characters or fewer', 'must be a JSON string', 'must be a JSON integer', 'must be a JSON number', 'must be a JSON boolean', '32-bit integer', 'finite', 'named enum value', 'Enum value must be a string', 'string, string array, number, boolean, Vector3, or Color', 'exactly 3 numbers', 'exactly 3 or 4 numbers', 'numeric x/y/z', 'numeric r/g/b', 'between 64 and 4096', 'control characters']) {
      if (!tests.includes(snippet)) errors.push(`McpBridgeTests must cover bounded MCP run/screenshot inputs: ${snippet}`);
    }
  }
}

function parseMcpToolsJson(definitions, errors) {
  const match = definitions.match(/return\s+@"([\s\S]*?)";\s*\n\s*}/);
  if (!match) {
    errors.push('MCP ToolsJson must return a parseable verbatim JSON string');
    return null;
  }
  const json = match[1].replaceAll('""', '"');
  try {
    return JSON.parse(json);
  } catch (error) {
    errors.push(`MCP ToolsJson is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function validateMcpTransformRoundTrip(root, files, errors) {
  const mapperPath = 'Editor/Sync/GreyboxRoundTripFieldMapper.cs';
  const serverPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const mapperTestPath = 'Tests/EditMode/RoundTripFieldMapperTests.cs';
  const mcpTestPath = 'Tests/EditMode/McpBridgeTests.cs';
  if (files.includes(mapperPath)) {
    const text = readFileSync(join(root, mapperPath), 'utf8');
    for (const snippet of [
      'TryMapTransform',
      'TryMapGameObjectMetadata',
      'TryMapHudBinding',
      'HudRoundTripRoot',
      'DirectMarkerFor',
      'GreyboxHudBinding',
      'nameof(GreyboxHudBinding.Text)',
      'nameof(GreyboxHudBinding.ProgressValue)',
      'nameof(Text.text)',
      'nameof(Slider.value)',
      '"m_Text"',
      '"m_Value"',
      '$.hud.slots[id=',
      'nameof(Transform.localPosition)',
      'nameof(Transform.localScale)',
      'nameof(Transform.localEulerAngles)',
      '"m_LocalPosition"',
      '"m_LocalScale"',
      '"m_LocalRotation"',
      '"m_TagString"',
      '"m_Layer"',
      '"m_IsActive"',
      '"m_StaticEditorFlags"',
      'marker.PositionJsonPath',
      'DiffApplier.FromVector3(transform.localPosition)',
      'DiffApplier.FromVector3(transform.localScale)',
      'DiffApplier.FromVector3(transform.localEulerAngles)',
      'ScaleFieldKey',
      '$"{marker.JsonPath}.rotation"',
      '$"{marker.JsonPath}.unityTag"',
      '$"{marker.JsonPath}.unityLayer"',
      '$"{marker.JsonPath}.unityActive"',
      '$"{marker.JsonPath}.unityStatic"',
      'marker.Collection == "rooms" ? "size" : "scale"',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxRoundTripFieldMapper must map MCP transform position/scale/rotation to artifact fields: ${snippet}`);
    }
  }
  if (files.includes(serverPath)) {
    const text = readFileSync(join(root, serverPath), 'utf8');
    for (const snippet of [
      'UpdateDesignNodeTransformMetadata',
      'SyncMovedTilemapCell',
      'FindTileRecord',
      'tilemap.SetTile(previousCell, null)',
      'result["tilemapCell"]',
      'designNode.AuthoredPosition',
      'designNode.AuthoredScale',
      'designNode.AuthoredRotationEuler',
    ]) {
      if (!text.includes(snippet)) errors.push(`MCP setField must keep GreyboxDesignNode transform metadata current: ${snippet}`);
    }
  }
  if (files.includes(mapperTestPath)) {
    const text = readFileSync(join(root, mapperTestPath), 'utf8');
    for (const snippet of ['MapsTransformLocalPositionToMarkerPositionPath', 'MapsTransformLocalScaleToNodeScalePath', 'MapsRoomTransformLocalScaleToRoomSizePath', 'MapsTransformLocalEulerAnglesToNodeRotationPath', 'MapsGameObjectMetadataToUnityJsonFields', 'MapsHudBindingInspectorFieldsToStableHudJsonPaths', 'MapsLegacyHudBindingInspectorFieldsFromSlotAndBindingIds', 'MapsUguiHudControlsToBindingRoundTripPaths', 'IgnoresUserAddedChildTransformUnderMarkedNode', 'IgnoresUserAddedChildRuntimeComponentUnderMarkedNode', 'nameof(Transform.localPosition)', 'nameof(Transform.localScale)', 'nameof(Transform.localEulerAngles)', 'nameof(GreyboxHudBinding.Text)', 'nameof(GreyboxHudBinding.ProgressValue)', 'm_Text', 'm_Value', 'm_LocalPosition.x', 'm_LocalScale.y', 'm_LocalRotation.y', 'm_TagString', 'm_Layer', 'm_IsActive', 'm_StaticEditorFlags', '$.actors[id=boss].position', '$.actors[id=boss].scale', '$.actors[id=boss].rotation', '$.rooms[id=entry].size', '$.hud.slots[id=hud-hearts].bindings[id=value].text', '$.hud.slots[id=hud-hearts].bindings[id=health].value', '$.actors[id=boss].unityTag', '$.actors[id=boss].unityLayer', '$.actors[id=boss].unityActive', '$.actors[id=boss].unityStatic']) {
      if (!text.includes(snippet)) errors.push(`RoundTripFieldMapperTests must cover transform position/scale/rotation mapping: ${snippet}`);
    }
  }
  if (files.includes(mcpTestPath)) {
    const text = readFileSync(join(root, mcpTestPath), 'utf8');
    for (const snippet of ['SetFieldQueuesRoundTripEditForTransformPosition', 'SetFieldMovesMarkedTilemapCellWithTransformPosition', 'SetFieldQueuesRoundTripEditForTransformScale', 'SetFieldQueuesRoundTripEditForTransformRotation', 'typeof(Transform).FullName', 'nameof(Transform.localPosition)', 'nameof(Transform.localScale)', 'nameof(Transform.localEulerAngles)', '$.actors[id=boss].position', '$.tilemap.tiles[tileId=hazard-tile].position', 'tilemap.GetTile(new Vector3Int(4, 5, 0))', 'result["tilemapCell"]["tileId"]', '$.actors[id=boss].scale', '$.actors[id=boss].rotation', 'designNode.AuthoredScale', 'designNode.AuthoredRotationEuler']) {
      if (!text.includes(snippet)) errors.push(`McpBridgeTests must cover MCP transform position/scale/rotation round-trip edits: ${snippet}`);
    }
  }
}

function validateMcpTileRecordFieldRoundTrip(root, files, errors) {
  const mapperPath = 'Editor/Sync/GreyboxRoundTripFieldMapper.cs';
  const mapperTestPath = 'Tests/EditMode/RoundTripFieldMapperTests.cs';
  const serverPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const testPath = 'Tests/EditMode/McpBridgeTests.cs';
  if (files.includes(mapperPath)) {
    const text = readFileSync(join(root, mapperPath), 'utf8');
    for (const snippet of [
      'TileRecordPropertyPathPattern',
      'TryMapTileRecord',
      'TileRecordRootPath',
      'TileRecordFieldKey',
      'TileRecordValue',
      'IsSafeTileRecordSelector',
      'TileRecords\\.Array\\.data',
      'Position.x',
      'tileId={record.TileId}',
      '$"{collectionPath}[{index}]"',
      'new GreyboxRoundTripFieldEdit(marker, $"{root}.{key}", value)',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxRoundTripFieldMapper must map Unity inspector tile record edits: ${snippet}`);
    }
  }
  if (files.includes(serverPath)) {
    const text = readFileSync(join(root, serverPath), 'utf8');
    for (const snippet of [
      'McpTileRecordFieldPattern',
      'DescribeTileRecordEditableFields',
      'TileRecordWorldPosition',
      'markerGameObjectId',
      'markerHierarchyPath',
      'tiles[tileId={tileId}].{fieldKey}',
      'SetTileRecordField',
      'TryParseTileRecordFieldName',
      'ApplyTileRecordType',
      'SyncTileRecordFieldToTilemap',
      'SyncTileRecordMarkerPosition',
      'CreateGeneratedTileForRecord',
      'RoundTripMarkerForTileRecord',
      'GreyboxSceneChangeWatcher.QueueFieldEdit(metadata',
      'TileRecordJsonPath',
      'TileRecordFieldValue',
      'ReadMcpTileRecordPosition',
      'tilemap.SetTile(record.Position, tile)',
      'result["tilemapCell"]',
    ]) {
      if (!text.includes(snippet)) errors.push(`MCP tile record field edits must update metadata, Tilemaps, and round-trip paths: ${snippet}`);
    }
  }
  if (files.includes(mapperTestPath)) {
    const text = readFileSync(join(root, mapperTestPath), 'utf8');
    for (const snippet of [
      'MapsTileRecordInspectorFieldsToStableJsonPaths',
      'TileRecords.Array.data[0].TileType',
      'TileRecords.Array.data[0].ColorHex',
      'TileRecords.Array.data[0].Walkable',
      'TileRecords.Array.data[0].Position.x',
      '$.tilemap.tiles[tileId=hazard-tile].type',
      '$.tilemap.tiles[tileId=hazard-tile].position',
      '$.tilemap.tiles[1].type',
    ]) {
      if (!text.includes(snippet)) errors.push(`RoundTripFieldMapperTests must cover inspector tile record field edits: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'SetFieldUpdatesTileRecordTypeAndVisibleTile',
      'SetFieldUpdatesTileRecordPositionAndMarker',
      'tiles[tileId=spike-a].type',
      'tiles[tileId=spike-a].position',
      'tiles[tileId=hazard-tile].type',
      'tiles[tileId=hazard-tile].position',
      '$.tilemap.tiles[tileId=hazard-tile].type',
      '$.tilemap.tiles[tileId=hazard-tile].position',
      'tilemapInfo["records"][1]["markerGameObjectId"]',
      'tilemapInfo["records"][1]["worldPosition"]',
      'Assert.AreEqual("wall", editedTile.TileType)',
      'Assert.AreEqual(new Vector3Int(4, 5, 0), movedTile.Position)',
      'Assert.True(editedTile.BlocksMovement)',
      'Assert.AreEqual(Tile.ColliderType.Sprite',
      'result["tilemapCell"]["markerSynced"]',
      'result["tilemapCell"]["field"]',
    ]) {
      if (!text.includes(snippet)) errors.push(`McpBridgeTests must cover MCP tile record field edits: ${snippet}`);
    }
  }
}

function validateMcpFieldTypeRoundTrip(root, files, errors) {
  const serverPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const mapperPath = 'Editor/Sync/GreyboxRoundTripFieldMapper.cs';
  const testPath = 'Tests/EditMode/McpBridgeTests.cs';
  if (files.includes(serverPath)) {
    const text = readFileSync(join(root, serverPath), 'utf8');
    for (const snippet of [
      'targetType == typeof(bool)',
      'targetType == typeof(Color)',
      'if (type == typeof(bool))',
      'if (type == typeof(Color))',
      'resolvedType == typeof(GameObject)',
      'SetGameObjectField',
      'SetGameObjectLayerRecursively',
      'CanonicalGameObjectFieldName',
      'ReadDefinedUnityTag',
      'ReadUnityLayerValue',
      'previousLayerName',
      'layerName',
      'propagatesToChildren',
      'UnityEditorInternal.InternalEditorUtility.tags',
      'ReadColor',
      'ToJson((Color)value)',
    ]) {
      if (!text.includes(snippet)) errors.push(`MCP setField must round-trip bool and Color values: ${snippet}`);
    }
  }
  if (files.includes(mapperPath)) {
    const text = readFileSync(join(root, mapperPath), 'utf8');
    for (const snippet of [
      'case bool flag:',
      'case Color color:',
      'case string[] texts:',
      'FromStringArray',
      'MaxRoundTripStringArrayItems',
      'MaxRoundTripStringArrayItemLength',
      'ContainsControlCharacter',
      'value?.DeepClone()',
      'DiffApplier.FromColor(color)',
      'nameof(GreyboxActorDefinition.IsEnemy)',
      'nameof(GreyboxActorDefinition.Damage)',
      'nameof(GreyboxActorDefinition.JumpImpulse)',
      'nameof(GreyboxActorDefinition.AttackRange)',
      'nameof(GreyboxActorDefinition.PatrolRadius)',
      'nameof(GreyboxActorDefinition.AttackCooldownSeconds)',
      'nameof(GreyboxActorDefinition.AggroRadius)',
      'nameof(GreyboxActorDefinition.Behavior)',
      'nameof(GreyboxActorDefinition.AbilityIds)',
      'nameof(GreyboxActorDefinition.PatrolPointIds)',
      'nameof(GreyboxActorDefinition.LootTableId)',
      'nameof(GreyboxHazard.Effect)',
      'nameof(GreyboxHazard.HazardType)',
      'nameof(GreyboxHazard.AffectedTags)',
      'nameof(GreyboxHazard.TickSeconds)',
      'nameof(GreyboxHazard.Knockback)',
      'nameof(GreyboxHazard.IsLethal)',
      'nameof(GreyboxObjective.TargetIds)',
      'nameof(GreyboxObjective.Reward)',
      'nameof(GreyboxObjective.TimeLimitSeconds)',
      'nameof(GreyboxSpawnPoint.ActorIds)',
      'nameof(GreyboxSpawnPoint.MaxCount)',
      'nameof(GreyboxSpawnPoint.CooldownSeconds)',
      'nameof(GreyboxSpawnPoint.SpawnOnStart)',
      'nameof(GreyboxCameraRig.BackgroundColor)',
      'nameof(GreyboxLevelRoom.ConnectedRoomIds)',
      'nameof(GreyboxLevelConnection.FromRoomId)',
      'nameof(GreyboxLevelConnection.ToRoomId)',
      'nameof(GreyboxPlatformerSampleCheckpoint.CooldownSeconds)',
      'nameof(GreyboxPlatformerSampleCheckpoint.RespawnPoint)',
      'nameof(GreyboxPlatformerSampleGoal.RequiredCoins)',
      'nameof(GreyboxPlatformerSampleGoal.TargetIds)',
      'nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveId)',
      'nameof(GreyboxPlatformerSampleCollectible.SourceObjectiveType)',
      'PlatformerCheckpointFieldKey',
      'PlatformerGoalFieldKey',
      'PlatformerCollectibleFieldKey',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxRoundTripFieldMapper must serialize bool and Color artifact fields: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'SetFieldQueuesRoundTripEditForBoolFields',
      'SetFieldQueuesRoundTripEditForGameObjectMetadata',
      'SetFieldRejectsInvalidGameObjectMetadataValues',
      'SetFieldQueuesRoundTripEditForColorFields',
      'previousLayerName',
      'propagatesToChildren',
      'nameof(GreyboxActorDefinition.IsEnemy)',
      'typeof(GameObject).FullName',
      'nameof(GreyboxCameraRig.BackgroundColor)',
      '$.actors[id=boss].isEnemy',
      '$.actors[id=boss].unityTag',
      '$.actors[id=boss].unityLayer',
      '$.actors[id=boss].unityStatic',
      '$.actors[id=boss].unityActive',
      'Unity tag is not defined',
      'Unity layer is not defined',
      'between 0 and 31',
      '$.camera.backgroundColor',
      '#FF6B35',
    ]) {
      if (!text.includes(snippet)) errors.push(`McpBridgeTests must prove MCP bool and Color round-trip edits: ${snippet}`);
    }
  }
}

function validateMcpObjectCreationRoundTrip(root, files, errors) {
  const serverPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const testPath = 'Tests/EditMode/McpBridgeTests.cs';
  if (files.includes(serverPath)) {
    const text = readFileSync(join(root, serverPath), 'utf8');
    for (const snippet of [
      'TryStampCreatedGreyboxNode',
      'ApplyInitialTransform',
      'GreyboxSceneChangeWatcher.QueueFieldEdit(go, createEdit)',
      'CreatedNodeJson',
      'ApplyCreatedNodeDefaults',
      'RoundTripIdFieldForCollection',
      'GreyboxDesignNode',
      'AttachDefaultRuntimeComponent',
      'GreyboxActorDefinition',
      'GreyboxSpawnPoint',
      'GreyboxObjective',
      'GreyboxHazard',
      'GreyboxLevelConnection',
      'GreyboxLevelTilemap',
      'using UnityEngine.Tilemaps',
      'ApplyCreatedTilemapCell',
      'UpsertCreatedTileRecord',
      'FindTileForCreatedType',
      'CreateGeneratedTileForCreatedType',
      'CreateGeneratedTileTexture',
      'CreateGeneratedTileSprite',
      'AppendGeneratedTileAsset',
      'Sprite.Create',
      'TextureFormat.RGBA32',
      'metadata.TileTextures',
      'metadata.TileSprites',
      'tilemap.SetTile(cell, tile)',
      'GreyboxPlatformerSampleCheckpoint',
      'GreyboxPlatformerSampleGoal',
      'GreyboxPlatformerSampleCollectible',
      'CircleCollider2D',
      'PositionJsonPath',
      'SafeGameObjectName',
      'UniqueGameObjectName',
      'SafeMarkerId',
      'UniqueMarkerId',
      'KnownRoundTripCollections',
      'tiles',
      'tileId',
      'checkpoints',
      'checkpointId',
      'goals',
      'goalId',
      'coins',
      'coinId',
      'IsCollectionRootMarkerId',
      'IsExactCollectionRootJsonPath',
      '[{idField}=',
      '[idField] = id',
      'actorId',
      'spawnId',
      'objectiveId',
      'hazardId',
      'roomId',
      'encounterId',
      'connectionId',
      '$.tilemap.tiles',
      '$.tilemap.cells',
      '$.grid.tiles',
      'SafeMcpMarkerSourceFileName',
      'SafeMcpMarkerSourcePath',
      'IsSafeMcpMarkerSourcePath',
      'MaxMcpSourcePathLength',
      'marker.SourcePath = SafeMcpMarkerSourcePath(parentMarker.SourcePath)',
      'GreyboxConflictResolver.SafeRoundTripFileName',
      'segment == "." || segment == ".."',
      '$.{collection}',
      'roundTripValue',
      '["rotation"] = ToJson(rotationEuler)',
      '["scale"] = ToJson(scale)',
      'node["health"] = 1',
      'node["spawnRadius"] = 0.5f',
      'node["tickSeconds"] = 1f',
      'node["type"] = tileType',
      'node["isHazard"]',
      'node["travelCost"] = 1f',
      'node["maxActivations"] = 1',
      'node["respawnPoint"] = ToJson(position)',
      'node["objectiveType"] = "exit"',
      'node["sourceObjectiveType"] = "collectible"',
    ]) {
      if (!text.includes(snippet)) errors.push(`MCP createGameObject must queue durable Greybox node inserts: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'CreateGameObjectQueuesRoundTripInsertUnderGreyboxCollections',
      'CreateGameObjectUsesUniqueMarkerIdsWithinGreyboxCollections',
      'CreateGameObjectAcceptsParentIdAliasForGreyboxCollections',
      'CreateGameObjectUsesCollectionSpecificIdFields',
      'CreateGameObjectQueuesTilemapTileUnderNestedCollectionRoot',
      'CreateGameObjectCreatesVisibleTileWhenTilemapHasNoGeneratedAssets',
      'CreateGameObjectSkipsRoundTripForUnsafeCollectionRoots',
      'CreateGameObjectQueuesInitialTransformInRoundTripInsert',
      'InvokeCreateGameObject',
      '$.actors[actorId=boss-add]',
      '$.actors[actorId=boss-add-2]',
      '$.spawnPoints[spawnId=checkpoint-a]',
      '$.actors[actorId=patrol-scout]',
      '$.{spec.Collection}[{spec.IdField}={spec.Id}]',
      'GreyboxActorDefinition',
      'GreyboxSpawnPoint',
      'roundTripValue"]["health"]',
      'roundTripValue"]["spawnRadius"]',
      'roundTripValue"]["tickSeconds"]',
      'objectiveId',
      'hazardId',
      'roomId',
      'encounterId',
      'connectionId',
      'tileId',
      'checkpointId',
      'goalId',
      'coinId',
      'GreyboxPlatformerSampleCheckpoint',
      'GreyboxPlatformerSampleGoal',
      'GreyboxPlatformerSampleCollectible',
      'roundTripValue"]["maxActivations"]',
      'roundTripValue"]["respawnPoint"]',
      'roundTripValue"]["requiredCount"]',
      'roundTripValue"]["sourceObjectiveType"]',
      'roundTripValue"]["travelCost"]',
      '$.tilemap.tiles[tileId=hazard-tile]',
      'Tilemap',
      'TileBase',
      'metadata.TryGetTileRecord("hazard-tile"',
      'tilemap.GetTile(new Vector3Int(3, 4, 0))',
      'metadata.TileTextures',
      'metadata.TileSprites',
      'Assert.AreEqual(1, metadata.TileAssets.Length)',
      'Assert.AreEqual(Tile.ColliderType.Sprite, generatedTile.colliderType)',
      'roundTripValue"]["type"]',
      'roundTripValue"]["isHazard"]',
      'roundTripValue"]["blocksMovement"]',
      'GreyboxLevelConnection',
      'Assert.AreEqual("connection", connection.ConnectionType)',
      'roundTripValue"]["actorId"]',
      'roundTripValue"]["spawnId"]',
      '$.rooms[id=entry].actors',
      '$.__proto__',
      '../levels/arena.gameview.json',
      '../ProjectSettings/ProjectSettings.asset',
      'Assert.AreEqual("", marker.SourcePath)',
      'parentId',
      'Boss Add 2',
      'GreyboxDesignNode',
      'GreyboxActorDefinition',
      'PendingRoundTripFieldEditCount',
    ]) {
      if (!text.includes(snippet)) errors.push(`McpBridgeTests must cover createGameObject round-trip inserts: ${snippet}`);
    }
  }
}

function validateMcpAssetAssignmentRoundTrip(root, files, errors) {
  const serverPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const mapperPath = 'Editor/Sync/GreyboxRoundTripFieldMapper.cs';
  const testPath = 'Tests/EditMode/McpBridgeTests.cs';
  const mapperTestPath = 'Tests/EditMode/RoundTripFieldMapperTests.cs';
  if (files.includes(serverPath)) {
    const text = readFileSync(join(root, serverPath), 'utf8');
    for (const snippet of [
      'GreyboxRoundTripFieldMapper.TryMapAsset',
      'GreyboxSceneChangeWatcher.QueueFieldEdit(component, assetEdit)',
      'UpdateMarkerAssetMetadata',
      'NormalizeMcpAssetPath',
      'IsSafeProjectAssetPath',
      'canonical project-relative Assets/',
      'project-relative Assets/',
      'previousAssetPath',
      'previousAssetGuid',
      'previousObjectName',
      'objectName',
      'nameof(MeshFilter.sharedMesh)',
      'roundTripValue',
    ]) {
      if (!text.includes(snippet)) errors.push(`MCP assignAsset must queue durable asset round-trip edits: ${snippet}`);
    }
  }
  if (files.includes(mapperPath)) {
    const text = readFileSync(join(root, mapperPath), 'utf8');
    for (const snippet of [
      'TryMapAsset',
      'AssetMarkerFor',
      'IsGreyboxGeneratedComponent',
      'AssetFieldKey',
      'GetComponentInParent<GreyboxMarker>',
      'MeshFilter',
      'meshAssetPath',
      'Renderer',
      'materialAssetPath',
      'new JValue(assetPath)',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxRoundTripFieldMapper must map Unity asset references to artifact fields: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'AssignAssetQueuesRoundTripEditForMeshReferences',
      'AssignAssetQueuesRoundTripEditForMaterialReferences',
      'AssignAssetRejectsUnsafeAssetPathsBeforeLookup',
      'InvokeAssignAsset',
      'Assets\\\\BossMesh.asset',
      'Assets/Boss\\\\Mesh.asset',
      'previousAssetPath',
      'previousAssetGuid',
      'previousObjectName',
      'objectName',
      'meshAssetPath',
      'materialAssetPath',
    ]) {
      if (!text.includes(snippet)) errors.push(`McpBridgeTests must cover asset assignment round-trip edits: ${snippet}`);
    }
  }
  if (files.includes(mapperTestPath)) {
    const text = readFileSync(join(root, mapperTestPath), 'utf8');
    for (const snippet of [
      'MapsGeneratedChildAssetReferencesThroughParentMarker',
      'RejectsUserAddedChildAssetReferencesUnderMarkedNode',
      'GreyboxGeneratedComponents',
      '$.actors[id=boss].materialAssetPath',
    ]) {
      if (!text.includes(snippet)) errors.push(`RoundTripFieldMapperTests must cover generated-child asset reference mapping: ${snippet}`);
    }
  }
}

function validateCiWorkflow(root, files, errors) {
  const workflowPath = '.github/workflows/unity-validation.yml';
  if (!files.includes(workflowPath)) {
    errors.push(`missing Unity package validation workflow: ${workflowPath}`);
    return;
  }
  const text = readFileSync(join(root, workflowPath), 'utf8');
  for (const snippet of [
    'node Validation~/asset-store-metadata-check.mjs',
    'node Validation~/asset-store-submission-check.mjs',
    'node Validation~/package-builder.mjs',
    '--summary',
    'Validation~/artifacts/package-summary.md',
    '--submission',
    'submission-readiness',
    'Run stable-version submission gate',
    'Run final submission packet gate',
    'node --test Validation~/*.test.mjs',
    'node Validation~/mcp-conformance-report.mjs',
    'Validation~/artifacts/mcp-conformance.md',
    'node Validation~/unity-import-smoke.mjs',
    'Verify Unity smoke result XML',
    'node Validation~/unity-result-artifact-check.mjs',
    '--editmode-root',
    '--playmode-root',
    '--playmode-log-file',
    '--playmode-results-file',
    'editmode-results.xml',
    'playmode-results.xml',
    'unity-smoke-dry-run-project',
    'GreyboxImportSmoke.cs',
    'GreyboxPlatformerPlaySmoke.cs',
    'ProjectVersion.txt',
    'unity-package-artifacts',
    'unity-license-preflight',
    'UNITY_LICENSE',
    'game-ci/unity-test-runner@v4',
    'testMode: editmode',
    'testMode: playmode',
    'Greybox Unity PlayMode smoke',
    '${{ steps.unity-editmode-tests.outputs.artifactsPath }}',
    '${{ steps.unity-playmode-tests.outputs.artifactsPath }}',
    '${{ matrix.projectPath }}/editmode-results.xml',
    '${{ matrix.projectPath }}/playmode-results.xml',
    '2022.3.74f1',
    '2023.2.20f1',
    '6000.0.58f1',
    'actions/upload-artifact@v4',
  ]) {
    if (!text.includes(snippet)) errors.push(`Unity validation workflow must cover static gates and smoke matrix: ${snippet}`);
  }
}

function validateReleaseWorkflow(root, files, errors) {
  const workflowPath = '.github/workflows/release.yml';
  const policyPath = 'Validation~/release-workflow-policy.mjs';
  const policyTestPath = 'Validation~/release-workflow-policy.test.mjs';
  if (!files.includes(workflowPath)) {
    errors.push(`missing Unity package release workflow: ${workflowPath}`);
    return;
  }
  const text = readFileSync(join(root, workflowPath), 'utf8');
  const policyReport = validateReleaseWorkflowPolicy(text);
  for (const error of policyReport.errors) {
    errors.push(`Unity release workflow policy gate failed: ${error}`);
  }
  for (const snippet of [
    "tags:",
    "'v*.*.*'",
    'Validate release tag and package version',
    'Validate release workflow policy',
    'node Validation~/release-workflow-policy.mjs version',
    'node Validation~/release-workflow-policy.mjs workflow --workflow .github/workflows/release.yml',
    '--github-output "$GITHUB_OUTPUT"',
    'node Validation~/asset-store-metadata-check.mjs',
    'node Validation~/asset-store-metadata-check.mjs --submission',
    'node Validation~/asset-store-submission-check.mjs',
    'node Validation~/asset-store-submission-check.mjs --submission --skip-release-evidence',
    'node --test Validation~/*.test.mjs',
    'node Validation~/release-readiness.mjs',
    '--dry-run-only',
    '--require-unity',
    'Validation~/artifacts/release-readiness.json',
    'Verify final submission evidence',
    "steps.version.outputs.prerelease != 'true'",
    'run: node Validation~/asset-store-submission-check.mjs --submission',
    'Write stable release candidate evidence',
    'node Validation~/stable-release-candidate.mjs',
    'REQUIRE_READY="--require-ready"',
    'Validation~/artifacts/stable-release-candidate.json',
    'com.greybox.studio.unitypackage',
    'Validation~/artifacts/unitypackage-export.json',
    'IS_PRERELEASE: ${{ steps.version.outputs.prerelease }}',
    'if [ "$IS_PRERELEASE" != "true" ]; then',
    'Create prerelease GitHub Release',
    'Create stable GitHub Release',
    'node Validation~/package-builder.mjs',
    'SUBMISSION_FLAG="--submission"',
    'dist/com.greybox.studio-${REF}.tgz',
    'Generate SHA-256 checksums',
    'sha256sum',
    'SHA256SUMS-${REF}.txt',
    'Generate release notes from CHANGELOG',
    'node Validation~/release-workflow-policy.mjs notes',
    '--output /tmp/release-notes.md',
    'release-workflow-policy.mjs',
    'softprops/action-gh-release@v2',
    'Validation~/artifacts/package-summary.md',
    'prerelease:',
    "steps.version.outputs.prerelease == 'true'",
  ]) {
    if (!text.includes(snippet)) errors.push(`Unity release workflow must build deterministic release evidence: ${snippet}`);
  }
  if (!files.includes(policyPath)) errors.push(`missing release workflow policy helper: ${policyPath}`);
  if (files.includes(policyPath)) {
    const policy = readFileSync(join(root, policyPath), 'utf8');
    for (const snippet of [
      'parseReleaseTag',
      'verifyPackageVersionMatchesTag',
      'extractChangelogSection',
      'formatReleaseNotes',
      'CHANGELOG.md must include non-empty release notes',
      'com.greybox.studio.unitypackage',
      'unitypackage-export.json',
      'stable-release-candidate.json',
      'stable releases attach it only after editor smoke, Unity export, and stable-candidate gates pass',
    ]) {
      if (!policy.includes(snippet)) errors.push(`Release workflow policy must be testable and fail closed: ${snippet}`);
    }
  }
  if (!files.includes(policyTestPath)) errors.push(`missing release workflow policy tests: ${policyTestPath}`);
  if (files.includes(policyTestPath)) {
    const policyTest = readFileSync(join(root, policyTestPath), 'utf8');
    for (const snippet of [
      'parseReleaseTag accepts stable and prerelease',
      'verifyPackageVersionMatchesTag fails closed',
      'extractChangelogSection supports plain and bracketed',
      'CLI writes GitHub outputs and release notes',
      'does not match package\\.json version',
    ]) {
      if (!policyTest.includes(snippet)) errors.push(`Release workflow policy tests must cover tag and notes gates: ${snippet}`);
    }
  }
}

function validateAssetStoreUnityPackageExporter(root, files, errors) {
  const exporterPath = 'Editor/Export/GreyboxAssetStorePackageExporter.cs';
  const exportScriptPath = 'Validation~/unity-package-export.mjs';
  const readinessPath = 'Validation~/release-readiness.mjs';
  const stableCandidatePath = 'Validation~/stable-release-candidate.mjs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  const submissionPath = 'ASSET_STORE_SUBMISSION.md';
  const readmePath = 'README.md';
  if (!files.includes(exporterPath)) {
    errors.push(`missing Asset Store .unitypackage exporter: ${exporterPath}`);
    return;
  }

  const exporter = readFileSync(join(root, exporterPath), 'utf8');
  for (const snippet of [
    'AssetDatabase.ExportPackage',
    'PackageInfo.FindForPackageName',
    'ExportFromCommandLine',
    'Export Asset Store .unitypackage',
    'GREYBOX_ASSET_STORE_PACKAGE_OUTPUT',
    '-greyboxAssetStorePackageOutput',
    'Assets/GreyboxStudio',
    'EnumeratePackageFiles',
    'ShouldDescendDirectory',
    'Samples~/',
    'Samples/',
    'Documentation~/',
    'Documentation/',
    'Validation~',
    '".github"',
    '"Tests"',
    'ExportPackageOptions.Recurse',
  ]) {
    if (!exporter.includes(snippet)) errors.push(`Asset Store .unitypackage exporter must use real Unity export discipline: ${snippet}`);
  }
  if (/package-builder\.mjs|DefaultOutputPath\s*=\s*"[^"]+\.tgz"/u.test(exporter)) {
    errors.push('Asset Store .unitypackage exporter must not shell out to package-builder or rename the UPM tarball');
  }

  if (!files.includes(exportScriptPath)) {
    errors.push(`missing Unity-driven Asset Store export runner: ${exportScriptPath}`);
  } else {
    const exportScript = readFileSync(join(root, exportScriptPath), 'utf8');
    for (const snippet of [
      'createSmokeProject',
      'discoverUnityEditors',
      'spawnSync',
      'GREYBOX_ASSET_STORE_PACKAGE_OUTPUT',
      'Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine',
      '-greyboxAssetStorePackageOutput',
      'dist/com.greybox.studio.unitypackage',
      'Validation~/artifacts/unitypackage-export.json',
      'createHash',
      'sha256',
      'existsSync(outputPath)',
      'statSync(outputPath).size',
    ]) {
      if (!exportScript.includes(snippet)) errors.push(`Unity export runner must prove the .unitypackage artifact: ${snippet}`);
    }
  }

  if (files.includes(stableCandidatePath)) {
    const stableCandidate = readFileSync(join(root, stableCandidatePath), 'utf8');
    for (const snippet of [
      'EXPORT_METHOD',
      'DEFAULT_UNITY_PACKAGE_PROJECT_PATH',
      'GREYBOX_ASSET_STORE_PACKAGE_OUTPUT=',
      'commandWithEnvironment',
      'packageRoot must match the package workspace',
      'releaseReadyEditors',
      'Unity editor must match a release-readiness ready target',
      'command must use the clean Asset Store export project path',
      'command must run Unity in batchmode, quit, and nographics mode',
      'command must not be dry-run',
      'command must run ${EXPORT_METHOD}',
    ]) {
      if (!stableCandidate.includes(snippet)) errors.push(`Stable release candidate gate must verify Unity export provenance: ${snippet}`);
    }
  }

  if (files.includes(readinessPath)) {
    const readiness = readFileSync(join(root, readinessPath), 'utf8');
    for (const snippet of [
      'asset-store-unitypackage-export',
      'Validation~/unity-package-export.mjs',
      'DEFAULT_UNITY_PACKAGE_OUTPUT',
      'DEFAULT_UNITY_PACKAGE_MANIFEST',
      'finalSubmissionEvidenceBlockers',
      'final Unity smoke step must not skip missing editors',
      'assertPassingResults',
      'ResultXmlValidated',
      'validated EditMode result XML evidence',
      'validated PlayMode result XML evidence',
    ]) {
      if (!readiness.includes(snippet)) errors.push(`Release readiness must run the Unity .unitypackage export gate: ${snippet}`);
    }
  }

  if (files.includes(smokePath)) {
    const smoke = readFileSync(join(root, smokePath), 'utf8');
    if (!smoke.includes('Greybox.Editor.Export.GreyboxAssetStorePackageExporter')) {
      errors.push('Unity smoke source must compile-check GreyboxAssetStorePackageExporter');
    }
  }

  if (files.includes(submissionPath)) {
    const packet = readFileSync(join(root, submissionPath), 'utf8');
    for (const snippet of ['-executeMethod Greybox.Editor.Export.GreyboxAssetStorePackageExporter.ExportFromCommandLine', '-greyboxAssetStorePackageOutput', 'dist/com.greybox.studio.unitypackage']) {
      if (!packet.includes(snippet)) errors.push(`ASSET_STORE_SUBMISSION.md must document real Unity .unitypackage export: ${snippet}`);
    }
  }

  if (files.includes(readmePath)) {
    const readme = readFileSync(join(root, readmePath), 'utf8');
    for (const snippet of ['GreyboxAssetStorePackageExporter.ExportFromCommandLine', 'GREYBOX_ASSET_STORE_PACKAGE_OUTPUT', 'dist/com.greybox.studio.unitypackage']) {
      if (!readme.includes(snippet)) errors.push(`README.md must document real Unity .unitypackage export: ${snippet}`);
    }
  }
}

function validateSamples(root, files, errors) {
  for (const sample of REQUIRED_SAMPLES) {
    const sampleFiles = files.filter((file) => file.startsWith(`${sample}/`));
    const readmePath = `${sample}/README.md`;
    if (files.includes(readmePath)) {
      const readme = readFileSync(join(root, readmePath), 'utf8');
      if (readme.trim().length < 180) errors.push(`${readmePath} must describe importer coverage and round-trip intent`);
      validateTextProvenance(readmePath, readme, errors, {
        requireAiAssisted: true,
        requireHumanDesigner: true,
      });
    }

    for (const extension of REQUIRED_SAMPLE_EXTENSIONS) {
      if (!sampleFiles.some((file) => file.endsWith(extension))) {
        errors.push(`${sample} must include at least one ${extension} artifact`);
      }
    }

    for (const file of sampleFiles.filter((entry) => entry.endsWith('.gameview'))) {
      validateGameViewportArtifact(root, file, errors);
    }
    for (const file of sampleFiles.filter((entry) => entry.endsWith('.levelboard'))) {
      validateLevelBoardArtifact(root, file, errors);
    }
    for (const file of sampleFiles.filter((entry) => entry.endsWith('.design'))) {
      validateDesignArtifact(root, file, errors);
    }
    for (const file of sampleFiles.filter((entry) => entry.endsWith('.gbhud'))) {
      validateHudArtifact(root, file, errors);
    }
  }
}

function validatePlayablePlatformerSample(root, files, errors) {
  const requiredPaths = [
    'Editor/Samples/Greybox2DPlatformerSampleBuilder.cs',
    'Runtime/GreyboxPlatformerSamplePlayer.cs',
    'Runtime/GreyboxPlatformerSampleCameraFollow.cs',
    'Runtime/GreyboxPlatformerSampleHazard.cs',
    'Runtime/GreyboxPlatformerSampleEnemy.cs',
    'Runtime/GreyboxPlatformerSampleCheckpoint.cs',
    'Runtime/GreyboxPlatformerSampleGoal.cs',
    'Runtime/GreyboxPlatformerSampleHud.cs',
    'Runtime/GreyboxPlatformerSampleCollectible.cs',
    'Runtime/GreyboxPlatformerSampleRunReset.cs',
    'Runtime/GreyboxPlatformerSampleArtifactManifest.cs',
    'Tests/PlayMode/GreyboxPlatformerSamplePlayTests.cs',
  ];
  for (const path of requiredPaths) {
    if (!files.includes(path)) errors.push(`2D Platformer playable sample missing required file: ${path}`);
  }

  const readmePath = 'Samples~/2D Platformer/README.md';
  if (files.includes(readmePath)) {
    const readme = readFileSync(join(root, readmePath), 'utf8');
    for (const snippet of ['Build 2D Platformer Scene', 'Greybox2DPlatformerSample.unity', 'controllable runner', 'coin counter', '24 collectible coins', 'Unity Input System', 'Press `R`', 'RESET RUN', 'restart the generated sample run']) {
      if (!readme.includes(snippet)) errors.push(`2D Platformer README must document playable sample setup: ${snippet}`);
    }
  }
  const platformerHudPath = 'Samples~/2D Platformer/platformer.gbhud';
  if (files.includes(platformerHudPath)) {
    const text = readFileSync(join(root, platformerHudPath), 'utf8');
    for (const snippet of ['<img data-role="heart-icon"', '<progress data-role="health"', 'Resources/Hud/heart.png', 'data-agds-id="hud-loot"', '<span data-role="label">LOOT</span>', 'data-agds-id="hud-reset"', 'data-action="reset-run"', 'RESET RUN']) {
      if (!text.includes(snippet)) errors.push(`2D Platformer HUD sample must exercise shipped HUD icon/meter imports: ${snippet}`);
    }
  }
  const platformerGameViewPath = 'Samples~/2D Platformer/platformer.gameview';
  if (files.includes(platformerGameViewPath)) {
    const text = readFileSync(join(root, platformerGameViewPath), 'utf8');
    for (const snippet of ['"id": "coin_line"', '"objectiveType": "collectible"', '"requiredCount": 24', '"attackCooldown": 0.45', '"attackCooldown": 0.75', '"attackRange": 1.6', '"jumpImpulse": 12.5', '"faction": "runners"', '"behavior": "player-controlled"', '"abilities": ["double-jump"]', '"lootTable": "runner-pickups"', '"faction": "slimes"', '"behavior": "patrol-aggro"', '"abilities": ["bump"]', '"patrolRoute": ["teach_move", "coin_arc"]', '"lootTable": "starter-slime-drops"', '"patrolRadius": 1.6', '"detectionRadius": 5.5', '"tickSeconds": 0.65', '"knockback": 3.25', '"effect": "stagger"', '"affectedTags": ["Player"]', '"lethal": true', '"spawnGroup": "mid-run"', '"actorIds": ["player_runner"]', '"maxCount": 2', '"cooldownSeconds": 0.75', '"spawnOnStart": false', '"targetIds": ["coin_line"]', '"reward": "unlock-exit"', '"timeLimitSeconds": 90', '"primary": true']) {
      if (!text.includes(snippet)) errors.push(`2D Platformer gameview must author its collectible objective count: ${snippet}`);
    }
  }

  const builderPath = 'Editor/Samples/Greybox2DPlatformerSampleBuilder.cs';
  if (files.includes(builderPath)) {
    const text = readFileSync(join(root, builderPath), 'utf8');
    for (const snippet of [
      'Greybox2DPlatformerSampleBuilder',
      'Build2DPlatformerScene',
      'BuildScene',
      'GeneratedScenePath',
      'Window/Greybox/Samples/Build 2D Platformer Scene',
      'EditorSceneManager.NewScene',
      'EditorSceneManager.SaveScene',
      'RegisterSceneInBuildSettings',
      'EditorBuildSettings.scenes',
      'InstantiateImportedArtifacts',
      'BuildGameplayPlan',
      'LevelBoardDrivenObjectCount',
      'GameViewDrivenObjectCount',
      'LevelBoardTileCount',
      'LevelBoardRouteLength',
      'ArtBiblePaletteColorCount',
      'ArtBibleDrivenMaterialCount',
      'GameViewEnemyCount',
      'GameViewHazardCount',
      'GameViewCoinCount',
      'AttackCooldownSeconds',
      'GameViewPlayerConfigured',
      'PlayerMoveSpeed',
      'PlayerJumpImpulse',
      'PlayerMaxHearts',
      'PlayerAttackDamage',
      'PlayerAttackRange',
      'PlayerAttackCooldownSeconds',
      'GameViewCheckpointConfigured',
      'GameViewGoalConfigured',
      'CameraFollowEnabled',
      'GameViewCameraConfigured',
      'CameraMode',
      'CameraOrthographicSize',
      'BuildDurationSeconds',
      'GreyboxGameViewport',
      'GreyboxArtBiblePalette',
      'GreyboxLevelBoard',
      'GreyboxLevelTilemap',
      'ShortestRoomPath',
      'BuildArtBibleStyle',
      'LoadPaletteMaterial',
      'Stopwatch.StartNew',
      'Elapsed.TotalSeconds',
      'ColorOrDefault',
      'TryGetMaterialAssetPath',
      'PlayerSpawnFromGameView',
      'PlayerSpec',
      'PlayerScaleFromActorRadius',
      'EnemyScaleFromActorRadius',
      'actor.PatrolRadius > 0f',
      'actor.AggroRadius > 0f',
      'HazardScaleFromRadius',
      'CheckpointScaleFromRadius',
      'GoalScaleFromRadius',
      'AuthoredRadiusFromTransform',
      'PlayerFromGameView',
      'HazardSpec',
      'HazardsFromGameView',
      'HazardSpecsFromPositions',
      'EnemiesFromGameView',
      'PatrolWaypointsFromRoute',
      'TryPatrolWaypointPosition',
      'RouteMatches',
      'RouteKey',
      'CoinSpec',
      'CoinSpecsFromGameView',
      'CoinTargetCountFromObjective',
      'coinLine.RequiredCount',
      'Mathf.Clamp(authoredCount, 1, 64)',
      'FallbackCoinSpecs',
      'CheckpointSpec',
      'CheckpointFromGameView',
      'GoalSpec',
      'GoalFromGameView',
      'CameraFromGameView',
      'CameraModeFromGameView',
      'CameraOrthographicSizeFromGameView',
      'platformer.gameview',
      'platformer.design',
      'platformer.levelboard',
      'platformer.gbhud',
      'GreyboxPlatformerSamplePlayer',
      'GreyboxPlatformerSampleCameraFollow',
      'GreyboxPlatformerSampleHazard',
      'GreyboxPlatformerSampleEnemy',
      'GreyboxPlatformerSampleCheckpoint',
      'GreyboxPlatformerSampleGoal',
      'GreyboxPlatformerSampleHud',
      'GreyboxPlatformerSampleCollectible',
      'GreyboxPlatformerSampleRunReset',
      'SampleCoinCount',
      'CreatePlayer',
      'playerSpec.Scale',
      'checkpointSpec.Scale',
      'goalSpec.Scale',
      'controller.MaxHearts',
      'controller.JumpImpulse',
      'controller.AttackDamage',
      'controller.AttackRange',
      'controller.AttackCooldownSeconds',
      'controller.Faction',
      'controller.Behavior',
      'controller.AbilityIds',
      'controller.LootTableId',
      'patrol.LootDropColor',
      'patrol.LootDropMaterial',
      'controller.ResetHealth()',
      'sampleHazard.TickSeconds',
      'sampleHazard.Knockback',
      'sampleHazard.Effect',
      'sampleHazard.AffectedTags',
      'sampleHazard.IsLethal',
      'sampleGoal.TargetIds',
      'sampleGoal.Reward',
      'sampleGoal.TimeLimitSeconds',
      'sampleGoal.IsPrimary',
      'sampleCheckpoint.SpawnGroup',
      'sampleCheckpoint.ActorIds',
      'sampleCheckpoint.MaxActivations',
      'sampleCheckpoint.CooldownSeconds',
      'sampleCheckpoint.SpawnOnStart',
      'patrol.AggroRadius',
      'patrol.AbilityKnockback',
      'actor.Faction',
      'actor.Behavior',
      'actor.AbilityIds',
      'actor.PatrolPointIds',
      'actor.LootTableId',
      'patrol.Faction',
      'patrol.Behavior',
      'patrol.AbilityIds',
      'patrol.PatrolPointIds',
      'patrol.PatrolWaypoints',
      'patrol.LootTableId',
      'CreateCheckpoint',
      'ApplyCheckpointSpawnOnStart',
      'CreateEnemies',
      'WireCameraFollow',
      'follow.ApplyCameraMode(cameraMode)',
      'WireHud',
      'hud.TotalCoins = Mathf.Max(1, coins.Length)',
      'RequiredCoinsForGoal',
      'TargetIdsContain',
      'goal.RequiredCoins = RequiredCoinsForGoal(goal, coins, hud.TotalCoins)',
      'AttachRunReset',
      'reset.CaptureInitialState()',
      'HasHudAction',
      'manifest.HudResetActionConfigured',
      'manifest.BuildDurationSeconds',
      'manifest.BuildCompletedUnderBudget',
      'manifest.PlayModeSmokeReady',
      'manifest.PlayableObjectCount',
      'manifest.ResetControllerConfigured',
      'manifest.AddressablesTaggingConfigured',
      'AddressablesTagger.TagSampleSceneDeferred',
      'CreateCoins',
      'AttachArtifactManifest',
      'GreyboxPlatformerSampleArtifactManifest',
      'BoxCollider2D',
      'CircleCollider2D',
      'Rigidbody2D',
    ]) {
      if (!text.includes(snippet)) errors.push(`Greybox2DPlatformerSampleBuilder must create a playable imported sample scene: ${snippet}`);
    }
  }

  const playerPath = 'Runtime/GreyboxPlatformerSamplePlayer.cs';
  const runtimeAsmdefPath = 'Runtime/Greybox.Runtime.asmdef';
  if (files.includes(runtimeAsmdefPath)) {
    const runtimeAsmdef = readJson(join(root, runtimeAsmdefPath), errors);
    if (!runtimeAsmdef?.references?.includes('Unity.InputSystem')) {
      errors.push('Greybox.Runtime.asmdef must reference Unity.InputSystem for the playable 2D Platformer sample');
    }
    if (!runtimeAsmdef?.references?.includes('UnityEngine.UI')) {
      errors.push('Greybox.Runtime.asmdef must reference UnityEngine.UI for playable HUD state binding');
    }
  }
  if (files.includes(playerPath)) {
    const text = readFileSync(join(root, playerPath), 'utf8');
    for (const snippet of [
      'GreyboxPlatformerSamplePlayer',
      'PlayerId',
      'DisplayName',
      'Role',
      'Faction',
      'Behavior',
      'AbilityIds',
      'LootTableId',
      'QueueInput',
      'Simulate',
      'Simulate(horizontal, jumpPressed, attackPressed, Time.time)',
      'Simulate(float horizontal, bool jumpPressed, bool attackPressed, float timeSeconds)',
      'Respawn',
      'ApplyDamage',
      'MaxHearts',
      'CurrentHearts',
      'TotalDamageTaken',
      'AttackDamage',
      'AttackRange',
      'AttackCooldownSeconds',
      'Attack',
      'Attack(enemy, Time.time)',
      'AttackNearestEnemy',
      'AttackNearestEnemy(float timeSeconds)',
      'FindNearestAttackableEnemy',
      'FindNearestAttackableEnemy(float timeSeconds)',
      'CanAttack',
      'CanAttack(enemy, Time.time)',
      'IsAttackReady',
      'IsEnemyInAttackRange',
      'FindObjectsOfType<GreyboxPlatformerSampleEnemy>()',
      'AttackCount',
      'LastAttackTimeSeconds',
      'JumpCount',
      'DefeatedEnemyCount',
      'GoalRewardCount',
      'LootPickupCount',
      'LastCollectedLootDropId',
      'LastCollectedLootTableId',
      'LastCollectedLootDisplayName',
      'HashSet<string>',
      'LastAttackedEnemyId',
      'LastAttackedEnemyDisplayName',
      'LastDefeatedEnemyLootTableId',
      'LastCompletedGoalId',
      'LastCompletedGoalDisplayName',
      'LastCompletedGoalRewardId',
      'ReceiveGoalReward',
      'ReceiveLoot',
      'ResetLootInventory',
      'ResetCombatProgress',
      'ResetRunProgress',
      'collectedLootDropIds.Add',
      'defeatedEnemyIds.Clear',
      'defeatedEnemyIds.Add',
      'HasDefeatedEnemy',
      'DefeatedEnemyCount = 0',
      'LastAttackTimeSeconds = float.NegativeInfinity',
      'DeathCount = 0',
      'GoalRewardCount = 0',
      'transform.position = SpawnPoint',
      'body.velocity = Vector2.zero',
      'enemy.TakeHit',
      'ResetHealth',
      'LastDamageTaken',
      'LastDamageSourceKind',
      'LastDamageSourceId',
      'LastDamageSourceDisplayName',
      'LastStatusEffect',
      'LastUsedAbilityId',
      'HasAbility',
      'SameFaction',
      'SafeAttackRange',
      'ApplyJumpImpulse',
      'AirJumpAbilityId',
      'ReadAttackPressed',
      'ReadInputSystemAttackPressed',
      'ComposeHorizontal',
      'ComposeJumpPressed',
      'Rigidbody2D',
      'BoxCollider2D',
      'MoveSpeed',
      'JumpImpulse',
      'SourceArtifactKind',
      'SourceArtifactId',
      'SourceArtifactDisplayName',
      'using UnityEngine.InputSystem',
      'Keyboard.current',
      'jKey',
      'enterKey',
      'wasPressedThisFrame',
      'Input.GetKey',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSamplePlayer must support playable movement and input fallback: ${snippet}`);
    }
  }

  const cameraPath = 'Runtime/GreyboxPlatformerSampleCameraFollow.cs';
  if (files.includes(cameraPath)) {
    const text = readFileSync(join(root, cameraPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleCameraFollow', 'Target', 'SourceArtifactKind', 'SourceArtifactId', 'SourceArtifactDisplayName', 'CameraMode', 'Offset', 'SmoothTime', 'LateUpdate', 'SnapToTarget', 'ApplyCameraMode', 'ShouldLockY', 'OffsetForMode', 'IsSideScrollCameraMode', 'ContainsCameraModeToken', 'ComposeTargetPosition']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleCameraFollow must track the playable runner: ${snippet}`);
    }
  }

  const hazardPath = 'Runtime/GreyboxPlatformerSampleHazard.cs';
  if (files.includes(hazardPath)) {
    const text = readFileSync(join(root, hazardPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleHazard', 'HazardId', 'DisplayName', 'HazardType', 'SourceArtifactKind', 'SourceArtifactId', 'SourceArtifactDisplayName', 'Effect', 'AffectedTags', 'LastAppliedEffect', 'AffectsPlayer', 'SafeEffect', 'MatchesPlayerIdentity', 'SameIdentity', 'Damage', 'TickSeconds', 'Knockback', 'IsLethal', 'LastApplyTimeSeconds', 'KnockbackImpulseFor', 'OnTriggerEnter2D', 'Apply(player, Time.time)', 'Apply(GreyboxPlatformerSamplePlayer player, float timeSeconds)', 'IsReady', 'DamageFor', 'SafeTickSeconds', 'ApplyDamage', 'Mathf.CeilToInt']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleHazard must respawn the player: ${snippet}`);
    }
  }

  const enemyPath = 'Runtime/GreyboxPlatformerSampleEnemy.cs';
  if (files.includes(enemyPath)) {
    const text = readFileSync(join(root, enemyPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleEnemy', 'EnemyId', 'DisplayName', 'Role', 'Faction', 'Behavior', 'AbilityIds', 'PatrolPointIds', 'PatrolWaypoints', 'ActivePatrolPointId', 'CurrentPatrolTarget', 'LootTableId', 'SpawnLootOnDefeat', 'LootDropColor', 'LootDropMaterial', 'SourceArtifactKind', 'SourceArtifactId', 'SourceArtifactDisplayName', 'Health', 'Damage', 'AttackRange', 'AggroRadius', 'AbilityKnockback', 'AttackCooldownSeconds', 'LastAttackTimeSeconds', 'LastUsedAbilityId', 'LastAppliedAbilityEffect', 'PatrolRadius', 'PatrolSpeed', 'OnTriggerEnter2D', 'Apply(player, Time.time)', 'Apply(GreyboxPlatformerSamplePlayer player, float timeSeconds)', 'AbilityKnockbackImpulseFor', 'AbilityKnockbackMagnitude', 'AbilityStatusEffect', 'AbilityContains', 'IsPlayerInRange', 'IsPlayerInAggroRange', 'CanTargetPlayer', 'SameFaction', 'SafeFaction', 'CanPatrol', 'CanAggro', 'HasAbility', 'SafeBehavior', 'BehaviorContains', 'FirstAbilityId', 'SafeAttackRange', 'SafeAggroRadius', 'IsAttackReady', 'TryGetAuthoredPatrolTarget', 'AdvancePatrolWaypoint', 'PatrolPointIdAt', 'Simulate', 'HitCount', 'ApplyDamage', 'TakeHit', 'SpawnLootDrop', 'GameObject.CreatePrimitive(PrimitiveType.Cube)', 'GetComponent<Renderer>()', 'renderer.sharedMaterial', 'renderer.material.color', 'DestroyLootDrop', 'DestroyRuntimeObject', 'BuildLootDropId', 'SafeToken', 'GreyboxPlatformerSampleCollectible', 'gameview.loot-table', 'SourceObjectiveType = "loot"', 'LastLootDrop', 'LastLootDropId', 'DamageTaken', 'CurrentHealth', 'Defeated', 'ResetEnemy', 'float.NegativeInfinity']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleEnemy must patrol and respawn the player: ${snippet}`);
    }
  }

  const artifactManifestPath = 'Runtime/GreyboxPlatformerSampleArtifactManifest.cs';
  if (files.includes(artifactManifestPath)) {
    const text = readFileSync(join(root, artifactManifestPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleArtifactManifest', 'GameViewSourcePath', 'LevelBoardSourcePath', 'HudSourcePath', 'ArtBibleSourcePath', 'GameViewSourceHash', 'LevelBoardSourceHash', 'HudSourceHash', 'ArtBibleSourceHash', 'GeneratorCredit', 'HumanDesignerCredit', 'AiDisclosure', 'ImportChainProvenanceReady', 'ImportedArtifactCount', 'PlayableObjectCount', 'LevelBoardDrivenObjectCount', 'GameViewDrivenObjectCount', 'SourceTaggedRuntimeObjectCount', 'GameViewEnemyCount', 'GameViewHazardCount', 'GameViewCoinCount', 'GameViewPlayerConfigured', 'GameViewCheckpointConfigured', 'GameViewGoalConfigured', 'GameViewCameraConfigured', 'CameraMode', 'SampleCoinCount', 'PlayerControllerConfigured', 'HudControllerConfigured', 'GoalControllerConfigured', 'CheckpointControllerConfigured', 'CameraFollowConfigured', 'ResetControllerConfigured', 'PlayModeSmokeReady', 'AddressablesScenePath', 'AddressablesLabels', 'AddressablesTaggingConfigured', 'BuildBudgetSeconds', 'BuildDurationSeconds', 'BuildCompletedUnderBudget', 'HudResetActionConfigured', 'HudResetActionId', 'KeyboardResetConfigured', 'KeyboardResetKey']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleArtifactManifest must expose sample provenance: ${snippet}`);
    }
  }

  const checkpointPath = 'Runtime/GreyboxPlatformerSampleCheckpoint.cs';
  if (files.includes(checkpointPath)) {
    const text = readFileSync(join(root, checkpointPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleCheckpoint', 'CheckpointId', 'DisplayName', 'SpawnId', 'SourceArtifactKind', 'SourceArtifactId', 'SourceArtifactDisplayName', 'SpawnGroup', 'ActorIds', 'MaxActivations', 'CooldownSeconds', 'SpawnOnStart', 'SpawnOnStartApplied', 'OnTriggerEnter2D', 'Activate', 'Activate(GreyboxPlatformerSamplePlayer player, float timeSeconds)', 'ApplySpawnOnStart', 'CanActivatePlayer', 'HasActorRestrictions', 'MatchesPlayerIdentity', 'SameIdentity', 'IsReady', 'ResetCheckpoint', 'SafeMaxActivations', 'SafeCooldownSeconds', 'RespawnPoint', 'ActivationCount', 'LastActivationTimeSeconds', 'RemainingActivations']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleCheckpoint must update respawn state: ${snippet}`);
    }
  }

  const goalPath = 'Runtime/GreyboxPlatformerSampleGoal.cs';
  if (files.includes(goalPath)) {
    const text = readFileSync(join(root, goalPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleGoal', 'GoalId', 'DisplayName', 'ObjectiveType', 'SourceArtifactKind', 'SourceArtifactId', 'SourceArtifactDisplayName', 'TargetIds', 'Reward', 'TimeLimitSeconds', 'IsPrimary', 'LastReward', 'Expired', 'GreyboxPlatformerSampleHud Hud', 'RequiredCount', 'RequiredCoins', 'OnTriggerEnter2D', 'MarkReached', 'MarkReached(player, Hud)', 'MarkReached(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)', 'MarkReached(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud, float timeSeconds)', 'player.ReceiveGoalReward(this)', 'Completed', 'CompletionCount', 'RemainingCount', 'RemainingCoins', 'RemainingTargetIds', 'RemainingProgress', 'CurrentHudPlayer()', 'Hud.Player', 'IsLockedByCoins', 'IsLockedByTargetIds', 'IsLocked', 'IsLockedFor', 'IsLockedFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)', 'IsLockedByCoinsFor', 'IsLockedByTargetIdsFor', 'IsLockedByTargetIdsFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)', 'RemainingCoinsFor', 'RemainingTargetIdsFor', 'RemainingTargetIdsFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)', 'player.HasDefeatedEnemy(safeTargetId)', 'RemainingProgressFor', 'RemainingProgressFor(GreyboxPlatformerSamplePlayer player, GreyboxPlatformerSampleHud hud)', 'ResetGoal', 'SafeRequiredCount', 'SafeRequiredCoins', 'IsExpired', 'SafeTimeLimitSeconds', 'SafeReward']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleGoal must track completion: ${snippet}`);
    }
  }

  const hudPath = 'Runtime/GreyboxPlatformerSampleHud.cs';
  if (files.includes(hudPath)) {
    const text = readFileSync(join(root, hudPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleHud', 'GreyboxPlatformerSampleCheckpoint', 'ObjectiveLockedText', 'ObjectiveReadyText', 'ObjectiveCompletedText', 'CheckpointReadyText', 'CheckpointActivatedText', 'RespawnReadyText', 'SafeHudText', 'LockedObjectiveText', 'LockedObjectiveText(int remainingCoins, int remainingTargets)', 'CollectCoin', 'CollectCoin(string coinId, string sourceObjectiveId)', 'collectedCoinIds', 'collectedObjectiveIds', '!collectedCoinIds.Add', 'HasCollectedObjective', 'ResetCoins', 'CoinsCollected', 'Player.CurrentHearts', 'Player.MaxHearts', 'Player.LootPickupCount', 'Goal.IsLockedFor(Player, this)', 'Goal.RemainingCoinsFor(this)', 'Goal.RemainingTargetIdsFor(Player, this)', 'lastHearts', 'lastMaxHearts', 'lastLootPickups', 'lastRemainingGoalCoins', 'lastRemainingGoalTargets', 'lastGoalLocked', 'hud-hearts', 'hud-coins', 'hud-loot', 'hud-objective', 'hud-checkpoint', 'CHECKPOINT SET', 'TARGET', 'GreyboxUiToolkitHud', 'GreyboxMarker', 'SetSlotProgress', 'SetUguiProgress', 'SetUiToolkitProgress', 'GetComponentsInChildren<Slider>', 'element.IsProgress', 'ProgressValue']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleHud must wire gameplay state into imported HUD text: ${snippet}`);
    }
  }

  const collectiblePath = 'Runtime/GreyboxPlatformerSampleCollectible.cs';
  if (files.includes(collectiblePath)) {
    const text = readFileSync(join(root, collectiblePath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleCollectible', 'DisplayName', 'SourceArtifactKind', 'SourceArtifactId', 'SourceArtifactDisplayName', 'SourceObjectiveId', 'SourceObjectiveDisplayName', 'SourceObjectiveType', 'OnTriggerEnter2D', 'Collect', 'IsLoot', 'ResetCollectible', 'player.ReceiveLoot(this)', 'GreyboxPlatformerSampleHud', '!Hud.CollectCoin(CoinId, SourceObjectiveId)', 'gameObject.SetActive(false)']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleCollectible must increment HUD coin state: ${snippet}`);
    }
  }

  const runResetPath = 'Runtime/GreyboxPlatformerSampleRunReset.cs';
  if (files.includes(runResetPath)) {
    const text = readFileSync(join(root, runResetPath), 'utf8');
    for (const snippet of ['GreyboxPlatformerSampleRunReset', 'using UnityEngine.InputSystem', 'CaptureInitialState', 'ResetSampleRun', 'ResetOnKeyPress', 'LegacyResetKey', 'KeyCode.R', 'HudResetActionIds', 'reset-run', 'OnEnable', 'OnDisable', 'GreyboxHudActionDispatcher.ActionRaised', 'TryResetFromHudAction', 'CanHandleHudAction', 'LastHudActionResetCount', 'Update', 'ReadResetPressed', 'ComposeResetPressed', 'ReadInputSystemResetPressed', 'Keyboard.current', 'Input.GetKeyDown(LegacyResetKey)', 'InitialPlayerSpawnPoint', 'HasInitialPlayerSpawnPoint', 'Player.ResetRunProgress()', 'checkpoint.ResetCheckpoint()', 'goal.ResetGoal()', 'enemy.ResetEnemy()', 'collectible.ResetCollectible()', 'hud.ResetCoins()', 'LastResetEnemyCount', 'LastResetCollectibleCount', 'FindObjectsOfType<T>(IncludeInactiveObjects)']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSampleRunReset must restart playable samples: ${snippet}`);
    }
  }

  const testPath = 'Tests/PlayMode/GreyboxPlatformerSamplePlayTests.cs';
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['PlayerSimulateMovesAndRespawnsToSpawnPoint', 'PlayerInputCompositionPrefersInputSystemAndFallsBackToLegacyKeyboard', 'PlayerUsesAuthoredDoubleJumpAbility', 'player.AbilityIds = new[] { "double-jump" }', 'player.JumpCount', 'player.LastUsedAbilityId', 'player.HasAbility("double-jump")', 'HazardRespawnsPlayer', 'hazard.Effect = "stagger"', 'hazard.AffectedTags = new[] { "controller" }', 'hazard.AffectsPlayer(player)', 'player.LastStatusEffect', 'hazard.LastAppliedEffect', 'hazard.TickSeconds = 0.5f', 'hazard.Knockback = 4.5f', 'hazard.Apply(player, 10f)', 'hazard.Apply(player, 10.25f)', 'hazard.IsReady(10.5f)', 'hazard.IsLethal = true', 'player.LastKnockbackImpulse', 'EnemyPatrolsAndRespawnsPlayer', 'player.Faction = "runners"', 'enemy.Faction = "slimes"', 'enemy.Behavior = "patrol-aggro"', 'enemy.AbilityIds = new[] { "slam" }', 'enemy.PatrolPointIds = new[] { "patrol-a", "patrol-b" }', 'enemy.PatrolWaypoints = new[] { new Vector3(7f, 2f, 0f), new Vector3(3f, 2f, 0f) }', 'enemy.ActivePatrolPointId', 'enemy.CurrentPatrolTarget', 'enemy.LootTableId = "starter-slime-drops"', 'enemy.CanPatrol()', 'enemy.CanAggro()', 'enemy.CanTargetPlayer(player)', 'enemy.HasAbility("slam")', 'enemy.LastUsedAbilityId', 'enemy.LastAppliedAbilityEffect', 'enemy.AbilityKnockback = 4f', 'enemy.AttackRange = 2.5f', 'enemy.AggroRadius = 3f', 'enemy.IsPlayerInRange(player)', 'enemy.IsPlayerInAggroRange(player)', 'player.Faction = "slimes"', 'Assert.IsFalse(enemy.CanTargetPlayer(player))', 'enemy.AttackCooldownSeconds = 0.75f', 'enemy.Apply(player, 10f)', 'enemy.Apply(player, 10.25f)', 'enemy.IsAttackReady(10.25f)', 'enemy.Apply(player, 10.75f)', 'enemy.LastAttackTimeSeconds', 'PlayerAttackUsesAuthoredDamageAgainstEnemyHealth', 'PlayerAttackNearestEnemyUsesAuthoredRangeAndFaction', 'player.AttackDamage = 1', 'player.AttackRange = 1.6f', 'player.AttackCooldownSeconds = 0.5f', 'player.IsAttackReady(10.25f)', 'player.Attack(enemy, 10f)', 'player.Attack(enemy, 10.25f)', 'player.Attack(enemy, 10.5f)', 'player.LastAttackTimeSeconds', 'player.CanAttack(enemy)', 'player.IsEnemyInAttackRange(enemy)', 'player.FindNearestAttackableEnemy()', 'player.FindNearestAttackableEnemy(10f)', 'player.AttackNearestEnemy()', 'player.Simulate(0f, false, true, 10f)', 'Player attacks should reject same-faction imported actors', 'Player attack range should be driven by authored metadata', 'player.Attack(enemy)', 'player.AttackCount', 'player.DefeatedEnemyCount', 'player.LastAttackedEnemyId', 'player.LastDefeatedEnemyLootTableId', 'player.HasDefeatedEnemy("slime_patrol_a")', 'Color.yellow', 'enemy.LastLootDropId', 'enemy.LastLootDrop', 'lootRenderer', 'lootRenderer.material.color', 'gameview.loot-table', 'loot.SourceObjectiveType', 'loot.IsLoot()', 'player.LootPickupCount', 'player.LastCollectedLootDropId', 'player.LastCollectedLootTableId', 'player.ResetLootInventory()', 'loot.Collect(player)', 'Assert.IsNull(enemy.LastLootDrop)', 'CameraFollowTracksTargetWithOffsetAndOptionalLockedY', 'follow.ApplyCameraMode("side-scroll")', 'follow.CameraMode', 'GreyboxPlatformerSampleCameraFollow.ShouldLockY("top-down")', 'GreyboxPlatformerSampleCameraFollow.OffsetForMode("top-down", follow.Offset)', 'follow.ApplyCameraMode("top-down")', 'new Vector3(12f, 5f, -18f)', 'CheckpointUpdatesRespawnPoint', 'checkpoint.ApplySpawnOnStart(player)', 'checkpoint.SpawnOnStartApplied', 'CheckpointSpawnOnStartMovesAuthoredActorWithoutConsumingActivation', 'checkpoint.SpawnOnStart = true', 'player.PlayerId = "player_runner"', 'checkpoint.ActorIds = new[] { "player_runner" }', 'checkpoint.CanActivatePlayer(player)', 'player.PlayerId = "spectator"', 'Assert.IsFalse(checkpoint.CanActivatePlayer(player))', 'checkpoint.MaxActivations = 2', 'checkpoint.CooldownSeconds = 0.75f', 'checkpoint.Activate(player, 10f)', 'checkpoint.Activate(player, 10.25f)', 'checkpoint.IsReady(10.75f)', 'checkpoint.RemainingActivations', 'GoalMarksCompletion', 'goal.RequiredCount = 2', 'goal.Reward = "unlock-exit"', 'goal.TimeLimitSeconds = 30f', 'goal.IsPrimary = true', 'goal.MarkReached(player, null, 10f)', 'goal.MarkReached(player, null, 31f)', 'goal.LastReward', 'player.GoalRewardCount', 'player.LastCompletedGoalId', 'player.LastCompletedGoalDisplayName', 'player.LastCompletedGoalRewardId', 'goal.IsExpired(31f)', 'goal.RemainingCount', 'goal.ResetGoal()', 'GoalRequiresAuthoredCoinsBeforeCompletion', 'goal.RequiredCoins = 2', 'goal.TargetIds = new[] { "coin_line" }', 'goal.IsLockedByCoins', 'goal.IsLockedByTargetIds', 'goal.IsLocked', 'goal.RemainingCoins', 'goal.RemainingTargetIds', 'goal.RemainingProgress', 'goal.RemainingTargetIdsFor(hud)', 'goal.RemainingProgressFor(hud)', 'hud.HasCollectedObjective("coin_line")', 'goal.MarkReached(player, hud)', 'GoalTargetIdsUnlockFromDefeatedEnemies', 'goal.IsLockedByTargetIdsFor(player, hud)', 'goal.RemainingTargetIdsFor(player, hud)', 'player.HasDefeatedEnemy("boss")', 'Assert.IsFalse(goal.IsLockedByTargetIds)', 'Assert.AreEqual(0, goal.RemainingTargetIds)', 'DEFEAT 1 TARGET', 'HudTracksDeathsCoinsAndGoalCompletion', 'BuildTextSlot(hudObject.transform, "hud-loot", "value", "0")', 'SlotText(hudObject.transform, "hud-loot", "value").text', 'HudTracksHeartProgressForUguiAndUiToolkit', 'BuildSliderSlot', 'CollectibleIncrementsHudAndDisablesItself', 'CollectibleRejectsDuplicateStableCoinIdsFromHud', 'Assert.IsFalse(hud.CollectCoin("coin-01"))', 'Assert.IsFalse(duplicate.Collect(player))', 'hud.ResetCoins()', 'player.LastDamageTaken', 'player.LastDamageSourceId', 'player.CurrentHearts', 'player.TotalDamageTaken', 'player.ResetHealth()', 'enemy.TakeHit(1)', 'enemy.ResetEnemy()', 'enemy.Defeated', 'enemy.CurrentHealth', 'GreyboxPlatformerSamplePlayer', 'GreyboxPlatformerSampleCameraFollow', 'GreyboxPlatformerSampleHazard', 'GreyboxPlatformerSampleEnemy', 'GreyboxPlatformerSampleCheckpoint', 'GreyboxPlatformerSampleGoal', 'GreyboxPlatformerSampleHud', 'GreyboxPlatformerSampleCollectible']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSamplePlayTests must validate playable sample loops: ${snippet}`);
    }
    for (const snippet of ['PlayerResetRunProgressClearsReplayState', 'SampleRunResetControllerRestartsPlayableSampleState', 'reset.CaptureInitialState()', 'reset.ResetSampleRun()', 'reset.ResetOnKeyPress', 'Assert.AreEqual(KeyCode.R, reset.LegacyResetKey)', 'GreyboxPlatformerSampleRunReset.ComposeResetPressed(true, false)', 'GreyboxPlatformerSampleRunReset.ComposeResetPressed(false, true)', 'reset.CanHandleHudAction("reset-run")', 'GreyboxHudActionDispatcher.Raise("reset-run"', 'Assert.AreEqual(1, reset.LastHudActionResetCount)', 'Assert.AreEqual(initialSpawn, player.SpawnPoint)', 'Assert.AreEqual(1, reset.LastResetEnemyCount)', 'Assert.AreEqual(1, reset.LastResetCollectibleCount)', 'player.ResetRunProgress()', 'Assert.AreEqual(0, player.DeathCount)', 'Assert.AreEqual(player.SpawnPoint, playerObject.transform.position)', 'player.ResetCombatProgress()', 'Assert.IsFalse(player.HasDefeatedEnemy("boss"))', 'Assert.AreEqual(float.NegativeInfinity, player.LastAttackTimeSeconds)', 'Assert.IsTrue(goal.IsLockedByTargetIdsFor(player, hud))']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPlatformerSamplePlayTests must validate replay-safe defeated target resets: ${snippet}`);
    }
  }

  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of [
      'playModeSmokeTestSource',
      'GreyboxPlatformerPlaySmoke',
      'GeneratedPlatformerSceneRunsGameplayLoop',
      'InputFallbackCompositionWorks',
      'AssertInputFallbackComposition',
      'ComposeHorizontal',
      'ComposeJumpPressed',
      'player.HasAbility("double-jump")',
      'player.JumpCount',
      'player.LastUsedAbilityId',
      'Player double jump should be driven by authored ability metadata',
      'Player double jump should expose the authored ability id',
      'GreyboxPlatformerSampleCheckpoint',
      'CHECKPOINT FLAG SET',
      'player.LastDamageTaken',
      'player.LastKnockbackImpulse',
      'player.LastDamageSourceId',
      'player.CurrentHearts',
      'player.ResetHealth()',
      'GreyboxPlatformerSampleEnemy',
      'enemy.Apply(player, 12f)',
      'enemy.AttackRange',
      'sampleEnemy.PatrolWaypoints.Length',
      'sampleEnemy.ActivePatrolPointId',
      'sampleEnemy.CurrentPatrolTarget',
      'authoredPatrolStep.x',
      'Playable enemy patrol waypoints should be resolved from authored route ids and the imported level board',
      'Playable enemy should expose the active authored patrol route id',
      'Playable enemy should expose the current authored patrol target',
      'Playable enemy should move toward the first authored route waypoint instead of an unbound fallback patrol',
      'Sample enemy patrol radius should stay authored independently from attack range',
      'Sample enemy aggro radius should stay authored from the imported detection radius',
      'enemy.IsPlayerInAggroRange(player)',
      'enemy.IsPlayerInRange(player)',
      'Playable player width should be driven by authored gameview actor radius',
      'Playable player jump should be driven by authored gameview actor jump impulse',
      'Playable player attack range should be driven by authored gameview actor attack range',
      'Playable sample should carry imported player attack range into combat',
      'Playable enemy width should be driven by authored gameview actor radius',
      'Playable hazard width should be driven by authored gameview hazard radius',
      'Playable hazard tick cadence should be driven by authored gameview hazard timing',
      'Playable hazard knockback should be driven by authored gameview hazard knockback',
      'Playable spike hazard should preserve authored lethal flag',
      'Playable checkpoint width should be driven by authored gameview checkpoint radius',
      'Playable checkpoint cooldown should be driven by authored gameview spawn metadata',
      'Playable checkpoint should preserve authored spawn-on-start metadata',
      'Playable checkpoint actorIds should admit the imported player actor',
      'sampleCheckpoint.ApplySpawnOnStart(samplePlayer)',
      'sampleCheckpoint.SpawnOnStartApplied',
      'Playable checkpoint should honor authored spawnOnStart=false and leave the start spawn alone',
      'Playable checkpoint should not mark spawn-on-start applied when authored off',
      'Authored spawnOnStart=false should preserve the imported start spawn',
      'Playable goal width should be driven by authored gameview objective radius',
      'Playable goal should preserve authored gameview objective time limit',
      'Playable goal should preserve authored primary objective flag',
      'Playable sample should carry the imported gameview camera mode into the generated Unity camera follow',
      'sampleCameraFollow.CameraMode',
      'sampleCameraFollow.Offset',
      'Playable sample should apply the side-scroll camera offset from the authored camera mode',
      'sampleCameraFollow.LockY',
      'GreyboxPlatformerSampleCameraFollow.ShouldLockY(sampleCameraFollow.CameraMode)',
      'manifest.CameraMode',
      'enemy.AttackCooldownSeconds',
      'enemy.Behavior',
      'enemy.CanPatrol()',
      'enemy.CanAggro()',
      'enemy.HasAbility("bump")',
      'enemy.LastUsedAbilityId',
      'Playable enemy behavior should be driven by authored gameview actor metadata',
      'Guard-aggro authored behavior should keep the sample enemy stationary',
      'Sample enemy behavior should stay authored from the imported gameview actor',
      'Enemy contact should expose the authored ability used for the hit',
      'Enemy contact should expose the authored ability effect used for the hit',
      'Enemy contact should apply authored ability effects to the player runtime',
      'Enemy contact should apply authored ability knockback to the player runtime',
      'Playable enemy ability knockback should be derived from authored damage/range',
      'enemy.IsAttackReady(12.75f)',
      'Enemy contact damage should respect authored attack cooldown',
      'Enemy contact damage should respect authored attack range',
      'Enemy contact damage should respect authored detection radius',
      'Hazard should preserve imported knockback on the player',
      'Hazard should preserve imported status effect on the player',
      'Hazard affected tags should include playable player identity',
      'hazard.LastAppliedEffect',
      'Hazard tick cadence should prevent duplicate immediate damage',
      'Checkpoint should retain authored activation count after first use',
      'Checkpoint should respect authored spawn cooldown before reactivation',
      'checkpoint.CanActivatePlayer(player)',
      'Checkpoint actorIds should reject non-authored player actors',
      'Authored spawnOnStart=false should not auto-apply the checkpoint on scene load',
      'Rejected checkpoint activation should not consume authored activations',
      'player.FindNearestAttackableEnemy()',
      'player.Simulate(0f, false, true, 30f)',
      'Player attack input should target the nearest authored enemy inside range',
      'Input-driven player attack should damage the imported enemy',
      'Input-driven player attack should preserve deterministic simulation time',
      'Input-driven player attack should preserve authored enemy provenance',
      'Player attack cooldown should stay authored from the imported gameview actor',
      'player.Attack(enemy, player.LastAttackTimeSeconds + 0.25f)',
      'Player attack input should respect authored attack cooldown',
      'Cooldown-blocked player attacks should not inflate attack count',
      'player.IsAttackReady(player.LastAttackTimeSeconds + player.AttackCooldownSeconds)',
      'player.Attack(enemy, player.LastAttackTimeSeconds + player.AttackCooldownSeconds)',
      'player.Attack(enemy)',
      'player.AttackDamage',
      'player.AttackRange',
      'player.AttackCooldownSeconds',
      'Player attack range should stay authored from the imported gameview actor',
      'player.AttackCount',
      'player.DefeatedEnemyCount',
      'player.LastAttackedEnemyId',
      'Defeating an imported enemy should expose authored loot-table provenance',
      'Player should track authored defeated enemy ids for target objectives',
      'Non-defeating hits should not emit authored loot-table provenance',
      'enemy.LastLootDropId',
      'Defeating an imported enemy should spawn a stable authored loot drop id',
      'Defeating an imported enemy should spawn a playable loot pickup',
      'Enemy loot drops should render at a stable playable pickup scale',
      'Enemy loot drops should render visibly in the generated scene',
      'Enemy loot drops should inherit an art-bible coin material',
      'Enemy loot drops should use the playable collectible runtime',
      'gameview.loot-table',
      'Enemy loot drops should be classified separately from objective coins',
      'Enemy loot should not increment player inventory before collection',
      'HUD loot slot should start from imported player inventory state',
      'Enemy loot drop should be collectible without affecting objective coin gates',
      'Enemy loot collection should update player inventory state',
      'HUD loot slot should reflect collected enemy loot',
      'Goal target ids should unlock when authored enemies are defeated',
      'Defeated-enemy target goals should become completable',
      'player.LastCollectedLootTableId',
      'enemy.ResetEnemy()',
      'enemy.Defeated',
      'enemy.CurrentHealth',
      'Defeated imported enemy should reject extra player attacks',
      'EXIT GATE REACHED',
      'SourceObjectiveId',
      'SourceObjectiveType',
      'coin_line',
      'collectible',
      'HUD coin target should be driven by the imported coin-line objective count',
      'Playable HUD should use the authored coin-line objective count',
      'Playable exit should require the authored coin-line target before completion',
      'Playable exit should start locked until authored target objectives are collected',
      'Playable exit should track authored target objective progress',
      'Generated goal should retain the authored objective reward',
      'Generated goal should retain the authored objective time limit',
      'Goal should remain completable before the authored objective time limit',
      'Goal should expire after the authored objective time limit',
      'Goal should stay locked before every authored coin is collected',
      'Goal should stay locked before authored target objective coins are collected',
      'HUD should track collected authored source objective ids',
      'Goal target ids should unlock after collecting a coin from the authored target objective',
      'Goal should unlock after every authored coin is collected',
      'goal.MarkReached(player, hud, 89f)',
      'Goal should reject completion after authored time limit expires',
      'Goal completion should expose the authored objective reward',
      'Goal completion should grant the authored reward to the player runtime',
      'Goal completion should expose the authored goal id on the player runtime',
      'Goal completion should expose the authored goal display name on the player runtime',
      'Goal completion should expose the authored reward id on the player runtime',
      'player.LastCompletedGoalRewardId',
      'hud.CollectCoin(coins.First().CoinId)',
      'SlotSlider(hud.transform, "hud-hearts", "health")',
      'SceneManager.LoadScene("Greybox2DPlatformerSample"',
      'Unity PlayMode gameplay smoke',
      'DRY_RUN_PLAYMODE',
      'unityPlayModeSmokeCommand',
    ]) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate PlayMode gameplay loop: ${snippet}`);
    }
    for (const snippet of ['Resetting combat progress should clear defeated target ids for replay', 'Defeated-enemy target goals should relock after combat progress resets']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate replay-safe defeated target resets: ${snippet}`);
    }
    for (const snippet of ['GreyboxPlatformerSampleRunReset', 'Playable sample should include a one-click run reset controller', 'Run reset should capture the imported initial spawn', 'manifest.PlayModeSmokeReady', 'manifest.PlayableObjectCount', 'manifest.ResetControllerConfigured', 'manifest.AddressablesTaggingConfigured', 'AddressablesTagger.SampleSceneLabel', 'AddressablesTagger.PlatformerSampleLabel', 'AssertSampleSceneAddressable', 'Greybox generated sample scene should be Addressable', 'manifest.BuildCompletedUnderBudget', 'manifest.HudResetActionConfigured', 'manifest.KeyboardResetConfigured', 'Run reset should be keyboard-accessible for Asset Store reviewers', 'sampleReset.CanHandleHudAction("reset-run")', 'GreyboxPlatformerSampleRunReset.ComposeResetPressed(true, false)', 'GreyboxPlatformerSampleRunReset.ComposeResetPressed(false, true)', 'GreyboxHudActionDispatcher.Raise("reset-run"', 'sceneReset.LastHudActionResetCount', 'sceneReset.ResetSampleRun()', 'Generated scene should include a one-click sample run reset controller', 'Sample run reset should clear awarded goal progress', 'Sample run reset should clear collected loot progress', 'Sample run reset should return player to imported spawn', 'Sample run reset should reset imported enemies', 'Sample run reset should reset imported objective coins']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate replay-safe sample run resets: ${snippet}`);
    }
  }
}

function validateAsmdefDependencyReferences(root, files, manifest, errors) {
  const dependencies = manifest?.dependencies && typeof manifest.dependencies === 'object'
    ? manifest.dependencies
    : {};
  for (const file of files.filter((entry) => entry.endsWith('.asmdef'))) {
    const asmdef = readJson(join(root, file), errors);
    const references = Array.isArray(asmdef?.references) ? asmdef.references : [];
    for (const reference of references) {
      if (typeof reference !== 'string' || reference.startsWith('GUID:')) continue;
      const dependency = ASMDEF_REFERENCE_DEPENDENCIES[reference];
      if (dependency && !dependencies[dependency]) {
        errors.push(`${file} references ${reference} but package.json must declare ${dependency}`);
      }
    }
  }
}

function validateUnityTestAssemblies(root, files, errors) {
  const suites = [
    {
      path: 'Tests/EditMode/Greybox.Editor.Tests.asmdef',
      directory: 'Tests/EditMode/',
      name: 'Greybox.Editor.Tests',
      rootNamespace: 'Greybox.Tests.EditMode',
      requiredReferences: ['Greybox.Editor', 'Greybox.Runtime', 'Unity.Newtonsoft.Json', 'UnityEngine.UI'],
      editModeOnly: true,
    },
    {
      path: 'Tests/PlayMode/Greybox.Runtime.Tests.asmdef',
      directory: 'Tests/PlayMode/',
      name: 'Greybox.Runtime.Tests',
      rootNamespace: 'Greybox.Tests.PlayMode',
      requiredReferences: ['Greybox.Runtime', 'Unity.InputSystem', 'UnityEngine.UI'],
      editModeOnly: false,
    },
  ];

  for (const suite of suites) {
    const testFiles = files.filter((file) => file.startsWith(suite.directory) && file.endsWith('.cs'));
    if (testFiles.length === 0) continue;
    if (!files.includes(suite.path)) {
      errors.push(`${suite.directory.slice(0, -1)} tests must include a Unity Test Runner asmdef: ${suite.path}`);
      continue;
    }

    const asmdef = readJson(join(root, suite.path), errors);
    if (!asmdef) continue;
    if (asmdef.name !== suite.name) errors.push(`${suite.path} name must be ${suite.name}`);
    if (asmdef.rootNamespace !== suite.rootNamespace) errors.push(`${suite.path} rootNamespace must be ${suite.rootNamespace}`);

    const references = Array.isArray(asmdef.references) ? asmdef.references : [];
    for (const reference of suite.requiredReferences) {
      if (!references.includes(reference)) errors.push(`${suite.path} must reference ${reference}`);
    }

    const optionalUnityReferences = Array.isArray(asmdef.optionalUnityReferences) ? asmdef.optionalUnityReferences : [];
    if (!optionalUnityReferences.includes('TestAssemblies')) {
      errors.push(`${suite.path} must opt into Unity Test Runner via optionalUnityReferences TestAssemblies`);
    }

    const includePlatforms = Array.isArray(asmdef.includePlatforms) ? asmdef.includePlatforms : [];
    if (suite.editModeOnly && (includePlatforms.length !== 1 || includePlatforms[0] !== 'Editor')) {
      errors.push(`${suite.path} must be Editor-only for EditMode tests`);
    }
    if (!suite.editModeOnly && includePlatforms.includes('Editor')) {
      errors.push(`${suite.path} must not be Editor-only; PlayMode tests need player-compatible compilation`);
    }
    if (asmdef.noEngineReferences === true) {
      errors.push(`${suite.path} must keep Unity engine references enabled`);
    }
  }

  const hasPackagedTests = suites.some((suite) => files.some((file) => file.startsWith(suite.directory) && file.endsWith('.cs')));
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (hasPackagedTests && files.includes(smokePath)) {
    const smoke = readFileSync(join(root, smokePath), 'utf8');
    if (!smoke.includes("testables: ['com.greybox.studio']")) {
      errors.push('Unity smoke project manifest must mark com.greybox.studio testable so packaged Unity Test Runner assemblies execute');
    }
  }
}

function validateThirdPartyNotices(root, files, manifest, errors) {
  const noticesPath = 'Third-Party Notices.txt';
  if (!files.includes(noticesPath)) return;
  const notices = readFileSync(join(root, noticesPath), 'utf8');
  if (!/does not bundle third-party source code/i.test(notices)) {
    errors.push('Third-Party Notices.txt must state that the package does not bundle third-party source code or binaries');
  }
  if (!/Unity Technologies/i.test(notices)) {
    errors.push('Third-Party Notices.txt must name Unity Technologies as the source of Unity Package Manager dependency notices');
  }
  const dependencies = manifest?.dependencies && typeof manifest.dependencies === 'object'
    ? manifest.dependencies
    : {};
  for (const [name, version] of Object.entries(dependencies)) {
    if (!thirdPartyNoticeLineIncludes(notices, name, String(version))) {
      errors.push(`Third-Party Notices.txt must list ${name} (${version})`);
    }
  }
}

function thirdPartyNoticeLineIncludes(text, name, version) {
  return text
    .split(/\r?\n/u)
    .some((line) => line.includes(name) && line.includes(version));
}

function validateGameViewportArtifact(root, file, errors) {
  const document = readJson(join(root, file), errors);
  if (!document) return;
  expectString(errors, document.title, `${file} title`);
  expectNonEmptyArray(errors, document.actors, `${file} actors`);
  expectNonEmptyArray(errors, document.spawnPoints, `${file} spawnPoints`);
  expectNonEmptyArray(errors, document.objectives, `${file} objectives`);
  expectNonEmptyArray(errors, document.hazards, `${file} hazards`);
  validateMarkerArray(file, document.actors, 'actors', errors);
  validateMarkerArray(file, document.spawnPoints, 'spawnPoints', errors);
  validateMarkerArray(file, document.objectives, 'objectives', errors);
  validateMarkerArray(file, document.hazards, 'hazards', errors);
  validateStructuredArtifactProvenance(file, document, errors);
}

function validateLevelBoardArtifact(root, file, errors) {
  const document = readJson(join(root, file), errors);
  if (!document) return;
  expectString(errors, document.title, `${file} title`);
  expectNonEmptyArray(errors, document.rooms, `${file} rooms`);
  expectNonEmptyArray(errors, document.encounters, `${file} encounters`);
  expectNonEmptyArray(errors, levelBoardTiles(document), `${file} tilemap tiles`);
  if (!levelBoardCollisionEnabled(document)) errors.push(`${file} tilemap must opt into TilemapCollider2D collision`);
  validateMarkerArray(file, document.rooms, 'rooms', errors);
  validateMarkerArray(file, document.encounters, 'encounters', errors);
  validateStructuredArtifactProvenance(file, document, errors);
}

function levelBoardTiles(document) {
  if (Array.isArray(document?.tiles)) return document.tiles;
  if (Array.isArray(document?.cells)) return document.cells;
  if (Array.isArray(document?.tilemap?.tiles)) return document.tilemap.tiles;
  if (Array.isArray(document?.tilemap?.cells)) return document.tilemap.cells;
  if (Array.isArray(document?.grid?.tiles)) return document.grid.tiles;
  if (Array.isArray(document?.grid?.cells)) return document.grid.cells;
  return [];
}

function levelBoardCollisionEnabled(document) {
  return boolish(document?.collision)
    || boolish(document?.collider)
    || boolish(document?.tilemap?.collision)
    || boolish(document?.tilemap?.collider)
    || boolish(document?.grid?.collision)
    || boolish(document?.grid?.collider);
}

function boolish(value) {
  return value === true || (typeof value === 'string' && value.toLowerCase() === 'true');
}

function validateDesignArtifact(root, file, errors) {
  const text = readFileSync(join(root, file), 'utf8');
  const colors = text.match(/#[0-9A-Fa-f]{6}\b/g) ?? [];
  if (colors.length < 3) errors.push(`${file} must include at least three hex colors for palette import`);
  if (UNQUALIFIED_AI_GENERATED_PATTERN.test(text)) errors.push(`${file} must not use unqualified AI-generated language`);
  if (!AI_ASSISTED_PATTERN.test(text)) errors.push(`${file} must use AI-assisted credit language`);
  if (!/<designer>|human designer|designer credit|human-directed/i.test(text)) {
    errors.push(`${file} must credit the human designer or state human direction`);
  }
}

function validateHudArtifact(root, file, errors) {
  const text = readFileSync(join(root, file), 'utf8');
  if (!/<meta\s+name="generator"\s+content="Greybox \+ [^"]+"/i.test(text)) {
    errors.push(`${file} must include a Greybox + designer generator meta tag`);
  }
  if (!/data-greybox-artifact="hud"/i.test(text)) errors.push(`${file} must identify the HUD artifact`);
  if (UNQUALIFIED_AI_GENERATED_PATTERN.test(text)) errors.push(`${file} must not use unqualified AI-generated language`);
}

function validateMarkerArray(file, value, label, errors) {
  if (!Array.isArray(value)) return;
  for (const [index, marker] of value.entries()) {
    if (!marker || typeof marker !== 'object') {
      errors.push(`${file} ${label}[${index}] must be an object`);
      continue;
    }
    if (typeof marker.id !== 'string' && typeof marker.name !== 'string') {
      errors.push(`${file} ${label}[${index}] must include id or name`);
    }
    if (!hasValidPosition(marker)) {
      errors.push(`${file} ${label}[${index}] must include numeric x/y/z or position.x/y/z`);
    }
  }
}

function hasValidPosition(marker) {
  if (isNumeric(marker.x) && isNumeric(marker.y) && isNumeric(marker.z)) return true;
  const position = marker.position;
  return Boolean(position && isNumeric(position.x) && isNumeric(position.y) && isNumeric(position.z));
}

function validateListing(root, errors) {
  const listing = readText(join(root, 'STORE_LISTING.md'), errors);
  if (!listing) return;
  const top = listing.slice(0, 1200).toLowerCase();
  for (const phrase of ['external services', 'api keys', 'additional costs']) {
    if (!top.includes(phrase)) errors.push(`STORE_LISTING.md must disclose ${phrase} near the top`);
  }
  for (const line of REQUIRED_TIER_LINES) {
    if (!listing.includes(line)) errors.push(`STORE_LISTING.md missing exact pricing tier line: ${line}`);
  }
  if (!listing.includes('Third-Party Notices.txt')) {
    errors.push('STORE_LISTING.md must mention Third-Party Notices.txt');
  }
  if (/\bAI-generated\b/i.test(listing)) {
    errors.push('STORE_LISTING.md must say AI-assisted, not unqualified AI-generated');
  }
  if (!/\bAI-assisted\b/i.test(listing)) errors.push('STORE_LISTING.md must use AI-assisted positioning');
  for (const snippet of ['unity.buildAddressables', 'buildDurationMs', 'buildCompletedAtUtc', 'generatedEntryCount', 'labelCounts', 'missingLabels', 'generatedEntries', 'assetExists', 'assetType', 'greybox-sample-scene', 'greybox-2d-platformer']) {
    if (!listing.includes(snippet)) errors.push(`STORE_LISTING.md must document MCP Addressables reviewer proof: ${snippet}`);
  }
}

function validateHonestAiSurfaces(root, files, errors) {
  for (const file of ['package.json', 'README.md']) {
    if (!files.includes(file)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    validateTextProvenance(file, text, errors, { requireAiAssisted: true });
  }

  const publicSurfaces = files.filter((file) => (
    file.startsWith('Documentation~/')
    || file.startsWith('Samples~/')
    || file === 'STORE_LISTING.md'
  ));
  for (const file of publicSurfaces) {
    if (!isPublicTextSurface(file)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    if (UNQUALIFIED_AI_GENERATED_PATTERN.test(text)) {
      errors.push(`${file} must say AI-assisted, not unqualified AI-generated`);
    }
  }
}

function validateKeywordBrandHygiene(keywords, errors) {
  for (const keyword of keywords) {
    if (typeof keyword !== 'string') {
      errors.push('package keywords must be strings');
      continue;
    }
    if (GREYBOX_DERIVED_GENERIC_PATTERN.test(keyword)) {
      errors.push('package keywords must use blockout language instead of Greybox-derived generic verbs');
    }
  }
}

function validateStructuredArtifactProvenance(file, document, errors) {
  validateTextProvenance(file, JSON.stringify(document), errors, {
    requireAiAssisted: true,
    requireHumanDesigner: true,
  });
}

function validateTextProvenance(file, text, errors, { requireAiAssisted = false, requireHumanDesigner = false } = {}) {
  if (UNQUALIFIED_AI_GENERATED_PATTERN.test(text)) {
    errors.push(`${file} must not use unqualified AI-generated language`);
  }
  if (requireAiAssisted && !AI_ASSISTED_PATTERN.test(text)) {
    errors.push(`${file} must use AI-assisted provenance language`);
  }
  if (requireHumanDesigner && !HUMAN_DESIGNER_CREDIT_PATTERN.test(text)) {
    errors.push(`${file} must credit the human designer`);
  }
}

function validateRuntimeProvenance(root, files, errors) {
  const runtimeArtifactPath = 'Runtime/GreyboxArtifact.cs';
  const importedArtifactPath = 'Runtime/GreyboxImportedArtifact.cs';
  const runtimePalettePath = 'Runtime/GreyboxArtBiblePalette.cs';
  const builderPath = 'Editor/Importers/GreyboxImportArtifactBuilder.cs';
  const importFilePath = 'Editor/Importers/GreyboxImportFile.cs';
  const importJsonPath = 'Editor/Importers/GreyboxImportJson.cs';
  const artifactWindowPath = 'Editor/Windows/GreyboxArtifactWindow.cs';
  const importFileTestPath = 'Tests/EditMode/GreyboxImportFileTests.cs';
  const importerTests = [
    'Tests/EditMode/GameViewportImporterTests.cs',
    'Tests/EditMode/LevelBoardImporterTests.cs',
    'Tests/EditMode/HudLayoutImporterTests.cs',
    'Tests/EditMode/ArtBibleImporterTests.cs',
  ];

  for (const required of [runtimeArtifactPath, importedArtifactPath, runtimePalettePath, builderPath, importFilePath, importJsonPath, artifactWindowPath, importFileTestPath, ...importerTests]) {
    if (!files.includes(required)) errors.push(`missing Unity provenance file: ${required}`);
  }

  if (files.includes(runtimeArtifactPath)) {
    const text = readFileSync(join(root, runtimeArtifactPath), 'utf8');
    for (const snippet of ['GeneratorCredit', 'HumanDesignerCredit', 'AiDisclosure']) {
      if (!text.includes(snippet)) errors.push(`GreyboxArtifact must preserve imported artifact provenance: ${snippet}`);
    }
  }

  if (files.includes(importedArtifactPath)) {
    const text = readFileSync(join(root, importedArtifactPath), 'utf8');
    for (const snippet of ['GeneratorCredit', 'HumanDesignerCredit', 'AiDisclosure', 'CanonicalGeneratedAssetPath', 'ExportedAssetPath', 'ExportedToIncomingSidecar']) {
      if (!text.includes(snippet)) errors.push(`GreyboxImportedArtifact must expose imported artifact provenance on root GameObjects: ${snippet}`);
    }
  }

  if (files.includes(runtimePalettePath)) {
    const text = readFileSync(join(root, runtimePalettePath), 'utf8');
    for (const snippet of ['GeneratorCredit', 'HumanDesignerCredit', 'AiDisclosure']) {
      if (!text.includes(snippet)) errors.push(`GreyboxArtBiblePalette must preserve art-bible provenance: ${snippet}`);
    }
  }

  if (files.includes(builderPath)) {
    const text = readFileSync(join(root, builderPath), 'utf8');
    for (const snippet of ['ExtractProvenance', 'GeneratorMetaRegex', 'HumanDesignerCreditRegex', 'MaxArtifactNameLength', 'MaxArtifactSourcePathLength', 'SafeArtifactName', 'IsSafeArtifactSourcePath', 'segment == "." || segment == ".."', 'IsUnsafeUnityObjectNameChar', 'MaxArtifactSourceJsonLength', 'BoundedSourceJson', 'MaxArtifactProvenanceLength', 'ProvenanceWhitespace', 'char.IsControl', 'artifact.SourceJson = BoundedSourceJson(content)', 'artifact.SourceHash = GreyboxHash.Sha256(content)', 'artifact.GeneratorCredit', 'imported.GeneratorCredit']) {
      if (!text.includes(snippet)) errors.push(`GreyboxImportArtifactBuilder must parse and copy human designer provenance: ${snippet}`);
    }
  }

  if (files.includes(importFilePath)) {
    const text = readFileSync(join(root, importFilePath), 'utf8');
    for (const snippet of ['GreyboxImportFile', 'TryReadText', 'TryWriteTextAtomically', 'FileInfo', 'info.Length > safeMaxBytes', 'Encoding.UTF8.GetByteCount(content) > safeMaxBytes', 'byte safety limit before import', 'File.ReadAllText(assetPath, Encoding.UTF8)', 'File.WriteAllText(tempPath, content, Encoding.UTF8)', 'File.Replace', 'File.Move', 'File.Delete(tempPath)', '.greybox-tmp-', 'SafeImportFileError', 'char.IsControl(c)']) {
      if (!text.includes(snippet)) errors.push(`GreyboxImportFile must cap importer reads before loading file text: ${snippet}`);
    }
  }

  if (files.includes(importJsonPath)) {
    const text = readFileSync(join(root, importJsonPath), 'utf8');
    for (const snippet of ['GreyboxImportJson', 'TryParseObject', 'ParseObjectOrThrow', 'JsonReaderException', 'MaxImportJsonLength', 'MaxImportJsonErrorLength', 'character safety limit', 'root must be a JSON object', 'file is empty', 'SafeImportError', 'char.IsControl(c)']) {
      if (!text.includes(snippet)) errors.push(`GreyboxImportJson must fail gracefully for malformed Unity import JSON: ${snippet}`);
    }
  }

  for (const importerPath of ['Editor/Importers/GameViewportImporter.cs', 'Editor/Importers/LevelBoardImporter.cs']) {
    if (!files.includes(importerPath)) continue;
    const text = readFileSync(join(root, importerPath), 'utf8');
    for (const snippet of ['TryBuildImportObjects', 'GreyboxImportJson.ParseObjectOrThrow', 'GreyboxImportJson.TryParseObject', 'GreyboxImportFile.TryReadText', 'GreyboxImportJson.MaxImportJsonLength', 'ctx.LogImportError(readError)', 'ctx.LogImportError(error)', 'return false']) {
      if (!text.includes(snippet)) errors.push(`${importerPath} must surface parse errors as importer errors: ${snippet}`);
    }
  }

  if (files.includes('Editor/Importers/ArtBibleImporter.cs')) {
    const text = readFileSync(join(root, 'Editor/Importers/ArtBibleImporter.cs'), 'utf8');
    for (const snippet of ['TryBuildImportObjects', 'GreyboxImportFile.TryReadText', 'MaxArtBibleMarkdownImportLength', 'character safety limit', 'ctx.LogImportError(readError)', 'ctx.LogImportError(error)', 'palette.GeneratorCredit = artifact.GeneratorCredit', 'palette.HumanDesignerCredit = artifact.HumanDesignerCredit', 'palette.AiDisclosure = artifact.AiDisclosure']) {
      if (!text.includes(snippet)) errors.push(`ArtBibleImporter must copy provenance onto palette assets: ${snippet}`);
    }
  }

  if (files.includes('Editor/Importers/HudLayoutImporter.cs')) {
    const text = readFileSync(join(root, 'Editor/Importers/HudLayoutImporter.cs'), 'utf8');
    for (const snippet of ['TryBuildImportObjects', 'GreyboxImportFile.TryReadText', 'MaxHudHtmlImportLength', 'character safety limit', 'ctx.LogImportError(readError)', 'ctx.LogImportError(error)']) {
      if (!text.includes(snippet)) errors.push(`HudLayoutImporter must cap HUD reads before building Unity UI: ${snippet}`);
    }
  }

  if (files.includes(artifactWindowPath)) {
    const text = readFileSync(join(root, artifactWindowPath), 'utf8');
    for (const snippet of ['Generator credit', 'Human designer', 'AI disclosure', 'DisplayOrFallback']) {
      if (!text.includes(snippet)) errors.push(`GreyboxArtifactWindow must surface imported provenance to Unity users: ${snippet}`);
    }
  }

  for (const testPath of importerTests) {
    if (!files.includes(testPath)) continue;
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['GeneratorCredit', 'HumanDesignerCredit', 'AiDisclosure']) {
      if (!text.includes(snippet)) errors.push(`${testPath} must assert imported provenance metadata: ${snippet}`);
    }
  }
  if (files.includes(importFileTestPath)) {
    const text = readFileSync(join(root, importFileTestPath), 'utf8');
    for (const snippet of ['TryReadTextReturnsFileContentUnderByteLimit', 'TryReadTextRejectsOversizedFilesBeforeImport', 'TryReadTextReportsMissingFilesWithoutThrowing', 'TryWriteTextAtomicallyCreatesAndReplacesWithoutTempResidue', 'TryWriteTextAtomicallyRejectsOversizedContentBeforeReplacing', 'byte safety limit before import', 'file does not exist', '.greybox-tmp-*']) {
      if (!text.includes(snippet)) errors.push(`GreyboxImportFileTests must cover bounded importer file reads: ${snippet}`);
    }
  }
  if (files.includes('Tests/EditMode/GameViewportImporterTests.cs')) {
    const text = readFileSync(join(root, 'Tests/EditMode/GameViewportImporterTests.cs'), 'utf8');
    for (const snippet of ['BoundsStoredArtifactSourceJsonWhileHashingFullSource', 'BoundsImportedArtifactNameAndSourcePath', 'RejectsTraversalLikeImportedArtifactSourcePaths', 'BoundsImportedProvenanceCredits', 'TryBuildRejectsInvalidGameViewportJsonWithoutThrowing', 'TryBuildRejectsOversizedGameViewportJsonWithoutThrowing', 'valid JSON object', 'root must be a JSON object', 'character safety limit', '16 * 1024 * 1024', '262144', 'SourceJson.Length', 'SourcePath.Length', '../ProjectSettings/ProjectSettings.asset', 'SourceHash', 'GeneratorCredit.Length', 'HumanDesignerCredit.Length']) {
      if (!text.includes(snippet)) errors.push(`GameViewportImporterTests must prove bounded artifact source snapshots preserve full source hashes: ${snippet}`);
    }
  }
  if (files.includes('Tests/EditMode/LevelBoardImporterTests.cs')) {
    const text = readFileSync(join(root, 'Tests/EditMode/LevelBoardImporterTests.cs'), 'utf8');
    for (const snippet of ['TryBuildRejectsInvalidLevelBoardJsonWithoutThrowing', 'TryBuildRejectsOversizedLevelBoardJsonWithoutThrowing', 'valid JSON object', 'root must be a JSON object', 'character safety limit', '16 * 1024 * 1024']) {
      if (!text.includes(snippet)) errors.push(`LevelBoardImporterTests must prove malformed JSON is reported without throwing: ${snippet}`);
    }
  }
}

function isPublicTextSurface(file) {
  if (file === 'package.json') return true;
  if (file.endsWith('.md') || file.endsWith('.txt')) return true;
  return REQUIRED_SAMPLE_EXTENSIONS.some((extension) => file.endsWith(extension));
}

function validateSecretStorage(root, files, errors) {
  const runtimeConfig = 'Runtime/GreyboxConfig.cs';
  const editorSettings = 'Editor/Windows/GreyboxSettings.cs';
  const licenseWindow = 'Editor/Windows/GreyboxLicenseWindow.cs';
  const cloudClient = 'Editor/Sync/GreyboxCloudClient.cs';
  if (!files.includes(runtimeConfig)) errors.push(`missing runtime config: ${runtimeConfig}`);
  if (!files.includes(editorSettings)) errors.push(`missing editor settings: ${editorSettings}`);
  if (!files.includes(licenseWindow)) errors.push(`missing license window: ${licenseWindow}`);
  if (!files.includes(cloudClient)) errors.push(`missing cloud client: ${cloudClient}`);

  if (files.includes(runtimeConfig)) {
    const text = readFileSync(join(root, runtimeConfig), 'utf8');
    if (/LicenseKey|EditorPrefs|PasswordField/.test(text)) {
      errors.push('Runtime/GreyboxConfig.cs must not store license keys, EditorPrefs, or password fields');
    }
  }
  if (files.includes(editorSettings)) {
    const text = readFileSync(join(root, editorSettings), 'utf8');
    if (!text.includes('EditorPrefs.GetString') || !text.includes('EditorPrefs.SetString') || !text.includes('EditorPrefs.DeleteKey')) {
      errors.push('GreyboxSettings must store the license key in EditorPrefs with delete-on-empty behavior');
    }
  }
  if (files.includes(licenseWindow)) {
    const text = readFileSync(join(root, licenseWindow), 'utf8');
    if (!text.includes('GreyboxSettings.GetLicenseKey') || !text.includes('GreyboxSettings.SetLicenseKey')) {
      errors.push('GreyboxLicenseWindow must read/write license keys through GreyboxSettings EditorPrefs helpers');
    }
    if (/config\.LicenseKey/.test(text)) errors.push('GreyboxLicenseWindow must not write license keys to GreyboxConfig assets');
  }
  if (files.includes(cloudClient)) {
    const text = readFileSync(join(root, cloudClient), 'utf8');
    if (!text.includes('GreyboxSettings.GetLicenseKey')) errors.push('GreyboxCloudClient must read license keys from EditorPrefs helpers');
    if (/config\.LicenseKey/.test(text)) errors.push('GreyboxCloudClient must not read license keys from GreyboxConfig assets');
  }
}

function validateLicenseCapabilities(root, files, errors) {
  const statePath = 'Editor/Windows/GreyboxLicenseState.cs';
  const settingsPath = 'Editor/Windows/GreyboxSettings.cs';
  const projectEntitlementsPath = 'Editor/Windows/GreyboxProjectEntitlements.cs';
  const licenseWindowPath = 'Editor/Windows/GreyboxLicenseWindow.cs';
  const studioWindowPath = 'Editor/Windows/GreyboxStudioWindow.cs';
  const packageDownloaderPath = 'Editor/Sync/GreyboxPackageDownloader.cs';
  const daemonClientPath = 'Editor/Sync/GreyboxDaemonClient.cs';
  const sceneWatcherPath = 'Editor/Sync/GreyboxSceneChangeWatcher.cs';
  const projectWatcherPath = 'Editor/Sync/ProjectWatcher.cs';
  const artifactRefresherPath = 'Editor/Sync/GreyboxArtifactRefresher.cs';
  const conflictResolverPath = 'Editor/Sync/GreyboxConflictResolver.cs';
  const cloudClientPath = 'Editor/Sync/GreyboxCloudClient.cs';
  const mcpServerPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const testPath = 'Tests/EditMode/GreyboxLicenseStateTests.cs';
  const cloudClientTestPath = 'Tests/EditMode/GreyboxCloudClientTests.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  for (const required of [
    statePath,
    settingsPath,
    projectEntitlementsPath,
    licenseWindowPath,
    studioWindowPath,
    packageDownloaderPath,
    daemonClientPath,
    sceneWatcherPath,
    projectWatcherPath,
    artifactRefresherPath,
    conflictResolverPath,
    cloudClientPath,
    mcpServerPath,
    testPath,
    cloudClientTestPath,
  ]) {
    if (!files.includes(required)) errors.push(`missing license capability file: ${required}`);
  }

  if (files.includes(statePath)) {
    const text = readFileSync(join(root, statePath), 'utf8');
    for (const snippet of [
      'GreyboxLicenseTier',
      'FreePersonal',
      'Indie',
      'Pro',
      'Studio',
      'GreyboxLicenseCapabilities',
      'CanImport',
      'CanRoundTrip',
      'CanUseMcpBridge',
      'HasWatermark',
      'MaxProjects',
      'ForTier(GreyboxLicenseTier.FreePersonal)',
      'HasPriorityQueue',
      'HasSso',
      'HasCustomSkillPacks',
      'SeatLimit',
      'IsSiteLicense',
      'PriceLabel',
      '$149 one-time',
      '$399 one-time + $9/mo',
      '$2,999 one-time + $499/yr',
      'FromCloudFeatures',
      'ClampFeature',
      'ClampProjectLimit',
      'ClampSeatLimit',
      'TryAuthorizeImport',
      'TryParseCapabilities',
      'TryParseTrustedCapabilities',
      'IsPlanCompatibleWithTier',
      'CapabilitySnapshotIntegrity',
      'VerifyCapabilitySnapshotIntegrity',
      'GreyboxSettings.GetLicenseCapabilitiesJson',
      'GreyboxSettings.GetLicenseCapabilitiesIntegrity',
      'GreyboxSettings.GetLicenseKey',
      'TryParseTier',
      'plan',
      'JTokenType.String',
      'must be a JSON string',
      'MaxCachedLicenseSnapshotChars',
      'value.Length > MaxCachedLicenseSnapshotChars',
      'MaxCachedLicenseClaimChars',
      'SafeCachedLicenseClaim',
      'character safety cap',
      'contains control characters',
      'OptionalString(body, "expiresAt")',
      'OptionalString(body, "validatedAt")',
      'DateTimeOffset.UtcNow',
      'cached license capabilities expired',
      'studiositelicense',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxLicenseState must define tier capabilities: ${snippet}`);
    }
    if (/Enum\.TryParse/.test(text)) {
      errors.push('GreyboxLicenseState must not parse license tiers through Enum.TryParse; numeric enum values could grant paid tiers');
    }
    if (text.includes('TryInferTierFromKey')) {
      errors.push('GreyboxLicenseState must not infer paid capabilities from license-key prefixes');
    }
    if (text.includes('body.Value<string>("expiresAt")') || text.includes('body.Value<string>("validatedAt")')) {
      errors.push('GreyboxLicenseState must parse cached license timestamps with strict string-token checks');
    }
  }
  if (files.includes(settingsPath)) {
    const text = readFileSync(join(root, settingsPath), 'utf8');
    for (const snippet of ['LicenseTierPref', 'LicenseCapabilitiesPref', 'LicenseCapabilitiesIntegrityPref', 'ProjectKeysPref', 'McpBridgeTokenPref', 'GetLicenseTier', 'SetLicenseTier', 'ClearLicenseTier', 'GetLicenseCapabilitiesJson', 'GetLicenseCapabilitiesIntegrity', 'SetLicenseCapabilities', 'MaxLicenseSnapshotExpiryChars', 'TryCleanLicenseSnapshotExpiry', 'DateTimeOffset.TryParse', 'TryParseTrustedCapabilities', 'CapabilitySnapshotIntegrity', 'validatedAt', 'expiresAt', 'ClearLicenseCapabilities', 'GetTrackedProjectKeys', 'SetTrackedProjectKeys', 'SanitizeTrackedProjectKeys', 'MaxTrackedProjectKeys', 'TrackedProjectKeyChars', 'IsSafeTrackedProjectKey', 'GetOrCreateMcpBridgeToken', 'RotateMcpBridgeToken', 'McpBridgeTokenChars', 'IsSafeMcpBridgeToken', 'RandomNumberGenerator.Fill']) {
      if (!text.includes(snippet)) errors.push(`GreyboxSettings must cache the validated license tier: ${snippet}`);
    }
  }
  if (files.includes(projectEntitlementsPath)) {
    const text = readFileSync(join(root, projectEntitlementsPath), 'utf8');
    for (const snippet of ['GreyboxProjectEntitlements', 'RegisterCurrentProject', 'EvaluateProjectAccess', 'GreyboxSettings.SanitizeTrackedProjectKeys', 'ProjectKey', 'GreyboxDaemonUrlBuilder.TrySafeProjectId', 'safe Greybox Project ID', 'SHA256.Create', 'limited to', '3 projects']) {
      if (!text.includes(snippet)) errors.push(`GreyboxProjectEntitlements must enforce Free Personal project caps: ${snippet}`);
    }
  }
  if (files.includes(licenseWindowPath)) {
    const text = readFileSync(join(root, licenseWindowPath), 'utf8');
    for (const snippet of [
      'Cached tier',
      'Validate With Greybox Cloud',
      'EditorCoroutineUtility.StartCoroutine',
      'GreyboxCloudClient',
      'LastLicenseValidationSucceeded',
      'SaveLocalKey',
      'ValidateAgainstCloud',
      'GreyboxSettings.ClearLicenseTier',
      'Validate with Greybox Cloud to activate paid capabilities',
      'requires Pro or Studio',
      'Project cap',
      'Priority queue',
      'SSO',
      'Custom skill packs',
      'Seats',
      'Site license',
      'Price: {capabilities.PriceLabel}',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxLicenseWindow must show paid capability state: ${snippet}`);
    }
    if (text.includes('Infer Tier From Key') || text.includes('SaveLocalKeyAndInferTier')) {
      errors.push('GreyboxLicenseWindow must not offer local paid-tier inference from key prefixes');
    }
  }
  if (files.includes(studioWindowPath)) {
    const text = readFileSync(join(root, studioWindowPath), 'utf8');
    for (const snippet of ['GreyboxLicenseState.CurrentCapabilities', 'GreyboxProjectEntitlements.CurrentProjectAccess', 'GreyboxProjectEntitlements.RegisterCurrentProject', 'Project usage', 'CanRoundTrip', 'CanUseMcpBridge', 'McpBridgeEnabled', 'EditorGUI.DisabledScope', 'require a Pro or Studio license', 'Priority queue', 'Seats', 'Studio site license', 'custom skill packs', 'Copy MCP Config', 'Rotate MCP Token', 'GreyboxSettings.GetOrCreateMcpBridgeToken', 'GreyboxSettings.RotateMcpBridgeToken']) {
      if (!text.includes(snippet)) errors.push(`GreyboxStudioWindow must gate paid controls: ${snippet}`);
    }
  }
  if (files.includes(packageDownloaderPath)) {
    const text = readFileSync(join(root, packageDownloaderPath), 'utf8');
    for (const snippet of ['GreyboxLicenseState.TryAuthorizeImport', 'GreyboxProjectEntitlements.RegisterCurrentProject', 'DisplayDialog', 'Debug.LogWarning']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPackageDownloader must enforce project caps on direct package pulls: ${snippet}`);
    }
  }
  if (files.includes(daemonClientPath)) {
    const text = readFileSync(join(root, daemonClientPath), 'utf8');
    for (const snippet of [
      'GreyboxProjectEntitlements.RegisterCurrentProject',
      'GreyboxLicenseState.CurrentCapabilities().CanRoundTrip',
      'round-trip sync requires a Pro or Studio license',
      'ReceiveChunkBytes',
      'MaxSyncMessageBytes',
      'MemoryStream',
      'EndOfMessage',
      'MessageTooBig',
      'malformed Unity sync frame',
      'BuildSyncUri',
      'Uri.TryCreate',
      'absolute HTTP or HTTPS',
      'GreyboxConflictResolver.SafeRoundTripFileName',
      'GreyboxConflictResolver.SafeConflictJsonPath',
      'TryBuildUnityEditFrame',
      'SafeRoundTripEditPath',
      'IsSafeRoundTripEditValue',
      'MaxRoundTripEditPathChars',
      'MaxRoundTripEditValueDepth',
      'MaxRoundTripEditObjectProperties',
      'MaxRoundTripEditArrayItems',
      'MaxRoundTripEditStringChars',
      'ForbiddenRoundTripEditValueKeys',
      'IsSafeRoundTripEditPropertyName',
      '__proto__',
      'prototype',
      'constructor',
      'value.DeepClone()',
      'bytes.Length <= MaxSyncMessageBytes',
      'oversized Unity edit frame',
      'unsafe file name, unsafe JSON path, or unsafe value',
      'without a safe project id',
      'ProjectScopeCandidates',
      'TryReadStringField',
      'TryReadStringField(evt, "type"',
      'token.Type != JTokenType.String',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxDaemonClient must gate direct sync calls behind license entitlements: ${snippet}`);
    }
    if (text.includes('evt.Value<string>("type")')) {
      errors.push('GreyboxDaemonClient must read daemon sync frame types with strict string-token checks');
    }
  }
  for (const file of [sceneWatcherPath, projectWatcherPath, conflictResolverPath]) {
    if (!files.includes(file)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    if (!text.includes('GreyboxLicenseState.CurrentCapabilities().CanRoundTrip')) {
      errors.push(`${file} must gate round-trip write paths behind Pro or Studio`);
    }
  }
  if (files.includes(artifactRefresherPath)) {
    const text = readFileSync(join(root, artifactRefresherPath), 'utf8');
    for (const snippet of ['GreyboxLicenseState.CurrentCapabilities().CanRoundTrip', 'web-to-Unity artifact refresh requires a Pro or Studio license']) {
      if (!text.includes(snippet)) errors.push(`GreyboxArtifactRefresher must gate direct web-to-Unity refreshes behind round-trip licensing: ${snippet}`);
    }
  }
  if (files.includes(cloudClientPath)) {
    const text = readFileSync(join(root, cloudClientPath), 'utf8');
    for (const snippet of [
      'JObject.Parse',
      'tier',
      'plan',
      'LastLicenseValidationSucceeded',
      'LastLicenseValidationMessage',
      'LastValidatedTier',
      'LastValidatedCapabilities',
      '/v1/licenses/validate',
      'GreyboxLicenseState.TryParseTier',
      'FromCloudFeatures',
      'features',
      'status',
      'expiresAt',
      'MaxLicenseKeyChars',
      'MaxLicenseClaimChars',
      'MaxLicenseValidationMessageChars',
      'IsSafeLicenseKey',
      'OptionalLicenseClaim',
      'SafeLicenseClaim',
      'SafeLicenseValidationMessage',
      'character safety cap',
      'contains control characters',
      'JTokenType.Boolean',
      'JTokenType.Integer',
      'JTokenType.String',
      'must be a JSON boolean',
      'must be a JSON integer',
      'must be a JSON string',
      'must be a JSON object',
      'MaxLicenseValidationRequestMs',
      'MaxLicenseValidationResponseChars',
      'request.timeout',
      'request.Abort()',
      'IsSafeLicenseValidationResponse',
      'parsed.UserInfo',
      'credentials',
      'IsPlanCompatibleWithTier',
      'mismatched tier and plan claims',
      'priorityQueue',
      'sso',
      'customSkillPacks',
      'seatLimit',
      'siteLicense',
      'GreyboxSettings.SetLicenseTier',
      'GreyboxSettings.SetLicenseCapabilities',
      'unsafe or untrusted capability snapshot',
      'ClearCachedLicenseAfterValidationFailure',
      'GreyboxSettings.ClearLicenseTier',
      'TryBuildLicenseValidationUrl',
      'Uri.UriSchemeHttps',
      'Uri.UriSchemeHttp',
      'localhost',
      '127.0.0.1',
      '::1',
      'requires HTTPS outside localhost',
      'query strings or fragments',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxCloudClient must cache cloud-validated license tiers: ${snippet}`);
    }
  }
  if (files.includes(cloudClientTestPath)) {
    const text = readFileSync(join(root, cloudClientTestPath), 'utf8');
    for (const snippet of ['LicenseValidationUrlRequiresHttpsOutsideLocalRehearsals', 'LicenseValidationTimeoutAndResponseCapsAreBounded', 'LicenseValidationRejectsUnsafeBearerKeys', 'LicenseValidationFeatureClaimsRequireStrictJsonTypes', 'LicenseValidationIdentityClaimsRequireStrictJsonTypes', 'LicenseValidationIdentityClaimsAreBoundedAndDisplaySafe', 'MaxLicenseKeyChars', 'MaxLicenseClaimChars', 'MaxLicenseValidationMessageChars', 'IsSafeLicenseKey', 'OptionalLicenseClaim', 'SafeLicenseValidationMessage', 'expiresAt', 'Injected: true', 'MaxLicenseValidationRequestMs', 'MaxLicenseValidationResponseChars', 'IsSafeLicenseValidationResponse', 'https://cloud.greybox.studio', 'http://localhost:8787', 'http://cloud.greybox.studio', 'https://cloud.greybox.studio?token=leak', 'https://user:pass@cloud.greybox.studio', 'requires HTTPS', 'query strings', 'credentials', 'absolute HTTPS']) {
      if (!text.includes(snippet)) errors.push(`GreyboxCloudClientTests must cover safe license validation URLs: ${snippet}`);
    }
  }
  if (files.includes(mcpServerPath)) {
    const text = readFileSync(join(root, mcpServerPath), 'utf8');
    for (const snippet of ['IsMcpBridgeAllowed', 'McpBridgeEnabled', 'GreyboxLicenseState.CurrentCapabilities().CanUseMcpBridge', 'GreyboxProjectEntitlements.RegisterCurrentProject', 'Greybox MCP bridge requires a Pro or Studio license', 'HandleToolCall', 'IsAuthorizedMcpRequest', 'mcp_auth_required', 'IsAllowedMcpContentType', 'mcp_unsupported_media_type', 'X-Greybox-Mcp-Token', 'MaxMcpAuthorizationHeaderChars', 'IsSafeMcpAuthHeader', 'IsSafeMcpBrowserRequest', 'mcp_browser_origin_forbidden', 'McpListenerPrefix', 'ResetMcpListenerStateAfterStartFailure', 'GreyboxSettings.IsSafeMcpBridgeToken']) {
      if (!text.includes(snippet)) errors.push(`GreyboxMcpServer must enforce Pro/Studio entitlements on direct MCP access: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['CapabilityMatrixMatchesPricingTiers', 'CloudFeaturesCanDisableTierFeaturesButCannotUpgradeTier', 'CloudFeaturesClampFreeAndStudioCommercialCaps', 'ImportAuthorizationFailsClosedWhenCloudDisablesImport', 'ParsesCachedCloudCapabilitySnapshot', 'RejectsCachedCloudCapabilitySnapshotWithMismatchedPlan', 'RejectsCachedCloudCapabilitySnapshotWithStringlyFeatureClaims', 'RejectsCachedCloudCapabilitySnapshotWithNonStringIdentityClaims', 'RejectsCachedCloudCapabilitySnapshotWithUnsafeIdentityClaims', 'RejectsOversizedCachedCloudCapabilitySnapshotBeforeParsing', 'MaxCachedLicenseSnapshotChars', 'maxSnapshotChars + 1', 'LicenseCapabilitySnapshotsRejectUnsafeExpiryBeforeCaching', 'ExpiredCachedCloudCapabilitySnapshotFailsClosed', 'CurrentCapabilitiesRequireCloudValidatedSnapshot', 'ParsesCloudTierValues', 'RejectsLocalPaidPrefixActivation', 'LicenseValidationFailuresClearCachedPaidCapabilities', 'numericExpiry', 'numericValidation', 'not-a-date', 'Injected: true', 'EnforcesFreePersonalThreeProjectCap', 'ProjectEntitlementsUseSafeCanonicalProjectIds', 'TrackedProjectKeysAreCanonicalBoundedHashes', 'not-a-hash', '0123456789abcdeg', '64', 'PaidTiersAllowUnlimitedProjects', 'studio_site_license', 'CanRoundTrip', 'CanUseMcpBridge', 'HasWatermark', 'MaxProjects', 'HasPriorityQueue', 'HasSso', 'HasCustomSkillPacks', 'SeatLimit', 'IsSiteLicense', 'PriceLabel', '$149 one-time', '$399 one-time + $9/mo', '$2,999 one-time + $499/yr']) {
      if (!text.includes(snippet)) errors.push(`License state tests must cover pricing tier gates: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['Greybox.Editor.Windows.GreyboxLicenseState', 'Greybox.Editor.Windows.GreyboxLicenseWindow', 'Greybox.Editor.Windows.GreyboxProjectEntitlements']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate license capability types: ${snippet}`);
    }
  }
}

function validateWatermarkEnforcement(root, files, errors) {
  const runtimeWatermarkPath = 'Runtime/GreyboxWatermark.cs';
  const runtimeArtifactPath = 'Runtime/GreyboxArtifact.cs';
  const runtimePalettePath = 'Runtime/GreyboxArtBiblePalette.cs';
  const builderPath = 'Editor/Generation/GreyboxWatermarkBuilder.cs';
  const importerPaths = [
    'Editor/Importers/GameViewportImporter.cs',
    'Editor/Importers/LevelBoardImporter.cs',
    'Editor/Importers/HudLayoutImporter.cs',
    'Editor/Importers/ArtBibleImporter.cs',
  ];
  const testPath = 'Tests/EditMode/GreyboxWatermarkBuilderTests.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  for (const required of [runtimeWatermarkPath, builderPath, testPath]) {
    if (!files.includes(required)) errors.push(`missing Free Personal watermark enforcement file: ${required}`);
  }
  if (files.includes(runtimeWatermarkPath)) {
    const text = readFileSync(join(root, runtimeWatermarkPath), 'utf8');
    for (const snippet of ['GreyboxWatermark', 'MonoBehaviour', 'Greybox Free Personal', 'LicenseTier', 'Visible']) {
      if (!text.includes(snippet)) errors.push(`GreyboxWatermark runtime marker must describe generated watermarks: ${snippet}`);
    }
  }
  if (files.includes(runtimeArtifactPath)) {
    const text = readFileSync(join(root, runtimeArtifactPath), 'utf8');
    if (!text.includes('Watermarked')) errors.push('GreyboxArtifact must record whether imported artifacts were watermarked');
  }
  if (files.includes(runtimePalettePath)) {
    const text = readFileSync(join(root, runtimePalettePath), 'utf8');
    if (!text.includes('Watermarked')) errors.push('GreyboxArtBiblePalette must record Free Personal watermark state');
  }
  if (files.includes(builderPath)) {
    const text = readFileSync(join(root, builderPath), 'utf8');
    for (const snippet of ['GreyboxWatermarkBuilder', 'WatermarkText', 'Greybox Free Personal', 'TextMesh', 'UnityEngine.UI', 'ApplyWorldWatermark', 'ApplyHudWatermark', 'MarkGeneratedWatermark', 'GreyboxGeneratedComponents']) {
      if (!text.includes(snippet)) errors.push(`GreyboxWatermarkBuilder must generate visible Free Personal watermarks: ${snippet}`);
    }
  }
  for (const importerPath of importerPaths) {
    if (!files.includes(importerPath)) {
      errors.push(`missing importer for watermark enforcement: ${importerPath}`);
      continue;
    }
    const text = readFileSync(join(root, importerPath), 'utf8');
    for (const snippet of ['GreyboxLicenseState.TryAuthorizeImport', 'capabilities.HasWatermark', 'artifact.Watermarked = watermarked']) {
      if (!text.includes(snippet)) errors.push(`${importerPath} must enforce Free Personal watermark metadata: ${snippet}`);
    }
    if (importerPath !== 'Editor/Importers/ArtBibleImporter.cs' && !text.includes('GreyboxWatermarkBuilder.Apply(root, watermarked)')) {
      errors.push(`${importerPath} must add visible watermarks to generated GameObjects`);
    }
    if (importerPath === 'Editor/Importers/ArtBibleImporter.cs' && !text.includes('palette.Watermarked = watermarked')) {
      errors.push('ArtBibleImporter must mark runtime palettes when Free Personal watermarks apply');
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['CreatesVisibleWorldWatermarkForFreePersonalArtifacts', 'CreatesVisibleHudWatermarkForFreePersonalArtifacts', 'DoesNotWatermarkPaidArtifacts']) {
      if (!text.includes(snippet)) errors.push(`Watermark tests must cover Free Personal and paid tiers: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['Greybox.Runtime.GreyboxWatermark', 'Greybox.Editor.Generation.GreyboxWatermarkBuilder']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate watermark types: ${snippet}`);
    }
  }
}

function validateRoundTripMarkers(root, files, errors) {
  const markerPath = 'Runtime/GreyboxMarker.cs';
  const prefabBuilderPath = 'Editor/Generation/PrefabBuilder.cs';
  const prefabBuilderTestPath = 'Tests/EditMode/PrefabBuilderTests.cs';
  const watcherPath = 'Editor/Sync/ProjectWatcher.cs';
  const watcherTestPath = 'Tests/EditMode/ProjectWatcherTests.cs';
  const sceneWatcherPath = 'Editor/Sync/GreyboxSceneChangeWatcher.cs';
  const metadataSyncPath = 'Editor/Sync/GreyboxRoundTripMetadataSync.cs';
  const mcpTestPath = 'Tests/EditMode/McpBridgeTests.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (!files.includes(markerPath)) errors.push(`missing runtime round-trip marker: ${markerPath}`);
  if (files.includes(markerPath)) {
    const text = readFileSync(join(root, markerPath), 'utf8');
    for (const snippet of ['MonoBehaviour', 'GreyboxArtifactKind', 'SourcePath', 'SourceFileName', 'JsonPath', 'PositionJsonPath']) {
      if (!text.includes(snippet)) errors.push(`GreyboxMarker.cs missing required metadata field: ${snippet}`);
    }
  }
  if (files.includes(prefabBuilderPath)) {
    const text = readFileSync(join(root, prefabBuilderPath), 'utf8');
    for (const snippet of ['AddComponent<GreyboxMarker>', 'PositionJsonPath', 'PositionJsonPath(itemPath, item)', 'transform.position', '[{fieldName}=', 'GreyboxArtifactKind.GameViewport', 'GreyboxArtifactKind.LevelBoard', '__greyboxSourceFileName', 'SourceFileName(document, sourcePath)', 'SafeSourceFileName', 'SafeSourcePath', 'IsSafeSourcePath', 'MaxSourcePathLength', 'segment == "." || segment == ".."', 'GreyboxConflictResolver.SafeRoundTripFileName', 'CountPathKeys', 'UniqueMarkerId', 'UniqueObjectName', 'usedConnectionMarkerIds', 'connectionPathKeyCounts', 'ItemJsonPath(collection, item, index, pathKeyCounts)', 'JsonPathSelectorValue', 'IsSafeJsonPathSelectorValue', 'MaxJsonPathSelectorValueLength', 'IsUniquePathKey', 'StableJsonPathKeyFields', 'actorId', 'spawnId', 'objectiveId', 'hazardId', 'checkpointId', 'goalId', 'coinId', 'tileId', 'roomId', 'encounterId', 'connectionId']) {
      if (!text.includes(snippet)) errors.push(`PrefabBuilder must stamp stable round-trip marker metadata: ${snippet}`);
    }
  }
  if (files.includes(prefabBuilderTestPath)) {
    const text = readFileSync(join(root, prefabBuilderTestPath), 'utf8');
    for (const snippet of ['DuplicateAuthoredIdsUseIndexPathsAndUniqueMarkerIds', 'DuplicateAuthoredNamesUseUniqueHierarchyLabels', 'UnsafeJsonPathSelectorValuesUseIndexPaths', 'UnsafeDaemonSourceFileMetadataFallsBackToLocalSourceFile', 'RejectsUnsafeMarkerSourcePaths', 'DuplicateLevelBoardConnectionIdsUseUniqueMarkersAndIndexPaths', 'DomainSpecificIdsUseStableRoundTripPaths', 'LevelBoardDomainSpecificIdsUseStableRoundTripPaths', 'PreservesAuthoredTransformAliasesForRoundTripPositionPaths', 'Actors/Scout 2', 'Connections/Gate 2', '$.actors[1]', '$.connections[1]', '$.actors[id=boss].transform.position', '$.spawnPoints[id=spawn-a].location', '$.objectives[id=exit].translation', '$.actors[actorId=boss]', '$.spawnPoints[spawnId=spawn-a]', '$.objectives[objectiveId=exit]', '$.hazards[hazardId=spikes]', '$.rooms[roomId=entry]', '$.tilemap.tiles[tileId=spike-row]', 'boss-2', 'Scout-2', 'gate-2', 'boss]oops', 'Gate=Boss', '../levels/arena.gameview.json', '../ProjectSettings/ProjectSettings.asset', '$.actors[id=7]', '$.spawnPoints[0]']) {
      if (!text.includes(snippet)) errors.push(`PrefabBuilderTests must cover duplicate authored marker IDs: ${snippet}`);
    }
  }
  if (files.includes(watcherPath)) {
    const text = readFileSync(join(root, watcherPath), 'utf8');
    for (const snippet of ['NotifyMarkerTransformChanged', 'GreyboxMarker', 'PositionJsonPath', 'DiffApplier.FromVector3', 'MarkerSourceFileName', 'GreyboxConflictResolver.SafeRoundTripFileName', 'unsafe marker source file']) {
      if (!text.includes(snippet)) errors.push(`ProjectWatcher must send marker-based round-trip edits: ${snippet}`);
    }
  }
  if (!files.includes(watcherTestPath)) errors.push(`missing project watcher tests: ${watcherTestPath}`);
  if (files.includes(watcherTestPath)) {
    const text = readFileSync(join(root, watcherTestPath), 'utf8');
    for (const snippet of ['MarkerSourceFileNameNormalizesSafeRoundTripArtifacts', 'MarkerSourceFileNameRejectsUnsafeRoundTripArtifacts', 'levels\\arena.gameview.json', '../levels/arena.gameview.json', 'https://example.test/arena.gameview.json', 'levels/notes.txt', 'world/DESIGN.md']) {
      if (!text.includes(snippet)) errors.push(`ProjectWatcherTests must cover safe outbound Unity edit file names: ${snippet}`);
    }
  }
  if (!files.includes(sceneWatcherPath)) errors.push(`missing Scene edit watcher: ${sceneWatcherPath}`);
  if (files.includes(sceneWatcherPath)) {
    const text = readFileSync(join(root, sceneWatcherPath), 'utf8');
    for (const snippet of ['InitializeOnLoad', 'Undo.postprocessModifications', 'm_LocalPosition', 'm_LocalScale', 'm_LocalRotation', 'QueueMarkerTransform', 'SyncMovedTilemapCell', 'SyncTileRecordPropertyChange', 'SyncTileRecordMarkerTransform', 'TileRecords\\.Array\\.data', 'CreateTileForRecord', 'tilemap.SetTile(record.Position, tile)', 'GreyboxLevelTilemap', 'FindTileRecord', 'FindTileMarker', 'tilemap.SetTile(previousCell, null)', 'record.Position = currentCell', 'marker.transform.position = target', 'MaxPendingMarkers', 'PendingMarkers.Count >= MaxPendingMarkers', 'UpdateDesignNodeTransformMetadata', 'GreyboxRoundTripMetadataSync.UpdateDisplayNameMetadata', 'AuthoredPosition', 'AuthoredScale', 'AuthoredRotationEuler', 'EnsureConnectedAsync', 'NotifyMarkerTransformChanged', 'RoundTripSyncEnabled', 'RoundTripLatencyBudgetSeconds = 2.0d', 'FlushDelaySeconds = 0.25d']) {
      if (!text.includes(snippet)) errors.push(`GreyboxSceneChangeWatcher must auto-sync marked Scene transforms: ${snippet}`);
    }
    for (const snippet of ['Dictionary<string, GreyboxRoundTripFieldEdit>', 'FieldEditKey', 'source.GetInstanceID()', 'edit.Path', 'MaxPendingFieldEdits', 'PendingFieldEdits.Count >= MaxPendingFieldEdits']) {
      if (!text.includes(snippet)) errors.push(`GreyboxSceneChangeWatcher must preserve multiple pending field edits per object: ${snippet}`);
    }
  }
  if (!files.includes(metadataSyncPath)) errors.push(`missing round-trip metadata sync helper: ${metadataSyncPath}`);
  if (files.includes(metadataSyncPath)) {
    const text = readFileSync(join(root, metadataSyncPath), 'utf8');
    for (const snippet of ['UpdateDisplayNameMetadata', 'GreyboxMarker', 'MarkerName', 'GreyboxDesignNode', 'DisplayName', 'NodeId', 'JsonPath', 'PositionJsonPath', 'TryUpdateNameSelectorPath', 'TryFindLastNameSelector', 'IndexFallbackSelector', 'ReplacePathPrefix', 'IsSafeNameSelectorValue', 'SafeMarkerId', 'UniqueGameObjectName', 'SafeGameObjectName', 'nodeObject.name', 'PrefabUtility.RecordPrefabInstancePropertyModifications']) {
      if (!text.includes(snippet)) errors.push(`GreyboxRoundTripMetadataSync must keep display-name metadata current: ${snippet}`);
    }
  }
  if (files.includes(mcpTestPath)) {
    const text = readFileSync(join(root, mcpTestPath), 'utf8');
    for (const snippet of ['SetFieldKeepsGreyboxDisplayNameMetadataCurrent', 'SetFieldRefreshesNameSelectorMetadataAfterQueuingOldPathEdit', 'SetFieldFallsNameSelectorMetadataBackToIndexWhenRenamedUnsafely', 'SetFieldKeepsDisplayNameHierarchyLabelsUnique', 'SetFieldQueuesDistinctTransformEditsForSameObject', 'SetFieldRejectsUnsafeMemberSurfaces', 'AssignAssetRejectsUnadvertisedMemberSurfaces', 'marker.MarkerName', 'designNode.DisplayName', 'Assert.AreEqual("Gate Boss", go.name)', 'Assert.AreEqual("Gate Boss 2", go.name)', '$.actors[id=boss].name', '$.actors[name=Scout].name', '$.actors[name=Runner]', '$.actors[0]', 'Gate-Boss', 'Assert.AreEqual(2, PendingRoundTripFieldEditCount())', 'ReadOnlyScore', 'PrivateSetterScore', 'LegacyScore', 'LegacyMeshReference', 'TransientScore', 'HiddenScore', 'RuntimeMeshReference', 'HiddenMeshReference', 'nameof(Object.name)', 'nameof(Renderer.material)', 'unity.assignAsset']) {
      if (!text.includes(snippet)) errors.push(`McpBridgeTests must cover display-name metadata sync: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['Greybox.Runtime.GreyboxMarker', 'Greybox.Editor.Sync.GreyboxSceneChangeWatcher', 'AssertRoundTripMarkers', 'PositionJsonPath']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate round-trip markers: ${snippet}`);
    }
  }
}

function validateDiffApplier(root, files, errors) {
  const diffPath = 'Editor/Sync/DiffApplier.cs';
  const testPath = 'Tests/EditMode/DiffApplierTests.cs';
  if (!files.includes(diffPath)) errors.push(`missing Unity-side round-trip diff applier: ${diffPath}`);
  if (files.includes(diffPath)) {
    const text = readFileSync(join(root, diffPath), 'utf8');
    for (const snippet of ['ThreeWayMerge', 'MergeNode', 'MergeArray', 'StableArrayItemKey', 'StableArraySelectorValue', 'IsSafeStableArraySelectorValue', 'MaxStableArraySelectorValueLength', 'StableArrayKeyFields', 'actorId', 'roomId', 'spawnId', 'checkpointId', 'goalId', 'coinId', 'tileId', 'abilityId', 'routeId', 'waveId', 'lootTableId', 'FromVector3', 'FromColor', 'TryMergeIndependentText', 'FindTextEdit', 'ApplyTextEdits', 'TextEditsOverlap', 'TextEditsTouchSameToken', 'MergedNode.Missing', 'CloneOrMissing', 'ClonePreferred', 'mergedChild.Exists', 'mergedItem.Exists', 'AddConflict', 'MaxMergeConflicts', 'AssertSafeObjectTreeKeys', 'AssertSafeMergeTokenValue', 'AssertSafeObjectKey', 'ContainsConflictPathDelimiter', 'ForbiddenObjectKeys', 'char.IsWhiteSpace', 'MaxMergeObjectKeyLength', 'MaxMergeTreeDepth', 'MaxMergeObjectProperties', 'MaxMergeArrayItems', 'MaxMergeStringLength', 'MaxMergePathLength', 'JTokenType.Undefined', 'double.IsNaN', 'double.IsInfinity']) {
      if (!text.includes(snippet)) errors.push(`DiffApplier must preserve typed round-trip merge and deletion semantics: ${snippet}`);
    }
    if (/JArray\(\)[\s\S]*?merged\.Add\(MergeNode/.test(text)) {
      errors.push('DiffApplier must not add missing array items as null values');
    }
  }
  if (!files.includes(testPath)) errors.push(`missing Unity-side round-trip diff tests: ${testPath}`);
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['UnityTypedFieldsMergeWithoutConflict', 'IndependentStableIdArrayEditsMergeWithoutConflict', 'GameDomainStableKeyArrayEditsMergeWithoutConflict', 'PlayableDomainStableKeyArrayEditsMergeWithoutConflict', 'IndependentTextFieldEditsMergeWithoutConflict', 'OverlappingTextFieldEditsRemainConflict', 'AdjacentSameTokenTextEditsRemainConflict', 'SameStableIdArrayFieldConflictReportsLeafPath', 'UnsafeStableArraySelectorValuesFallBackToIndexPaths', 'SelectorValuesWithWhitespaceFallBackToIndexPaths', 'SelectorValuesWithDotsFallBackToIndexPaths', 'UnsafePrimaryStableKeyUsesSecondarySelector', 'MixedStableAndUnkeyedArrayItemsKeepStableSelectors', 'GameDomainStableKeyConflictReportsLeafPath', 'PlayableDomainStableKeyConflictReportsLeafPath', 'WebDeletedObjectFieldIsRemovedWhenUnityIsUnchanged', 'UnityDeletedStableIdArrayItemIsRemovedWhenWebIsUnchanged', 'DeleteVersusEditReportsConflictAndKeepsUnityEdit', 'RejectsUnsafeObjectKeysBeforeEarlyReturnMerges', 'RejectsUnsafeMergeTokenValuesBeforeEarlyReturnMerges', 'RejectsOversizedMergeTreesBeforeEarlyReturnMerges', 'RejectsExcessiveMergeConflictsBeforeInboxOverflow', 'checkpointId', 'goalId', 'coinId', 'tileId', '$.checkpoints[checkpointId=flag-a].cooldownSeconds', '__proto__', 'constructor', 'phase.name', 'phase[0]', 'double.NaN', 'JValue.CreateUndefined', 'System.DateTime', 'DeepObject(34)', 'WideObject(2049)', 'WideArray(8193)', 'ConflictingObject(101, 0)', "new string('x', (1024 * 1024) + 1)", "new string('a', 511)"]) {
      if (!text.includes(snippet)) errors.push(`DiffApplierTests must cover typed fields, stable arrays, conflicts, and deletions: ${snippet}`);
    }
  }
}

function validateRoundTripLatency(root, files, errors) {
  const daemonClientPath = 'Editor/Sync/GreyboxDaemonClient.cs';
  const sceneWatcherPath = 'Editor/Sync/GreyboxSceneChangeWatcher.cs';
  const testPath = 'Tests/EditMode/RoundTripLatencyTests.cs';
  if (files.includes(daemonClientPath)) {
    const text = readFileSync(join(root, daemonClientPath), 'utf8');
    for (const snippet of ['RoundTripLatencyBudgetMs = 2000', 'ConnectTimeoutMs = 750', 'SendTimeoutMs = 750', 'CancelAfter(ConnectTimeoutMs)', 'CancelAfter(SendTimeoutMs)', 'await EnsureConnectedAsync()', 'OperationCanceledException', 'ObjectDisposedException', 'latencyBudgetMs', 'failed to send Unity edit within', 'BuildSyncUri', 'TryBuildUnityEditFrame', 'SafeRoundTripEditPath', 'IsSafeRoundTripEditValue', 'MaxRoundTripEditObjectProperties', 'MaxRoundTripEditArrayItems', 'ContainsRoundTripEditPathDelimiter', 'GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl', 'GreyboxDaemonUrlBuilder.TrySafeProjectId', 'Uri.TryCreate', 'project id must be set', 'absolute HTTP or HTTPS', 'without a safe project id']) {
      if (!text.includes(snippet)) errors.push(`GreyboxDaemonClient must enforce the 2-second round-trip sync budget: ${snippet}`);
    }
  }
  if (files.includes(sceneWatcherPath)) {
    const text = readFileSync(join(root, sceneWatcherPath), 'utf8');
    for (const snippet of ['RoundTripLatencyBudgetSeconds = 2.0d', 'FlushDelaySeconds = 0.25d', 'FlushDelaySeconds >= RoundTripLatencyBudgetSeconds', 'SessionKey(config)', 'ResetRoundTripSession', 'ProjectId', 'DaemonUrl', 'GreyboxDaemonUrlBuilder.TrySafeProjectId', 'GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl', 'safeDaemonBaseUrl', 'failed to start a safe round-trip sync session']) {
      if (!text.includes(snippet)) errors.push(`GreyboxSceneChangeWatcher must keep debounce inside the 2-second sync budget: ${snippet}`);
    }
  }
  if (!files.includes(testPath)) errors.push(`missing round-trip latency budget tests: ${testPath}`);
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['SceneEditDebounceStaysInsideTwoSecondBudget', 'WebSocketTimeoutsStayInsideTwoSecondBudget', 'ColdRoundTripSyncStaysInsideTwoSecondBudget', 'DirectUnityEditReconnectStaysInsideTwoSecondBudget', 'RawArtifactPullTimeoutStaysInsideTwoSecondBudget', 'RawArtifactPullTimeoutMs', 'RoundTripSessionReconnectsWhenProjectOrDaemonChanges', 'SessionKeyNormalizesDaemonAuthorityAndRejectsUnsafeDaemonUrls', 'SyncUriRequiresAbsoluteHttpDaemonUrlAndEscapesProjectId', 'SafeRoundTripEditPathRejectsUnsafePayloadPaths', 'UnityEditFramesNormalizeInputsAndPreserveSafeValues', 'UnityEditFramesRejectUnsafeValuesAndOversizedPayloads', 'PendingFieldEditQueueCapsAtDaemonDiffLimit', 'RoundTripFieldEditSnapshotsMutablePayloads', 'mutated-after-queue', 'MaxPendingFieldEditsForTests', 'PendingFieldEditCountForTests', 'PendingMarkerQueueCapsAtDaemonDiffLimit', 'MaxPendingMarkersForTests', 'PendingMarkerCountForTests', '$.actors[id=boss].health', '$..actors[id=boss].health', '$.actors .health', '$.actors[id=boss]. displayName', 'https://example.test/arena.gameview.json', "new string('a', 513)", "new string('x', 4097)", 'phase.name', 'phase[0]', 'phase=one', 'double.NaN', '__proto__', 'constructor', 'prototype', 'tooManyProperties', 'tooManyItems', 'oversized Unity edit frame', 'safe project id', 'project\\n42', 'project/42', 'http://user:pass@127.0.0.1:17456', 'file:///tmp/daemon.sock', 'project id must be set', 'SceneTransformEditsKeepDesignNodeMetadataCurrent', 'SceneTileTransformEditsKeepTilemapMetadataCurrent', 'SceneTileRecordInspectorEditsRefreshVisibleTile', 'SceneTileRecordInspectorPositionEditsMoveVisibleTile', 'TileRecords.Array.data[0].TileType', 'Assert.AreEqual(Tile.ColliderType.None', 'Assert.AreEqual(tilemap.CellToWorld(new Vector3Int(4, 5, 0)), child.transform.position)', 'SceneComponentNameEditsKeepGreyboxMetadataCurrent', 'GreyboxSceneChangeWatcher.FlushDelaySeconds', 'GreyboxDaemonClient.ConnectTimeoutMs', 'GreyboxDaemonClient.SendTimeoutMs', 'AuthoredRotationEuler', 'Assert.AreEqual("Gate Boss", go.name)', 'Assert.AreSame(tile, tilemap.GetTile(new Vector3Int(4, 5, 0)))', 'Assert.AreNotSame(firstClient, secondClient)', 'Assert.AreSame(firstClient, sameAuthorityClient)', 'Assert.IsNull(GetStaticField("daemonClient"))', '""type"":{""name"":""artifact-changed""}', '""projectId"":{""id"":""project-a""}', '""projectId"":[""project-a""]']) {
      if (!text.includes(snippet)) errors.push(`RoundTripLatencyTests must cover the 2-second sync budget: ${snippet}`);
    }
  }
}

function validateArtifactRefresher(root, files, errors) {
  const refresherPath = 'Editor/Sync/GreyboxArtifactRefresher.cs';
  const windowPath = 'Editor/Windows/GreyboxStudioWindow.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (!files.includes(refresherPath)) errors.push(`missing web-to-Unity artifact refresher: ${refresherPath}`);
  if (files.includes(refresherPath)) {
    const text = readFileSync(join(root, refresherPath), 'utf8');
    for (const snippet of [
      'PullAndRefreshFromEvent',
      'PullAndRefreshArtifactAsync',
      'RefreshFromEvent',
      'ExtractArtifactNames',
      'TryReadStringField',
      'token.Type != JTokenType.String',
      'FindMatchingAssetPaths',
      'BuildRawArtifactUrl',
      'IsSafeDaemonBaseUrl',
      'SafeRawArtifactUrlParts',
      'DownloadRawArtifactAsync',
      'IsContentSafeForAsset',
      'IsSupportedLocalWritePath',
      'UnityPackageRefreshRequested',
      'ShouldRequestUnityPackageRefresh',
      'HasUnityPackageReference',
      'meshSource',
      'prefabAssetPath',
      'greyboxImportedAssets',
      'AssetDatabase.ImportAsset',
      'AssetDatabase.GetAllAssetPaths',
      'UnityWebRequest.Get',
      '/raw/',
      'File.WriteAllText',
      'TryWriteArtifactText',
      'File.Replace',
      'File.Move',
      'File.Delete(tempPath)',
      '.greybox-tmp-',
      'Encoding.UTF8',
      'MaxArtifactBytes',
      'data.Length == 0',
      'MaxArtifactNameChars',
      'MaxArtifactNamePartChars',
      'MaxUnityPackageReferenceScanDepth',
      'MaxUnityPackageReferenceScanNodes',
      'MaxUnityPackageReferenceStringChars',
      'MaxRawArtifactPullMs',
      'RawArtifactPollMs',
      '.gameview.json',
      '.levelboard.json',
      '.hud.html',
      'DESIGN.md',
      'SafeUnityFileStem',
      'IsSafeDaemonArtifactName',
      'GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl',
      'GreyboxDaemonUrlBuilder.TrySafeProjectId',
      'char.IsControl',
      'IsSupportedDaemonName(artifactName)',
      'part.Length > MaxArtifactNamePartChars',
      'request.timeout',
      'DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()',
      'request.Abort()',
      'Task.Delay(RawArtifactPollMs)',
      'Stack<(JToken Token, int Depth)>',
      'scannedNodes > MaxUnityPackageReferenceScanNodes',
      'current.Depth > MaxUnityPackageReferenceScanDepth',
      'art-bible.design',
      'IsNonRefreshSyncEvent',
      'TryReadStringField(payload, "type"',
      'TryReadStringField(payload, "action"',
      '"conflict"',
      'unity-edit-merged',
      'part != "." && part != ".."',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxArtifactRefresher must safely reimport daemon-changed artifacts: ${snippet}`);
    }
    if (!/TryWriteArtifactText\(assetPath,\s*content\)/.test(text)) {
      errors.push('GreyboxArtifactRefresher must only write downloaded raw artifact content through the bounded atomic writer');
    }
    if (/File\.WriteAllText\(assetPath,\s*content\)/.test(text)) {
      errors.push('GreyboxArtifactRefresher must not write downloaded raw artifact content directly to Unity asset paths');
    }
    if (/File\.WriteAllText\([^,]+payload|File\.WriteAllText\([^,]+evt|WriteAllBytes|DownloadFile|WebClient/i.test(text)) {
      errors.push('GreyboxArtifactRefresher must not write daemon event payloads or unbounded downloads into local assets');
    }
    if (/UnityWebRequest\.Get\([^)]*(assetUrl|meshUrl|fbxUrl|prefabUrl|materialUrl|unityAssetUrl)/i.test(text)) {
      errors.push('GreyboxArtifactRefresher must request daemon package preflight instead of fetching asset URLs from gameview JSON');
    }
    if (text.includes('payload.Value<string>("type")') || text.includes('payload.Value<string>("action")')) {
      errors.push('GreyboxArtifactRefresher must read daemon sync event type/action with strict string-token checks');
    }
  }
  if (files.includes(windowPath)) {
    const text = readFileSync(join(root, windowPath), 'utf8');
    for (const snippet of ['ArtifactChanged += OnArtifactChanged', 'ArtifactChanged -= OnArtifactChanged', 'GreyboxArtifactRefresher.PullAndRefreshFromEvent', 'RoundTripSyncEnabled', 'UnityPackageRefreshRequested += OnUnityPackageRefreshRequested', 'UnityPackageRefreshRequested -= OnUnityPackageRefreshRequested', 'RefreshEnginePackagePreflight']) {
      if (!text.includes(snippet)) errors.push(`GreyboxStudioWindow must subscribe daemon artifact changes to the refresher: ${snippet}`);
    }
    if (!/GreyboxConflictInbox\.RecordFromEvent\(evt\)[\s\S]*?return;[\s\S]*?GreyboxArtifactRefresher\.PullAndRefreshFromEvent\(evt,\s*config\)/.test(text)) {
      errors.push('GreyboxStudioWindow must route round-trip conflict frames to the conflict inbox before artifact refresh');
    }
  }
  const refresherTestPath = 'Tests/EditMode/GreyboxArtifactRefresherTests.cs';
  if (files.includes(refresherTestPath)) {
    const text = readFileSync(join(root, refresherTestPath), 'utf8');
    for (const snippet of ['SanitizesGeneratedImportPathCharacters', 'UnsafeDaemonArtifactNamesAreRejected', 'RawArtifactUrlEscapesSafeRelativeArtifactNames', 'RawArtifactUrlRejectsUnsafeDaemonBaseUrls', 'http://user:pass@127.0.0.1:17456', 'project\\n42', 'project/42', 'https://example.test/project-42', 'levels/notes.txt', "new string('a', 170)", "new string('a', 520)", 'ExtractArtifactNamesDropsUnsafeDaemonPaths', 'ExtractArtifactNamesIgnoresNonStringDaemonFields', 'NonRefreshSyncEventsRequireStringTypeAndActionFields', 'levels/nested.gameview.json', '""type"":{""name"":""unity_edit""}', '""action"":[""conflict""]', 'RequestsUnityPackageRefreshForGameviewAssetSources', 'RequestsUnityPackageRefreshForImportedAssetManifestRecords', 'UnityPackageReferenceScanIsBounded', 'NestedPackageReferenceJson', 'WidePackageReferenceJson', 'ContentSafetyRejectsEmptyOversizedAndMalformedRawArtifacts', 'ArtifactTextWritesReplaceExistingAssetsWithoutTempResidue', 'ArtifactTextWritesFailClosedForUnsafeTargets', 'TryWriteArtifactText', 'IsContentSafeForAsset', 'PrivateIntConstant', 'IgnoresHudAndGameviewChangesWithoutUnityAssetReferences', 'meshSource', 'greyboxImportedAssets']) {
      if (!text.includes(snippet)) errors.push(`GreyboxArtifactRefresherTests must cover live package refresh requests: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['Greybox.Editor.Sync.GreyboxArtifactRefresher', 'McpToolDefinitionsAreProtocolShapedJson', 'McpToolDefinitions.ToolsJson', 'AssertToolSchema', 'RefreshFromEvent', 'web-to-Unity', 'LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest', 'ShouldRequestPackageRefresh', 'local-private asset URLs']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate web-to-Unity artifact refresh wiring: ${snippet}`);
    }
  }
}

function validateProjectArtifactImportMenu(root, files, errors) {
  const importerPath = 'Editor/Importers/GreyboxProjectArtifactImporter.cs';
  const postprocessorPath = 'Editor/Importers/GreyboxProjectArtifactPostprocessor.cs';
  const designPostprocessorPath = 'Editor/Importers/DesignMarkdownPostprocessor.cs';
  const testPath = 'Tests/EditMode/GreyboxProjectArtifactImporterTests.cs';
  const designPostprocessorTestPath = 'Tests/EditMode/DesignMarkdownPostprocessorTests.cs';
  const submissionPath = 'ASSET_STORE_SUBMISSION.md';
  if (!files.includes(importerPath)) errors.push(`missing project artifact import menu: ${importerPath}`);
  if (!files.includes(postprocessorPath)) errors.push(`missing project artifact postprocessor: ${postprocessorPath}`);
  if (!files.includes(designPostprocessorPath)) errors.push(`missing design markdown postprocessor: ${designPostprocessorPath}`);
  if (!files.includes(designPostprocessorTestPath)) errors.push(`missing design markdown postprocessor tests: ${designPostprocessorTestPath}`);
  if (files.includes(importerPath)) {
    const text = readFileSync(join(root, importerPath), 'utf8');
    for (const snippet of [
      'MenuItem("Greybox Studio/Import Project Artifacts")',
      'ImportProjectArtifactsMenu',
      'ImportProjectArtifacts',
      'FindProjectArtifactAssetPaths',
      'IsProjectArtifactPath',
      'Selection.objects',
      'AssetDatabase.ImportAsset',
      'AddressablesTagger.FlushPending',
      'EnsureUnityImportAsset',
      'UnityImportAssetPath',
      'MaxJsonArtifactMirrorBytes',
      'MaxArtBibleMirrorBytes',
      'MaxHudMirrorBytes',
      'MaxProjectArtifactScanFiles',
      'MaxProjectArtifactCandidates',
      'MaxProjectArtifactMirrorBytes',
      'GreyboxImportFile.TryReadText',
      'GreyboxImportFile.TryWriteTextAtomically',
      'Project Artifact Mirror',
      'ProjectFilesUnder',
      'Directory.EnumerateFiles',
      'DesignMarkdownPostprocessor.ProxyDesignAssetPath',
      'ImportPriority',
      'ImportIdentity',
      'SourceDesignMarkdownPathForProxy',
      'IsCanonicalDaemonArtifactPath',
      'IsSafeUnityAssetPath',
      'normalized.Contains("://")',
      'normalized.Contains("//")',
      'part == "."',
      'part == ".."',
      'char.IsControl(c)',
      'TryWriteTextAtomically(importPath, content',
      '.gameview',
      '.gameview.json',
      '.levelboard',
      '.levelboard.json',
      '.gbhud',
      '.hud.html',
      '.design',
      'DESIGN.md',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxProjectArtifactImporter must provide the promised reviewer import workflow: ${snippet}`);
    }
  }
  if (files.includes(postprocessorPath)) {
    const text = readFileSync(join(root, postprocessorPath), 'utf8');
    for (const snippet of [
      'GreyboxProjectArtifactPostprocessor',
      'OnPostprocessAllAssets',
      'MirrorCanonicalDaemonArtifacts',
      'importedAssets',
      'movedAssets',
      'EnsureUnityImportAsset',
      '.gameview.json',
      '.levelboard.json',
      '.hud.html',
      '.gameview',
      '.levelboard',
      '.gbhud',
      '.design',
      'DESIGN.md',
      'AssetDatabase.ImportAsset',
      'ImportAssetOptions.ForceUpdate | ImportAssetOptions.ForceSynchronousImport',
      'AddressablesTagger.FlushPending',
      'wroteMirror',
      'IsCanonicalDaemonArtifactPath',
      'IsUnityMirrorOrDesignPath',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxProjectArtifactPostprocessor must mirror canonical daemon artifacts safely: ${snippet}`);
    }
  }
  if (files.includes(designPostprocessorPath)) {
    const text = readFileSync(join(root, designPostprocessorPath), 'utf8');
    for (const snippet of ['DesignMarkdownPostprocessor', 'MirrorDesignMarkdown', 'MaxDesignMarkdownBytes', 'GreyboxImportFile.TryReadText', 'GreyboxImportFile.TryWriteTextAtomically', 'Design Markdown Proxy', 'TryWriteTextAtomically(proxyPath, markdown', 'AssetDatabase.ImportAsset(proxyPath', 'return true']) {
      if (!text.includes(snippet)) errors.push(`DesignMarkdownPostprocessor must mirror DESIGN.md through bounded reads: ${snippet}`);
    }
  }
  if (!files.includes(testPath)) errors.push(`missing project artifact import menu tests: ${testPath}`);
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['RecognizesUnityProjectArtifactPathsOnlyInsideAssets', 'FindsProjectArtifactsUnderSelectedRoots', 'MapsCanonicalDaemonArtifactsToUnityImporterAssets', 'PrefersCanonicalDaemonArtifactsOverUnityMirrors', 'ProjectArtifactDiscoveryCapsCandidateCount', 'MaxProjectArtifactCandidates', 'MaxProjectArtifactScanFiles', 'CreatesUnityImporterMirrorForCanonicalDaemonArtifacts', 'PostprocessorCreatesExactContentMirrorsForDroppedCanonicalDaemonArtifacts', 'PostprocessorSkipsUnityMirrorAndDesignInputs', 'PostprocessorRejectsOversizedCanonicalHudSourceBeforeMirrorWrite', 'OnPostprocessAllAssetsMirrorsMovedCanonicalDaemonArtifacts', 'MirrorCanonicalDaemonArtifacts', 'OnPostprocessAllAssets', 'CreatesUnityImporterMirrorForDesignMarkdown', 'RejectsOversizedProjectArtifactMirrorsBeforeImport', 'MaxHudMirrorBytes', 'main.hud.html', 'main.gbhud', '.greybox-tmp-*', 'PrefersDesignMarkdownWhenProxyDesignAssetAlreadyExists', 'PrefersDesignMarkdownAcrossExplicitFileSelections', 'PrefersDesignMarkdownWhenOnlyProxyDesignAssetIsSelected', '.gameview.json', '.levelboard.json', '.hud.html', '.gameview', '.levelboard', '.gbhud', '.design', 'DESIGN.md', 'README.md', 'Packages/com.greybox.studio', 'Assets/../Samples/platformer.gameview.json', 'Assets/Samples/./platformer.gameview.json', 'Assets/Samples//platformer.gameview.json', 'Assets/Samples/\\nplatformer.gameview.json']) {
      if (!text.includes(snippet)) errors.push(`Project artifact import menu tests must cover safe sample import paths: ${snippet}`);
    }
  }
  if (files.includes(designPostprocessorTestPath)) {
    const text = readFileSync(join(root, designPostprocessorTestPath), 'utf8');
    for (const snippet of ['OnlyTreatsExactDesignMarkdownAssetsAsArtBibles', 'BuildsStableProxyDesignAssetPaths', 'MirrorDesignMarkdownRejectsOversizedSourceBeforeProxyWrite', 'MirrorDesignMarkdownOverwritesOversizedProxyWithBoundedSource', '.greybox-tmp-*', 'MaxDesignMarkdownBytes', 'PrivateIntConstant']) {
      if (!text.includes(snippet)) errors.push(`DesignMarkdownPostprocessorTests must cover bounded DESIGN.md proxy mirrors: ${snippet}`);
    }
  }
  if (files.includes(submissionPath)) {
    const text = readFileSync(join(root, submissionPath), 'utf8');
    if (!text.includes('Greybox Studio > Import Project Artifacts')) {
      errors.push('Asset Store reviewer path must name the Greybox Studio > Import Project Artifacts menu');
    }
  }
}

function validateConflictInbox(root, files, errors) {
  const inboxPath = 'Editor/Sync/GreyboxConflictInbox.cs';
  const resolverPath = 'Editor/Sync/GreyboxConflictResolver.cs';
  const daemonUrlBuilderPath = 'Editor/Sync/GreyboxDaemonUrlBuilder.cs';
  const prefabSidecarResolverPath = 'Editor/Sync/GreyboxPrefabSidecarResolver.cs';
  const windowPath = 'Editor/Windows/GreyboxConflictWindow.cs';
  const studioWindowPath = 'Editor/Windows/GreyboxStudioWindow.cs';
  const testPath = 'Tests/EditMode/GreyboxConflictInboxTests.cs';
  const resolverTestPath = 'Tests/EditMode/GreyboxConflictResolverTests.cs';
  const sidecarTestPath = 'Tests/EditMode/GreyboxPrefabSidecarResolverTests.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (!files.includes(inboxPath)) errors.push(`missing round-trip conflict inbox: ${inboxPath}`);
  if (!files.includes(resolverPath)) errors.push(`missing round-trip conflict resolver: ${resolverPath}`);
  if (!files.includes(daemonUrlBuilderPath)) errors.push(`missing daemon URL builder: ${daemonUrlBuilderPath}`);
  if (!files.includes(prefabSidecarResolverPath)) errors.push(`missing prefab sidecar resolver: ${prefabSidecarResolverPath}`);
  if (!files.includes(windowPath)) errors.push(`missing round-trip conflict window: ${windowPath}`);
  if (files.includes(inboxPath)) {
    const text = readFileSync(join(root, inboxPath), 'utf8');
    for (const snippet of ['InitializeOnLoad', 'GreyboxConflictInbox', 'RecordFromEvent', 'RecordPrefabSidecar', 'RecordExampleRoundTripConflict', 'RemoveExisting', 'SaveSnapshot', 'LoadSnapshot', 'SnapshotPref', 'ProjectScopeKey', 'GreyboxSettings.LoadConfig', 'Application.dataPath', 'EditorPrefs.SetString', 'EditorPrefs.DeleteKey', 'Remove', 'round_trip_merge', 'conflict', 'prefab-sidecar', 'mergedContent', 'baseValue', 'webValue', 'unityValue', 'GreyboxConflictResolver.SafeRoundTripFileName', 'GreyboxConflictResolver.SafeConflictJsonPath', 'SafeConflictPath', 'SafeConflictStrategy', 'IsSafeStoredConflictString', 'MaxConflictPathLength', 'MaxConflictValueJsonLength', 'MaxMergedContentLength', 'MaxStrategyLength', 'MaxScopePartLength', 'MaxConflictPayloadItems', 'MaxConflictSnapshotChars', 'MaxConflictValueDepth', 'MaxConflictValueNodes', 'MaxConflictValueObjectProperties', 'MaxConflictValueArrayItems', 'MaxConflictValuePropertyNameLength', 'ForbiddenConflictValueKeys', 'TryOptionalString', 'TryOptionalUpdatedAt', 'TryCompactConflictValue', 'IsSafeConflictValueTree', 'IsSafeConflictValueKey', 'conflicts.Count > MaxConflictPayloadItems', 'snapshot.Length <= MaxConflictSnapshotChars', 'snapshot.Length > MaxConflictSnapshotChars', 'snapshotItems.RemoveAt(snapshotItems.Count - 1)', 'double.IsNaN', 'double.IsInfinity', 'Sha256(trimmed).Substring(0, 16)', 'GreyboxPrefabSidecarResolver.CanAcceptIncoming', 'recorded == 0', 'Changed?.Invoke']) {
      if (!text.includes(snippet)) errors.push(`GreyboxConflictInbox must capture daemon merge conflict payloads: ${snippet}`);
    }
  }
  if (files.includes(resolverPath)) {
    const text = readFileSync(join(root, resolverPath), 'utf8');
    for (const snippet of ['GreyboxConflictResolver', 'AcceptUnityMerge', 'AcceptWebMerge', 'AcceptManualMerge', 'AcceptBatchMerge', 'AcceptUnityMergeAsync', 'AcceptWebMergeAsync', 'AcceptManualMergeAsync', 'AcceptBatchMergeAsync', 'ResolveContent', 'SetJsonPath', 'SafeRoundTripFileName', 'IsSafeRoundTripFileName', 'MaxRoundTripFileNameLength', 'SafeConflictJsonPath', 'ForbiddenConflictPathKeys', 'MaxRoundTripConflictPathLength', 'MaxRoundTripConflictPathSegmentLength', 'MaxRoundTripConflictSelectorValueLength', 'MaxRoundTripConflictValueJsonChars', 'TryParseConflictValue', 'IsSafeConflictValueJson', 'valueJson.Length <= MaxRoundTripConflictValueJsonChars', 'MaxResolvedMergeContentChars', 'MaxRoundTripMergePayloadBytes', 'MaxRoundTripMergeRequestMs', 'RoundTripMergePollMs', 'IsSafeResolvedMergeContent', 'HasSingleBatchDraft', 'mixed daemon drafts', 'bodyBytes.Length > MaxRoundTripMergePayloadBytes', 'request.timeout', 'DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()', 'request.Abort()', 'Task.Delay(RoundTripMergePollMs)', 'IsSafeConflictPathSegment', 'IsSafeConflictPathKey', 'IsSafeConflictSelectorValue', 'IsSupportedRoundTripFileName', 'BuildRoundTripMergeUrl', 'GreyboxDaemonUrlBuilder.BuildProjectRoute', 'safeFileName', 'SafePath', 'round-trip-merge', 'unityContent', 'force', 'UploadHandlerRaw', 'Content-Type', 'GreyboxConflictInbox.Remove', 'GreyboxArtifactRefresher.PullAndRefreshArtifactAsync', 'postResolvedMerge', 'refreshArtifact']) {
      if (!text.includes(snippet)) errors.push(`GreyboxConflictResolver must force-apply accepted Unity merge drafts: ${snippet}`);
    }
  }
  if (files.includes(daemonUrlBuilderPath)) {
    const text = readFileSync(join(root, daemonUrlBuilderPath), 'utf8');
    for (const snippet of ['GreyboxDaemonUrlBuilder', 'BuildProjectRoute', 'BuildGameDeliverableRoute', 'TrySafeDaemonBaseUrl', 'TrySafeProjectId', 'MaxProjectIdChars', 'UnityWebRequest.EscapeURL', 'UriSchemeHttp', 'UriSchemeHttps', 'uri.UserInfo', 'IsSafeRouteSegment', 'segment.Contains("/")', 'safeProjectId.Contains("/")', 'char.IsControl']) {
      if (!text.includes(snippet)) errors.push(`GreyboxDaemonUrlBuilder must centralize safe daemon route construction: ${snippet}`);
    }
  }
  if (files.includes(prefabSidecarResolverPath)) {
    const text = readFileSync(join(root, prefabSidecarResolverPath), 'utf8');
    for (const snippet of ['GreyboxPrefabSidecarResolver', 'IsPrefabSidecar', 'AcceptIncoming', 'KeepCanonical', 'CanAcceptIncoming', 'CanKeepCanonical', 'CanonicalPath', 'IncomingPath', 'public static bool IsSafePrefabAssetPath', 'IsIncomingPrefabSidecarPath', 'NormalizePrefabAssetPath', 'PrefabAssetExporter.IncomingSidecarSuffix', 'normalized.Length > 512', 'char.IsControl', 'StartsWith("Assets/"', 'EndsWith(".prefab"', 'segment == ".."', 'PrefabUtility.LoadPrefabContents', 'PrefabUtility.SaveAsPrefabAsset', 'AssetDatabase.DeleteAsset', 'GreyboxConflictInbox.Remove', 'prefab-sidecar']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPrefabSidecarResolver must resolve generated prefab sidecars: ${snippet}`);
    }
  }
  if (files.includes(windowPath)) {
    const text = readFileSync(join(root, windowPath), 'utf8');
    for (const snippet of ['Round-Trip Conflicts', 'GreyboxConflictInbox.Conflicts', 'Add Example Conflict', 'GreyboxConflictInbox.RecordExampleRoundTripConflict', 'Copy Web Value', 'Copy Unity Value', 'Copy Manual Draft', 'Manual Merge', 'Accept Web Merge', 'Accept Unity Merge', 'Accept Manual Merge', 'Accept All Web', 'Accept All Unity', 'Ping Canonical Prefab', 'Ping Incoming Prefab', 'Adopt Incoming', 'Keep Canonical', 'GreyboxPrefabSidecarResolver.CanAcceptIncoming', 'GreyboxPrefabSidecarResolver.CanKeepCanonical', 'GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath', 'GreyboxPrefabSidecarResolver.AcceptIncoming', 'GreyboxPrefabSidecarResolver.KeepCanonical', 'MessageType.Warning']) {
      if (!text.includes(snippet)) errors.push(`GreyboxConflictWindow must show actionable merge conflict UI: ${snippet}`);
    }
  }
  if (files.includes(studioWindowPath)) {
    const text = readFileSync(join(root, studioWindowPath), 'utf8');
    for (const snippet of ['GreyboxConflictInbox.RecordFromEvent', 'GreyboxConflictWindow.Open', 'GUILayout.Button("Conflicts")']) {
      if (!text.includes(snippet)) errors.push(`GreyboxStudioWindow must surface round-trip conflicts: ${snippet}`);
    }
  }
  if (!files.includes(testPath)) errors.push(`missing conflict inbox edit-mode tests: ${testPath}`);
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['RecordsRoundTripConflictPayloads', 'RecordsPrefabSidecarReviewItems', 'RecordsExampleRoundTripConflictForEditorSmoke', 'ReplacesExistingConflictForSameFileAndPath', 'PersistsUnresolvedConflictsAcrossInboxReloads', 'OversizedConflictSnapshotsAreRejectedBeforeDeserialize', 'SavingConflictSnapshotsTrimsOldestItemsUnderSnapshotCap', 'SnapshotPrefForTests', 'ConflictSnapshotScopePrefersProjectIdOverUnityPath', 'ProjectScopeKeyForTests', 'ReloadInboxForTests', 'mergedContent', '$.actors[id=boss].health', '$.spawnPoints[id=hero].position', 'GreyboxConflictInbox.Remove', 'IgnoresMergedPayloads', 'RejectsStringlyConflictEnvelopeFieldsAndTimestamps', 'RejectsUnsafeRoundTripConflictPayloads', 'RejectsOversizedRoundTripConflictPayloads', 'RejectsOversizedConflictArraysAndUnsafeValueTrees', 'ConflictEventWithConflictItems', 'DeepValue', 'WideObject', 'WideArray', 'PrivateIntConstant', '../arena.gameview.json', 'new string(\'a\', 520)', '(1024 * 1024) + 1', 'new string(\'s\', 81)', 'json\\nthree-way', 'new string(\'A\', 160)', 'Assert.LessOrEqual(longProjectKey.Length, "project-".Length + 80)', 'repeatLongProjectKey', 'actors[id=boss].health', '$.actors\\n[id=boss].health', '$..actors[id=boss].health', '$.__proto__.polluted', '$.actors[constructor=boss].health', '$.actors[id=../../boss].health', '$.actors[id=boss]/health', 'updatedAt"] = "42"', 'updatedAt"] = -1', 'numericStrategy', 'objectMergedContent', 'numericPath', 'maxPayloadItems + 1', 'DeepValue(maxDepth + 1)', 'WideObject(maxObjectProperties + 1)', 'WideArray(maxArrayItems + 1)', 'new JValue(double.NaN)', 'EditorPrefs.SetString(snapshotKey, new string(\'x\', maxSnapshotChars + 1))', 'Assert.LessOrEqual(snapshot.Length, maxSnapshotChars)', '$.actors[id=second].health', 'SkipsUnsafeConflictPathsAndKeepsSafeOnes']) {
      if (!text.includes(snippet)) errors.push(`Conflict inbox tests must cover conflict and merged payloads: ${snippet}`);
    }
  }
  if (!files.includes(resolverTestPath)) errors.push(`missing conflict resolver edit-mode tests: ${resolverTestPath}`);
  if (files.includes(resolverTestPath)) {
    const text = readFileSync(join(root, resolverTestPath), 'utf8');
    for (const snippet of ['WebResolutionPatchesStableIdConflictIntoMergedDocument', 'WebResolutionSupportsGameDomainSelectorKeys', 'BatchWebResolutionPatchesMultipleConflictsInOneDocument', 'BatchUnityResolutionKeepsMergedDraft', 'WebResolutionSupportsRootTextConflicts', 'WebResolutionRejectsOversizedConflictValuesBeforeParsing', 'ManualResolutionReturnsEditedDraft', 'AcceptActionsPostRefreshAndClearInboxWithInjectedTransport', 'AcceptActionsRejectOversizedResolvedContentBeforeInjectedTransport', 'AcceptActionsRejectOversizedWebConflictValueBeforeInjectedTransport', 'AcceptActionsRejectUnsafeConflictPathsBeforeInjectedTransport', 'AcceptActionsRejectUnsafeMergeFileNamesBeforeInjectedTransport', 'AcceptBatchRejectsMixedMergedDraftsForSameArtifactBeforeInjectedTransport', 'ConflictResolutionPostTimeoutAndPayloadCapsAreBounded', 'ConflictJsonPathRejectsPrototypeAndTraversalSelectors', 'RoundTripMergeUrlRequiresHttpDaemonAndProjectId', 'InstallProLicense', 'AcceptWebMergeAsync', 'AcceptUnityMergeAsync', 'AcceptManualMergeAsync', 'AcceptBatchMergeAsync', 'postedContents', 'refreshedFiles', 'MergeFileNameRejectsTraversalAndUnsupportedArtifacts', 'SafeConflictJsonPath', 'IsSafeResolvedMergeContent', 'PrivateIntConstant', 'MaxRoundTripMergeRequestMs', 'MaxRoundTripConflictValueJsonChars', 'oversized-web-value-test', 'new string(\'x\', maxContentChars + 1)', 'new string(\'x\', maxValueChars + 1)', 'IsSafeRoundTripFileName', 'new string(\'a\', 520)', 'new string(\'a\', 129)', 'new string(\'a\', 161)', 'BuildRoundTripMergeUrl', 'https://example.test/arena.gameview.json', 'file:///Users/soumyadebnath16/project', 'levels/notes.txt', 'mixed-conflict-draft-test', 'GreyboxConflictResolver.ResolveContent', 'GreyboxConflictResolution.Web', 'GreyboxConflictResolution.Manual', '$.actors[name=Gate Boss].health', '$.spawnPoints[0].position', '$.constructor.polluted', '$.actors[__proto__=boss].health']) {
      if (!text.includes(snippet)) errors.push(`Conflict resolver tests must cover web/manual merge application: ${snippet}`);
    }
  }
  if (!files.includes(sidecarTestPath)) errors.push(`missing prefab sidecar resolver edit-mode tests: ${sidecarTestPath}`);
  if (files.includes(sidecarTestPath)) {
    const text = readFileSync(join(root, sidecarTestPath), 'utf8');
    for (const snippet of ['RecognizesPrefabSidecarReviewItems', 'AcceptIncomingReplacesCanonicalWithSidecarAndPreservesGuid', 'KeepCanonicalDeletesSidecarAndPreservesUserModifiedPrefab', 'UnsafePrefabSidecarPathsAreRejected', 'ProjectSettings/ProjectSettings.asset', '../arena.greybox-incoming.prefab', 'other.prefab', 'arena.prefab\\n.meta', 'new string(\'a\', 520)', 'GreyboxPrefabSidecarResolver.IsSafePrefabAssetPath', 'GreyboxPrefabSidecarResolver.IsIncomingPrefabSidecarPath', 'GreyboxPrefabSidecarResolver.CanAcceptIncoming', 'GreyboxPrefabSidecarResolver.CanKeepCanonical', 'GreyboxPrefabSidecarResolver.AcceptIncoming', 'GreyboxPrefabSidecarResolver.KeepCanonical', 'AssetDatabase.AssetPathToGUID', 'Adopting incoming sidecars must preserve the canonical prefab GUID', 'AssetDatabase.LoadAssetAtPath<GameObject>', 'Rigidbody']) {
      if (!text.includes(snippet)) errors.push(`GreyboxPrefabSidecarResolverTests must cover accept/keep sidecar resolution: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['Greybox.Editor.Sync.GreyboxConflictInbox', 'Greybox.Editor.Sync.GreyboxConflictResolver', 'Greybox.Editor.Sync.GreyboxPrefabSidecarResolver', 'Greybox.Editor.Windows.GreyboxConflictWindow', 'ConflictInboxInjectsRepresentativeRoundTripSmokeConflict', 'ConflictResolverCoversWebUnityManualAndBatchUnderThirtySeconds', 'ConflictWindowActionsPostRefreshAndClearInboxUnderThirtySeconds', 'InvokeAcceptWebMerge', 'InvokeAcceptUnityMerge', 'InvokeAcceptManualMerge', 'InvokeAcceptBatchMerge', 'InvokeManualDraft', 'PrefabSidecarResolutionPreservesCanonicalChoiceUnderThirtySeconds', 'GreyboxConflictInbox.RecordExampleRoundTripConflict']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate round-trip conflict UI types: ${snippet}`);
    }
  }
}

function validateProModuleEngineTargetSurface(root, files, errors) {
  const clientPath = 'Editor/Sync/GreyboxProModuleStatusClient.cs';
  const testPath = 'Tests/EditMode/GreyboxProModuleStatusClientTests.cs';
  const windowPath = 'Editor/Windows/GreyboxStudioWindow.cs';
  if (!files.includes(clientPath)) errors.push(`missing Pro module status client: ${clientPath}`);
  if (!files.includes(testPath)) errors.push(`missing Pro module status client tests: ${testPath}`);
  if (files.includes(clientPath)) {
    const text = readFileSync(join(root, clientPath), 'utf8');
    for (const snippet of [
      'GreyboxProModuleStatusClient',
      'GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute',
      'pro-modules',
      'registries',
      'engineTargets',
      'EngineTargetCount',
      'EngineTargetNames',
      'SummaryMessage',
      'SafeDisplayName',
      'JTokenType.Array',
      'JTokenType.Object',
      'JTokenType.String',
      'must be a JSON array',
      'must be a JSON object',
      'must be a JSON string',
      'MaxDisplayedEngineTargetNames',
      'MaxProModuleStatusRequestMs',
      'MaxProModuleStatusJsonChars',
      'MaxProModuleStatusItems',
      'MaxProModuleStatusValueChars',
      'SafeStatusValue',
      'status == "blocked"',
      'ToLowerInvariant()',
      'may contain at most',
      'SendWithStatusTimeoutAsync',
      'request.Abort()',
      'GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute',
      'UnityWebRequest.Get',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxProModuleStatusClient must fetch bodyless Pro engine-target metadata: ${snippet}`);
    }
    if (/body|payload/.test(text)) {
      errors.push('GreyboxProModuleStatusClient must not request or parse Pro engine-target payload bodies');
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'ParseCountsLicensedBlockedAndEngineTargetMetadata',
      'SummaryMessageDistinguishesUnlicensedAndEmptyProStatus',
      'ParseFailsClosedForMalformedJson',
      'ParseFailsClosedForStringlyProStatusClaims',
      'ParseSanitizesAndCapsEngineTargetNames',
      'ParseTruncatesOversizedEngineTargetNames',
      'ParseFailsClosedForOversizedStatusJson',
      'ParseFailsClosedForOversizedCollectionsAndStatusValues',
      'StatusFetchTimeoutStaysInsideRoundTripBudget',
      'MaxProModuleStatusItems',
      'MaxProModuleStatusValueChars',
      'RepeatJson',
      'AssertEmpty',
      '+1 more',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxProModuleStatusClientTests must cover safe Pro status parsing: ${snippet}`);
    }
  }
  if (files.includes(windowPath)) {
    const text = readFileSync(join(root, windowPath), 'utf8');
    for (const snippet of [
      'Refresh Pro Modules',
      'DrawProModuleStatus',
      'proModuleStatus.SummaryMessage',
      'Unity export targets',
      'Open License To Activate Pro Modules',
      'bodyless Pro target metadata',
      'GreyboxProModuleStatusClient.FetchAsync',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxStudioWindow must surface Pro engine-target availability: ${snippet}`);
    }
  }
}

function validateEnginePackagePreflightSurface(root, files, errors) {
  const daemonUrlBuilderPath = 'Editor/Sync/GreyboxDaemonUrlBuilder.cs';
  const clientPath = 'Editor/Sync/GreyboxEnginePackagePreflightClient.cs';
  const downloaderPath = 'Editor/Sync/GreyboxPackageDownloader.cs';
  const windowPath = 'Editor/Windows/GreyboxStudioWindow.cs';
  const daemonUrlTestPath = 'Tests/EditMode/GreyboxDaemonUrlBuilderTests.cs';
  const clientTestPath = 'Tests/EditMode/GreyboxEnginePackagePreflightClientTests.cs';
  const testPath = 'Tests/EditMode/GreyboxPackageDownloaderTests.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (!files.includes(daemonUrlBuilderPath)) errors.push(`missing daemon URL builder: ${daemonUrlBuilderPath}`);
  if (!files.includes(clientPath)) errors.push(`missing engine package preflight client: ${clientPath}`);
  if (!files.includes(downloaderPath)) errors.push(`missing engine package downloader surface: ${downloaderPath}`);
  if (!files.includes(daemonUrlTestPath)) errors.push(`missing daemon URL builder tests: ${daemonUrlTestPath}`);
  if (!files.includes(clientTestPath)) errors.push(`missing engine package preflight client tests: ${clientTestPath}`);
  if (!files.includes(testPath)) errors.push(`missing engine package downloader tests: ${testPath}`);
  if (files.includes(daemonUrlBuilderPath)) {
    const text = readFileSync(join(root, daemonUrlBuilderPath), 'utf8');
    for (const snippet of [
      'GreyboxDaemonUrlBuilder',
      'BuildProjectRoute',
      'BuildGameDeliverableRoute',
      'TrySafeDaemonBaseUrl',
      'TrySafeProjectId',
      'MaxProjectIdChars',
      'UnityWebRequest.EscapeURL',
      'UriSchemeHttp',
      'UriSchemeHttps',
      'uri.UserInfo',
      'IsSafeRouteSegment',
      'segment.Contains("/")',
      'safeProjectId.Contains("/")',
      'char.IsControl',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxDaemonUrlBuilder must centralize safe daemon route construction: ${snippet}`);
    }
  }
  if (files.includes(clientPath)) {
    const text = readFileSync(join(root, clientPath), 'utf8');
    for (const snippet of [
      'GreyboxEnginePackagePreflightClient',
      'FetchUnityAsync',
      'GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute',
      'engine-package',
      'preflight',
      'UnityWebRequest.Get',
      'MaxPreflightRequestMs',
      'PreflightPollMs',
      'MaxPackageFileNameChars',
      'MaxPackageFileCount',
      'MaxPackageSizeBytes',
      'MaxManifestMetricCount',
      'MaxPreflightResponseChars',
      'MaxPreflightMessageChars',
      'SendWithPreflightTimeoutAsync',
      'request.timeout',
      'request.Abort()',
      'Task.Delay(PreflightPollMs)',
      'JObject.Parse',
      'JTokenType.Object',
      'JTokenType.String',
      'JTokenType.Boolean',
      'JTokenType.Integer',
      'must be a JSON object',
      'must be a JSON string',
      'must be a JSON boolean',
      'must be a JSON integer',
      'sizeBytes',
      'contentRevisionSha256',
      'terrainColliderCount',
      'dynamicEventCount',
      'FactionCount',
      'available',
      'ValidatePackageMetadata',
      'NormalizeEngineId',
      'GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute',
      'safe daemon URL and project id',
      'unsupported engine',
      'packageFileName must be a .zip file',
      'packageFileName.Length > MaxPackageFileNameChars',
      'packageFileName.IndexOf(":", StringComparison.Ordinal)',
      'fileCount > MaxPackageFileCount',
      'sizeBytes > MaxPackageSizeBytes',
      'OptionalManifestMetric',
      'must be between 0',
      'SafePreflightMessage',
      'response exceeded',
      'character safety cap',
      'positive sizeBytes',
      'valid contentRevisionSha256',
      'SafePreflightSourceFileName',
      'GreyboxConflictResolver.SafeRoundTripFileName',
      'safe Greybox artifact file name',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxEnginePackagePreflightClient must consume daemon package readiness metadata: ${snippet}`);
    }
  }
  if (files.includes(downloaderPath)) {
    const text = readFileSync(join(root, downloaderPath), 'utf8');
    for (const snippet of [
      'DownloadUnityEnginePackage',
      'GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute',
      'engine-package',
      'MaxUnityPackageBytes',
      'MaxEnginePackageZipBytes',
      'MaxUnityPackageDownloadMs',
      'MaxEnginePackageDownloadMs',
      'PackageDownloadPollMs',
      'MaxEnginePackageEntryBytes',
      'MaxEnginePackageManifestBytes',
      'MaxEnginePackagePathChars',
      'MaxEnginePackagePathPartChars',
      'MaxEnginePackageArchiveEntries',
      'MaxEnginePackageManifestFiles',
      'MaxEnginePackageManifestLabelChars',
      'MaxEnginePackageFileNameChars',
      'BlockedEnginePackageFileExtensions',
      'SendWithDownloadTimeoutAsync',
      'request.timeout',
      'request.Abort()',
      'Task.Delay(PackageDownloadPollMs)',
      'ReadZipEntryBytes',
      'ReadZipEntryBytes(manifestEntry, MaxEnginePackageManifestBytes',
      'Encoding.UTF8.GetString(manifestBytes)',
      'entry.Length',
      'manifest exceeds the safety cap',
      'entry byte count changed while reading',
      'VerifiedUnityPackageBytes',
      'VerifiedEnginePackageZipBytes',
      'ValidateEnginePackageZipManifest',
      'manifestEntries.Count != preflight.FileCount',
      'preflight fileCount',
      'VerifiedDownloadBytes',
      'SafeFileName',
      'file name must be a .zip file',
      'file name must be a bounded file name',
      'file name contains control characters',
      'IsGzipUnityPackage',
      'IsZipArchive',
      'ValidateUnityPackageTarStructure',
      'IsSafeUnityPackagePathname',
      'ReadUnityPackagePathnamePayload',
      'asset.meta',
      'pathname',
      'gzip-compressed .unitypackage',
      'Unity package tar is missing matching asset, asset.meta, and safe pathname entries',
      'Unity package pathname must stay inside Assets/ without traversal',
      'zip archive',
      'preflight sizeBytes',
      'download contentRevisionSha256',
      'safety cap',
      'ZipArchive',
      'ExtractEnginePackageZip',
      'SafeEnginePackageEntryPath',
      'archiveEntryCount > MaxEnginePackageArchiveEntries',
      'files.Count > MaxEnginePackageManifestFiles',
      'too many archive entries',
      'too many runtime files',
      'normalized.Length > MaxEnginePackagePathChars',
      'normalized.Contains("://")',
      'normalized.Contains("//")',
      'part.Length > MaxEnginePackagePathPartChars',
      'part.IndexOf(":", StringComparison.Ordinal)',
      'char.IsControl',
      'HasBlockedEnginePackageExtension',
      'blocked executable/project extension',
      'ManifestEntriesByPath',
      'EnginePackageContentRevisionSha256',
      'JTokenType.Array',
      'JTokenType.Object',
      'JTokenType.String',
      'JTokenType.Integer',
      'must be a JSON array',
      'must be a JSON object',
      'must be a JSON string',
      'must be a JSON integer',
      'SafeManifestLabel',
      'contains control characters',
      'is too long',
      'ReplaceEnginePackageImportRoot',
      'WriteBytesAtomically',
      'File.WriteAllBytes(tempPath, content)',
      'File.Replace',
      'File.Move',
      'File.Delete(path)',
      '.greybox-tmp-',
      '.greybox-staging-',
      '.greybox-backup-',
      'StagedEnginePackageDestinationPath',
      'RelativeEnginePackageDestinationPath',
      'TryDeleteDirectory',
      'Directory.Move(stagingRoot, rootFullPath)',
      'Directory.Move(rootFullPath, backupRoot)',
      'SHA256.Create',
      'manifest has an invalid contentRevisionSha256',
      'manifest contentRevisionSha256 did not match runtime files',
      'SHA-256 mismatch',
      'byte count mismatch',
      'duplicate runtime file',
      'duplicate archive entry',
      'checksum-verified',
      'Assets/GreyboxGenerated/EnginePackage',
      'AssetDatabase.Refresh',
      'GreyboxProjectEntitlements.RegisterCurrentProject',
      'GreyboxDaemonUrlBuilder.BuildProjectRoute',
      'GreyboxDaemonUrlBuilder.BuildGameDeliverableRoute',
      'safe daemon URL and project id',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxPackageDownloader must safely download native Unity engine packages: ${snippet}`);
    }
    if (!text.includes('InvalidDataException') || !text.includes('StartsWith(rootWithSeparator')) {
      errors.push('GreyboxPackageDownloader must reject unsafe zip entry paths before extraction');
    }
  }
  if (files.includes(daemonUrlTestPath)) {
    const text = readFileSync(join(root, daemonUrlTestPath), 'utf8');
    for (const snippet of [
      'BuildsProjectRoutesFromSafeDaemonOrigins',
      'RejectsUnsafeDaemonOriginsProjectIdsAndRouteSegments',
      'TrySafeDaemonBaseUrlRejectsCredentialsAndNonHttpSchemes',
      'TrySafeProjectIdTrimsAndRejectsAmbiguousScopes',
      'project%2042',
      'project\\n42',
      'project/42',
      'https://example.test/project-42',
      'file:///Users/soumyadebnath16/project',
      'http://user:pass@127.0.0.1:17456',
      'engine-package/unity',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxDaemonUrlBuilderTests must cover safe daemon route construction: ${snippet}`);
    }
  }
  if (files.includes(windowPath)) {
    const text = readFileSync(join(root, windowPath), 'utf8');
    for (const snippet of [
      'Check Unity Export',
      'RefreshEnginePackagePreflight',
      'DrawEnginePackagePreflight',
      'GreyboxEnginePackagePreflightClient.FetchUnityAsync',
      'GreyboxPackageDownloader.DownloadUnityEnginePackage',
      'Download Unity Export',
      'Unity engine package',
      'without recording shipment analytics',
      '.gameview.json',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxStudioWindow must surface Unity engine package preflight readiness: ${snippet}`);
    }
  }
  if (files.includes(clientTestPath)) {
    const text = readFileSync(join(root, clientTestPath), 'utf8');
    for (const snippet of [
      'ParseAcceptsReadyDaemonPackageMetadata',
      'ParseFailsClosedWhenDaemonMarksPackageUnavailable',
      'ParseFailsClosedWhenPackageMetadataIsMissingOrUnsafe',
      'ParseFailsClosedWhenSourceFileNameIsUnsafe',
      'ParseFailsClosedForStringlyPreflightClaims',
      'ParseFailsClosedForOutOfRangeManifestMetrics',
      'ParseFailsClosedForMalformedJson',
      'ParseBoundsResponseAndUnavailableMessages',
      'PreflightRequestTimeoutIsFinite',
      'PrivateIntConstant',
      'PrivateLongConstant',
      'MaxPreflightRequestMs',
      'PreflightPollMs',
      'MaxPackageFileNameChars',
      'MaxPackageFileCount',
      'MaxPackageSizeBytes',
      'MaxManifestMetricCount',
      'MaxPreflightResponseChars',
      'MaxPreflightMessageChars',
      'packageFileName',
      'contentRevisionSha256',
      'unity/../../godot',
      'unsupported engine',
      'positive sizeBytes',
      'valid contentRevisionSha256',
      'levels\\\\arena.gameview.json',
      '../levels/arena.gameview.json',
      'https://example.test/arena.gameview.json',
      'https://example.test/greybox.zip',
      'C:greybox.zip',
      "new string('g', 161)",
      'fileCount must be at most',
      'sizeBytes must be at most',
      'between 0',
      'response exceeded',
      "new string('x'",
      'levels/notes.txt',
      'safe Greybox artifact file name',
      'JSON boolean',
      'JSON integer',
      'JSON string',
      'JSON object',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxEnginePackagePreflightClientTests must cover fail-closed preflight parsing: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'SafeEnginePackageEntryPathRejectsTraversal',
      'SafeEnginePackageEntryPathAllowsNestedRuntimeFiles',
      'ExtractEnginePackageZipWritesOnlySafeFiles',
      'VerifiedDownloadBytesRejectsEmptyAndOversizedPackages',
      'PackageDownloadTimeoutsAreFiniteAndSizedForPackageCaps',
      'PackageEntryCapsAreFiniteAndOrdered',
      'PrivateIntConstant',
      'PrivateLongConstant',
      'MaxUnityPackageDownloadMs',
      'MaxEnginePackageDownloadMs',
      'PackageDownloadPollMs',
      'MaxEnginePackageManifestBytes',
      'MaxEnginePackageEntryBytes',
      'MaxEnginePackageArchiveEntries',
      'MaxEnginePackageManifestFiles',
      'MaxEnginePackageManifestLabelChars',
      'MaxEnginePackageFileNameChars',
      'ContentRevisionForFile',
      'contentRevisionSha256',
      'https://example.test/runtime.cs',
      'C:/temp/runtime.cs',
      "new string('a', 170)",
      "new string('a', 520)",
      'VerifiedUnityPackageBytesRequiresGzipUnityPackageTarStructure',
      'UnityPackageGzip',
      '../escape.gameview',
      'Packages/Greybox/Arena.gameview',
      'SafeFileNameRejectsPathLikePackageNames',
      'greybox.unitypackage',
      'VerifiedEnginePackageZipBytesRequiresZipHeaderAndPreflightSizeMatch',
      'download contentRevisionSha256',
      'InvalidDataException',
      'ZipArchive',
      'AGDSGameViewRuntime.cs',
      'GreyboxEnginePackageManifest.json',
      'ContentRevisionForFile',
      'ExtractEnginePackageZipRejectsManifestHashMismatch',
      'ExtractEnginePackageZipRejectsBlockedExecutableEntriesBeforeReplacingExistingFiles',
      'ExtractEnginePackageZipRejectsManifestByteMismatch',
      'ExtractEnginePackageZipRejectsStringlyManifestClaims',
      'ExtractEnginePackageZipRejectsUnsafeManifestLabels',
      'ExtractEnginePackageZipRejectsDuplicateManifestPaths',
      'ExtractEnginePackageZipRejectsDuplicateArchiveEntries',
      'ExtractEnginePackageZipRejectsOversizedManifestBeforeReplacingExistingFiles',
      'ExtractEnginePackageZipRejectsTooManyArchiveEntries',
      'ExtractEnginePackageZipRejectsTooManyManifestFiles',
      'ExtractEnginePackageZipPrunesStaleFilesAfterValidation',
      'ExtractEnginePackageZipStagesReplacementWithoutResidue',
      'ExtractEnginePackageZipKeepsExistingFilesWhenValidationFails',
      'WriteBytesAtomicallyCreatesAndReplacesDownloadsWithoutTempResidue',
      'WriteBytesAtomicallyRejectsOversizedDownloadsBeforeReplacing',
      'WriteBytesAtomically',
      'EnginePackage.greybox-staging-*',
      'EnginePackage.greybox-backup-*',
      '.greybox-tmp-*',
      'ManifestWithFileCount',
      'ManifestEntry',
      'AssertManifestRejected',
      'too many archive entries',
      'too many runtime files',
      'manifest exceeds the safety cap',
      'language contains control characters',
      'purpose is too long',
      "new string('p', 81)",
      'JSON string',
      'JSON integer',
      'SHA256.Create',
      'malware.dll',
      'install.sh',
      'Game.csproj',
    ]) {
      if (!text.includes(snippet)) errors.push(`GreyboxPackageDownloaderTests must cover safe zip extraction: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of [
      'Greybox.Editor.Sync.GreyboxEnginePackagePreflightClient',
      'Greybox.Editor.Sync.GreyboxPackageDownloader',
      'LiveSyncPackageHandoffRequiresPreflightAndChecksumManifest',
      'unity/../../godot',
      'contentRevisionSha256',
      'fileCount must be at most',
      'sizeBytes must be at most',
      'between 0',
      'response exceeded',
      'ExtractEnginePackageZip',
      'GreyboxEnginePackageManifest.json',
      'Failed checksum validation should keep the previous checksum-verified package import intact',
    ]) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate engine package preflight/import types: ${snippet}`);
    }
  }
}

function validateHudImporter(root, files, errors) {
  const builderPath = 'Editor/Generation/HudLayoutBuilder.cs';
  const builderTestPath = 'Tests/EditMode/HudLayoutBuilderTests.cs';
  const importerPath = 'Editor/Importers/HudLayoutImporter.cs';
  const importerTestPath = 'Tests/EditMode/HudLayoutImporterTests.cs';
  const uiToolkitHudPath = 'Runtime/GreyboxUiToolkitHud.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (!files.includes(builderPath)) errors.push(`missing HUD layout builder: ${builderPath}`);
  if (files.includes(builderPath)) {
    const text = readFileSync(join(root, builderPath), 'utf8');
    for (const snippet of ['BuildFromHudHtml', 'BuildHudLayout', 'CanvasScaler', 'GraphicRaycaster', 'UnityEngine.UI', 'Text', 'Button', 'UIDocument', 'PanelSettings', 'GreyboxUiToolkitHud', 'GreyboxHudBinding', 'AttachHudBinding', 'binding.SlotId', 'binding.BindingId', 'binding.Action', 'binding.AssetPath', 'binding.RoundTripJsonPath', 'HudBindingRoundTripPath', 'HudSlotRoundTripPath', 'data-slot', 'data-agds-id', 'greybox-source-file', 'greybox-hud-renderer', 'SourceFileName(html, sourcePath)', 'SafeSourceFileName', 'SafeSourcePath', 'IsSafeSourcePath', 'MaxSourcePathLength', 'segment == "." || segment == ".."', 'SafeHudToken', 'SafeHudText', 'MaxHudTokenLength', 'MaxHudTextLength', 'GreyboxConflictResolver.SafeRoundTripFileName', 'GreyboxMarker', 'CreateProgress', 'CreateImage', 'hud-progress', 'hud-image', 'AssetDatabase.LoadAssetAtPath<Sprite>', 'ImageSourcePath', 'IsProgress', 'IsImage', 'CollectGeneratedIconTextures', 'CollectGeneratedIconSprites', 'CreateFallbackIconSprite', 'Greybox Generated HUD Icon']) {
      if (!text.includes(snippet)) errors.push(`HudLayoutBuilder must generate uGUI and UI Toolkit HUD hierarchy: ${snippet}`);
    }
  }
  if (!files.includes(builderTestPath)) errors.push(`missing HUD layout builder tests: ${builderTestPath}`);
  if (files.includes(builderTestPath)) {
    const text = readFileSync(join(root, builderTestPath), 'utf8');
    for (const snippet of ['StampsOriginalDaemonSourceFileFromUnityPackageMetadata', 'UnsafeDaemonSourceFileMetadataFallsBackToLocalHudSourceFile', 'RejectsUnsafeHudMarkerSourcePaths', 'SanitizesHudTokensTextAndSelectorPaths', 'BuildsProgressBarsForHudMeters', 'BuildsImageIconsForHudSprites', 'CollectGeneratedIconSprites', 'Greybox Generated HUD Icon', 'BuildsUiToolkitProgressMetersWhenRendererRequested', 'BuildsUiToolkitImageElementsWhenRendererRequested', 'RoundTripJsonPath', '$.hud.slots[id=hud-hearts].bindings[id=value]', '$.hud.slots[id=hud-action].bindings[id=start-run]', '$.hud.slots[id=hud-xp].bindings[id=xp]', 'hud/combat.hud.html', '../hud/combat.hud.html', '../ProjectSettings/ProjectSettings.asset', 'combat.gbhud', 'hud-boss-0', 'value-bad', 'upgrade-boss-0', 'top-left-bad', 'hud-progress', 'hud-image', 'Resources/Hud/key.png']) {
      if (!text.includes(snippet)) errors.push(`HudLayoutBuilderTests must cover safe source file metadata: ${snippet}`);
    }
  }
  if (!files.includes(uiToolkitHudPath)) errors.push(`missing UI Toolkit HUD runtime binder: ${uiToolkitHudPath}`);
  if (files.includes(uiToolkitHudPath)) {
    const text = readFileSync(join(root, uiToolkitHudPath), 'utf8');
    for (const snippet of ['StandardSlotWidth', 'BottomSlotWidth', 'SlotHeight', 'BindingId', 'Action', 'IsProgress', 'ProgressBar', 'BuildProgressControl', 'IsImage', 'BuildImageControl', 'ImageSourcePath', 'LoadResourcesTexture', 'CreateFallbackIconTexture', 'ShouldPaintFallbackIconPixel', 'SafeElementName(string.IsNullOrWhiteSpace(element.BindingId)', 'ApplySlotPosition(view, normalizedSlot, width, SlotHeight)', 'view.style.marginLeft = -width * 0.5f', 'view.style.marginTop = -height * 0.5f']) {
      if (!text.includes(snippet)) errors.push(`GreyboxUiToolkitHud must center fixed HUD slots for real editor previews: ${snippet}`);
    }
  }
  if (files.includes(importerPath)) {
    const text = readFileSync(join(root, importerPath), 'utf8');
    for (const snippet of ['TryBuildImportObjects', 'MaxHudHtmlImportLength', 'character safety limit', 'ctx.LogImportError(error)', 'HudLayoutBuilder.BuildHudLayout', 'ctx.AddObjectToAsset("hud-panel-settings"', 'CollectGeneratedIconTextures', 'CollectGeneratedIconSprites', 'ctx.AddObjectToAsset($"hud-icon-texture-', 'ctx.AddObjectToAsset($"hud-icon-sprite-', 'ctx.AddObjectToAsset("hud-root"', 'ctx.SetMainObject(root)', 'ExportHudLayoutPrefab', 'AddressablesTagger.TagDeferred(prefabPath, GreyboxArtifactKind.HudLayout)']) {
      if (!text.includes(snippet)) errors.push(`HudLayoutImporter must import HUD HTML into a generated hierarchy: ${snippet}`);
    }
  }
  if (files.includes(importerTestPath)) {
    const text = readFileSync(join(root, importerTestPath), 'utf8');
    for (const snippet of ['TryBuildRejectsOversizedHudHtmlWithoutThrowing', 'MaxHudHtmlImportLength', 'character safety limit']) {
      if (!text.includes(snippet)) errors.push(`HudLayoutImporterTests must cover bounded HUD HTML imports: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['AssertHudLayout', 'AssertUiToolkitHudBuilder', 'AssertUiToolkitSlotPositioning', 'BindingFlags.NonPublic', 'GetComponent<Canvas>', 'GetComponentsInChildren<Text>', 'GetComponent<UIDocument>', 'GreyboxHudBinding', 'GreyboxArtifactKind.HudLayout', 'GetComponentsInChildren<Slider>', 'GetComponentsInChildren<UnityEngine.UI.Image>', 'item.IsProgress', 'item.IsImage', 'ImageSourcePath == "Resources/Hud/heart.png"']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate generated HUD hierarchy: ${snippet}`);
    }
  }
}

function validateArtBibleImporter(root, files, errors) {
  const runtimePalettePath = 'Runtime/GreyboxArtBiblePalette.cs';
  const builderPath = 'Editor/Generation/ScriptableObjectBuilder.cs';
  const materialBuilderPath = 'Editor/Generation/MaterialBuilder.cs';
  const assetExporterPath = 'Editor/Generation/ArtBibleAssetExporter.cs';
  const materialExporterPath = 'Editor/Generation/MaterialAssetExporter.cs';
  const importerPath = 'Editor/Importers/ArtBibleImporter.cs';
  const testPath = 'Tests/EditMode/ArtBibleImporterTests.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  if (!files.includes(runtimePalettePath)) errors.push(`missing runtime art-bible palette: ${runtimePalettePath}`);
  if (files.includes(runtimePalettePath)) {
    const text = readFileSync(join(root, runtimePalettePath), 'utf8');
    for (const snippet of ['namespace Greybox.Runtime', 'ScriptableObject', 'ColorNames', 'HexColors', 'Colors', 'MetallicValues', 'SmoothnessValues', 'EmissionEnabled', 'EmissionColors', 'RenderPipelineHints', 'StandalonePalettePath', 'MaterialAssetPaths', 'SourceMarkdown', 'ColorCount', 'TryGetColor', 'ColorOrDefault', 'TryGetMaterialAssetPath', 'FindColorIndex', 'NormalizeKey']) {
      if (!text.includes(snippet)) errors.push(`GreyboxArtBiblePalette must be a runtime ScriptableObject palette: ${snippet}`);
    }
  }
  if (files.includes(builderPath)) {
    const text = readFileSync(join(root, builderPath), 'utf8');
    if (/class\s+GreyboxArtBiblePalette/.test(text)) errors.push('GreyboxArtBiblePalette must not live in the editor assembly');
    if (!text.includes('using Greybox.Runtime')) errors.push('ScriptableObjectBuilder must create the runtime GreyboxArtBiblePalette type');
    for (const snippet of ['MaxArtBiblePaletteColors', 'MaxArtBibleColorNameLength', 'MaxArtBibleSourceMarkdownLength', 'BoundedSourceMarkdown', 'HexColor.Matches', 'IsEmissionColorMatch', 'UniqueColorLabel', 'SafeColorLabel', 'char.IsControl', 'Path.GetInvalidFileNameChars', 'MetallicValues.Add', 'SmoothnessValues.Add', 'EmissionEnabled.Add', 'EmissionColors.Add', 'RenderPipelineHints.Add', 'RenderPipelineHint', 'roughness', 'emissive', 'pipeline']) {
      if (!text.includes(snippet)) errors.push(`ScriptableObjectBuilder must preserve art-bible material traits: ${snippet}`);
    }
  }
  if (files.includes(materialBuilderPath)) {
    const text = readFileSync(join(root, materialBuilderPath), 'utf8');
    for (const snippet of ['BuildFromPalette', 'GreyboxArtBiblePalette', 'GraphicsSettings.currentRenderPipeline', 'PreferredShaderNamesForPipeline', 'PipelineHintToKind', 'ResolveShader', 'RenderPipelineHints', 'Shader.Find', 'Universal Render Pipeline/Lit', 'Universal Render Pipeline/Simple Lit', 'HDRP/Lit', 'HDRenderPipeline/Lit', 'Standard', '_BaseColor', '_Metallic', '_Smoothness', '_Glossiness', '_EmissionColor', '_EmissiveColor', 'EnableKeyword("_EMISSION")', 'Greybox ', 'MaxMaterialNameLength', 'internal static string SafeMaterialName', 'char.IsControl', 'Path.GetInvalidFileNameChars']) {
      if (!text.includes(snippet)) errors.push(`MaterialBuilder must generate art-bible materials: ${snippet}`);
    }
  }
  if (!files.includes(assetExporterPath)) errors.push(`missing art-bible asset exporter: ${assetExporterPath}`);
  if (files.includes(assetExporterPath)) {
    const text = readFileSync(join(root, assetExporterPath), 'utf8');
    for (const snippet of ['ExportPaletteAsset', 'GeneratedPalettePath', 'ExportPaletteName', 'MaterialBuilder.SafeMaterialName', 'GreyboxGeneratedAssetPaths.ProjectSlug', 'AssetDatabase.CreateAsset', 'GreyboxGeneratedAssetPaths.Root', '-palette.asset']) {
      if (!text.includes(snippet)) errors.push(`ArtBibleAssetExporter must emit standalone palette assets: ${snippet}`);
    }
  }
  if (!files.includes(materialExporterPath)) errors.push(`missing art-bible material asset exporter: ${materialExporterPath}`);
  if (files.includes(materialExporterPath)) {
    const text = readFileSync(join(root, materialExporterPath), 'utf8');
    for (const snippet of ['ExportMaterialAssets', 'GeneratedMaterialPaths', 'GeneratedMaterialPath', 'ExportMaterialName', 'MaterialBuilder.SafeMaterialName', 'GreyboxGeneratedAssetPaths.ProjectSlug', 'AssetDatabase.CreateAsset', 'EditorUtility.CopySerialized', 'AssetDatabase.SaveAssetIfDirty', '-material-', '.mat']) {
      if (!text.includes(snippet)) errors.push(`MaterialAssetExporter must emit stable standalone material assets: ${snippet}`);
    }
  }
  if (files.includes(importerPath)) {
    const text = readFileSync(join(root, importerPath), 'utf8');
    for (const snippet of ['MaterialBuilder.BuildFromPalette', 'ctx.AddObjectToAsset($"material-', 'ctx.SetMainObject(palette)', 'ExportPaletteAsset', 'MaterialAssetExporter.ExportMaterialAssets', 'RecordGeneratedAssetPaths', 'StandalonePalettePath', 'MaterialAssetPaths', 'AddressablesTagger.TagDeferred(palettePath, GreyboxArtifactKind.ArtBible)', 'AddressablesTagger.TagDeferred(materialPath, GreyboxArtifactKind.ArtBible)']) {
      if (!text.includes(snippet)) errors.push(`ArtBibleImporter must emit runtime palette and material sub-assets: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of ['BuildsStableStandalonePaletteAssetPath', 'BuildsBoundedPaletteFromMultiSwatchDesignLines', 'BoundsStoredArtBibleSourceMarkdown', 'TryBuildRejectsOversizedArtBibleMarkdownWithoutThrowing', 'MaxArtBibleMarkdownImportLength', 'character safety limit', 'SanitizesAndBoundsPaletteLabelsBeforeMaterialGeneration', 'RuntimePaletteLooksUpColorsAndMaterialPathsByNameOrHex', 'FindColorIndex("platform moss")', 'TryGetMaterialAssetPath("Hazard Crit"', 'SanitizesDirectMaterialNamesForGeneratedUnityAssets', 'PaletteAssetExporterSanitizesStandalonePaletteNamesOnCreateAndReexport', 'MaterialAssetExporterSanitizesStandaloneMaterialNamesOnCreateAndReexport', 'MaxArtBiblePaletteColors', 'MaxArtBibleColorNameLength', 'MaxArtBibleSourceMarkdownLength', 'MaxMaterialNameLength', 'Unsafe_Label Name', 'Unsafe Palette', 'Boss Mat', 'Unsafe Export', 'Greybox Material 01', 'Team Palette 2', 'DoesNotContain(palette.HexColors, "#303030")', 'ArtBibleImportProducesStandalonePaletteAsset', 'AssetDatabase.LoadAssetAtPath<GreyboxArtBiblePalette>', 'GeneratedPalettePath', 'world-design-palette.asset', 'BuildsStableStandaloneMaterialAssetPaths', 'GeneratedArtBibleAssetPathsRejectTraversalLikeSegments', 'project/42', 'https://example.test/project-42', 'ChoosesRenderPipelineShaderCandidatesForArtBibleMaterials', 'RenderPipelineHints', 'PipelineHintToKind', 'ArtBibleImportProducesStandaloneMaterialAssets', 'ArtBiblePaletteRecordsStandaloneMaterialAssetPaths', 'StandalonePalettePath', 'MaterialAssetPaths', 'ReExportingMaterialAssetPreservesGuidAndUpdatesContents', 'AssetDatabase.LoadAssetAtPath<Material>', 'GeneratedMaterialPath']) {
      if (!text.includes(snippet)) errors.push(`ArtBibleImporterTests must cover standalone palette asset export: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['Greybox.Runtime.GreyboxArtBiblePalette', 'Greybox.Editor.Generation.MaterialAssetExporter', 'OfType<Material>', 'materials.Length', 'Art bible should generate material sub-assets', 'GeneratedMaterialPath(path, "", 0)', 'Art bible should export stable standalone material assets', 'AssertAddressable(standaloneMaterialPath, GreyboxArtifactKind.ArtBible)']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate art-bible material output: ${snippet}`);
    }
  }
}

function validatePrefabAssetRealization(root, files, errors) {
  const prefabBuilderPath = 'Editor/Generation/PrefabBuilder.cs';
  const generatedAssetPathsPath = 'Editor/Generation/GreyboxGeneratedAssetPaths.cs';
  const prefabExporterPath = 'Editor/Generation/PrefabAssetExporter.cs';
  const generatedComponentsPath = 'Runtime/GreyboxGeneratedComponents.cs';
  const gameViewportRuntimePath = 'Runtime/GreyboxGameViewport.cs';
  const gameViewportImporterPath = 'Editor/Importers/GameViewportImporter.cs';
  const levelBoardImporterPath = 'Editor/Importers/LevelBoardImporter.cs';
  const testPath = 'Tests/EditMode/PrefabBuilderTests.cs';
  const exporterTestPath = 'Tests/EditMode/PrefabAssetExporterTests.cs';
  if (!files.includes(gameViewportRuntimePath)) errors.push(`missing game viewport runtime metadata: ${gameViewportRuntimePath}`);
  if (files.includes(gameViewportRuntimePath)) {
    const text = readFileSync(join(root, gameViewportRuntimePath), 'utf8');
    for (const snippet of ['GreyboxGameViewport', 'ViewportId', 'DisplayName', 'Theme', 'TargetEngine', 'CameraMode', 'ActorCount', 'SpawnPointCount', 'ObjectiveCount', 'HazardCount']) {
      if (!text.includes(snippet)) errors.push(`GreyboxGameViewport must expose imported root metadata: ${snippet}`);
    }
  }
  if (!files.includes(generatedComponentsPath)) errors.push(`missing generated component manifest: ${generatedComponentsPath}`);
  if (files.includes(generatedComponentsPath)) {
    const text = readFileSync(join(root, generatedComponentsPath), 'utf8');
    for (const snippet of ['GreyboxGeneratedComponents', 'ComponentTypeNames', 'Record(Component component)', 'Contains(string componentTypeName)', 'StringComparison.Ordinal']) {
      if (!text.includes(snippet)) errors.push(`GreyboxGeneratedComponents must record Unity components authored by Greybox: ${snippet}`);
    }
  }
  if (!files.includes(prefabBuilderPath)) errors.push(`missing prefab builder: ${prefabBuilderPath}`);
  if (files.includes(prefabBuilderPath)) {
    const text = readFileSync(join(root, prefabBuilderPath), 'utf8');
    for (const snippet of [
      'ResolveVisualAssetPath',
      'AttachGameViewport',
      'GreyboxGameViewport',
      'viewport.TargetEngine',
      'viewport.CameraMode',
      'viewport.ActorCount',
      'viewport.SpawnPointCount',
      'viewport.ObjectiveCount',
      'viewport.HazardCount',
      'CountObjectItems',
      'ResolveMaterialAsset',
      'ResolvePaletteMaterial',
      'CreateMaterialContext',
      'ReadPaletteMaterialLabel',
      'SafeUnityAssetPath',
      'StartsWith("Assets/"',
      'normalized.Length > 512',
      'segment == "." || segment == ".."',
      'AssetDatabase.LoadAssetAtPath<GameObject>',
      'AssetDatabase.LoadAssetAtPath<Mesh>',
      'meshFilter.sharedMesh = mesh',
      'AddComponent<MeshRenderer>()',
      'GetComponents<Collider>()',
      'DestroyImmediate(collider)',
      'GetComponentsInChildren<Renderer>(true)',
      'MarkGeneratedComponents(instance.GetComponentsInChildren<Component>(true))',
      'MarkGeneratedComponent(meshFilter)',
      'ApplyAuthoredCollider',
      'ApplyAuthoredPhysics',
      'ApplyUnityObjectMetadata',
      'BuildLevelTilemap',
      'CollectGeneratedTileAssets',
      'CollectGeneratedTileSprites',
      'CollectGeneratedTileTextures',
      'CollectGeneratedMaterials',
      'EditorUtility.IsPersistent(material)',
      'renderer.sharedMaterials',
      'TileDocuments',
      'ReadTilemapCellSize',
      'ReadTilemapCollisionFlag',
      'ReadTilePosition',
      'ScriptableObject.CreateInstance<Tile>()',
      'CreateTileSprite',
      'CreateTileTexture',
      'Sprite.Create',
      'new Texture2D',
      'texture.SetPixel',
      'texture.Apply',
      'tile.sprite',
      'tile.colliderType',
      'Tile.ColliderType.Sprite',
      'Tile.ColliderType.None',
      'tilemap.SetTile',
      'metadata.TileRecords',
      'ReadTileSemantics',
      'BlocksMovementForTileType',
      'CollectionPathFromJsonPath',
      'TilemapRenderer',
      'TilemapCollider2D',
      'CompositeCollider2D',
      'Rigidbody2D',
      'MarkGeneratedComponent(grid)',
      'MarkGeneratedComponent(tilemap)',
      'MarkGeneratedComponent(tilemapRenderer)',
      'MarkGeneratedComponent(tilemapCollider)',
      'MarkGeneratedComponent(body)',
      'MarkGeneratedComponent(composite)',
      'tilemapCollider.usedByComposite',
      'GreyboxLevelTilemap',
      'GreyboxLevelTileRecord',
      'metadata.ColliderEnabled',
      'metadata.CompositeColliderEnabled',
      'metadata.TileRecords',
      'metadata.TileCount = tileRecords.Count',
      'metadata.TileTextures',
      'metadata.TileSprites',
      'board.TileCount',
      'WantsCollider',
      'ReadColliderFlag',
      'ReadColliderType',
      'WantsRigidbody',
      'ReadRigidbodyFlag',
      'ApplyRigidbodyMode',
      'ReadPhysicsBool',
      'actor.Damage',
      'actor.JumpImpulse',
      'actor.AttackRange',
      'actor.PatrolRadius',
      'actor.AttackCooldownSeconds',
      'actor.AggroRadius',
      'actor.Behavior',
      'actor.AbilityIds',
      'actor.PatrolPointIds',
      'actor.LootTableId',
      'spawn.ActorIds',
      'spawn.MaxCount',
      'spawn.CooldownSeconds',
      'spawn.SpawnOnStart',
      'objective.TargetIds',
      'objective.Reward',
      'objective.TimeLimitSeconds',
      'hazard.HazardType',
      'hazard.Effect',
      'hazard.TickSeconds',
      'hazard.Knockback',
      'hazard.IsLethal',
      'hazard.AffectedTags',
      'go.AddComponent<MeshCollider>()',
      'meshCollider.sharedMesh',
      'AddComponent<Rigidbody>()',
      'MakeMeshCollidersConvex',
      'UnityEditorInternal.InternalEditorUtility.tags',
      'LayerMask.NameToLayer',
      'SetLayerRecursively',
      'go.SetActive(active)',
      'SafeMarkerId',
      'ReadMarkerIdArray',
      'MarkerDisplayName',
      'MaxMarkerIdLength',
      'MaxUnityObjectNameLength',
      'MaxDesignNodeTags',
      'MaxDesignNodeProperties',
      'MaxDesignPropertyValueLength',
      'MaxRuntimeStringLength',
      'MaxRuntimeStringArrayItems',
      'BoundedSourceJson',
      'SafeDesignPropertyKey',
      'SafeInspectorString',
      'ReadRuntimeString',
      'ReadRuntimeStringArray',
      'SafeRuntimeString',
      'ForbiddenDesignPropertyKeys',
      'AddComponent<SphereCollider>()',
      'AddComponent<CapsuleCollider>()',
      'MarkGeneratedComponent',
      'GreyboxGeneratedComponents',
      'ReadRotationEuler',
      'AuthoredRotationEuler',
      'TryReadFiniteFloat',
      'float.IsNaN(value)',
      'float.IsInfinity(value)',
      'materialAssetGuid',
      'meshAssetPath',
      'materialAssetPath',
      'artBiblePaletteAssetPath',
      'MaterialBuilder.Styled',
    ]) {
      if (!text.includes(snippet)) errors.push(`PrefabBuilder must realize authored prefab, mesh, and material references: ${snippet}`);
    }
  }
  if (!files.includes(generatedAssetPathsPath)) errors.push(`missing generated asset path helper: ${generatedAssetPathsPath}`);
  if (files.includes(generatedAssetPathsPath)) {
    const text = readFileSync(join(root, generatedAssetPathsPath), 'utf8');
    for (const snippet of ['Root = "Assets/Greybox/Generated"', 'GameViewportsFolder', 'HudLayoutsFolder', 'LevelBoardsFolder', 'GeneratedAssetPath', 'ProjectSlug', 'GreyboxDaemonUrlBuilder.TrySafeProjectId', 'EnsureFolder', 'SafeSegment', 'MaxSegmentLength', 'StringBuilder', 'SourceAssetStem', 'ArtifactRelativePath']) {
      if (!text.includes(snippet)) errors.push(`GreyboxGeneratedAssetPaths must centralize generated asset paths: ${snippet}`);
    }
  }
  if (!files.includes(prefabExporterPath)) errors.push(`missing prefab asset exporter: ${prefabExporterPath}`);
  if (files.includes(prefabExporterPath)) {
    const text = readFileSync(join(root, prefabExporterPath), 'utf8');
    for (const snippet of [
      'PrefabUtility.SaveAsPrefabAsset',
      'GeneratedPrefabPath',
      'IncomingSidecarPath',
      'PrefabHasUserModifications',
      'greybox-incoming',
      'GreyboxConflictInbox.RecordPrefabSidecar',
      'GetComponentsInChildren<Transform>(true)',
      'IsGreyboxOwnedGameObject',
      'HasGreyboxOwnershipMarker',
      'GetComponentsInChildren<Component>(true)',
      'IsRecordedGeneratedComponent',
      'if (!component) return false;',
      'GreyboxGeneratedComponents',
      'GreyboxGeneratedAssetPaths.GeneratedAssetPath',
      'GreyboxGeneratedAssetPaths.GameViewportsFolder',
      'GreyboxGeneratedAssetPaths.HudLayoutsFolder',
      'GreyboxGeneratedAssetPaths.LevelBoardsFolder',
      'GreyboxGeneratedAssetPaths.EnsureFolder',
      'ExportHudLayoutPrefab',
      'RecordGeneratedPrefabMetadata',
      'SafeSourcePath',
      'IsSafeSourcePath',
      'MaxSourcePathLength',
      'segment == "." || segment == ".."',
      'CanonicalGeneratedAssetPath',
      'ExportedAssetPath',
      'ExportedToIncomingSidecar',
      'UnityEngine.UI.CanvasScaler',
      'UnityEngine.UIElements.UIDocument',
    ]) {
      if (!text.includes(snippet)) errors.push(`PrefabAssetExporter must emit persisted generated prefabs: ${snippet}`);
    }
  }
  if (files.includes(gameViewportImporterPath)) {
    const text = readFileSync(join(root, gameViewportImporterPath), 'utf8');
    for (const snippet of ['ExportGameViewportPrefab', 'CollectGeneratedMaterials', 'ctx.AddObjectToAsset($"material-', 'AddressablesTagger.TagDeferred(prefabPath, GreyboxArtifactKind.GameViewport)']) {
      if (!text.includes(snippet)) errors.push(`GameViewportImporter must persist and tag generated prefabs: ${snippet}`);
    }
  }
  if (files.includes(levelBoardImporterPath)) {
    const text = readFileSync(join(root, levelBoardImporterPath), 'utf8');
    for (const snippet of ['ExportLevelBoardPrefab', 'CollectGeneratedMaterials', 'CollectGeneratedTileAssets', 'CollectGeneratedTileTextures', 'CollectGeneratedTileSprites', 'ctx.AddObjectToAsset($"material-', 'ctx.AddObjectToAsset($"tile-', 'ctx.AddObjectToAsset($"tile-texture-', 'ctx.AddObjectToAsset($"tile-sprite-', 'AddressablesTagger.TagDeferred(prefabPath, GreyboxArtifactKind.LevelBoard)']) {
      if (!text.includes(snippet)) errors.push(`LevelBoardImporter must persist and tag generated prefabs: ${snippet}`);
    }
  }
  if (!files.includes(testPath)) errors.push(`missing prefab builder tests: ${testPath}`);
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'InstantiatesReferencedPrefabAssetsForAuthoredNodes',
      'RuntimeCountsOnlyGeneratedGameViewportNodes',
      'RuntimeCountsOnlyGeneratedLevelBoardNodesAndTiles',
      'GetComponent<GreyboxGameViewport>',
      'viewport.ViewportId',
      'viewport.TargetEngine',
      'viewport.CameraMode',
      'viewport.ActorCount',
      'viewport.SpawnPointCount',
      'viewport.ObjectiveCount',
      'viewport.HazardCount',
      'typeof(AudioSource).FullName',
      'manifest.Contains',
      'BuildsMeshNodesWithReferencedMaterialAssets',
      'RejectsUnsafeUnityAssetPathsFromArtifactJson',
      'Assets/Greybox/../Secrets/Boss.prefab',
      '../ProjectSettings/ProjectSettings.asset',
      'https://example.test/Boss.fbx',
      'Assets\\\\Greybox\\\\Missing\\\\Boss.asset',
      'AddsAuthoredCollidersForPlayableImports',
      'AppliesExplicitUnityObjectMetadata',
      'BuildsTilemapFromLevelBoardTiles',
      'PrefabUtility.SaveAsPrefabAsset',
      'AssetDatabase.CreateAsset(mesh, meshPath)',
      'AssetDatabase.CreateAsset(material, materialPath)',
      'Tilemap',
      'TilemapRenderer',
      'TilemapCollider2D',
      'CompositeCollider2D',
      'Rigidbody2D',
      'GreyboxLevelTilemap',
      'ColliderEnabled',
      'CompositeColliderEnabled',
      'TileTextures',
      'TileSprites',
      'TileRecords',
      'SourceJsonPath',
      'BlocksMovement',
      'Tile.ColliderType.Sprite',
      'Tile.ColliderType.None',
      'CollectGeneratedTileAssets',
      'CollectGeneratedTileTextures',
      'CollectGeneratedTileSprites',
      'CollectGeneratedMaterials',
      'generatedMaterials.Length',
      'ResolvesGameViewportMaterialsFromArtBiblePalette',
      'GeneratesGameViewportMaterialFromArtBiblePaletteColor',
      'ResolvesLevelBoardConnectionMaterialsFromArtBiblePalette',
      'CreatePaletteAsset',
      'materialSlot',
      'paletteMaterial',
      'paletteColor',
      'artBiblePaletteAssetPath',
      'GetTile',
      'sprite',
      'MeshCollider',
      'Rigidbody',
      'SphereCollider',
      'CapsuleCollider',
      'isKinematic',
      'useGravity',
      'attackDamage',
      'jumpImpulse',
      'patrolRadius',
      'AttackCooldownSeconds',
      'detectionRadius',
      'patrol-aggro',
      'AbilityIds',
      'PatrolPointIds',
      'LootTableId',
      'SpawnOnStart',
      'TargetIds',
      'TimeLimitSeconds',
      'TickSeconds',
      'Knockback',
      'IsLethal',
      'AffectedTags',
      'unityTag',
      'unityLayerName',
      'activeSelf',
      'ImportsAuthoredEulerAliasesIntoTransformsAndDesignNodes',
      'MalformedNumericVectorInputsFallBackWithoutThrowing',
      'SanitizesAuthoredMarkerIdsAndLevelBoardReferences',
      'BoundsInspectableRuntimeDesignNodeMetadata',
      'BoundsAuthoredRuntimeComponentStringsAndArrays',
      '""position"":[""left"",2,3]',
      '""scale"":[""wide"",3,4]',
      '""position"":[1,2,""far""]',
      'Assert.IsNull(actor.GetComponent<Collider>())',
      'boss-oops',
      'Gate-Boss',
      'entry-room-0',
      'boss-room-0',
      'explicit-key',
      'bad-key',
      '__proto__',
      'node.Properties.Count',
      'node.Tags.Count',
      '8192',
      'loot-table-0',
      'AbilityIds.Length',
      'AffectedTags.Length',
      'side scroll',
      'Prefab',
      'Mesh',
    ]) {
      if (!text.includes(snippet)) errors.push(`PrefabBuilderTests must cover real asset realization: ${snippet}`);
    }
  }
  if (!files.includes(exporterTestPath)) errors.push(`missing prefab exporter tests: ${exporterTestPath}`);
  if (files.includes(exporterTestPath)) {
    const text = readFileSync(join(root, exporterTestPath), 'utf8');
    for (const snippet of [
      'BuildsStableGeneratedPrefabPaths',
      'GeneratedPrefabPathsIncludeArtifactFoldersToAvoidCollisions',
      'GeneratedAssetPathsRejectTraversalLikeSegments',
      'GeneratedProjectSlugsUseSafeProjectScope',
      'GameViewportImportProducesNavigablePrefab',
      'ExportedPrefabMetadataRejectsUnsafeSourcePaths',
      'HudLayoutImportProducesNavigablePrefab',
      'UiToolkitHudLayoutImportProducesNavigablePrefab',
      'ReExportingGeneratedPrefabPreservesGuidAndUpdatesHierarchy',
      'ReExportingUserModifiedPrefabWritesToSidecarPathAndPreservesUserEdits',
      'IncomingSidecarPathInsertsSuffixBeforePrefabExtension',
      'PrefabWithUserAddedEmptyChildIsUserModified',
      'PrefabWithUserAddedRigidbody2DIsUserModified',
      'MissingScriptComponentsAreNotGreyboxOwnedForOverwriteSafety',
      'InvokeIsGreyboxOwnedComponent(null)',
      'PrefabWithGeneratedWatermarkChildIsNotUserModified',
      'PrefabWithGeneratedHudInfrastructureIsNotUserModified',
      'PrefabWithRecordedGreyboxGeneratedColliderIsNotUserModified',
      'PrefabWithRecordedImportedPrefabComponentsIsNotUserModified',
      'PrefabWithGeneratedTilemapInfrastructureIsNotUserModified',
      'GreyboxConflictInbox.Conflicts',
      'AssetDatabase.LoadAssetAtPath<GameObject>',
      'AssetDatabase.AssetPathToGUID',
      'ExportHudLayoutPrefab',
      'GreyboxArtifactKind.HudLayout',
      'HudLayouts',
      'GreyboxUiToolkitHud',
      'CanonicalGeneratedAssetPath',
      'ExportedAssetPath',
      'ExportedToIncomingSidecar',
      'boss-arena.prefab',
      '$.spawnPoints[id=spawn-a].position',
      'Generated prefab GUID must remain stable across re-exports',
      '../ProjectSettings/ProjectSettings.asset',
      'Assert.AreEqual("", imported.SourcePath)',
    ]) {
      if (!text.includes(snippet)) errors.push(`PrefabAssetExporterTests must cover persisted generated prefabs: ${snippet}`);
    }
  }
}

function validateUnityPackageImportContract(root, files, errors) {
  const docPath = 'Documentation~/round-trip-sync.md';
  const prefabBuilderPath = 'Editor/Generation/PrefabBuilder.cs';
  const testPath = 'Tests/EditMode/PrefabBuilderTests.cs';
  if (!files.includes(docPath)) errors.push(`missing Unity package import contract docs: ${docPath}`);
  if (files.includes(docPath)) {
    const text = readFileSync(join(root, docPath), 'utf8');
    for (const snippet of [
      'Unity Package Import Contract',
      'GreyboxProjectManifest.json',
      'importedAssets',
      'contentRevisionSha256',
      'kind: "unity-imported-asset"',
      'sourceType',
      'Assets/Greybox/Imported/<sha-prefix>/',
      'prefabAssetPath',
      'meshAssetPath',
      'materialAssetPath',
      'unityAssetGuid',
      'materialAssetGuid',
      'greyboxImportedAssets',
      'resolves GUID aliases first',
      'falls back to primitive markers',
      'blocked private-network',
      'non-HTTPS remote assets',
      'requests a new engine-package preflight check',
      'checksum-verified package path',
    ]) {
      if (!text.includes(snippet)) errors.push(`round-trip docs must define the daemon Unity package import contract: ${snippet}`);
    }
  }
  if (files.includes(prefabBuilderPath)) {
    const text = readFileSync(join(root, prefabBuilderPath), 'utf8');
    for (const snippet of [
      'ResolveUnityAssetPath',
      'AssetDatabase.GUIDToAssetPath',
      'SafeUnityAssetPath',
      'StartsWith("Assets/"',
      'prefabAssetPath',
      'meshAssetPath',
      'materialAssetPath',
      'unityAssetGuid',
      'materialAssetGuid',
      'UnityAssetPath = unityAssetPath ?? ""',
    ]) {
      if (!text.includes(snippet)) errors.push(`PrefabBuilder must consume the daemon Unity package import contract: ${snippet}`);
    }
  }
  if (files.includes(testPath)) {
    const text = readFileSync(join(root, testPath), 'utf8');
    for (const snippet of [
      'RecordsRequestedPrefabPathWhenAssetFallsBackToPrimitive',
      'RejectsUnsafeUnityAssetPathsFromArtifactJson',
      'InstantiatesReferencedPrefabAssetsForAuthoredNodes',
      'BuildsMeshNodesWithReferencedMaterialAssets',
      'ResolvesMeshAndMaterialReferencesFromGuidAliases',
    ]) {
      if (!text.includes(snippet)) errors.push(`PrefabBuilderTests must cover the daemon Unity package import contract: ${snippet}`);
    }
  }
}

function validateAddressablesTagging(root, files, errors) {
  const taggerPath = 'Editor/Generation/AddressablesTagger.cs';
  const taggerTestPath = 'Tests/EditMode/AddressablesTaggerTests.cs';
  const mcpPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const smokePath = 'Validation~/unity-import-smoke.mjs';
  const readmePath = 'README.md';
  const syncDocPath = 'Documentation~/round-trip-sync.md';
  const importerPaths = [
    'Editor/Importers/GameViewportImporter.cs',
    'Editor/Importers/LevelBoardImporter.cs',
    'Editor/Importers/HudLayoutImporter.cs',
    'Editor/Importers/ArtBibleImporter.cs',
  ];
  if (!files.includes(taggerPath)) errors.push(`missing Addressables tagger: ${taggerPath}`);
  if (files.includes(taggerPath)) {
    const text = readFileSync(join(root, taggerPath), 'utf8');
    for (const snippet of [
      'AddressablesTagger',
      'GeneratedGroupName',
      'greybox-generated',
      'greybox-gameview',
      'greybox-art-bible',
      'greybox-hud-layout',
      'greybox-level-board',
      'greybox-sample-scene',
      'greybox-2d-platformer',
      'TagDeferred',
      'TagSampleSceneDeferred',
      'FlushPending',
      'AddressableAssetSettingsDefaultObject.GetSettings(true)',
      'settings.CreateGroup',
      'settings.CreateOrMoveEntry',
      'settings.AddLabel',
      'entry.SetLabel',
      'entry.SetAddress(BuildAddress',
      'AddressableAssetSettings.ModificationEvent.EntryModified',
      'AssetDatabase.SetLabels',
      'MaxPendingTagRequests',
      'PendingKeys.Contains(key)',
      'Pending.Count >= MaxPendingTagRequests',
      'TagAttemptResult.RetryableFailure',
      'EnqueueRetry',
      'ScheduleFlush',
      'FlushScheduledForTests',
      'retryable = true',
      'retryable Addressables tag request',
      'ClearPendingForTests',
    ]) {
      if (!text.includes(snippet)) errors.push(`AddressablesTagger must assign generated Greybox labels/groups: ${snippet}`);
    }
  }
  if (!files.includes(taggerTestPath)) errors.push(`missing Addressables tagger tests: ${taggerTestPath}`);
  if (files.includes(taggerTestPath)) {
    const text = readFileSync(join(root, taggerTestPath), 'utf8');
    for (const snippet of ['DeferredTagQueueDeduplicatesAndCapsGeneratedAssets', 'DeferredFlushRetainsRetryableAddressablesFailures', 'DuplicateDeferredTagWakesRetryablePendingQueue', 'SampleSceneTagsUseGeneratedAndSampleLabels', 'MaxPendingTagRequestsForTests', 'PendingTagRequestCountForTests', 'FlushScheduledForTests', 'FlushPendingForTests', 'retry.prefab', 'retry-wakeup.prefab', 'overflow.prefab']) {
      if (!text.includes(snippet)) errors.push(`AddressablesTaggerTests must cover bounded deferred tag queues: ${snippet}`);
    }
  }
  for (const importerPath of importerPaths) {
    if (!files.includes(importerPath)) {
      errors.push(`missing importer for Addressables tagging: ${importerPath}`);
      continue;
    }
    const text = readFileSync(join(root, importerPath), 'utf8');
    if (!text.includes('AddressablesTagger.TagDeferred(ctx.assetPath')) {
      errors.push(`${importerPath} must defer Addressables tagging for generated artifacts`);
    }
  }
  if (files.includes(mcpPath)) {
    const text = readFileSync(join(root, mcpPath), 'utf8');
    for (const snippet of ['AddressablesTagger.FlushPending', 'AddressableAssetSettingsDefaultObject.Settings', 'Addressables settings are not configured', 'System.Diagnostics.Stopwatch.StartNew', 'AddressableAssetSettings.BuildPlayerContent', 'AnnotateAddressablesBuildTiming', 'timer.ElapsedMilliseconds', 'DateTime.UtcNow', 'buildDurationMs', 'buildCompletedAtUtc', 'AddressablesTagger.GeneratedGroupName', 'AddressablesTagger.GeneratedLabel', 'AddressablesTagger.SampleSceneLabel', 'AddressablesTagger.PlatformerSampleLabel', 'DescribeAddressablesBuild', 'DescribeAddressableEntry', 'AssetDatabase.LoadMainAssetAtPath', 'assetExists', 'assetType', 'CountAddressableLabels', 'DescribeMissingAddressableLabels', 'CompareAddressableEntriesForMcp', 'DescribeAddressableEntryLabels', 'sortedEntries.Sort', 'sortedLabels.Sort', 'generatedEntryCount', 'labelCounts', 'missingLabels', 'generatedEntries', 'generatedEntriesTruncated', 'MaxMcpAddressablesSummaryEntries']) {
      if (!text.includes(snippet)) errors.push(`MCP buildAddressables must flush generated asset tags before build: ${snippet}`);
    }
  }
  if (files.includes(smokePath)) {
    const text = readFileSync(join(root, smokePath), 'utf8');
    for (const snippet of ['EnsureAddressablesSettings', 'AddressablesTagger.FlushPending', 'System.Diagnostics.Stopwatch.StartNew', 'importTimer.Elapsed.TotalSeconds, 30d', 'under 30 seconds', 'AssertAddressable', 'AssertSampleSceneAddressable', 'AddressablesTagger.GeneratedGroupName', 'AddressablesTagger.GeneratedLabel', 'AddressablesTagger.LabelForKind', 'AddressablesTagger.SampleSceneLabel', 'AddressablesTagger.PlatformerSampleLabel']) {
      if (!text.includes(snippet)) errors.push(`Unity import smoke must validate Addressables tagging: ${snippet}`);
    }
  }
  for (const docPath of [readmePath, syncDocPath]) {
    if (!files.includes(docPath)) continue;
    const text = readFileSync(join(root, docPath), 'utf8');
    for (const snippet of ['unity.buildAddressables', 'buildDurationMs', 'buildCompletedAtUtc', 'generatedEntryCount', 'labelCounts', 'missingLabels', 'generatedEntries', 'assetExists', 'assetType', 'greybox-sample-scene', 'greybox-2d-platformer']) {
      if (!text.includes(snippet)) errors.push(`${docPath} must document Addressables build proof: ${snippet}`);
    }
  }
}

function validateFilesystem(files, errors) {
  for (const file of files) {
    if (file.length >= 140) errors.push(`file path must be under 140 characters: ${file}`);
    if (file.split('/').some((part) => /assetstoretools/i.test(part))) {
      errors.push(`AssetStoreTools folders are forbidden: ${file}`);
    }
    const ext = extname(file).toLowerCase();
    if (BANNED_ARCHIVE_OR_EXECUTABLE_EXTENSIONS.has(ext)) {
      errors.push(`archive/executable content must not be bundled: ${file}`);
    }
  }
}

function validateProprietarySourceHygiene(root, files, errors) {
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!PROPRIETARY_SOURCE_EXTENSIONS.has(ext)) continue;
    const text = readFileSync(join(root, file), 'utf8');
    const firstLines = text.split(/\r?\n/u).slice(0, 3).join('\n');
    if (!firstLines.includes(PROPRIETARY_SOURCE_HEADER)) {
      errors.push(`${file} must carry the Greybox proprietary source header`);
    }
    if (APACHE_OR_SPDX_PATTERN.test(firstLines)) {
      errors.push(`${file} must not carry Apache/SPDX open-source headers in the proprietary Unity package`);
    }
  }
}

function validateCSharpNamespaces(root, files, errors) {
  const csFiles = files.filter((file) => file.endsWith('.cs'));
  for (const file of csFiles) {
    const text = readFileSync(join(root, file), 'utf8');
    for (const match of text.matchAll(/\bnamespace\s+([A-Za-z_][A-Za-z0-9_.]*)/g)) {
      const ns = match[1];
      if (!ns.startsWith('Greybox.')) {
        errors.push(`${file} namespace must start with Greybox.: ${ns}`);
      }
      if (ns.startsWith('Unity') || ns.includes('.Unity')) {
        errors.push(`${file} namespace must not use Unity trademark namespace: ${ns}`);
      }
    }
    if (/sk-[A-Za-z0-9]{20,}|anthropic_[A-Za-z0-9]/.test(text)) {
      errors.push(`${file} appears to contain an API key literal`);
    }
  }
}

function expectEqual(errors, actual, expected, label) {
  if (actual !== expected) errors.push(`${label} must be ${expected}`);
}

function expectString(errors, value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) errors.push(`${label} must be a non-empty string`);
}

function expectNonEmptyArray(errors, value, label) {
  if (!Array.isArray(value) || value.length === 0) errors.push(`${label} must be a non-empty array`);
}

function isNumeric(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function readJson(file, errors) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`could not parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readText(file, errors) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    errors.push(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
}

function walkFiles(root) {
  const out = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      const rel = relative(root, abs).replaceAll('\\', '/');
      if (entry.name === '.git' || entry.name === 'Library' || entry.name === 'Temp' || entry.name === 'Obj' || rel === 'dist' || rel === '.tmp' || rel === 'Validation~/artifacts') continue;
      if (entry.isDirectory()) {
        visit(abs);
      } else if (entry.isFile()) {
        out.push(rel);
      }
    }
  }
  visit(root);
  return out.sort();
}

function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  const submission = process.argv.includes('--submission');
  const result = validatePackage(root, { submission });
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`FAIL ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS Unity Asset Store metadata checks (${result.totalBytes} bytes).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
