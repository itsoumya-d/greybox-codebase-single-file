# Greybox Unity MCP Conformance

Generated: deterministic
Status: pass
Endpoint: `http://127.0.0.1:38467/mcp`
Protocol version: `2024-11-05`
Tools: 8

## Checks

| Category | Check | Status | Evidence |
| --- | --- | --- | --- |
| tool surface | required tool list is exact and ordered | pass | 8 tools: unity.getSceneHierarchy, unity.createGameObject, unity.addComponent, unity.setField, unity.assignAsset, unity.runEditModeTest, unity.captureGameViewScreenshot, unity.buildAddressables |
| tool surface | unity.getSceneHierarchy is advertised | pass | unity.getSceneHierarchy |
| routing | unity.getSceneHierarchy is routed | pass | unity.getSceneHierarchy |
| tool surface | unity.createGameObject is advertised | pass | unity.createGameObject |
| routing | unity.createGameObject is routed | pass | unity.createGameObject |
| tool surface | unity.addComponent is advertised | pass | unity.addComponent |
| routing | unity.addComponent is routed | pass | unity.addComponent |
| tool surface | unity.setField is advertised | pass | unity.setField |
| routing | unity.setField is routed | pass | unity.setField |
| tool surface | unity.assignAsset is advertised | pass | unity.assignAsset |
| routing | unity.assignAsset is routed | pass | unity.assignAsset |
| tool surface | unity.runEditModeTest is advertised | pass | unity.runEditModeTest |
| routing | unity.runEditModeTest is routed | pass | unity.runEditModeTest |
| tool surface | unity.captureGameViewScreenshot is advertised | pass | unity.captureGameViewScreenshot |
| routing | unity.captureGameViewScreenshot is routed | pass | unity.captureGameViewScreenshot |
| tool surface | unity.buildAddressables is advertised | pass | unity.buildAddressables |
| routing | unity.buildAddressables is routed | pass | unity.buildAddressables |
| schema | unity.getSceneHierarchy input schema is object-shaped | pass | {"type":"object","properties":{},"additionalProperties":false} |
| schema | unity.getSceneHierarchy rejects unknown arguments | pass | {"type":"object","properties":{},"additionalProperties":false} |
| schema | unity.createGameObject input schema is object-shaped | pass | {"type":"object","additionalProperties":false,"$defs":{"vector3":{"oneOf":[{"type":"object","required":["x","y","z"],"additionalProperties":false,"properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}}]}},"properties":{"name":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parent":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parentId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"position":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"rotation":{"description":"Local Euler Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"scale":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"}},"required":["name"]} |
| schema | unity.createGameObject rejects unknown arguments | pass | {"type":"object","additionalProperties":false,"$defs":{"vector3":{"oneOf":[{"type":"object","required":["x","y","z"],"additionalProperties":false,"properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}}]}},"properties":{"name":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parent":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parentId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"position":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"rotation":{"description":"Local Euler Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"scale":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"}},"required":["name"]} |
| schema | unity.addComponent input schema is object-shaped | pass | {"type":"object","additionalProperties":false,"properties":{"gameObjectId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"componentType":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"}},"required":["gameObjectId","componentType"]} |
| schema | unity.addComponent rejects unknown arguments | pass | {"type":"object","additionalProperties":false,"properties":{"gameObjectId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"componentType":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"}},"required":["gameObjectId","componentType"]} |
| schema | unity.setField input schema is object-shaped | pass | {"type":"object","additionalProperties":false,"$defs":{"vector3":{"oneOf":[{"type":"object","required":["x","y","z"],"additionalProperties":false,"properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}}]},"color":{"oneOf":[{"type":"string","pattern":"^#?[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$"},{"type":"object","required":["r","g","b"],"additionalProperties":false,"properties":{"r":{"type":"number"},"g":{"type":"number"},"b":{"type":"number"},"a":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":4,"items":{"type":"number"}}]}},"properties":{"gameObjectId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"componentType":{"description":"Unity component type, or UnityEngine.GameObject for tag/layer/isStatic/activeSelf metadata","type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"fieldName":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"value":{"oneOf":[{"type":"string","maxLength":4096},{"type":"array","maxItems":64,"items":{"type":"string","maxLength":256,"pattern":"^(?!.*[\\x00-\\x1F\\x7F-\\x9F]).*$"}},{"type":"number"},{"type":"boolean"},{"$ref":"#/$defs/vector3"},{"$ref":"#/$defs/color"}]}},"required":["gameObjectId","componentType","fieldName","value"]} |
| schema | unity.setField rejects unknown arguments | pass | {"type":"object","additionalProperties":false,"$defs":{"vector3":{"oneOf":[{"type":"object","required":["x","y","z"],"additionalProperties":false,"properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}}]},"color":{"oneOf":[{"type":"string","pattern":"^#?[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$"},{"type":"object","required":["r","g","b"],"additionalProperties":false,"properties":{"r":{"type":"number"},"g":{"type":"number"},"b":{"type":"number"},"a":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":4,"items":{"type":"number"}}]}},"properties":{"gameObjectId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"componentType":{"description":"Unity component type, or UnityEngine.GameObject for tag/layer/isStatic/activeSelf metadata","type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"fieldName":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"value":{"oneOf":[{"type":"string","maxLength":4096},{"type":"array","maxItems":64,"items":{"type":"string","maxLength":256,"pattern":"^(?!.*[\\x00-\\x1F\\x7F-\\x9F]).*$"}},{"type":"number"},{"type":"boolean"},{"$ref":"#/$defs/vector3"},{"$ref":"#/$defs/color"}]}},"required":["gameObjectId","componentType","fieldName","value"]} |
| schema | unity.assignAsset input schema is object-shaped | pass | {"type":"object","additionalProperties":false,"properties":{"gameObjectId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"componentType":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"fieldName":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"assetPath":{"type":"string","minLength":8,"maxLength":512,"pattern":"^(?!.*[\\x00-\\x1F\\x7F-\\x9F])Assets/(?!.*//)(?!.*\\\\)(?!.*(?:^\|/)\\.\\.?(?:/\|$)).+$"}},"required":["gameObjectId","componentType","fieldName","assetPath"]} |
| schema | unity.assignAsset rejects unknown arguments | pass | {"type":"object","additionalProperties":false,"properties":{"gameObjectId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"componentType":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"fieldName":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"assetPath":{"type":"string","minLength":8,"maxLength":512,"pattern":"^(?!.*[\\x00-\\x1F\\x7F-\\x9F])Assets/(?!.*//)(?!.*\\\\)(?!.*(?:^\|/)\\.\\.?(?:/\|$)).+$"}},"required":["gameObjectId","componentType","fieldName","assetPath"]} |
| schema | unity.runEditModeTest input schema is object-shaped | pass | {"type":"object","additionalProperties":false,"properties":{"testName":{"type":"string","minLength":1,"maxLength":256,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"}},"required":["testName"]} |
| schema | unity.runEditModeTest rejects unknown arguments | pass | {"type":"object","additionalProperties":false,"properties":{"testName":{"type":"string","minLength":1,"maxLength":256,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"}},"required":["testName"]} |
| schema | unity.captureGameViewScreenshot input schema is object-shaped | pass | {"type":"object","additionalProperties":false,"properties":{"width":{"type":"integer","minimum":64,"maximum":4096},"height":{"type":"integer","minimum":64,"maximum":4096}},"required":["width","height"]} |
| schema | unity.captureGameViewScreenshot rejects unknown arguments | pass | {"type":"object","additionalProperties":false,"properties":{"width":{"type":"integer","minimum":64,"maximum":4096},"height":{"type":"integer","minimum":64,"maximum":4096}},"required":["width","height"]} |
| schema | unity.buildAddressables input schema is object-shaped | pass | {"type":"object","properties":{},"additionalProperties":false} |
| schema | unity.buildAddressables rejects unknown arguments | pass | {"type":"object","properties":{},"additionalProperties":false} |
| tool surface | all MCP tools advertise safety annotations | pass | [{"name":"unity.getSceneHierarchy","annotations":{"title":"Get Scene Hierarchy","readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}},{"name":"unity.createGameObject","annotations":{"title":"Create GameObject","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.addComponent","annotations":{"title":"Add Component","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.setField","annotations":{"title":"Set Field","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.assignAsset","annotations":{"title":"Assign Asset","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.runEditModeTest","annotations":{"title":"Run EditMode Test","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.captureGameViewScreenshot","annotations":{"title":"Capture Game View Screenshot","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.buildAddressables","annotations":{"title":"Build Addressables","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}}] |
| tool surface | MCP annotations distinguish read-only and mutating tools | pass | [{"name":"unity.getSceneHierarchy","annotations":{"title":"Get Scene Hierarchy","readOnlyHint":true,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false}},{"name":"unity.createGameObject","annotations":{"title":"Create GameObject","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.addComponent","annotations":{"title":"Add Component","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.setField","annotations":{"title":"Set Field","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.assignAsset","annotations":{"title":"Assign Asset","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.runEditModeTest","annotations":{"title":"Run EditMode Test","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.captureGameViewScreenshot","annotations":{"title":"Capture Game View Screenshot","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}},{"name":"unity.buildAddressables","annotations":{"title":"Build Addressables","readOnlyHint":false,"destructiveHint":false,"idempotentHint":false,"openWorldHint":false}}] |
| schema | unity.createGameObject advertises parent and parentId aliases | pass | {"name":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parent":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parentId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"position":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"rotation":{"description":"Local Euler Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"scale":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"}} |
| schema | mutation string arguments advertise control-free bounds | pass | all mutating MCP string arguments include minLength/maxLength/control-free pattern |
| schema | unity.createGameObject advertises optional initial transform | pass | {"name":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parent":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"parentId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"position":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"rotation":{"description":"Local Euler Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"},"scale":{"description":"Local Vector3 as {x,y,z} or [x,y,z]","$ref":"#/$defs/vector3"}} |
| schema | unity.createGameObject vector3 schema accepts object and array forms | pass | {"oneOf":[{"type":"object","required":["x","y","z"],"additionalProperties":false,"properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}}]} |
| schema | unity.setField advertises bounded scalar/string-array/vector/color values | pass | {"type":"object","additionalProperties":false,"$defs":{"vector3":{"oneOf":[{"type":"object","required":["x","y","z"],"additionalProperties":false,"properties":{"x":{"type":"number"},"y":{"type":"number"},"z":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":3,"items":{"type":"number"}}]},"color":{"oneOf":[{"type":"string","pattern":"^#?[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$"},{"type":"object","required":["r","g","b"],"additionalProperties":false,"properties":{"r":{"type":"number"},"g":{"type":"number"},"b":{"type":"number"},"a":{"type":"number"}}},{"type":"array","minItems":3,"maxItems":4,"items":{"type":"number"}}]}},"properties":{"gameObjectId":{"type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"componentType":{"description":"Unity component type, or UnityEngine.GameObject for tag/layer/isStatic/activeSelf metadata","type":"string","minLength":1,"maxLength":512,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"fieldName":{"type":"string","minLength":1,"maxLength":128,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"},"value":{"oneOf":[{"type":"string","maxLength":4096},{"type":"array","maxItems":64,"items":{"type":"string","maxLength":256,"pattern":"^(?!.*[\\x00-\\x1F\\x7F-\\x9F]).*$"}},{"type":"number"},{"type":"boolean"},{"$ref":"#/$defs/vector3"},{"$ref":"#/$defs/color"}]}},"required":["gameObjectId","componentType","fieldName","value"]} |
| schema | unity.assignAsset advertises canonical project-relative Assets paths | pass | {"type":"string","minLength":8,"maxLength":512,"pattern":"^(?!.*[\\x00-\\x1F\\x7F-\\x9F])Assets/(?!.*//)(?!.*\\\\)(?!.*(?:^\|/)\\.\\.?(?:/\|$)).+$"} |
| schema | unity.assignAsset asset paths advertise all control characters blocked | pass | {"type":"string","minLength":8,"maxLength":512,"pattern":"^(?!.*[\\x00-\\x1F\\x7F-\\x9F])Assets/(?!.*//)(?!.*\\\\)(?!.*(?:^\|/)\\.\\.?(?:/\|$)).+$"} |
| schema | unity.runEditModeTest advertises bounded control-free test names | pass | {"type":"string","minLength":1,"maxLength":256,"pattern":"^(?!\\s*$)(?!.*[\\x00-\\x1F\\x7F-\\x9F]).+$"} |
| schema | unity.captureGameViewScreenshot advertises bounded integer dimensions | pass | {"width":{"type":"integer","minimum":64,"maximum":4096},"height":{"type":"integer","minimum":64,"maximum":4096}} |
| protocol | initialize serverInfo version matches package.json | pass | package=1.0.0; mcp=1.0.0 |
| protocol | initialize returns MCP protocol 2024-11-05 | pass | case "initialize":[\s\S]*?\["protocolVersion"\]\s*=\s*"2024-11-05" |
| protocol | initialize advertises tools capability | pass | case "initialize":[\s\S]*?\["capabilities"\]\s*=\s*new JObject \{ \["tools"\] |
| protocol | JSON-RPC envelope rejects non-string versions | pass | rawJsonRpc\.Type != JTokenType\.String[\s\S]*?jsonrpc must be a string |
| protocol | JSON-RPC envelope rejects non-string methods | pass | rawMethod\.Type != JTokenType\.String[\s\S]*?method must be a string |
| protocol | tools/list returns advertised definitions | pass | case "tools\/list":[\s\S]*?JObject\.Parse\(McpToolDefinitions\.ToolsJson\(\)\) |
| protocol | tools/call returns MCP text content | pass | case "tools\/call":[\s\S]*?\["content"\]\s*=\s*new JArray |
| protocol | tools/call returns structuredContent | pass | case "tools\/call":[\s\S]*?\["structuredContent"\]\s*=\s*structuredResult |
| protocol | tools/call marks successful tool results as non-errors | pass | McpToolSuccess[\s\S]*?\["isError"\]\s*=\s*false |
| protocol | direct tools/call returns structuredContent | pass | DirectToolSuccess[\s\S]*?\["structuredContent"\]\s*=\s*structuredResult |
| protocol | direct tools/call marks successful tool results as non-errors | pass | DirectToolSuccess[\s\S]*?\["isError"\]\s*=\s*false |
| protocol | tools/call rejects non-object params | pass | case "tools\/call":[\s\S]*?params must be an object |
| protocol | tools/call rejects non-string names | pass | case "tools\/call":[\s\S]*?params\.name must be a string |
| protocol | tools/call rejects non-object arguments | pass | case "tools\/call":[\s\S]*?params\.arguments must be an object |
| protocol | direct tools/call rejects non-object bodies | pass | HandleToolCall[\s\S]*?TryReadDirectToolCallRequest[\s\S]*?tools\/call body must be an object |
| protocol | direct tools/call rejects non-string names | pass | TryReadDirectToolCallRequest[\s\S]*?tools\/call name must be a string |
| protocol | direct tools/call rejects non-object arguments | pass | TryReadDirectToolCallRequest[\s\S]*?tools\/call arguments must be an object |
| protocol | tools/call rejects arguments outside the advertised schemas | pass | InvokeUnityTool[\s\S]*?ValidateMcpArguments\(name,\s*args\)[\s\S]*?Unexpected argument for |
| protocol | tools/call rejects missing required schema arguments | pass | ValidateMcpArguments[\s\S]*?RequireMcpArgument[\s\S]*?Missing required argument for |
| protocol | tools/call rejects non-integer screenshot dimensions | pass | ValidateMcpArguments[\s\S]*?RequireMcpIntegerArgument[\s\S]*?must be an integer |
| protocol | tools/call rejects out-of-range integer arguments | pass | RequireMcpIntegerArgument[\s\S]*?ReadMcpInt32Value[\s\S]*?32-bit integer |
| protocol | tools/call rejects non-string schema arguments | pass | ValidateMcpArguments[\s\S]*?RequireMcpStringArgument[\s\S]*?must be a string |
| protocol | tools/call rejects oversized schema strings | pass | ValidateMcpStringArgument[\s\S]*?characters or fewer |
| protocol | tools/call rejects control characters in schema strings | pass | ValidateMcpStringArgument[\s\S]*?char\.IsControl[\s\S]*?control characters |
| protocol | createGameObject rejects conflicting parent aliases | pass | ReadMcpCreateGameObjectParentId[\s\S]*?parent and parentId must match |
| protocol | tools/call validates createGameObject Vector3 schema arguments | pass | ValidateMcpArguments[\s\S]*?ValidateMcpVector3Arguments[\s\S]*?position[\s\S]*?rotation[\s\S]*?scale |
| protocol | tools/call rejects schema-invalid setField value shapes | pass | ValidateMcpSetFieldValueArgument[\s\S]*?ValidateMcpSetFieldValueShape[\s\S]*?string, string array, number, boolean, Vector3, or Color |
| protocol | tools/call rejects oversized setField string values | pass | MaxMcpSetFieldStringValueLength[\s\S]*?string value must be \{MaxMcpSetFieldStringValueLength\} characters or fewer |
| protocol | tools/call rejects control characters in setField string arrays | pass | CanReadMcpStringArray[\s\S]*?char\.IsControl[\s\S]*?string array items may not contain control characters |
| errors | parse errors use JSON-RPC -32700 | pass | JsonRpcError\(null,\s*-32700 |
| errors | invalid request uses JSON-RPC -32600 | pass | JsonRpcError\([^,]+,\s*-32600 |
| errors | invalid tool params use JSON-RPC -32602 | pass | JsonRpcError\(id,\s*-32602,\s*"tools\/call params\.name is required"\) |
| errors | unknown methods use JSON-RPC -32601 | pass | JsonRpcError\(id,\s*-32601 |
| errors | tool exceptions return MCP isError results | pass | catch \(Exception ex\)[\s\S]*?JsonRpcResult\(id,\s*McpToolError\(ex\.Message\)\) |
| errors | direct tool exceptions return MCP isError results | pass | HandleToolCall[\s\S]*?catch \(Exception ex\)[\s\S]*?return McpToolError\(ex\.Message\)\.ToString\(Formatting\.None\) |
| errors | MCP tool error results use isError true with text content | pass | McpToolError[\s\S]*?\["content"\]\s*=\s*new JArray[\s\S]*?\["type"\]\s*=\s*"text"[\s\S]*?\["text"\]\s*=\s*message \?\? ""[\s\S]*?\["isError"\]\s*=\s*true |
| errors | unexpected JSON-RPC handler failures use server error -32000 | pass | JsonRpcError\(id,\s*-32000,\s*ex\.Message\) |
| errors | license failures use server error -32001 | pass | JsonRpcError\(id,\s*-32001,\s*accessMessage\) |
| batching | empty batches are rejected | pass | if \(batch\.Count == 0\)[\s\S]*?empty JSON-RPC batch |
| batching | batch size is capped | pass | MaxMcpJsonRpcBatchItems[\s\S]*?batch\.Count > MaxMcpJsonRpcBatchItems[\s\S]*?JSON-RPC batch may contain at most |
| batching | batch entries aggregate responses | pass | foreach \(JToken item in batch\)[\s\S]*?responses\.Add\(response\) |
| notifications | notifications without id are supported | pass | bool expectsResponse = request\.Property\("id"\) != null |
| notifications | notifications/initialized may omit response | pass | case "notifications\/initialized":[\s\S]*?return expectsResponse \? JsonRpcResult |
| security | listener binds loopback only | pass | McpListenerPrefix\s*=\s*"http:\/\/127\.0\.0\.1:38467\/"[\s\S]*?listener\.Prefixes\.Add\(McpListenerPrefix\) |
| security | MCP bridge checks Pro or Studio license | pass | GreyboxLicenseState\.CurrentCapabilities\(\)\.CanUseMcpBridge |
| security | MCP bridge registers project entitlement usage | pass | GreyboxProjectEntitlements\.RegisterCurrentProject |
| security | MCP HTTP routes require local bearer token | pass | IsAuthorizedMcpRequest\(ctx\.Request[\s\S]*?mcp_auth_required |
| security | MCP HTTP Host header must be loopback | pass | (?=[\s\S]*IsSafeMcpHostHeader\(ctx\.Request\.Headers\["Host"\] \?\? ctx\.Request\.UserHostName \?\? ""\))(?=[\s\S]*mcp_host_forbidden)(?=[\s\S]*IsLoopbackMcpHost) |
| security | MCP authorization accepts Authorization bearer header | pass | request\.Headers\["Authorization"\][\s\S]*?McpAuthorizationHeaderMatches\(authorization,\s*expected\) |
| security | MCP authorization accepts explicit local token header | pass | request\.Headers\["X-Greybox-Mcp-Token"\][\s\S]*?McpTokenMatches\(tokenHeader,\s*expected\) |
| security | MCP token comparisons are fixed-time backed | pass | McpTokenMatches[\s\S]*?FixedTimeEquals[\s\S]*?diff \\|= |
| security | MCP request bodies are size capped before parsing | pass | (?=[\s\S]*MaxMcpRequestBodyBytes)(?=[\s\S]*ContentLength64)(?=[\s\S]*ReadMcpRequestBody)(?=[\s\S]*mcp_request_too_large) |
| security | scene hierarchy export is node and depth capped | pass | MaxMcpSceneHierarchyNodes[\s\S]*?MaxMcpSceneHierarchyDepth[\s\S]*?McpHierarchyBudget[\s\S]*?childrenTruncated[\s\S]*?mcpHierarchy |
| security | scene hierarchy receipt health uses strict generated receipt lookup | pass | (?=[\s\S]*IsSafeMcpImportReceiptPath)(?=[\s\S]*GreyboxGeneratedAssetPaths\.Root \+ "\/")(?=[\s\S]*EndsWith\("\.asset")(?=[\s\S]*GreyboxGeneratedAssetPaths\.ReceiptsFolder)(?=[\s\S]*AssetDatabase\.LoadAssetAtPath<GreyboxImportReceipt>) |
| security | scene hierarchy receipt health is bounded | pass | MaxMcpImportReceiptSummaryEntries[\s\S]*?DescribeImportReceiptSummary[\s\S]*?generatedAssetPathsTruncated[\s\S]*?addressableLabelsTruncated[\s\S]*?missingReferencesTruncated[\s\S]*?BoundedMissingReferenceArray |
| security | MCP mutating tools require stable editor state | pass | InvokeUnityTool[\s\S]*?IsUnityEditorReadyForMcpMutation\(name,\s*out string editorStateMessage\)[\s\S]*?EditorApplication\.isCompiling[\s\S]*?EditorApplication\.isUpdating[\s\S]*?EditorApplication\.isPlayingOrWillChangePlaymode[\s\S]*?IsMcpMutationTool |
| security | MCP JSON-RPC and tool calls are POST-only | pass | IsAllowedMcpHttpMethod[\s\S]*?tools\/list[\s\S]*?method == "GET"[\s\S]*?return method == "POST" |
| security | MCP POST routes require JSON content type | pass | IsAllowedMcpContentType[\s\S]*?mcp_unsupported_media_type[\s\S]*?application\/json |
| security | MCP mutation tools require Unity Component types | pass | RequireComponentType[\s\S]*?typeof\(Component\)\.IsAssignableFrom |
| security | MCP addComponent rejects abstract component types | pass | type\.IsAbstract[\s\S]*?Component type is not addable |
| unity action | addComponent returns component detail metadata | pass | AddComponent[\s\S]*?componentName[\s\S]*?componentDetail[\s\S]*?DescribeComponent\(component\) |
| unity action | scene hierarchy exposes addable component hints | pass | addableComponents[\s\S]*?DescribeAddableComponents[\s\S]*?RecommendedMcpAddableComponentTypes[\s\S]*?unity\.addComponent[\s\S]*?alreadyAttached[\s\S]*?canAdd |
| unity action | addComponent only accepts advertised component hints | pass | AddComponent[\s\S]*?ResolveMcpAddableComponentType[\s\S]*?IsRecommendedMcpAddableComponentType[\s\S]*?Component type is not advertised by scene hierarchy addableComponents |
| unity action | addComponent rejects duplicate single-instance components | pass | RequireCanAddMcpComponent[\s\S]*?AllowsMultipleMcpComponent[\s\S]*?single-instance |
| unity action | scene hierarchy exposes prefab source metadata | pass | DescribeUnityPrefabMetadata[\s\S]*?GetPrefabAssetPathOfNearestInstanceRoot[\s\S]*?nearestPrefabAssetPath |
| unity action | scene hierarchy exposes writable GameObject metadata fields | pass | writableGameObjectFields(?=[\s\S]*DescribeWritableGameObjectFields)(?=[\s\S]*acceptedAliases)(?=[\s\S]*propagatesToChildren)(?=[\s\S]*allowedTags)(?=[\s\S]*allowedLayers)(?=[\s\S]*previousLayerName)(?=[\s\S]*layerName)(?=[\s\S]*unityTag)(?=[\s\S]*unityLayer)(?=[\s\S]*unityActive) |
| unity action | scene hierarchy exposes writable setField properties | pass | writableProperties[\s\S]*?DescribeWritableProperties[\s\S]*?setTool[\s\S]*?unity\.setField[\s\S]*?allowedEnumValues[\s\S]*?Enum\.GetNames |
| unity action | scene hierarchy labels writable setField properties | pass | DescribeWritableProperty[\s\S]*?memberKind[\s\S]*?property[\s\S]*?setTool[\s\S]*?unity\.setField |
| unity action | scene hierarchy exposes writable setField fields | pass | writableFields[\s\S]*?DescribeWritableFields[\s\S]*?DescribeWritableField[\s\S]*?memberKind[\s\S]*?field[\s\S]*?unity\.setField |
| unity action | scene hierarchy raw fields use serialized field filter | pass | DescribeComponent[\s\S]*?foreach \(FieldInfo field[\s\S]*?IsWritableMcpValueField\(field\)[\s\S]*?fields\[field\.Name\] |
| unity action | scene hierarchy exposes setField value schemas | pass | valueSchema[\s\S]*?DescribeMcpValueSchema[\s\S]*?kind[\s\S]*?vector3[\s\S]*?kind[\s\S]*?color[\s\S]*?allowedEnumValues |
| unity action | scene hierarchy exposes assignable asset reference fields | pass | assetReferenceFields[\s\S]*?DescribeAssetReferenceFields[\s\S]*?assignTool[\s\S]*?unity\.assignAsset |
| unity action | assignAsset returns previous asset metadata | pass | (?=[\s\S]*AssignAsset)(?=[\s\S]*previousAssetPath)(?=[\s\S]*previousAssetGuid)(?=[\s\S]*previousObjectName)(?=[\s\S]*objectName) |
| unity action | assignAsset rejects non-canonical asset paths before lookup | pass | NormalizeMcpAssetPath[\s\S]*?canonical project-relative Assets\/[\s\S]*?IsSafeProjectAssetPath[\s\S]*?Length < 8[\s\S]*?IndexOf\('\\\\'\)[\s\S]*?char\.IsControl |
| unity action | runEditModeTest invokes Unity Test Runner | pass | UnityEditor\.TestTools\.TestRunner\.Api\.TestRunnerApi[\s\S]*?GetMethod\("Execute"[\s\S]*?execute\.Invoke\(api |
| unity action | runEditModeTest targets EditMode | pass | Enum\.Parse\(testModeType,\s*"EditMode"\) |
| unity action | runEditModeTest captures Unity Test Runner run guid | pass | NormalizeMcpUnityRunGuid\(\s*execute\.Invoke\(api,\s*new\[\]\s*\{\s*settings\s*\}\)\s*\) |
| unity action | runEditModeTest returns deterministic async result contract | pass | DescribeMcpEditModeTestSubmission[\s\S]*?\["runId"\]\s*=\s*runId[\s\S]*?\["sanitizedTestName"\]\s*=\s*testName[\s\S]*?\["testNameLength"\]\s*=\s*testName\.Length[\s\S]*?\["submittedAtUtc"\]\s*=\s*submittedAtUtc[\s\S]*?\["editModeFilter"\][\s\S]*?\["resultContract"\][\s\S]*?CreateMcpEditModeTestRunId |
| unity action | runEditModeTest waits on Unity Test Runner callbacks | pass | SubmitMcpEditModeTestRunAndWait[\s\S]*?UnityEditor\.TestTools\.TestRunner\.Api\.ICallbacks[\s\S]*?RegisterMcpTestRunCallbacks[\s\S]*?Task\.WhenAny[\s\S]*?RunFinished |
| unity action | runEditModeTest returns final pass fail evidence when completed | pass | DescribeMcpEditModeTestCompletion[\s\S]*?\["completed"\]\s*=\s*true[\s\S]*?\["status"\]\s*=\s*status[\s\S]*?\["result"\]\s*=\s*result[\s\S]*?\["testResults"\]\s*=\s*testResults[\s\S]*?\["finalResultInResponse"\]\s*=\s*true |
| security | runEditModeTest rejects path and secret test names | pass | NormalizeMcpTestName[\s\S]*?IndexOf\('\/'\)[\s\S]*?IndexOf\('\\\\'\)[\s\S]*?ContainsMcpSensitiveText[\s\S]*?testName may not contain paths or secrets |
| unity action | screenshot tool sizes Game View before capture | pass | TryApplyGameViewSize\(width,\s*height[\s\S]*?ScreenCapture\.CaptureScreenshot |
| unity action | screenshot tool returns MCP-readable local path metadata | pass | CaptureGameViewScreenshot[\s\S]*?Path\.GetFullPath\(path\)[\s\S]*?DescribeMcpScreenshotCapture[\s\S]*?\["absolutePath"\]\s*=\s*absolutePath[\s\S]*?\["fileName"\]\s*=\s*Path\.GetFileName\(path\)[\s\S]*?\["asyncCapture"\]\s*=\s*true[\s\S]*?\["pollAfterMs"\]\s*=\s*McpScreenshotPollAfterMs |
| unity action | addressables tool flushes tags before build | pass | (?=[\s\S]*AddressablesTagger\.FlushPending\(\))(?=[\s\S]*System\.Diagnostics\.Stopwatch\.StartNew)(?=[\s\S]*AddressableAssetSettings\.BuildPlayerContent\(\))(?=[\s\S]*AnnotateAddressablesBuildTiming)(?=[\s\S]*buildDurationMs)(?=[\s\S]*buildCompletedAtUtc)(?=[\s\S]*labelCounts)(?=[\s\S]*missingLabels)(?=[\s\S]*generatedEntries)(?=[\s\S]*assetExists)(?=[\s\S]*assetType) |
| unity action | mutation tools mark scenes dirty and report dirty state | pass | (?=[\s\S]*MarkMcpEditedSceneDirty)(?=[\s\S]*EditorSceneManager\.MarkSceneDirty)(?=[\s\S]*sceneDirty) |
| field types | setField accepts int values | pass | if \(targetType == typeof\(int\)\) return ReadMcpIntFieldValue\(token,\s*targetType\) |
| field types | setField accepts float values | pass | if \(targetType == typeof\(float\)\) return ReadMcpFloatFieldValue\(token,\s*targetType\) |
| field types | setField accepts string values | pass | if \(targetType == typeof\(string\)\) return ReadMcpStringFieldValue\(token,\s*targetType\) |
| field types | setField accepts Color values | pass | if \(targetType == typeof\(Color\)\) return ReadColor\(token\) |
| field types | setField accepts Vector3 values | pass | if \(targetType == typeof\(Vector3\)\) return ReadVector3\(token\) |
| field types | Vector3 conversion rejects loose shapes | pass | ReadVector3[\s\S]*?exactly 3 numbers[\s\S]*?numeric x\/y\/z |
| field types | Color conversion rejects loose shapes | pass | ReadColor[\s\S]*?6- or 8-digit[\s\S]*?exactly 3 or 4 numbers[\s\S]*?numeric r\/g\/b |
| field types | scalar conversion rejects string coercion | pass | ReadMcpStringFieldValue[\s\S]*?must be a JSON string[\s\S]*?ReadMcpIntFieldValue[\s\S]*?must be a JSON integer[\s\S]*?ReadMcpBoolFieldValue[\s\S]*?must be a JSON boolean |
| field types | integer conversion rejects out-of-range values | pass | ReadMcpIntFieldValue[\s\S]*?ReadMcpInt32Value[\s\S]*?32-bit integer |
| field types | numeric conversion rejects non-finite values | pass | IsJsonFiniteNumber[\s\S]*?double\.IsNaN[\s\S]*?double\.IsInfinity[\s\S]*?ReadFiniteFloat[\s\S]*?float\.IsNaN[\s\S]*?float\.IsInfinity |
| field types | enum conversion rejects unnamed numeric values | pass | ConvertEnumValue[\s\S]*?Enum value must be a string[\s\S]*?Enum\.IsDefined[\s\S]*?named enum value |
| field types | setField resolver rejects unadvertised member surfaces | pass | ResolveAssignableMember[\s\S]*?IsResolvableMcpAssignableField[\s\S]*?IsEditorSerializedMcpField[\s\S]*?field\.IsNotSerialized[\s\S]*?NonSerializedAttribute[\s\S]*?HideInInspector[\s\S]*?IsResolvableMcpAssignableProperty[\s\S]*?DeclaringType == typeof\(UnityEngine\.Object\)[\s\S]*?ObsoleteAttribute |
| field types | assignAsset resolver rejects unadvertised member surfaces | pass | (?=[\s\S]*AssignAsset[\s\S]*?ResolveAssignableAssetMember)(?=[\s\S]*IsAssignableAssetReferenceField[\s\S]*?IsEditorSerializedMcpField[\s\S]*?field\.IsNotSerialized[\s\S]*?HideInInspector)(?=[\s\S]*IsAssignableAssetReferenceProperty[\s\S]*?ObsoleteAttribute[\s\S]*?property\.Name != "material") |
| security | MCP token is editor-only and generated with CSPRNG | pass | GreyboxSettings.GetOrCreateMcpBridgeToken + RandomNumberGenerator.Fill |
| security | Studio window can copy and rotate MCP token | pass | Copy MCP Config + Rotate MCP Token |

## Tool Surface

| Tool | Required fields |
| --- | --- |
| `unity.getSceneHierarchy` | - |
| `unity.createGameObject` | name |
| `unity.addComponent` | gameObjectId, componentType |
| `unity.setField` | gameObjectId, componentType, fieldName, value |
| `unity.assignAsset` | gameObjectId, componentType, fieldName, assetPath |
| `unity.runEditModeTest` | testName |
| `unity.captureGameViewScreenshot` | width, height |
| `unity.buildAddressables` | - |

## Transcript Fixtures

```json
{
  "initialize": {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05"
    }
  },
  "list": {
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  },
  "call": {
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "unity.getSceneHierarchy",
      "arguments": {}
    }
  },
  "initializedNotification": {
    "jsonrpc": "2.0",
    "method": "notifications/initialized"
  }
}
```

