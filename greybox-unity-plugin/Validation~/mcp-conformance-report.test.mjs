// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  REQUIRED_MCP_TOOLS,
  buildMcpConformanceReport,
  extractToolDefinitions,
  formatMcpConformanceMarkdown,
  parseMcpConformanceArgs,
} from './mcp-conformance-report.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('MCP conformance args capture root and output paths', () => {
  assert.deepEqual(parseMcpConformanceArgs([
    '--root',
    '/tmp/greybox-unity-plugin',
    '--output',
    'Validation~/artifacts/mcp-conformance.md',
  ]), {
    root: '/tmp/greybox-unity-plugin',
    output: 'Validation~/artifacts/mcp-conformance.md',
  });
});

test('MCP conformance report passes for the real package', () => {
  const report = buildMcpConformanceReport({ root });
  assert.equal(report.status, 'pass');
  assert.deepEqual(report.tools.map((tool) => tool.name), REQUIRED_MCP_TOOLS);
  assert.ok(report.checks.some((check) => check.name === 'all MCP tools advertise safety annotations' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP annotations distinguish read-only and mutating tools' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call returns structuredContent' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'JSON-RPC envelope rejects non-string versions' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'initialize serverInfo version matches package.json' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call marks successful tool results as non-errors' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'direct tools/call returns structuredContent' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'direct tools/call marks successful tool results as non-errors' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tool exceptions return MCP isError results' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'direct tool exceptions return MCP isError results' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP tool error results use isError true with text content' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unexpected JSON-RPC handler failures use server error -32000' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'JSON-RPC envelope rejects non-string methods' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects non-object params' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects non-string names' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects non-object arguments' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'direct tools/call rejects non-object bodies' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'direct tools/call rejects non-string names' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'direct tools/call rejects non-object arguments' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects arguments outside the advertised schemas' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects missing required schema arguments' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects non-integer screenshot dimensions' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects out-of-range integer arguments' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects non-string schema arguments' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects oversized schema strings' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'createGameObject rejects conflicting parent aliases' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call validates createGameObject Vector3 schema arguments' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects schema-invalid setField value shapes' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects oversized setField string values' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects control characters in setField string arrays' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'runEditModeTest invokes Unity Test Runner' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'runEditModeTest waits on Unity Test Runner callbacks' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'runEditModeTest returns final pass fail evidence when completed' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'screenshot tool returns MCP-readable local path metadata' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'mutation tools mark scenes dirty and report dirty state' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP request bodies are size capped before parsing' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy receipt health uses strict generated receipt lookup' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy receipt health is bounded' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP JSON-RPC and tool calls are POST-only' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP POST routes require JSON content type' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP HTTP Host header must be loopback' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP mutating tools require stable editor state' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP mutation tools require Unity Component types' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'MCP addComponent rejects abstract component types' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'addComponent returns component detail metadata' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy exposes addable component hints' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'addComponent only accepts advertised component hints' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'addComponent rejects duplicate single-instance components' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy exposes prefab source metadata' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy exposes writable GameObject metadata fields' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy exposes writable setField properties' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy exposes writable setField fields' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy raw fields use serialized field filter' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy exposes setField value schemas' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy exposes assignable asset reference fields' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'assignAsset returns previous asset metadata' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'assignAsset rejects non-canonical asset paths before lookup' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'setField accepts Vector3 values' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'Vector3 conversion rejects loose shapes' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'Color conversion rejects loose shapes' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scalar conversion rejects string coercion' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'integer conversion rejects out-of-range values' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'numeric conversion rejects non-finite values' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'enum conversion rejects unnamed numeric values' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'setField resolver rejects unadvertised member surfaces' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'assignAsset resolver rejects unadvertised member surfaces' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'scene hierarchy labels writable setField properties' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.createGameObject advertises parent and parentId aliases' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.createGameObject advertises optional initial transform' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.createGameObject vector3 schema accepts object and array forms' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.setField advertises bounded scalar/string-array/vector/color values' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.assignAsset advertises canonical project-relative Assets paths' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.assignAsset asset paths advertise all control characters blocked' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.runEditModeTest advertises bounded control-free test names' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'mutation string arguments advertise control-free bounds' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'unity.captureGameViewScreenshot advertises bounded integer dimensions' && check.status === 'pass'));
  assert.ok(report.checks.some((check) => check.name === 'tools/call rejects control characters in schema strings' && check.status === 'pass'));
});

test('MCP conformance markdown is reviewer-readable', () => {
  const markdown = formatMcpConformanceMarkdown(buildMcpConformanceReport({ root }));
  assert.match(markdown, /# Greybox Unity MCP Conformance/u);
  assert.match(markdown, /Status: pass/u);
  assert.match(markdown, /unity\.captureGameViewScreenshot/u);
  assert.match(markdown, /tools\/call/u);
  assert.match(markdown, /structuredContent/u);
  assert.match(markdown, /isError/u);
});

test('MCP conformance fails when a required tool is not advertised', () => {
  const tmp = join(tmpdir(), `greybox-mcp-conformance-${Date.now()}`);
  mkdirSync(join(tmp, 'Editor/McpBridge'), { recursive: true });
  const definitions = readFileSync(join(root, 'Editor/McpBridge/McpToolDefinitions.cs'), 'utf8')
    .replace(/,\n    \{ ""name"": ""unity\.buildAddressables""[\s\S]*?\n  \]/u, '\n  ]');
  writeFileSync(join(tmp, 'Editor/McpBridge/McpToolDefinitions.cs'), definitions);
  writeFileSync(join(tmp, 'Editor/McpBridge/GreyboxMcpServer.cs'), readFileSync(join(root, 'Editor/McpBridge/GreyboxMcpServer.cs'), 'utf8'));

  const report = buildMcpConformanceReport({ root: tmp });
  assert.equal(report.status, 'fail');
  assert.ok(report.checks.some((check) => check.name === 'unity.buildAddressables is advertised' && check.status === 'fail'));
});

test('extractToolDefinitions returns MCP tool schemas from the C# verbatim JSON', () => {
  const tools = extractToolDefinitions(readFileSync(join(root, 'Editor/McpBridge/McpToolDefinitions.cs'), 'utf8'));
  const controlFree = '^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$';
  const controlCharFree = '^(?!.*[\\x00-\\x1F\\x7F-\\x9F]).*$';
  const safeAssetPath = '^(?!.*[\\x00-\\x1F\\x7F-\\x9F])Assets/(?!.*//)(?!.*\\\\)(?!.*(?:^|/)\\.\\.?(?:/|$)).+$';
  assert.equal(tools.length, REQUIRED_MCP_TOOLS.length);
  const createGameObject = tools.find((tool) => tool.name === 'unity.createGameObject');
  assert.equal(createGameObject.inputSchema.properties.parentId.type, 'string');
  assert.equal(createGameObject.inputSchema.properties.name.pattern, controlFree);
  assert.equal(createGameObject.inputSchema.properties.parent.pattern, controlFree);
  assert.equal(createGameObject.inputSchema.properties.parentId.pattern, controlFree);
  assert.equal(createGameObject.inputSchema.additionalProperties, false);
  assert.equal(createGameObject.inputSchema.properties.position.$ref, '#/$defs/vector3');
  assert.equal(createGameObject.inputSchema.properties.rotation.$ref, '#/$defs/vector3');
  assert.equal(createGameObject.inputSchema.properties.scale.$ref, '#/$defs/vector3');
  assert.equal(createGameObject.inputSchema.$defs.vector3.oneOf.length, 2);
  assert.equal(tools.find((tool) => tool.name === 'unity.captureGameViewScreenshot').inputSchema.properties.width.maximum, 4096);
  assert.equal(tools.find((tool) => tool.name === 'unity.runEditModeTest').inputSchema.properties.testName.maxLength, 256);
  assert.equal(tools.find((tool) => tool.name === 'unity.runEditModeTest').inputSchema.properties.testName.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.addComponent').inputSchema.properties.gameObjectId.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.addComponent').inputSchema.properties.componentType.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.setField').inputSchema.properties.gameObjectId.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.setField').inputSchema.properties.componentType.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.setField').inputSchema.properties.fieldName.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.assignAsset').inputSchema.properties.gameObjectId.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.assignAsset').inputSchema.properties.componentType.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.assignAsset').inputSchema.properties.fieldName.pattern, controlFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.setField').inputSchema.properties.value.oneOf.find((variant) => variant.type === 'string').maxLength, 4096);
  const setFieldStringArray = tools.find((tool) => tool.name === 'unity.setField').inputSchema.properties.value.oneOf.find((variant) => variant.type === 'array' && variant.items?.type === 'string');
  assert.equal(setFieldStringArray.maxItems, 64);
  assert.equal(setFieldStringArray.items.maxLength, 256);
  assert.equal(setFieldStringArray.items.pattern, controlCharFree);
  assert.equal(tools.find((tool) => tool.name === 'unity.assignAsset').inputSchema.properties.assetPath.pattern, safeAssetPath);
  assert.deepEqual(tools.find((tool) => tool.name === 'unity.setField').inputSchema.required, [
    'gameObjectId',
    'componentType',
    'fieldName',
    'value',
  ]);
  assert.ok(tools.find((tool) => tool.name === 'unity.setField').inputSchema.properties.value.oneOf.some((variant) => variant.$ref === '#/$defs/color'));
});
