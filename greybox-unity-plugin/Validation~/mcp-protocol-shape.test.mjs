// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { REQUIRED_MCP_TOOLS, SAFE_ASSET_PATH_PATTERN } from './mcp-conformance-report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('MCP tool definitions expose schemas for every Unity tool', () => {
  const definitions = readFileSync(join(root, 'Editor/McpBridge/McpToolDefinitions.cs'), 'utf8');
  const toolsJson = extractVerbatimJsonReturn(definitions);
  const document = JSON.parse(toolsJson);
  assert.ok(Array.isArray(document.tools));
  assert.deepEqual(document.tools.map((tool) => tool.name), REQUIRED_MCP_TOOLS);
  for (const tool of document.tools) {
    assert.equal(tool.inputSchema?.type, 'object', `${tool.name} must expose an object input schema`);
    assert.equal(tool.inputSchema?.additionalProperties, false, `${tool.name} must reject unknown arguments`);
    assert.equal(typeof tool.annotations?.title, 'string', `${tool.name} must expose an annotation title`);
    assert.equal(typeof tool.annotations?.readOnlyHint, 'boolean', `${tool.name} must expose readOnlyHint`);
    assert.equal(typeof tool.annotations?.destructiveHint, 'boolean', `${tool.name} must expose destructiveHint`);
    assert.equal(typeof tool.annotations?.idempotentHint, 'boolean', `${tool.name} must expose idempotentHint`);
    assert.equal(typeof tool.annotations?.openWorldHint, 'boolean', `${tool.name} must expose openWorldHint`);
  }
  assert.equal(document.tools.find((tool) => tool.name === 'unity.getSceneHierarchy').annotations.readOnlyHint, true);
  assert.equal(document.tools.find((tool) => tool.name === 'unity.getSceneHierarchy').annotations.idempotentHint, true);
  assert.equal(document.tools.filter((tool) => tool.name !== 'unity.getSceneHierarchy').every((tool) => tool.annotations.readOnlyHint === false), true);
  assert.equal(document.tools.every((tool) => tool.annotations.destructiveHint === false && tool.annotations.openWorldHint === false), true);
  const createGameObject = document.tools.find((tool) => tool.name === 'unity.createGameObject');
  assert.equal(createGameObject.inputSchema.properties.parent.type, 'string');
  assert.equal(createGameObject.inputSchema.properties.parentId.type, 'string');
  assert.equal(createGameObject.inputSchema.properties.name.minLength, 1);
  assert.equal(createGameObject.inputSchema.properties.name.maxLength, 128);
  assert.match(createGameObject.inputSchema.properties.position.description, /Local Vector3/u);
  assert.match(createGameObject.inputSchema.properties.rotation.description, /Local Euler Vector3/u);
  assert.match(createGameObject.inputSchema.properties.scale.description, /Local Vector3/u);
  assert.equal(createGameObject.inputSchema.properties.position.$ref, '#/$defs/vector3');
  assert.equal(createGameObject.inputSchema.properties.rotation.$ref, '#/$defs/vector3');
  assert.equal(createGameObject.inputSchema.properties.scale.$ref, '#/$defs/vector3');
  assert.deepEqual(createGameObject.inputSchema.$defs.vector3.oneOf[0].required, ['x', 'y', 'z']);
  assert.equal(createGameObject.inputSchema.$defs.vector3.oneOf[0].additionalProperties, false);
  assert.equal(createGameObject.inputSchema.$defs.vector3.oneOf[1].minItems, 3);
  assert.equal(createGameObject.inputSchema.$defs.vector3.oneOf[1].maxItems, 3);

  const setField = document.tools.find((tool) => tool.name === 'unity.setField');
  assert.equal(setField.inputSchema.properties.fieldName.minLength, 1);
  assert.equal(setField.inputSchema.properties.fieldName.maxLength, 128);
  assert.equal(setField.inputSchema.properties.value.oneOf.find((variant) => variant.type === 'string').maxLength, 4096);
  const setFieldStringArray = setField.inputSchema.properties.value.oneOf.find((variant) => variant.type === 'array' && variant.items?.type === 'string');
  assert.equal(setFieldStringArray.maxItems, 64);
  assert.equal(setFieldStringArray.items.maxLength, 256);
  assert.equal(setFieldStringArray.items.pattern, '^(?!.*[\\x00-\\x1F\\x7F-\\x9F]).*$');
  assert.ok(setField.inputSchema.properties.value.oneOf.some((variant) => variant.$ref === '#/$defs/vector3'));
  assert.ok(setField.inputSchema.properties.value.oneOf.some((variant) => variant.$ref === '#/$defs/color'));
  assert.match(setField.inputSchema.$defs.color.oneOf[0].pattern, /\^#\?/u);

  const assignAsset = document.tools.find((tool) => tool.name === 'unity.assignAsset');
  assert.equal(assignAsset.inputSchema.properties.assetPath.pattern, SAFE_ASSET_PATH_PATTERN);
  assert.equal(assignAsset.inputSchema.properties.assetPath.maxLength, 512);

  const runEditModeTest = document.tools.find((tool) => tool.name === 'unity.runEditModeTest');
  assert.equal(runEditModeTest.inputSchema.properties.testName.minLength, 1);
  assert.equal(runEditModeTest.inputSchema.properties.testName.maxLength, 256);
  assert.equal(runEditModeTest.inputSchema.properties.testName.pattern, '^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$');
  const testNamePattern = new RegExp(runEditModeTest.inputSchema.properties.testName.pattern);
  assert.equal(testNamePattern.test('Greybox.Tests.EditMode.McpBridgeTests.McpRunAndScreenshotInputsAreBounded'), true);
  assert.equal(testNamePattern.test('   '), false);
  assert.equal(testNamePattern.test('Greybox.Tests.Bad\nName'), false);

  const screenshot = document.tools.find((tool) => tool.name === 'unity.captureGameViewScreenshot');
  assert.equal(screenshot.inputSchema.properties.width.type, 'integer');
  assert.equal(screenshot.inputSchema.properties.width.minimum, 64);
  assert.equal(screenshot.inputSchema.properties.width.maximum, 4096);
  assert.equal(screenshot.inputSchema.properties.height.type, 'integer');
  assert.equal(screenshot.inputSchema.properties.height.minimum, 64);
  assert.equal(screenshot.inputSchema.properties.height.maximum, 4096);
});

test('MCP JSON-RPC handler returns initialize, list, call, and error envelopes', () => {
  const server = readFileSync(join(root, 'Editor/McpBridge/GreyboxMcpServer.cs'), 'utf8');
  const packageVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  assert.match(server, /catch \(JsonReaderException ex\)[\s\S]*?JsonRpcError\(null,\s*-32700/);
  assert.match(server, /rawJsonRpc\.Type != JTokenType\.String[\s\S]*?JsonRpcError\(id,\s*-32600,\s*"jsonrpc must be a string"\)/);
  assert.match(server, /rawJsonRpc\?\.Value<string>\(\) != "2\.0"[\s\S]*?JsonRpcError\(id,\s*-32600/);
  assert.match(server, /rawMethod\.Type != JTokenType\.String[\s\S]*?JsonRpcError\(id,\s*-32600,\s*"method must be a string"\)/);
  assert.match(server, /string\.IsNullOrWhiteSpace\(method\)[\s\S]*?JsonRpcError\(id,\s*-32600,\s*"method is required"\)/);
  assert.match(server, /case "initialize":[\s\S]*?\["protocolVersion"\]\s*=\s*"2024-11-05"/);
  assert.match(server, /case "initialize":[\s\S]*?\["capabilities"\]\s*=\s*new JObject \{ \["tools"\]/);
  assert.ok(server.includes(`private const string McpServerVersion = "${packageVersion}";`));
  assert.match(server, /case "initialize":[\s\S]*?\["serverInfo"\][\s\S]*?\["version"\]\s*=\s*McpServerVersion/);
  assert.match(server, /case "tools\/list":[\s\S]*?JsonRpcResult\(id,\s*JObject\.Parse\(McpToolDefinitions\.ToolsJson\(\)\)\)/);
  assert.match(server, /case "tools\/call":[\s\S]*?IsMcpBridgeAllowed\(activeConfig/);
  assert.match(server, /IsAuthorizedMcpRequest\(ctx\.Request[\s\S]*?mcp_auth_required/);
  assert.match(server, /request\.Headers\["Authorization"\][\s\S]*?McpAuthorizationHeaderMatches\(authorization,\s*expected\)/);
  assert.match(server, /request\.Headers\["X-Greybox-Mcp-Token"\][\s\S]*?McpTokenMatches\(tokenHeader,\s*expected\)/);
  assert.match(server, /McpTokenMatches[\s\S]*?FixedTimeEquals[\s\S]*?diff \|=/);
  assert.match(server, /MaxMcpRequestBodyBytes/);
  assert.match(server, /McpScreenshotPollAfterMs/);
  assert.match(server, /ContentLength64/);
  assert.match(server, /ReadMcpRequestBody/);
  assert.match(server, /mcp_request_too_large/);
  assert.match(server, /IsAllowedMcpHttpMethod/);
  assert.match(server, /mcp_method_not_allowed/);
  assert.match(server, /path == "\/tools\/list"[\s\S]*?method == "GET"[\s\S]*?return method == "POST"/);
  assert.match(server, /case "tools\/call":[\s\S]*?params must be an object/);
  assert.match(server, /case "tools\/call":[\s\S]*?params\.name must be a string/);
  assert.match(server, /case "tools\/call":[\s\S]*?tools\/call params\.name is required/);
  assert.match(server, /case "tools\/call":[\s\S]*?params\.arguments must be an object/);
  assert.match(server, /case "tools\/call":[\s\S]*?\["content"\]\s*=\s*new JArray/);
  assert.match(server, /case "tools\/call":[\s\S]*?\["structuredContent"\]\s*=\s*structuredResult/);
  assert.match(server, /case "tools\/call":[\s\S]*?JsonRpcResult\(id,\s*McpToolSuccess\(structured\)\)/);
  assert.match(server, /case "tools\/call":[\s\S]*?JsonRpcResult\(id,\s*McpToolError\(ex\.Message\)\)/);
  assert.match(server, /McpToolSuccess[\s\S]*?\["isError"\]\s*=\s*false/);
  assert.match(server, /DirectToolSuccess[\s\S]*?\["structuredContent"\]\s*=\s*structuredResult/);
  assert.match(server, /DirectToolSuccess[\s\S]*?\["isError"\]\s*=\s*false/);
  assert.match(server, /McpToolError[\s\S]*?\["type"\]\s*=\s*"text"[\s\S]*?\["text"\]\s*=\s*message \?\? ""[\s\S]*?\["isError"\]\s*=\s*true/);
  assert.match(server, /HandleToolCall[\s\S]*?TryReadDirectToolCallRequest[\s\S]*?mcp_invalid_tool_call/);
  assert.match(server, /HandleToolCall[\s\S]*?DirectToolSuccess\(structured\)/);
  assert.match(server, /HandleToolCall[\s\S]*?return McpToolError\(ex\.Message\)\.ToString\(Formatting\.None\)/);
  assert.match(server, /TryReadDirectToolCallRequest[\s\S]*?tools\/call body must be an object/);
  assert.match(server, /TryReadDirectToolCallRequest[\s\S]*?tools\/call name must be a string/);
  assert.match(server, /TryReadDirectToolCallRequest[\s\S]*?tools\/call arguments must be an object/);
  assert.match(server, /InvokeUnityTool[\s\S]*?ValidateMcpArguments\(name,\s*args\)[\s\S]*?Unexpected argument for/);
  assert.match(server, /InvokeUnityTool[\s\S]*?IsUnityEditorReadyForMcpMutation\(name,\s*out string editorStateMessage\)[\s\S]*?EditorApplication\.isCompiling[\s\S]*?EditorApplication\.isUpdating[\s\S]*?EditorApplication\.isPlayingOrWillChangePlaymode[\s\S]*?IsMcpMutationTool/);
  assert.match(server, /ValidateMcpArguments[\s\S]*?RequireMcpArgument[\s\S]*?Missing required argument for/);
  assert.match(server, /ValidateMcpArguments[\s\S]*?RequireMcpIntegerArgument[\s\S]*?must be an integer/);
  assert.match(server, /RequireMcpIntegerArgument[\s\S]*?ReadMcpInt32Value[\s\S]*?32-bit integer/);
  assert.match(server, /ValidateMcpArguments[\s\S]*?RequireMcpStringArgument[\s\S]*?must be a string/);
  assert.match(server, /ValidateMcpStringArgument[\s\S]*?characters or fewer/);
  assert.match(server, /ReadMcpCreateGameObjectParentId[\s\S]*?parent and parentId must match/);
  assert.match(server, /ValidateMcpArguments[\s\S]*?ValidateMcpVector3Arguments[\s\S]*?position[\s\S]*?rotation[\s\S]*?scale/);
  assert.match(server, /ValidateMcpSetFieldValueArgument[\s\S]*?ValidateMcpSetFieldValueShape[\s\S]*?string, string array, number, boolean, Vector3, or Color/);
  assert.match(server, /MaxMcpSetFieldStringValueLength[\s\S]*?string value must be \{MaxMcpSetFieldStringValueLength\} characters or fewer/);
  assert.match(server, /ReadMcpStringFieldValue[\s\S]*?must be a JSON string[\s\S]*?ReadMcpIntFieldValue[\s\S]*?must be a JSON integer[\s\S]*?ReadMcpBoolFieldValue[\s\S]*?must be a JSON boolean/);
  assert.match(server, /ReadMcpIntFieldValue[\s\S]*?ReadMcpInt32Value[\s\S]*?32-bit integer/);
  assert.match(server, /CaptureGameViewScreenshot[\s\S]*?Path\.GetFullPath\(path\)[\s\S]*?DescribeMcpScreenshotCapture[\s\S]*?\["absolutePath"\]\s*=\s*absolutePath[\s\S]*?\["fileName"\]\s*=\s*Path\.GetFileName\(path\)[\s\S]*?\["asyncCapture"\]\s*=\s*true[\s\S]*?\["pollAfterMs"\]\s*=\s*McpScreenshotPollAfterMs/);
  assert.match(server, /IsJsonFiniteNumber[\s\S]*?double\.IsNaN[\s\S]*?double\.IsInfinity[\s\S]*?ReadFiniteFloat[\s\S]*?float\.IsNaN[\s\S]*?float\.IsInfinity/);
  assert.match(server, /ReadVector3[\s\S]*?exactly 3 numbers[\s\S]*?numeric x\/y\/z/);
  assert.match(server, /ReadColor[\s\S]*?6- or 8-digit[\s\S]*?exactly 3 or 4 numbers[\s\S]*?numeric r\/g\/b/);
  assert.match(server, /ConvertEnumValue[\s\S]*?Enum value must be a string[\s\S]*?Enum\.IsDefined[\s\S]*?named enum value/);
  assert.match(server, /private static JObject JsonRpcResult[\s\S]*?\["jsonrpc"\]\s*=\s*"2.0"[\s\S]*?\["result"\]\s*=\s*result/);
  assert.match(server, /private static JObject JsonRpcError[\s\S]*?\["error"\]\s*=\s*new JObject[\s\S]*?\["code"\]\s*=\s*code[\s\S]*?\["message"\]\s*=\s*message/);
});

test('MCP JSON-RPC handler supports batches and notifications', () => {
  const server = readFileSync(join(root, 'Editor/McpBridge/GreyboxMcpServer.cs'), 'utf8');
  assert.match(server, /if \(batch\.Count == 0\)[\s\S]*?empty JSON-RPC batch/);
  assert.match(server, /MaxMcpJsonRpcBatchItems[\s\S]*?batch\.Count > MaxMcpJsonRpcBatchItems[\s\S]*?JSON-RPC batch may contain at most/);
  assert.match(server, /parsed is JArray batch[\s\S]*?var responses = new JArray\(\)/);
  assert.match(server, /foreach \(JToken item in batch\)[\s\S]*?responses\.Add\(response\)/);
  assert.match(server, /responses\.Count == 0 \? "" : responses\.ToString\(Formatting\.None\)/);
  assert.match(server, /bool expectsResponse = request\.Property\("id"\) != null/);
  assert.match(server, /!expectsResponse && method != "notifications\/initialized"[\s\S]*?return null/);
  assert.match(server, /case "notifications\/initialized":[\s\S]*?return expectsResponse \? JsonRpcResult/);
  assert.match(server, /return response == null \? "" : response\.ToString\(Formatting\.None\)/);
});

test('MCP scene hierarchy export is bounded', () => {
  const server = readFileSync(join(root, 'Editor/McpBridge/GreyboxMcpServer.cs'), 'utf8');
  assert.match(server, /MaxMcpSceneHierarchyNodes/);
  assert.match(server, /MaxMcpSceneHierarchyDepth/);
  assert.match(server, /new McpHierarchyBudget\(MaxMcpSceneHierarchyNodes,\s*MaxMcpSceneHierarchyDepth\)/);
  assert.match(server, /depth >= budget\.MaxDepth[\s\S]*?childrenTruncated = true[\s\S]*?MarkDepthExceeded/);
  assert.match(server, /!budget\.HasNodeCapacity[\s\S]*?childrenTruncated = true[\s\S]*?MarkNodeBudgetExceeded/);
  assert.match(server, /\["mcpHierarchy"\]\s*=\s*new JObject[\s\S]*?\["childrenTruncated"\][\s\S]*?\["nodeBudgetExceeded"\][\s\S]*?\["depthExceeded"\]/);
});

function extractVerbatimJsonReturn(source) {
  const match = source.match(/return @\"([\s\S]*?)\";\s*\n\s*\}/);
  assert.ok(match, 'expected a C# verbatim JSON return string');
  return match[1].replaceAll('""', '"');
}
