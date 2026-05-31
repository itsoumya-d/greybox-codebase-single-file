#!/usr/bin/env node
// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_MCP_TOOLS = [
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
export const SAFE_ASSET_PATH_PATTERN = '^(?!.*[\\x00-\\x1F\\x7F-\\x9F])Assets/(?!.*//)(?!.*\\\\)(?!.*(?:^|/)\\.\\.?(?:/|$)).+$';

export function parseMcpConformanceArgs(argv) {
  const options = {
    output: '',
    root: '',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = argv[++index] ?? '';
    else if (arg === '--root') options.root = argv[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

export function extractToolDefinitions(definitionsSource) {
  const match = definitionsSource.match(/return @\"([\s\S]*?)\";\s*\n\s*\}/);
  if (!match) throw new Error('McpToolDefinitions.ToolsJson must return a C# verbatim JSON string.');
  return JSON.parse(match[1].replaceAll('""', '"')).tools ?? [];
}

export function buildMcpConformanceReport({
  root = join(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const packageRoot = resolve(root);
  const definitionsPath = 'Editor/McpBridge/McpToolDefinitions.cs';
  const serverPath = 'Editor/McpBridge/GreyboxMcpServer.cs';
  const settingsPath = 'Editor/Windows/GreyboxSettings.cs';
  const studioWindowPath = 'Editor/Windows/GreyboxStudioWindow.cs';
  const packageJsonPath = 'package.json';
  const checks = [];
  const tools = [];

  const definitionsFile = join(packageRoot, definitionsPath);
  const serverFile = join(packageRoot, serverPath);
  const settingsFile = join(packageRoot, settingsPath);
  const studioWindowFile = join(packageRoot, studioWindowPath);
  const packageJsonFile = join(packageRoot, packageJsonPath);
  if (!existsSync(definitionsFile)) {
    addCheck(checks, 'files', 'tool definitions source exists', false, definitionsPath);
  }
  if (!existsSync(serverFile)) {
    addCheck(checks, 'files', 'MCP server source exists', false, serverPath);
  }

  const definitions = existsSync(definitionsFile) ? readFileSync(definitionsFile, 'utf8') : '';
  const server = existsSync(serverFile) ? readFileSync(serverFile, 'utf8') : '';
  const settings = existsSync(settingsFile) ? readFileSync(settingsFile, 'utf8') : '';
  const studioWindow = existsSync(studioWindowFile) ? readFileSync(studioWindowFile, 'utf8') : '';
  const packageJson = existsSync(packageJsonFile) ? readJsonFile(packageJsonFile) : {};
  const packageVersion = typeof packageJson.version === 'string' ? packageJson.version : '';
  const mcpServerVersion = extractCSharpStringConstant(server, 'McpServerVersion');
  try {
    tools.push(...extractToolDefinitions(definitions));
  } catch (error) {
    addCheck(checks, 'tool surface', 'ToolsJson parses as JSON', false, error instanceof Error ? error.message : String(error));
  }

  const toolNames = tools.map((tool) => tool.name);
  addCheck(
    checks,
    'tool surface',
    'required tool list is exact and ordered',
    sameList(toolNames, REQUIRED_MCP_TOOLS),
    `${toolNames.length} tools: ${toolNames.join(', ')}`,
  );
  for (const tool of REQUIRED_MCP_TOOLS) {
    addCheck(checks, 'tool surface', `${tool} is advertised`, toolNames.includes(tool), tool);
    addCheck(checks, 'routing', `${tool} is routed`, server.includes(`"${tool}" =>`), tool);
  }
  for (const tool of tools) {
    addCheck(
      checks,
      'schema',
      `${tool.name} input schema is object-shaped`,
      tool.inputSchema?.type === 'object',
      JSON.stringify(tool.inputSchema ?? {}),
    );
    addCheck(
      checks,
      'schema',
      `${tool.name} rejects unknown arguments`,
      tool.inputSchema?.additionalProperties === false,
      JSON.stringify(tool.inputSchema ?? {}),
    );
  }
  addCheck(
    checks,
    'tool surface',
    'all MCP tools advertise safety annotations',
    tools.length === REQUIRED_MCP_TOOLS.length
      && tools.every((tool) => {
        const annotations = tool.annotations ?? {};
        return typeof annotations.title === 'string'
          && annotations.title.trim().length > 0
          && typeof annotations.readOnlyHint === 'boolean'
          && typeof annotations.destructiveHint === 'boolean'
          && typeof annotations.idempotentHint === 'boolean'
          && typeof annotations.openWorldHint === 'boolean';
      }),
    JSON.stringify(tools.map((tool) => ({ name: tool.name, annotations: tool.annotations ?? null }))),
  );
  addCheck(
    checks,
    'tool surface',
    'MCP annotations distinguish read-only and mutating tools',
    tools.find((tool) => tool.name === 'unity.getSceneHierarchy')?.annotations?.readOnlyHint === true
      && tools.find((tool) => tool.name === 'unity.getSceneHierarchy')?.annotations?.idempotentHint === true
      && tools.filter((tool) => tool.name !== 'unity.getSceneHierarchy').every((tool) => tool.annotations?.readOnlyHint === false)
      && tools.every((tool) => tool.annotations?.destructiveHint === false && tool.annotations?.openWorldHint === false),
    JSON.stringify(tools.map((tool) => ({ name: tool.name, annotations: tool.annotations ?? null }))),
  );
  const createGameObjectTool = tools.find((tool) => tool.name === 'unity.createGameObject');
  const createGameObjectProps = createGameObjectTool?.inputSchema?.properties ?? {};
  const vector3Schema = createGameObjectTool?.inputSchema?.$defs?.vector3;
  const vector3Variants = Array.isArray(vector3Schema?.oneOf) ? vector3Schema.oneOf : [];
  addCheck(
    checks,
    'schema',
    'unity.createGameObject advertises parent and parentId aliases',
    createGameObjectProps.parent?.type === 'string'
      && createGameObjectProps.parentId?.type === 'string',
    JSON.stringify(createGameObjectProps),
  );
  addCheck(
    checks,
    'schema',
    'mutation string arguments advertise control-free bounds',
    [
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
    ].every(([toolName, propName, maxLength]) => {
      const schema = tools.find((tool) => tool.name === toolName)?.inputSchema?.properties?.[propName];
      return schema?.type === 'string'
        && schema.minLength === 1
        && schema.maxLength === maxLength
        && schema.pattern === CONTROL_FREE_STRING_PATTERN;
    }),
    'all mutating MCP string arguments include minLength/maxLength/control-free pattern',
  );
  addCheck(
    checks,
    'schema',
    'unity.createGameObject advertises optional initial transform',
    createGameObjectProps.position?.$ref === '#/$defs/vector3'
      && createGameObjectProps.rotation?.$ref === '#/$defs/vector3'
      && createGameObjectProps.scale?.$ref === '#/$defs/vector3',
    JSON.stringify(createGameObjectProps),
  );
  addCheck(
    checks,
    'schema',
    'unity.createGameObject vector3 schema accepts object and array forms',
    vector3Variants.some((variant) => variant?.type === 'object'
      && Array.isArray(variant.required)
      && ['x', 'y', 'z'].every((axis) => variant.required.includes(axis) && variant.properties?.[axis]?.type === 'number'))
      && vector3Variants.some((variant) => variant?.type === 'array'
        && variant.minItems === 3
        && variant.maxItems === 3
        && variant.items?.type === 'number'),
    JSON.stringify(vector3Schema ?? {}),
  );
  const setFieldTool = tools.find((tool) => tool.name === 'unity.setField');
  const setFieldProps = setFieldTool?.inputSchema?.properties ?? {};
  const setFieldValueVariants = Array.isArray(setFieldProps.value?.oneOf) ? setFieldProps.value.oneOf : [];
  const setFieldStringValue = setFieldValueVariants.find((variant) => variant?.type === 'string');
  const setFieldStringArrayValue = setFieldValueVariants.find((variant) => variant?.type === 'array' && variant?.items?.type === 'string');
  addCheck(
    checks,
    'schema',
    'unity.setField advertises bounded scalar/string-array/vector/color values',
    setFieldProps.fieldName?.minLength === 1
      && setFieldProps.fieldName?.maxLength === 128
      && setFieldStringValue?.maxLength === 4096
      && setFieldStringArrayValue?.maxItems === 64
      && setFieldStringArrayValue?.items?.maxLength === 256
      && setFieldStringArrayValue?.items?.pattern === CONTROL_CHAR_FREE_STRING_PATTERN
      && setFieldValueVariants.some((variant) => variant?.$ref === '#/$defs/vector3')
      && setFieldValueVariants.some((variant) => variant?.$ref === '#/$defs/color'),
    JSON.stringify(setFieldTool?.inputSchema ?? {}),
  );
  const assignAssetTool = tools.find((tool) => tool.name === 'unity.assignAsset');
  const assignAssetPath = assignAssetTool?.inputSchema?.properties?.assetPath;
  addCheck(
    checks,
    'schema',
    'unity.assignAsset advertises canonical project-relative Assets paths',
    assignAssetPath?.pattern === SAFE_ASSET_PATH_PATTERN
      && assignAssetPath?.minLength === 8
      && assignAssetPath?.maxLength === 512,
    JSON.stringify(assignAssetPath ?? {}),
  );
  addCheck(
    checks,
    'schema',
    'unity.assignAsset asset paths advertise all control characters blocked',
    typeof assignAssetPath?.pattern === 'string'
      && assignAssetPath.pattern.includes('[\\x00-\\x1F\\x7F-\\x9F]'),
    JSON.stringify(assignAssetPath ?? {}),
  );
  const runEditModeTestTool = tools.find((tool) => tool.name === 'unity.runEditModeTest');
  const testNameSchema = runEditModeTestTool?.inputSchema?.properties?.testName;
  addCheck(
    checks,
    'schema',
    'unity.runEditModeTest advertises bounded control-free test names',
    testNameSchema?.type === 'string'
      && testNameSchema?.minLength === 1
      && testNameSchema?.maxLength === 256
      && testNameSchema?.pattern === CONTROL_FREE_STRING_PATTERN,
    JSON.stringify(testNameSchema ?? {}),
  );
  const screenshotTool = tools.find((tool) => tool.name === 'unity.captureGameViewScreenshot');
  const screenshotProps = screenshotTool?.inputSchema?.properties ?? {};
  addCheck(
    checks,
    'schema',
    'unity.captureGameViewScreenshot advertises bounded integer dimensions',
    screenshotProps.width?.type === 'integer'
      && screenshotProps.height?.type === 'integer'
      && screenshotProps.width?.minimum === 64
      && screenshotProps.height?.minimum === 64
      && screenshotProps.width?.maximum === 4096
      && screenshotProps.height?.maximum === 4096,
    JSON.stringify(screenshotProps),
  );
  addCheck(
    checks,
    'protocol',
    'initialize serverInfo version matches package.json',
    packageVersion.length > 0
      && mcpServerVersion === packageVersion
      && /\["version"\]\s*=\s*McpServerVersion/u.test(server),
    `package=${packageVersion || '<missing>'}; mcp=${mcpServerVersion || '<missing>'}`,
  );

  for (const item of [
    ['protocol', 'initialize returns MCP protocol 2024-11-05', /case "initialize":[\s\S]*?\["protocolVersion"\]\s*=\s*"2024-11-05"/u],
    ['protocol', 'initialize advertises tools capability', /case "initialize":[\s\S]*?\["capabilities"\]\s*=\s*new JObject \{ \["tools"\]/u],
    ['protocol', 'JSON-RPC envelope rejects non-string versions', /rawJsonRpc\.Type != JTokenType\.String[\s\S]*?jsonrpc must be a string/u],
    ['protocol', 'JSON-RPC envelope rejects non-string methods', /rawMethod\.Type != JTokenType\.String[\s\S]*?method must be a string/u],
    ['protocol', 'tools/list returns advertised definitions', /case "tools\/list":[\s\S]*?JObject\.Parse\(McpToolDefinitions\.ToolsJson\(\)\)/u],
    ['protocol', 'tools/call returns MCP text content', /case "tools\/call":[\s\S]*?\["content"\]\s*=\s*new JArray/u],
    ['protocol', 'tools/call returns structuredContent', /case "tools\/call":[\s\S]*?\["structuredContent"\]\s*=\s*structuredResult/u],
    ['protocol', 'tools/call marks successful tool results as non-errors', /McpToolSuccess[\s\S]*?\["isError"\]\s*=\s*false/u],
    ['protocol', 'direct tools/call returns structuredContent', /DirectToolSuccess[\s\S]*?\["structuredContent"\]\s*=\s*structuredResult/u],
    ['protocol', 'direct tools/call marks successful tool results as non-errors', /DirectToolSuccess[\s\S]*?\["isError"\]\s*=\s*false/u],
    ['protocol', 'tools/call rejects non-object params', /case "tools\/call":[\s\S]*?params must be an object/u],
    ['protocol', 'tools/call rejects non-string names', /case "tools\/call":[\s\S]*?params\.name must be a string/u],
    ['protocol', 'tools/call rejects non-object arguments', /case "tools\/call":[\s\S]*?params\.arguments must be an object/u],
    ['protocol', 'direct tools/call rejects non-object bodies', /HandleToolCall[\s\S]*?TryReadDirectToolCallRequest[\s\S]*?tools\/call body must be an object/u],
    ['protocol', 'direct tools/call rejects non-string names', /TryReadDirectToolCallRequest[\s\S]*?tools\/call name must be a string/u],
    ['protocol', 'direct tools/call rejects non-object arguments', /TryReadDirectToolCallRequest[\s\S]*?tools\/call arguments must be an object/u],
    ['protocol', 'tools/call rejects arguments outside the advertised schemas', /InvokeUnityTool[\s\S]*?ValidateMcpArguments\(name,\s*args\)[\s\S]*?Unexpected argument for/u],
    ['protocol', 'tools/call rejects missing required schema arguments', /ValidateMcpArguments[\s\S]*?RequireMcpArgument[\s\S]*?Missing required argument for/u],
    ['protocol', 'tools/call rejects non-integer screenshot dimensions', /ValidateMcpArguments[\s\S]*?RequireMcpIntegerArgument[\s\S]*?must be an integer/u],
    ['protocol', 'tools/call rejects out-of-range integer arguments', /RequireMcpIntegerArgument[\s\S]*?ReadMcpInt32Value[\s\S]*?32-bit integer/u],
    ['protocol', 'tools/call rejects non-string schema arguments', /ValidateMcpArguments[\s\S]*?RequireMcpStringArgument[\s\S]*?must be a string/u],
    ['protocol', 'tools/call rejects oversized schema strings', /ValidateMcpStringArgument[\s\S]*?characters or fewer/u],
    ['protocol', 'tools/call rejects control characters in schema strings', /ValidateMcpStringArgument[\s\S]*?char\.IsControl[\s\S]*?control characters/u],
    ['protocol', 'createGameObject rejects conflicting parent aliases', /ReadMcpCreateGameObjectParentId[\s\S]*?parent and parentId must match/u],
    ['protocol', 'tools/call validates createGameObject Vector3 schema arguments', /ValidateMcpArguments[\s\S]*?ValidateMcpVector3Arguments[\s\S]*?position[\s\S]*?rotation[\s\S]*?scale/u],
    ['protocol', 'tools/call rejects schema-invalid setField value shapes', /ValidateMcpSetFieldValueArgument[\s\S]*?ValidateMcpSetFieldValueShape[\s\S]*?string, string array, number, boolean, Vector3, or Color/u],
    ['protocol', 'tools/call rejects oversized setField string values', /MaxMcpSetFieldStringValueLength[\s\S]*?string value must be \{MaxMcpSetFieldStringValueLength\} characters or fewer/u],
    ['protocol', 'tools/call rejects control characters in setField string arrays', /CanReadMcpStringArray[\s\S]*?char\.IsControl[\s\S]*?string array items may not contain control characters/u],
    ['errors', 'parse errors use JSON-RPC -32700', /JsonRpcError\(null,\s*-32700/u],
    ['errors', 'invalid request uses JSON-RPC -32600', /JsonRpcError\([^,]+,\s*-32600/u],
    ['errors', 'invalid tool params use JSON-RPC -32602', /JsonRpcError\(id,\s*-32602,\s*"tools\/call params\.name is required"\)/u],
    ['errors', 'unknown methods use JSON-RPC -32601', /JsonRpcError\(id,\s*-32601/u],
    ['errors', 'tool exceptions return MCP isError results', /catch \(Exception ex\)[\s\S]*?JsonRpcResult\(id,\s*McpToolError\(ex\.Message\)\)/u],
    ['errors', 'direct tool exceptions return MCP isError results', /HandleToolCall[\s\S]*?catch \(Exception ex\)[\s\S]*?return McpToolError\(ex\.Message\)\.ToString\(Formatting\.None\)/u],
    ['errors', 'MCP tool error results use isError true with text content', /McpToolError[\s\S]*?\["content"\]\s*=\s*new JArray[\s\S]*?\["type"\]\s*=\s*"text"[\s\S]*?\["text"\]\s*=\s*message \?\? ""[\s\S]*?\["isError"\]\s*=\s*true/u],
    ['errors', 'unexpected JSON-RPC handler failures use server error -32000', /JsonRpcError\(id,\s*-32000,\s*ex\.Message\)/u],
    ['errors', 'license failures use server error -32001', /JsonRpcError\(id,\s*-32001,\s*accessMessage\)/u],
    ['batching', 'empty batches are rejected', /if \(batch\.Count == 0\)[\s\S]*?empty JSON-RPC batch/u],
    ['batching', 'batch size is capped', /MaxMcpJsonRpcBatchItems[\s\S]*?batch\.Count > MaxMcpJsonRpcBatchItems[\s\S]*?JSON-RPC batch may contain at most/u],
    ['batching', 'batch entries aggregate responses', /foreach \(JToken item in batch\)[\s\S]*?responses\.Add\(response\)/u],
    ['notifications', 'notifications without id are supported', /bool expectsResponse = request\.Property\("id"\) != null/u],
    ['notifications', 'notifications/initialized may omit response', /case "notifications\/initialized":[\s\S]*?return expectsResponse \? JsonRpcResult/u],
    ['security', 'listener binds loopback only', /McpListenerPrefix\s*=\s*"http:\/\/127\.0\.0\.1:38467\/"[\s\S]*?listener\.Prefixes\.Add\(McpListenerPrefix\)/u],
    ['security', 'MCP bridge checks Pro or Studio license', /GreyboxLicenseState\.CurrentCapabilities\(\)\.CanUseMcpBridge/u],
    ['security', 'MCP bridge registers project entitlement usage', /GreyboxProjectEntitlements\.RegisterCurrentProject/u],
    ['security', 'MCP HTTP routes require local bearer token', /IsAuthorizedMcpRequest\(ctx\.Request[\s\S]*?mcp_auth_required/u],
    ['security', 'MCP HTTP Host header must be loopback', /(?=[\s\S]*IsSafeMcpHostHeader\(ctx\.Request\.Headers\["Host"\] \?\? ctx\.Request\.UserHostName \?\? ""\))(?=[\s\S]*mcp_host_forbidden)(?=[\s\S]*IsLoopbackMcpHost)/u],
    ['security', 'MCP authorization accepts Authorization bearer header', /request\.Headers\["Authorization"\][\s\S]*?McpAuthorizationHeaderMatches\(authorization,\s*expected\)/u],
    ['security', 'MCP authorization accepts explicit local token header', /request\.Headers\["X-Greybox-Mcp-Token"\][\s\S]*?McpTokenMatches\(tokenHeader,\s*expected\)/u],
    ['security', 'MCP token comparisons are fixed-time backed', /McpTokenMatches[\s\S]*?FixedTimeEquals[\s\S]*?diff \|=/u],
    ['security', 'MCP request bodies are size capped before parsing', /(?=[\s\S]*MaxMcpRequestBodyBytes)(?=[\s\S]*ContentLength64)(?=[\s\S]*ReadMcpRequestBody)(?=[\s\S]*mcp_request_too_large)/u],
    ['security', 'scene hierarchy export is node and depth capped', /MaxMcpSceneHierarchyNodes[\s\S]*?MaxMcpSceneHierarchyDepth[\s\S]*?McpHierarchyBudget[\s\S]*?childrenTruncated[\s\S]*?mcpHierarchy/u],
    ['security', 'scene hierarchy receipt health uses strict generated receipt lookup', /(?=[\s\S]*IsSafeMcpImportReceiptPath)(?=[\s\S]*GreyboxGeneratedAssetPaths\.Root \+ "\/")(?=[\s\S]*EndsWith\("\.asset")(?=[\s\S]*GreyboxGeneratedAssetPaths\.ReceiptsFolder)(?=[\s\S]*AssetDatabase\.LoadAssetAtPath<GreyboxImportReceipt>)/u],
    ['security', 'scene hierarchy receipt health is bounded', /MaxMcpImportReceiptSummaryEntries[\s\S]*?DescribeImportReceiptSummary[\s\S]*?generatedAssetPathsTruncated[\s\S]*?addressableLabelsTruncated[\s\S]*?missingReferencesTruncated[\s\S]*?BoundedMissingReferenceArray/u],
    ['security', 'MCP mutating tools require stable editor state', /InvokeUnityTool[\s\S]*?IsUnityEditorReadyForMcpMutation\(name,\s*out string editorStateMessage\)[\s\S]*?EditorApplication\.isCompiling[\s\S]*?EditorApplication\.isUpdating[\s\S]*?EditorApplication\.isPlayingOrWillChangePlaymode[\s\S]*?IsMcpMutationTool/u],
    ['security', 'MCP JSON-RPC and tool calls are POST-only', /IsAllowedMcpHttpMethod[\s\S]*?tools\/list[\s\S]*?method == "GET"[\s\S]*?return method == "POST"/u],
    ['security', 'MCP POST routes require JSON content type', /IsAllowedMcpContentType[\s\S]*?mcp_unsupported_media_type[\s\S]*?application\/json/u],
    ['security', 'MCP mutation tools require Unity Component types', /RequireComponentType[\s\S]*?typeof\(Component\)\.IsAssignableFrom/u],
    ['security', 'MCP addComponent rejects abstract component types', /type\.IsAbstract[\s\S]*?Component type is not addable/u],
    ['unity action', 'addComponent returns component detail metadata', /AddComponent[\s\S]*?componentName[\s\S]*?componentDetail[\s\S]*?DescribeComponent\(component\)/u],
    ['unity action', 'scene hierarchy exposes addable component hints', /addableComponents[\s\S]*?DescribeAddableComponents[\s\S]*?RecommendedMcpAddableComponentTypes[\s\S]*?unity\.addComponent[\s\S]*?alreadyAttached[\s\S]*?canAdd/u],
    ['unity action', 'addComponent only accepts advertised component hints', /AddComponent[\s\S]*?ResolveMcpAddableComponentType[\s\S]*?IsRecommendedMcpAddableComponentType[\s\S]*?Component type is not advertised by scene hierarchy addableComponents/u],
    ['unity action', 'addComponent rejects duplicate single-instance components', /RequireCanAddMcpComponent[\s\S]*?AllowsMultipleMcpComponent[\s\S]*?single-instance/u],
    ['unity action', 'scene hierarchy exposes prefab source metadata', /DescribeUnityPrefabMetadata[\s\S]*?GetPrefabAssetPathOfNearestInstanceRoot[\s\S]*?nearestPrefabAssetPath/u],
    ['unity action', 'scene hierarchy exposes writable GameObject metadata fields', /writableGameObjectFields(?=[\s\S]*DescribeWritableGameObjectFields)(?=[\s\S]*acceptedAliases)(?=[\s\S]*propagatesToChildren)(?=[\s\S]*allowedTags)(?=[\s\S]*allowedLayers)(?=[\s\S]*previousLayerName)(?=[\s\S]*layerName)(?=[\s\S]*unityTag)(?=[\s\S]*unityLayer)(?=[\s\S]*unityActive)/u],
    ['unity action', 'scene hierarchy exposes writable setField properties', /writableProperties[\s\S]*?DescribeWritableProperties[\s\S]*?setTool[\s\S]*?unity\.setField[\s\S]*?allowedEnumValues[\s\S]*?Enum\.GetNames/u],
    ['unity action', 'scene hierarchy labels writable setField properties', /DescribeWritableProperty[\s\S]*?memberKind[\s\S]*?property[\s\S]*?setTool[\s\S]*?unity\.setField/u],
    ['unity action', 'scene hierarchy exposes writable setField fields', /writableFields[\s\S]*?DescribeWritableFields[\s\S]*?DescribeWritableField[\s\S]*?memberKind[\s\S]*?field[\s\S]*?unity\.setField/u],
    ['unity action', 'scene hierarchy raw fields use serialized field filter', /DescribeComponent[\s\S]*?foreach \(FieldInfo field[\s\S]*?IsWritableMcpValueField\(field\)[\s\S]*?fields\[field\.Name\]/u],
    ['unity action', 'scene hierarchy exposes setField value schemas', /valueSchema[\s\S]*?DescribeMcpValueSchema[\s\S]*?kind[\s\S]*?vector3[\s\S]*?kind[\s\S]*?color[\s\S]*?allowedEnumValues/u],
    ['unity action', 'scene hierarchy exposes assignable asset reference fields', /assetReferenceFields[\s\S]*?DescribeAssetReferenceFields[\s\S]*?assignTool[\s\S]*?unity\.assignAsset/u],
    ['unity action', 'assignAsset returns previous asset metadata', /(?=[\s\S]*AssignAsset)(?=[\s\S]*previousAssetPath)(?=[\s\S]*previousAssetGuid)(?=[\s\S]*previousObjectName)(?=[\s\S]*objectName)/u],
    ['unity action', 'assignAsset rejects non-canonical asset paths before lookup', /NormalizeMcpAssetPath[\s\S]*?canonical project-relative Assets\/[\s\S]*?IsSafeProjectAssetPath[\s\S]*?Length < 8[\s\S]*?IndexOf\('\\\\'\)[\s\S]*?char\.IsControl/u],
    ['unity action', 'runEditModeTest invokes Unity Test Runner', /UnityEditor\.TestTools\.TestRunner\.Api\.TestRunnerApi[\s\S]*?GetMethod\("Execute"[\s\S]*?execute\.Invoke\(api/u],
    ['unity action', 'runEditModeTest targets EditMode', /Enum\.Parse\(testModeType,\s*"EditMode"\)/u],
    ['unity action', 'runEditModeTest captures Unity Test Runner run guid', /NormalizeMcpUnityRunGuid\(\s*execute\.Invoke\(api,\s*new\[\]\s*\{\s*settings\s*\}\)\s*\)/u],
    ['unity action', 'runEditModeTest returns deterministic async result contract', /DescribeMcpEditModeTestSubmission[\s\S]*?\["runId"\]\s*=\s*runId[\s\S]*?\["sanitizedTestName"\]\s*=\s*testName[\s\S]*?\["testNameLength"\]\s*=\s*testName\.Length[\s\S]*?\["submittedAtUtc"\]\s*=\s*submittedAtUtc[\s\S]*?\["editModeFilter"\][\s\S]*?\["resultContract"\][\s\S]*?CreateMcpEditModeTestRunId/u],
    ['unity action', 'runEditModeTest waits on Unity Test Runner callbacks', /SubmitMcpEditModeTestRunAndWait[\s\S]*?UnityEditor\.TestTools\.TestRunner\.Api\.ICallbacks[\s\S]*?RegisterMcpTestRunCallbacks[\s\S]*?Task\.WhenAny[\s\S]*?RunFinished/u],
    ['unity action', 'runEditModeTest returns final pass fail evidence when completed', /DescribeMcpEditModeTestCompletion[\s\S]*?\["completed"\]\s*=\s*true[\s\S]*?\["status"\]\s*=\s*status[\s\S]*?\["result"\]\s*=\s*result[\s\S]*?\["testResults"\]\s*=\s*testResults[\s\S]*?\["finalResultInResponse"\]\s*=\s*true/u],
    ['security', 'runEditModeTest rejects path and secret test names', /NormalizeMcpTestName[\s\S]*?IndexOf\('\/'\)[\s\S]*?IndexOf\('\\\\'\)[\s\S]*?ContainsMcpSensitiveText[\s\S]*?testName may not contain paths or secrets/u],
    ['unity action', 'screenshot tool sizes Game View before capture', /TryApplyGameViewSize\(width,\s*height[\s\S]*?ScreenCapture\.CaptureScreenshot/u],
    ['unity action', 'screenshot tool returns MCP-readable local path metadata', /CaptureGameViewScreenshot[\s\S]*?Path\.GetFullPath\(path\)[\s\S]*?DescribeMcpScreenshotCapture[\s\S]*?\["absolutePath"\]\s*=\s*absolutePath[\s\S]*?\["fileName"\]\s*=\s*Path\.GetFileName\(path\)[\s\S]*?\["asyncCapture"\]\s*=\s*true[\s\S]*?\["pollAfterMs"\]\s*=\s*McpScreenshotPollAfterMs/u],
    ['unity action', 'addressables tool flushes tags before build', /(?=[\s\S]*AddressablesTagger\.FlushPending\(\))(?=[\s\S]*System\.Diagnostics\.Stopwatch\.StartNew)(?=[\s\S]*AddressableAssetSettings\.BuildPlayerContent\(\))(?=[\s\S]*AnnotateAddressablesBuildTiming)(?=[\s\S]*buildDurationMs)(?=[\s\S]*buildCompletedAtUtc)(?=[\s\S]*labelCounts)(?=[\s\S]*missingLabels)(?=[\s\S]*generatedEntries)(?=[\s\S]*assetExists)(?=[\s\S]*assetType)/u],
    ['unity action', 'mutation tools mark scenes dirty and report dirty state', /(?=[\s\S]*MarkMcpEditedSceneDirty)(?=[\s\S]*EditorSceneManager\.MarkSceneDirty)(?=[\s\S]*sceneDirty)/u],
    ['field types', 'setField accepts int values', /if \(targetType == typeof\(int\)\) return ReadMcpIntFieldValue\(token,\s*targetType\)/u],
    ['field types', 'setField accepts float values', /if \(targetType == typeof\(float\)\) return ReadMcpFloatFieldValue\(token,\s*targetType\)/u],
    ['field types', 'setField accepts string values', /if \(targetType == typeof\(string\)\) return ReadMcpStringFieldValue\(token,\s*targetType\)/u],
    ['field types', 'setField accepts Color values', /if \(targetType == typeof\(Color\)\) return ReadColor\(token\)/u],
    ['field types', 'setField accepts Vector3 values', /if \(targetType == typeof\(Vector3\)\) return ReadVector3\(token\)/u],
    ['field types', 'Vector3 conversion rejects loose shapes', /ReadVector3[\s\S]*?exactly 3 numbers[\s\S]*?numeric x\/y\/z/u],
    ['field types', 'Color conversion rejects loose shapes', /ReadColor[\s\S]*?6- or 8-digit[\s\S]*?exactly 3 or 4 numbers[\s\S]*?numeric r\/g\/b/u],
    ['field types', 'scalar conversion rejects string coercion', /ReadMcpStringFieldValue[\s\S]*?must be a JSON string[\s\S]*?ReadMcpIntFieldValue[\s\S]*?must be a JSON integer[\s\S]*?ReadMcpBoolFieldValue[\s\S]*?must be a JSON boolean/u],
    ['field types', 'integer conversion rejects out-of-range values', /ReadMcpIntFieldValue[\s\S]*?ReadMcpInt32Value[\s\S]*?32-bit integer/u],
    ['field types', 'numeric conversion rejects non-finite values', /IsJsonFiniteNumber[\s\S]*?double\.IsNaN[\s\S]*?double\.IsInfinity[\s\S]*?ReadFiniteFloat[\s\S]*?float\.IsNaN[\s\S]*?float\.IsInfinity/u],
    ['field types', 'enum conversion rejects unnamed numeric values', /ConvertEnumValue[\s\S]*?Enum value must be a string[\s\S]*?Enum\.IsDefined[\s\S]*?named enum value/u],
    ['field types', 'setField resolver rejects unadvertised member surfaces', /ResolveAssignableMember[\s\S]*?IsResolvableMcpAssignableField[\s\S]*?IsEditorSerializedMcpField[\s\S]*?field\.IsNotSerialized[\s\S]*?NonSerializedAttribute[\s\S]*?HideInInspector[\s\S]*?IsResolvableMcpAssignableProperty[\s\S]*?DeclaringType == typeof\(UnityEngine\.Object\)[\s\S]*?ObsoleteAttribute/u],
    ['field types', 'assignAsset resolver rejects unadvertised member surfaces', /(?=[\s\S]*AssignAsset[\s\S]*?ResolveAssignableAssetMember)(?=[\s\S]*IsAssignableAssetReferenceField[\s\S]*?IsEditorSerializedMcpField[\s\S]*?field\.IsNotSerialized[\s\S]*?HideInInspector)(?=[\s\S]*IsAssignableAssetReferenceProperty[\s\S]*?ObsoleteAttribute[\s\S]*?property\.Name != "material")/u],
  ]) {
    const [category, name, pattern] = item;
    addCheck(checks, category, name, pattern.test(server), pattern.source);
  }
  addCheck(
    checks,
    'security',
    'MCP token is editor-only and generated with CSPRNG',
    /GetOrCreateMcpBridgeToken[\s\S]*?RotateMcpBridgeToken[\s\S]*?RandomNumberGenerator\.Fill/u.test(settings),
    'GreyboxSettings.GetOrCreateMcpBridgeToken + RandomNumberGenerator.Fill',
  );
  addCheck(
    checks,
    'security',
    'Studio window can copy and rotate MCP token',
    /Copy MCP Config[\s\S]*?GetOrCreateMcpBridgeToken[\s\S]*?Rotate MCP Token[\s\S]*?RotateMcpBridgeToken/u.test(studioWindow),
    'Copy MCP Config + Rotate MCP Token',
  );

  const status = checks.every((check) => check.status === 'pass') ? 'pass' : 'fail';
  return {
    generatedAt: 'deterministic',
    status,
    protocolVersion: '2024-11-05',
    endpoint: 'http://127.0.0.1:38467/mcp',
    tools,
    checks,
  };
}

export function formatMcpConformanceMarkdown(report) {
  const lines = [
    '# Greybox Unity MCP Conformance',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    `Endpoint: \`${report.endpoint}\``,
    `Protocol version: \`${report.protocolVersion}\``,
    `Tools: ${report.tools.length}`,
    '',
    '## Checks',
    '',
    '| Category | Check | Status | Evidence |',
    '| --- | --- | --- | --- |',
  ];
  for (const check of report.checks) {
    lines.push(`| ${escapeTableCell(check.category)} | ${escapeTableCell(check.name)} | ${check.status} | ${escapeTableCell(check.evidence)} |`);
  }
  lines.push(
    '',
    '## Tool Surface',
    '',
    '| Tool | Required fields |',
    '| --- | --- |',
  );
  for (const tool of report.tools) {
    lines.push(`| \`${tool.name}\` | ${requiredFields(tool).join(', ') || '-'} |`);
  }
  lines.push(
    '',
    '## Transcript Fixtures',
    '',
    '```json',
    JSON.stringify({
      initialize: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: report.protocolVersion } },
      list: { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      call: { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'unity.getSceneHierarchy', arguments: {} } },
      initializedNotification: { jsonrpc: '2.0', method: 'notifications/initialized' },
    }, null, 2),
    '```',
    '',
  );
  return lines.join('\n');
}

function addCheck(checks, category, name, passed, evidence) {
  checks.push({
    category,
    name,
    status: passed ? 'pass' : 'fail',
    evidence: String(evidence ?? ''),
  });
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function extractCSharpStringConstant(source, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`private\\s+const\\s+string\\s+${escapedName}\\s*=\\s*"([^"]*)"`, 'u'));
  return match?.[1] ?? '';
}

function sameList(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function requiredFields(tool) {
  return Array.isArray(tool.inputSchema?.required) ? tool.inputSchema.required : [];
}

function escapeTableCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function main() {
  const options = parseMcpConformanceArgs(process.argv.slice(2));
  const root = resolve(options.root || join(dirname(fileURLToPath(import.meta.url)), '..'));
  const report = buildMcpConformanceReport({ root });
  if (options.output) {
    const output = resolve(root, options.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${formatMcpConformanceMarkdown(report)}\n`);
  }
  console.log(`${report.status === 'pass' ? 'PASS' : 'FAIL'} MCP conformance ${report.checks.filter((check) => check.status === 'pass').length}/${report.checks.length} checks`);
  if (report.status !== 'pass') process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
