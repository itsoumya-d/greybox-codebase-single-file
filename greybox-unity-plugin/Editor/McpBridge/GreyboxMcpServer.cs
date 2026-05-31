// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Greybox.Editor.Generation;
using Greybox.Editor.Sync;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEditor.AddressableAssets;
using UnityEditor.AddressableAssets.Settings;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace Greybox.Editor.McpBridge
{
    public static class GreyboxMcpServer
    {
        private const int MaxMcpRequestBodyBytes = 256 * 1024;
        private const int MaxMcpJsonRpcBatchItems = 32;
        private const int MaxMcpSceneHierarchyNodes = 2048;
        private const int MaxMcpSceneHierarchyDepth = 32;
        private const int MinMcpScreenshotDimension = 64;
        private const int MaxMcpScreenshotDimension = 4096;
        private const int MaxMcpTestNameLength = 256;
        private const int MaxMcpSetFieldStringValueLength = 4096;
        private const int MaxMcpSetFieldStringArrayItems = 64;
        private const int MaxMcpSetFieldStringArrayItemLength = 256;
        private const int MaxMcpEnumValueLength = 128;
        private const int MaxMcpSourcePathLength = 512;
        private const int MaxMcpAuthorizationHeaderChars = 128;
        private const int MaxMcpBrowserHeaderChars = 512;
        private const int MaxMcpScreenshotFiles = 20;
        private const int MaxMcpAddressablesSummaryEntries = 50;
        private const int MaxMcpTilemapRecordReadback = 128;
        private const int MaxMcpImportReceiptSummaryEntries = 16;
        private const int McpScreenshotPollAfterMs = 250;
        private const int McpEditModeTestCompletionTimeoutMs = 60000;
        private const int MaxMcpEditModeTestResultChildren = 64;
        private const string McpServerVersion = "1.0.0";
        private const string McpScreenshotDirectory = "Temp/Greybox/McpScreenshots";
        private const string McpScreenshotFilePrefix = "greybox-game-view-";
        private const string McpScreenshotExtension = ".png";
        private const string McpEditModeTestRunIdPrefix = "greybox-editmode-test-";
        private const string McpListenerPrefix = "http://127.0.0.1:38467/";
        private const string McpBearerPrefix = "Bearer ";
        private static HttpListener listener;
        private static bool running;
        private static bool mcpEditModeTestRunInProgress;
        private static GreyboxConfig activeConfig;
        private static readonly Type[] RecommendedMcpAddableComponentTypes =
        {
            typeof(Camera),
            typeof(Light),
            typeof(MeshFilter),
            typeof(MeshRenderer),
            typeof(SpriteRenderer),
            typeof(Rigidbody),
            typeof(Rigidbody2D),
            typeof(BoxCollider),
            typeof(SphereCollider),
            typeof(CapsuleCollider),
            typeof(BoxCollider2D),
            typeof(CircleCollider2D),
            typeof(PolygonCollider2D),
            typeof(Animator),
            typeof(AudioSource),
            typeof(GreyboxMarker),
            typeof(GreyboxDesignNode),
            typeof(GreyboxActorDefinition),
            typeof(GreyboxSpawnPoint),
            typeof(GreyboxObjective),
            typeof(GreyboxHazard),
            typeof(GreyboxLevelRoom),
            typeof(GreyboxEncounter),
            typeof(GreyboxLevelConnection)
        };

        private static readonly HashSet<string> KnownRoundTripCollections = new HashSet<string>(StringComparer.Ordinal)
        {
            "actors",
            "spawnPoints",
            "objectives",
            "hazards",
            "rooms",
            "encounters",
            "connections",
            "tiles",
            "checkpoints",
            "goals",
            "coins",
        };
        private static readonly Regex McpBearerTokenPattern = new Regex(@"\bBearer\s+[A-Za-z0-9._~+/=-]{16,}(?=$|[^A-Za-z0-9._~+/=-])", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex McpStripeSecretPattern = new Regex(@"\b(?:Bearer\s+)?(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+\b|\bwhsec_[A-Za-z0-9_]+\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex McpEmailPattern = new Regex(@"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);
        private static readonly Regex McpIpAddressPattern = new Regex(@"\b(?:\d{1,3}\.){3}\d{1,3}\b", RegexOptions.Compiled);
        private static readonly Regex McpCardLikePattern = new Regex(@"\b(?:\d[ -]*?){13,19}\b", RegexOptions.Compiled);
        private static readonly Regex McpStripeObjectPattern = new Regex(@"\b(?:acct|ch|cs|cus|dp|evt|pi|re|taxcalc|tr|txr)_[A-Za-z0-9_-]+\b", RegexOptions.Compiled);
        private static readonly Regex McpAbsolutePathPattern = new Regex(@"(?:(?:[A-Za-z]:\\|/Users/|/private/|/var/|/tmp/)[^\s""']+)", RegexOptions.Compiled);
        private static readonly Regex McpTileRecordFieldPattern = new Regex(@"^(?:tiles|tileRecords|records)\[(?:tileId|id)=([A-Za-z0-9_-]{1,128})\]\.(type|tileType|walkable|blocksMovement|isSpawn|isExit|isHazard|colorHex|position)$", RegexOptions.Compiled);

        public static void Start(GreyboxConfig config)
        {
            if (!IsMcpBridgeAllowed(config, out string accessMessage))
            {
                Debug.LogWarning(accessMessage);
                return;
            }
            if (running) return;
            activeConfig = config;
            GreyboxSettings.GetOrCreateMcpBridgeToken();
            if (!TryStartMcpListener(out string startMessage))
            {
                ResetMcpListenerStateAfterStartFailure();
                Debug.LogWarning(startMessage);
                return;
            }
            running = true;
            _ = AcceptLoop();
            Debug.Log("Greybox MCP bridge listening on " + McpListenerPrefix);
        }

        private static bool TryStartMcpListener(out string message)
        {
            message = "";
            listener = new HttpListener();
            listener.Prefixes.Add(McpListenerPrefix);
            try
            {
                listener.Start();
                return true;
            }
            catch (Exception ex)
            {
                message = "Greybox MCP bridge failed to bind " + McpListenerPrefix + ": " + ex.Message;
                return false;
            }
        }

        private static void ResetMcpListenerStateAfterStartFailure()
        {
            running = false;
            listener?.Close();
            listener = null;
            activeConfig = null;
        }

        public static void Stop()
        {
            running = false;
            listener?.Close();
            listener = null;
            activeConfig = null;
        }

        private static async System.Threading.Tasks.Task AcceptLoop()
        {
            while (running && listener != null)
            {
                HttpListenerContext ctx;
                try { ctx = await listener.GetContextAsync(); }
                catch { break; }
                EditorApplication.delayCall += () => _ = Handle(ctx);
            }
        }

        private static async Task Handle(HttpListenerContext ctx)
        {
            try
            {
                string path = ctx.Request.Url.AbsolutePath;
                if (IsMcpRequestPath(path) && !IsSafeMcpHostHeader(ctx.Request.Headers["Host"] ?? ctx.Request.UserHostName ?? ""))
                {
                    WriteJson(ctx.Response, 403, new JObject
                    {
                        ["error"] = "mcp_host_forbidden",
                        ["message"] = "Greybox MCP accepts requests only through a loopback Host header."
                    }.ToString(Formatting.None));
                    return;
                }
                if (IsMcpRequestPath(path) && !IsSafeMcpBrowserRequest(ctx.Request, out string browserMessage))
                {
                    WriteJson(ctx.Response, 403, new JObject
                    {
                        ["error"] = "mcp_browser_origin_forbidden",
                        ["message"] = browserMessage
                    }.ToString(Formatting.None));
                    return;
                }
                if (IsMcpRequestPath(path) && !IsAuthorizedMcpRequest(ctx.Request, out string authMessage))
                {
                    WriteJson(ctx.Response, 401, new JObject
                    {
                        ["error"] = "mcp_auth_required",
                        ["message"] = authMessage
                    }.ToString(Formatting.None));
                    return;
                }
                if (IsMcpRequestPath(path) && !IsAllowedMcpHttpMethod(ctx.Request))
                {
                    WriteJson(ctx.Response, 405, new JObject
                    {
                        ["error"] = "mcp_method_not_allowed",
                        ["message"] = "Greybox MCP accepts POST for JSON-RPC and tool calls; tools/list also accepts GET."
                    }.ToString(Formatting.None));
                    return;
                }
                if (IsMcpRequestPath(path) && !IsAllowedMcpContentType(ctx.Request))
                {
                    WriteJson(ctx.Response, 415, new JObject
                    {
                        ["error"] = "mcp_unsupported_media_type",
                        ["message"] = "Greybox MCP POST requests must use Content-Type application/json."
                    }.ToString(Formatting.None));
                    return;
                }
                string response = path switch
                {
                    "/mcp" => await HandleMcpJsonRpcAsync(ReadMcpRequestBody(ctx.Request)),
                    "/tools/list" => McpToolDefinitions.ToolsJson(),
                    "/tools/call" => await HandleToolCallAsync(ReadMcpRequestBody(ctx.Request)),
                    _ => @"{""error"":""not found""}"
                };
                WriteJson(ctx.Response, 200, response);
            }
            catch (McpRequestTooLargeException ex)
            {
                WriteJson(ctx.Response, 413, @"{""error"":""mcp_request_too_large"",""message"":" + JValue.CreateString(SafeMcpErrorMessage(ex.Message)).ToString() + "}");
            }
            catch (Exception ex)
            {
                WriteJson(ctx.Response, 500, @"{""error"":" + JValue.CreateString(SafeMcpErrorMessage(ex.Message)).ToString() + "}");
            }
        }

        private static string ReadMcpRequestBody(HttpListenerRequest request)
        {
            if (request.ContentLength64 > MaxMcpRequestBodyBytes)
            {
                throw new McpRequestTooLargeException($"Greybox MCP request body exceeds {MaxMcpRequestBodyBytes} bytes.");
            }

            using var buffer = new MemoryStream();
            byte[] chunk = new byte[8192];
            long total = 0;
            int read;
            while ((read = request.InputStream.Read(chunk, 0, chunk.Length)) > 0)
            {
                total += read;
                if (total > MaxMcpRequestBodyBytes)
                {
                    throw new McpRequestTooLargeException($"Greybox MCP request body exceeds {MaxMcpRequestBodyBytes} bytes.");
                }
                buffer.Write(chunk, 0, read);
            }
            return Encoding.UTF8.GetString(buffer.ToArray());
        }

        private static void WriteJson(HttpListenerResponse response, int statusCode, string body)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(body);
            response.StatusCode = statusCode;
            response.ContentType = "application/json";
            response.ContentLength64 = bytes.Length;
            response.OutputStream.Write(bytes, 0, bytes.Length);
            response.Close();
        }

        private static bool IsMcpRequestPath(string path)
        {
            return path == "/mcp" || path == "/tools/list" || path == "/tools/call";
        }

        private static bool IsAllowedMcpHttpMethod(HttpListenerRequest request)
        {
            string method = request.HttpMethod ?? "";
            string path = request.Url.AbsolutePath;
            if (path == "/tools/list")
            {
                return method == "GET" || method == "POST";
            }
            return method == "POST";
        }

        private static bool IsAllowedMcpContentType(HttpListenerRequest request)
        {
            return IsAllowedMcpContentType(request.HttpMethod ?? "", request.ContentType ?? "");
        }

        private static bool IsAllowedMcpContentType(string method, string contentType)
        {
            if (!string.Equals(method ?? "", "POST", StringComparison.OrdinalIgnoreCase)) return true;
            string mediaType = (contentType ?? "").Split(';')[0].Trim();
            return string.Equals(mediaType, "application/json", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsSafeMcpHostHeader(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || !IsSafeMcpHeaderValue(value)) return false;
            string clean = value.Trim();
            if (clean.IndexOf('/') >= 0 || clean.IndexOf('\\') >= 0 || clean.IndexOf('@') >= 0) return false;

            string host = clean;
            if (host.StartsWith("[", StringComparison.Ordinal))
            {
                int endBracket = host.IndexOf(']');
                if (endBracket <= 1) return false;
                string remainder = host.Substring(endBracket + 1);
                if (remainder.Length > 0)
                {
                    if (!remainder.StartsWith(":", StringComparison.Ordinal) || !IsSafeMcpPort(remainder.Substring(1))) return false;
                }
                host = host.Substring(1, endBracket - 1);
            }
            else
            {
                int firstColon = host.IndexOf(':');
                if (firstColon >= 0)
                {
                    if (host.IndexOf(':', firstColon + 1) >= 0) return false;
                    string port = host.Substring(firstColon + 1);
                    if (!IsSafeMcpPort(port)) return false;
                    host = host.Substring(0, firstColon);
                }
            }

            return IsLoopbackMcpHost(host);
        }

        private static bool IsSafeMcpPort(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return false;
            foreach (char c in value)
            {
                if (c < '0' || c > '9') return false;
            }
            return int.TryParse(value, out int port) && port > 0 && port <= 65535;
        }

        private static bool IsSafeMcpBrowserRequest(HttpListenerRequest request, out string message)
        {
            message = "";
            if (!IsSafeMcpBrowserUrlHeader(request.Headers["Origin"] ?? "", "Origin"))
            {
                message = "Greybox MCP rejects browser requests whose Origin is not loopback.";
                return false;
            }
            if (!IsSafeMcpBrowserUrlHeader(request.Headers["Referer"] ?? "", "Referer"))
            {
                message = "Greybox MCP rejects browser requests whose Referer is not loopback.";
                return false;
            }
            if (!IsSafeMcpFetchSiteHeader(request.Headers["Sec-Fetch-Site"] ?? ""))
            {
                message = "Greybox MCP rejects browser requests from cross-site fetch contexts.";
                return false;
            }
            return true;
        }

        private static bool IsSafeMcpBrowserUrlHeader(string value, string headerName)
        {
            if (string.IsNullOrWhiteSpace(headerName)) return false;
            if (string.IsNullOrEmpty(value)) return true;
            if (!IsSafeMcpHeaderValue(value)) return false;
            if (!Uri.TryCreate(value, UriKind.Absolute, out Uri uri)) return false;
            if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }
            if (!string.IsNullOrEmpty(uri.UserInfo)) return false;
            return IsLoopbackMcpHost(uri.Host);
        }

        private static bool IsSafeMcpFetchSiteHeader(string value)
        {
            if (string.IsNullOrEmpty(value)) return true;
            if (!IsSafeMcpHeaderValue(value)) return false;
            string normalized = value.Trim();
            return string.Equals(normalized, "none", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "same-origin", StringComparison.OrdinalIgnoreCase)
                || string.Equals(normalized, "same-site", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsSafeMcpHeaderValue(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > MaxMcpBrowserHeaderChars) return false;
            foreach (char c in value)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static bool IsLoopbackMcpHost(string host)
        {
            if (string.IsNullOrWhiteSpace(host)) return false;
            if (string.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase)) return true;
            string normalized = host.Trim('[', ']');
            return IPAddress.TryParse(normalized, out IPAddress address) && IPAddress.IsLoopback(address);
        }

        private sealed class McpRequestTooLargeException : Exception
        {
            public McpRequestTooLargeException(string message) : base(message)
            {
            }
        }

        private sealed class McpEditModeTestResultCollector
        {
            private readonly List<object> finishedTests = new List<object>();
            private readonly TaskCompletionSource<object> completion = new TaskCompletionSource<object>();

            public TaskCompletionSource<object> Completion => completion;
            public object RunFinishedResult { get; private set; }
            public IReadOnlyList<object> FinishedTests => finishedTests;

            public void HandleCallback(string methodName, object[] args)
            {
                if (methodName == "TestFinished" && args != null && args.Length > 0 && args[0] != null)
                {
                    finishedTests.Add(args[0]);
                    return;
                }
                if (methodName == "RunFinished" && args != null && args.Length > 0)
                {
                    RunFinishedResult = args[0];
                    completion.TrySetResult(args[0]);
                }
            }
        }

        private sealed class McpTestRunCallbackProxy : DispatchProxy
        {
            private Action<string, object[]> callback;

            public static object Create(Type callbacksType, Action<string, object[]> callback)
            {
                MethodInfo create = typeof(DispatchProxy)
                    .GetMethods(BindingFlags.Public | BindingFlags.Static)
                    .First(method => method.Name == "Create" && method.GetGenericArguments().Length == 2)
                    .MakeGenericMethod(callbacksType, typeof(McpTestRunCallbackProxy));
                object proxy = create.Invoke(null, null);
                ((McpTestRunCallbackProxy)proxy).callback = callback;
                return proxy;
            }

            protected override object Invoke(MethodInfo targetMethod, object[] args)
            {
                callback?.Invoke(targetMethod?.Name ?? "", args ?? Array.Empty<object>());
                return null;
            }
        }

        private static bool IsAuthorizedMcpRequest(HttpListenerRequest request, out string message)
        {
            string expected = GreyboxSettings.GetOrCreateMcpBridgeToken();
            string authorization = request.Headers["Authorization"] ?? "";
            if (McpAuthorizationHeaderMatches(authorization, expected))
            {
                message = "";
                return true;
            }
            string tokenHeader = request.Headers["X-Greybox-Mcp-Token"] ?? "";
            if (McpTokenMatches(tokenHeader, expected))
            {
                message = "";
                return true;
            }
            message = "Greybox MCP bridge requires the local bearer token from Window/Greybox/Studio.";
            return false;
        }

        private static bool McpAuthorizationHeaderMatches(string authorization, string expected)
        {
            if (!IsSafeMcpAuthHeader(authorization)) return false;
            if (string.IsNullOrEmpty(authorization) || !authorization.StartsWith(McpBearerPrefix, StringComparison.Ordinal)) return false;
            return McpTokenMatches(authorization.Substring(McpBearerPrefix.Length), expected);
        }

        private static bool McpTokenMatches(string candidate, string expected)
        {
            if (!GreyboxSettings.IsSafeMcpBridgeToken(candidate) || !GreyboxSettings.IsSafeMcpBridgeToken(expected)) return false;
            return FixedTimeEquals(candidate, expected);
        }

        private static bool IsSafeMcpAuthHeader(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > MaxMcpAuthorizationHeaderChars) return false;
            foreach (char c in value)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static bool FixedTimeEquals(string left, string right)
        {
            byte[] leftBytes = Encoding.UTF8.GetBytes(left ?? "");
            byte[] rightBytes = Encoding.UTF8.GetBytes(right ?? "");
            int diff = leftBytes.Length ^ rightBytes.Length;
            int max = Math.Max(leftBytes.Length, rightBytes.Length);
            for (int i = 0; i < max; i++)
            {
                byte leftByte = i < leftBytes.Length ? leftBytes[i] : (byte)0;
                byte rightByte = i < rightBytes.Length ? rightBytes[i] : (byte)0;
                diff |= leftByte ^ rightByte;
            }
            return diff == 0;
        }

        private static string HandleToolCall(string body)
        {
            if (!TryReadDirectToolCallRequest(body, out string name, out JObject args, out string error))
            {
                return new JObject
                {
                    ["error"] = "mcp_invalid_tool_call",
                    ["message"] = SafeMcpErrorMessage(error)
                }.ToString(Formatting.None);
            }
            if (!IsMcpBridgeAllowed(activeConfig, out string accessMessage))
            {
                return new JObject { ["error"] = accessMessage }.ToString(Formatting.None);
            }
            try
            {
                JToken structured = InvokeUnityTool(name, args);
                return DirectToolSuccess(structured).ToString(Formatting.None);
            }
            catch (Exception ex)
            {
                return McpToolError(ex.Message).ToString(Formatting.None);
            }
        }

        private static async Task<string> HandleToolCallAsync(string body)
        {
            if (!TryReadDirectToolCallRequest(body, out string name, out JObject args, out string error))
            {
                return new JObject
                {
                    ["error"] = "mcp_invalid_tool_call",
                    ["message"] = SafeMcpErrorMessage(error)
                }.ToString(Formatting.None);
            }
            if (!IsMcpBridgeAllowed(activeConfig, out string accessMessage))
            {
                return new JObject { ["error"] = accessMessage }.ToString(Formatting.None);
            }
            try
            {
                JToken structured = await InvokeUnityToolAsync(name, args);
                return DirectToolSuccess(structured).ToString(Formatting.None);
            }
            catch (Exception ex)
            {
                return McpToolError(ex.Message).ToString(Formatting.None);
            }
        }

        private static bool TryReadDirectToolCallRequest(string body, out string name, out JObject args, out string error)
        {
            name = "";
            args = new JObject();
            error = "";
            if (string.IsNullOrWhiteSpace(body))
            {
                error = "tools/call body is required";
                return false;
            }

            JToken parsed;
            try
            {
                parsed = JToken.Parse(body);
            }
            catch (JsonReaderException ex)
            {
                error = "JSON parse error: " + ex.Message;
                return false;
            }

            if (!(parsed is JObject request))
            {
                error = "tools/call body must be an object";
                return false;
            }

            if (request.TryGetValue("name", out JToken rawName)
                && rawName != null
                && rawName.Type != JTokenType.Null
                && rawName.Type != JTokenType.String)
            {
                error = "tools/call name must be a string";
                return false;
            }
            name = rawName?.Value<string>() ?? "";
            if (string.IsNullOrWhiteSpace(name))
            {
                error = "tools/call name is required";
                return false;
            }

            if (request.TryGetValue("arguments", out JToken rawArguments)
                && rawArguments != null
                && rawArguments.Type != JTokenType.Null
                && !(rawArguments is JObject))
            {
                error = "tools/call arguments must be an object";
                return false;
            }

            args = rawArguments as JObject ?? new JObject();
            return true;
        }

        private static string HandleMcpJsonRpc(string body)
        {
            if (string.IsNullOrWhiteSpace(body)) return JsonRpcError(null, -32600, "empty JSON-RPC request").ToString(Formatting.None);
            JToken parsed;
            try
            {
                parsed = JToken.Parse(body);
            }
            catch (JsonReaderException ex)
            {
                return JsonRpcError(null, -32700, "JSON parse error: " + ex.Message).ToString(Formatting.None);
            }

            if (parsed is JArray batch)
            {
                if (batch.Count == 0)
                {
                    return JsonRpcError(null, -32600, "empty JSON-RPC batch").ToString(Formatting.None);
                }
                if (batch.Count > MaxMcpJsonRpcBatchItems)
                {
                    return JsonRpcError(null, -32600, $"JSON-RPC batch may contain at most {MaxMcpJsonRpcBatchItems} entries").ToString(Formatting.None);
                }
                var responses = new JArray();
                foreach (JToken item in batch)
                {
                    if (item is JObject message)
                    {
                        JObject response = HandleMcpJsonRpcMessage(message);
                        if (response != null) responses.Add(response);
                    }
                    else
                    {
                        responses.Add(JsonRpcError(null, -32600, "batch entries must be JSON-RPC objects"));
                    }
                }
                return responses.Count == 0 ? "" : responses.ToString(Formatting.None);
            }
            if (parsed is JObject request)
            {
                JObject response = HandleMcpJsonRpcMessage(request);
                return response == null ? "" : response.ToString(Formatting.None);
            }
            return JsonRpcError(null, -32600, "JSON-RPC request must be an object or batch").ToString(Formatting.None);
        }

        private static async Task<string> HandleMcpJsonRpcAsync(string body)
        {
            if (string.IsNullOrWhiteSpace(body)) return JsonRpcError(null, -32600, "empty JSON-RPC request").ToString(Formatting.None);
            JToken parsed;
            try
            {
                parsed = JToken.Parse(body);
            }
            catch (JsonReaderException ex)
            {
                return JsonRpcError(null, -32700, "JSON parse error: " + ex.Message).ToString(Formatting.None);
            }

            if (parsed is JArray batch)
            {
                if (batch.Count == 0)
                {
                    return JsonRpcError(null, -32600, "empty JSON-RPC batch").ToString(Formatting.None);
                }
                if (batch.Count > MaxMcpJsonRpcBatchItems)
                {
                    return JsonRpcError(null, -32600, $"JSON-RPC batch may contain at most {MaxMcpJsonRpcBatchItems} entries").ToString(Formatting.None);
                }
                var responses = new JArray();
                foreach (JToken item in batch)
                {
                    if (item is JObject message)
                    {
                        JObject response = await HandleMcpJsonRpcMessageAsync(message);
                        if (response != null) responses.Add(response);
                    }
                    else
                    {
                        responses.Add(JsonRpcError(null, -32600, "batch entries must be JSON-RPC objects"));
                    }
                }
                return responses.Count == 0 ? "" : responses.ToString(Formatting.None);
            }
            if (parsed is JObject request)
            {
                JObject response = await HandleMcpJsonRpcMessageAsync(request);
                return response == null ? "" : response.ToString(Formatting.None);
            }
            return JsonRpcError(null, -32600, "JSON-RPC request must be an object or batch").ToString(Formatting.None);
        }

        private static JObject HandleMcpJsonRpcMessage(JObject request)
        {
            bool expectsResponse = request.Property("id") != null;
            JToken id = expectsResponse ? request["id"] : null;
            if (request.TryGetValue("jsonrpc", out JToken rawJsonRpc)
                && rawJsonRpc != null
                && rawJsonRpc.Type != JTokenType.Null
                && rawJsonRpc.Type != JTokenType.String)
            {
                return expectsResponse ? JsonRpcError(id, -32600, "jsonrpc must be a string") : null;
            }
            if (rawJsonRpc?.Value<string>() != "2.0")
            {
                return expectsResponse ? JsonRpcError(id, -32600, @"jsonrpc must be ""2.0""") : null;
            }
            if (request.TryGetValue("method", out JToken rawMethod)
                && rawMethod != null
                && rawMethod.Type != JTokenType.Null
                && rawMethod.Type != JTokenType.String)
            {
                return expectsResponse ? JsonRpcError(id, -32600, "method must be a string") : null;
            }
            string method = rawMethod?.Value<string>() ?? "";
            if (string.IsNullOrWhiteSpace(method))
            {
                return expectsResponse ? JsonRpcError(id, -32600, "method is required") : null;
            }
            if (!expectsResponse && method != "notifications/initialized")
            {
                return null;
            }
            try
            {
                switch (method)
                {
                    case "initialize":
                        return JsonRpcResult(id, new JObject
                        {
                            ["protocolVersion"] = "2024-11-05",
                            ["capabilities"] = new JObject { ["tools"] = new JObject() },
                            ["serverInfo"] = new JObject
                            {
                                ["name"] = "greybox-unity-mcp",
                                ["version"] = McpServerVersion
                            }
                        });
                    case "notifications/initialized":
                        return expectsResponse ? JsonRpcResult(id, new JObject()) : null;
                    case "tools/list":
                        return JsonRpcResult(id, JObject.Parse(McpToolDefinitions.ToolsJson()));
                    case "tools/call":
                        if (request.TryGetValue("params", out JToken rawParams)
                            && rawParams != null
                            && rawParams.Type != JTokenType.Null
                            && !(rawParams is JObject))
                        {
                            return JsonRpcError(id, -32602, "tools/call params must be an object");
                        }
                        JObject toolParams = rawParams as JObject ?? new JObject();
                        if (toolParams.TryGetValue("name", out JToken rawName)
                            && rawName != null
                            && rawName.Type != JTokenType.Null
                            && rawName.Type != JTokenType.String)
                        {
                            return JsonRpcError(id, -32602, "tools/call params.name must be a string");
                        }
                        string name = rawName?.Value<string>() ?? "";
                        if (string.IsNullOrWhiteSpace(name))
                        {
                            return JsonRpcError(id, -32602, "tools/call params.name is required");
                        }
                        if (toolParams.TryGetValue("arguments", out JToken rawArguments)
                            && rawArguments != null
                            && rawArguments.Type != JTokenType.Null
                            && !(rawArguments is JObject))
                        {
                            return JsonRpcError(id, -32602, "tools/call params.arguments must be an object");
                        }
                        if (!IsMcpBridgeAllowed(activeConfig, out string accessMessage))
                        {
                            return JsonRpcError(id, -32001, accessMessage);
                        }
                        JObject args = rawArguments as JObject ?? new JObject();
                        try
                        {
                            JToken structured = InvokeUnityTool(name, args);
                            return JsonRpcResult(id, McpToolSuccess(structured));
                        }
                        catch (Exception ex)
                        {
                            return JsonRpcResult(id, McpToolError(ex.Message));
                        }
                    default:
                        return JsonRpcError(id, -32601, $"unknown MCP method: {method}");
                }
            }
            catch (Exception ex)
            {
                return JsonRpcError(id, -32000, ex.Message);
            }
        }

        private static async Task<JObject> HandleMcpJsonRpcMessageAsync(JObject request)
        {
            bool expectsResponse = request.Property("id") != null;
            JToken id = expectsResponse ? request["id"] : null;
            if (request.TryGetValue("jsonrpc", out JToken rawJsonRpc)
                && rawJsonRpc != null
                && rawJsonRpc.Type != JTokenType.Null
                && rawJsonRpc.Type != JTokenType.String)
            {
                return expectsResponse ? JsonRpcError(id, -32600, "jsonrpc must be a string") : null;
            }
            if (rawJsonRpc?.Value<string>() != "2.0")
            {
                return expectsResponse ? JsonRpcError(id, -32600, @"jsonrpc must be ""2.0""") : null;
            }
            if (request.TryGetValue("method", out JToken rawMethod)
                && rawMethod != null
                && rawMethod.Type != JTokenType.Null
                && rawMethod.Type != JTokenType.String)
            {
                return expectsResponse ? JsonRpcError(id, -32600, "method must be a string") : null;
            }
            string method = rawMethod?.Value<string>() ?? "";
            if (string.IsNullOrWhiteSpace(method))
            {
                return expectsResponse ? JsonRpcError(id, -32600, "method is required") : null;
            }
            if (!expectsResponse && method != "notifications/initialized")
            {
                return null;
            }
            try
            {
                switch (method)
                {
                    case "initialize":
                        return JsonRpcResult(id, new JObject
                        {
                            ["protocolVersion"] = "2024-11-05",
                            ["capabilities"] = new JObject { ["tools"] = new JObject() },
                            ["serverInfo"] = new JObject
                            {
                                ["name"] = "greybox-unity-mcp",
                                ["version"] = McpServerVersion
                            }
                        });
                    case "notifications/initialized":
                        return expectsResponse ? JsonRpcResult(id, new JObject()) : null;
                    case "tools/list":
                        return JsonRpcResult(id, JObject.Parse(McpToolDefinitions.ToolsJson()));
                    case "tools/call":
                        if (request.TryGetValue("params", out JToken rawParams)
                            && rawParams != null
                            && rawParams.Type != JTokenType.Null
                            && !(rawParams is JObject))
                        {
                            return JsonRpcError(id, -32602, "tools/call params must be an object");
                        }
                        JObject toolParams = rawParams as JObject ?? new JObject();
                        if (toolParams.TryGetValue("name", out JToken rawName)
                            && rawName != null
                            && rawName.Type != JTokenType.Null
                            && rawName.Type != JTokenType.String)
                        {
                            return JsonRpcError(id, -32602, "tools/call params.name must be a string");
                        }
                        string name = rawName?.Value<string>() ?? "";
                        if (string.IsNullOrWhiteSpace(name))
                        {
                            return JsonRpcError(id, -32602, "tools/call params.name is required");
                        }
                        if (toolParams.TryGetValue("arguments", out JToken rawArguments)
                            && rawArguments != null
                            && rawArguments.Type != JTokenType.Null
                            && !(rawArguments is JObject))
                        {
                            return JsonRpcError(id, -32602, "tools/call params.arguments must be an object");
                        }
                        if (!IsMcpBridgeAllowed(activeConfig, out string accessMessage))
                        {
                            return JsonRpcError(id, -32001, accessMessage);
                        }
                        JObject args = rawArguments as JObject ?? new JObject();
                        try
                        {
                            JToken structured = await InvokeUnityToolAsync(name, args);
                            return JsonRpcResult(id, McpToolSuccess(structured));
                        }
                        catch (Exception ex)
                        {
                            return JsonRpcResult(id, McpToolError(ex.Message));
                        }
                    default:
                        return JsonRpcError(id, -32601, $"unknown MCP method: {method}");
                }
            }
            catch (Exception ex)
            {
                return JsonRpcError(id, -32000, ex.Message);
            }
        }

        private static JObject McpToolSuccess(JToken structured)
        {
            JToken structuredResult = structured ?? JValue.CreateNull();
            return new JObject
            {
                ["content"] = new JArray(new JObject
                {
                    ["type"] = "text",
                    ["text"] = structuredResult.ToString(Formatting.None)
                }),
                ["structuredContent"] = structuredResult,
                ["isError"] = false
            };
        }

        private static JObject DirectToolSuccess(JToken structured)
        {
            JToken structuredResult = structured ?? JValue.CreateNull();
            return new JObject
            {
                ["content"] = new JArray(new JObject
                {
                    ["type"] = "json",
                    ["json"] = structuredResult
                }),
                ["structuredContent"] = structuredResult,
                ["isError"] = false
            };
        }

        private static JObject McpToolError(string message)
        {
            message = SafeMcpErrorMessage(message);
            return new JObject
            {
                ["content"] = new JArray(new JObject
                {
                    ["type"] = "text",
                    ["text"] = message ?? ""
                }),
                ["isError"] = true
            };
        }

        private static JObject JsonRpcResult(JToken id, JToken result)
        {
            return new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = id?.DeepClone() ?? JValue.CreateNull(),
                ["result"] = result
            };
        }

        private static JObject JsonRpcError(JToken id, int code, string message)
        {
            message = SafeMcpErrorMessage(message);
            return new JObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = id?.DeepClone() ?? JValue.CreateNull(),
                ["error"] = new JObject
                {
                    ["code"] = code,
                    ["message"] = message
                }
            };
        }

        private static string SafeMcpErrorMessage(string message)
        {
            if (string.IsNullOrEmpty(message)) return "";
            string safe = message;
            safe = McpBearerTokenPattern.Replace(safe, "[redacted-secret]");
            safe = McpStripeSecretPattern.Replace(safe, "[redacted-secret]");
            safe = McpEmailPattern.Replace(safe, "[redacted-email]");
            safe = McpCardLikePattern.Replace(safe, "[redacted-card]");
            safe = McpIpAddressPattern.Replace(safe, "[redacted-ip]");
            safe = McpStripeObjectPattern.Replace(safe, "[redacted-stripe-id]");
            safe = McpAbsolutePathPattern.Replace(safe, "[redacted-path]");
            return safe.Length <= 2048 ? safe : safe.Substring(0, 2048) + "...";
        }

        private static JToken InvokeUnityTool(string name, JObject args)
        {
            ValidateMcpArguments(name, args);
            if (!IsUnityEditorReadyForMcpMutation(name, out string editorStateMessage))
            {
                throw new InvalidOperationException(editorStateMessage);
            }
            return name switch
            {
                "unity.getSceneHierarchy" => GetSceneHierarchy(),
                "unity.createGameObject" => CreateGameObject(args),
                "unity.addComponent" => AddComponent(args),
                "unity.setField" => SetField(args),
                "unity.assignAsset" => AssignAsset(args),
                "unity.runEditModeTest" => RunEditModeTest(args),
                "unity.captureGameViewScreenshot" => CaptureGameViewScreenshot(args),
                "unity.buildAddressables" => BuildAddressables(),
                _ => throw new InvalidOperationException($"unknown tool: {name}")
            };
        }

        private static async Task<JToken> InvokeUnityToolAsync(string name, JObject args)
        {
            ValidateMcpArguments(name, args);
            if (!IsUnityEditorReadyForMcpMutation(name, out string editorStateMessage))
            {
                throw new InvalidOperationException(editorStateMessage);
            }
            if (name == "unity.runEditModeTest")
            {
                return await RunEditModeTestAsync(args);
            }
            return InvokeUnityTool(name, args);
        }

        private static bool IsUnityEditorReadyForMcpMutation(string toolName, out string message)
        {
            return IsUnityEditorReadyForMcpMutation(
                toolName,
                EditorApplication.isCompiling,
                EditorApplication.isUpdating,
                EditorApplication.isPlayingOrWillChangePlaymode,
                out message);
        }

        private static bool IsUnityEditorReadyForMcpMutation(
            string toolName,
            bool isCompiling,
            bool isUpdating,
            bool isPlayingOrWillChangePlaymode,
            out string message)
        {
            message = "";
            if (!IsMcpMutationTool(toolName)) return true;
            if (isCompiling)
            {
                message = $"Greybox MCP cannot run {toolName} while Unity is compiling. Wait for compilation to finish and retry.";
                return false;
            }
            if (isUpdating)
            {
                message = $"Greybox MCP cannot run {toolName} while Unity is importing or refreshing assets. Wait for the AssetDatabase update to finish and retry.";
                return false;
            }
            if (isPlayingOrWillChangePlaymode)
            {
                message = $"Greybox MCP cannot run {toolName} while Unity is entering, exiting, or running Play Mode. Return to Edit Mode and retry.";
                return false;
            }
            return true;
        }

        private static bool IsMcpMutationTool(string toolName)
        {
            switch (toolName)
            {
                case "unity.createGameObject":
                case "unity.addComponent":
                case "unity.setField":
                case "unity.assignAsset":
                case "unity.runEditModeTest":
                case "unity.buildAddressables":
                    return true;
                default:
                    return false;
            }
        }

        private static void ValidateMcpArguments(string toolName, JObject args)
        {
            string[] allowed = toolName switch
            {
                "unity.getSceneHierarchy" => Array.Empty<string>(),
                "unity.createGameObject" => new[] { "name", "parent", "parentId", "position", "rotation", "scale" },
                "unity.addComponent" => new[] { "gameObjectId", "componentType" },
                "unity.setField" => new[] { "gameObjectId", "componentType", "fieldName", "value" },
                "unity.assignAsset" => new[] { "gameObjectId", "componentType", "fieldName", "assetPath" },
                "unity.runEditModeTest" => new[] { "testName" },
                "unity.captureGameViewScreenshot" => new[] { "width", "height" },
                "unity.buildAddressables" => Array.Empty<string>(),
                _ => null
            };
            if (allowed == null) return;
            string[] required = toolName switch
            {
                "unity.createGameObject" => new[] { "name" },
                "unity.addComponent" => new[] { "gameObjectId", "componentType" },
                "unity.setField" => new[] { "gameObjectId", "componentType", "fieldName", "value" },
                "unity.assignAsset" => new[] { "gameObjectId", "componentType", "fieldName", "assetPath" },
                "unity.runEditModeTest" => new[] { "testName" },
                "unity.captureGameViewScreenshot" => new[] { "width", "height" },
                _ => Array.Empty<string>()
            };
            var allowedSet = new HashSet<string>(allowed, StringComparer.Ordinal);
            foreach (JProperty property in args.Properties())
            {
                if (!allowedSet.Contains(property.Name))
                {
                    throw new InvalidOperationException($"Unexpected argument for {toolName}: {property.Name}");
                }
            }
            foreach (string requiredName in required)
            {
                RequireMcpArgument(toolName, args, requiredName);
            }
            if (toolName == "unity.captureGameViewScreenshot")
            {
                RequireMcpIntegerArgument(toolName, args, "width");
                RequireMcpIntegerArgument(toolName, args, "height");
            }
            ValidateMcpStringArguments(toolName, args);
            ValidateMcpVector3Arguments(toolName, args);
            ValidateMcpSetFieldValueArgument(toolName, args);
        }

        private static JToken RequireMcpArgument(string toolName, JObject args, string argumentName)
        {
            if (!args.TryGetValue(argumentName, out JToken value) || value == null || value.Type == JTokenType.Null)
            {
                throw new InvalidOperationException($"Missing required argument for {toolName}: {argumentName}");
            }
            if (value.Type == JTokenType.String && string.IsNullOrWhiteSpace(value.Value<string>()))
            {
                throw new InvalidOperationException($"Required argument for {toolName} may not be blank: {argumentName}");
            }
            return value;
        }

        private static int RequireMcpIntegerArgument(string toolName, JObject args, string argumentName)
        {
            JToken value = RequireMcpArgument(toolName, args, argumentName);
            if (value.Type != JTokenType.Integer)
            {
                throw new InvalidOperationException($"Argument for {toolName} must be an integer: {argumentName}");
            }
            return ReadMcpInt32Value(value, $"Argument for {toolName} must fit in a 32-bit integer: {argumentName}");
        }

        private static void ValidateMcpStringArguments(string toolName, JObject args)
        {
            switch (toolName)
            {
                case "unity.createGameObject":
                    RequireMcpStringArgument(toolName, args, "name", 128);
                    ValidateOptionalMcpStringArgument(toolName, args, "parent", 512);
                    ValidateOptionalMcpStringArgument(toolName, args, "parentId", 512);
                    break;
                case "unity.addComponent":
                    RequireMcpStringArgument(toolName, args, "gameObjectId", 512);
                    RequireMcpStringArgument(toolName, args, "componentType", 512);
                    break;
                case "unity.setField":
                    RequireMcpStringArgument(toolName, args, "gameObjectId", 512);
                    RequireMcpStringArgument(toolName, args, "componentType", 512);
                    RequireMcpStringArgument(toolName, args, "fieldName", 128);
                    break;
                case "unity.assignAsset":
                    RequireMcpStringArgument(toolName, args, "gameObjectId", 512);
                    RequireMcpStringArgument(toolName, args, "componentType", 512);
                    RequireMcpStringArgument(toolName, args, "fieldName", 128);
                    RequireMcpStringArgument(toolName, args, "assetPath", 512);
                    break;
                case "unity.runEditModeTest":
                    RequireMcpStringArgument(toolName, args, "testName", MaxMcpTestNameLength);
                    break;
            }
        }

        private static string RequireMcpStringArgument(string toolName, JObject args, string argumentName, int maxLength)
        {
            return ValidateMcpStringArgument(toolName, RequireMcpArgument(toolName, args, argumentName), argumentName, maxLength);
        }

        private static void ValidateOptionalMcpStringArgument(string toolName, JObject args, string argumentName, int maxLength)
        {
            if (!args.TryGetValue(argumentName, out JToken value) || value == null || value.Type == JTokenType.Null) return;
            ValidateMcpStringArgument(toolName, value, argumentName, maxLength);
        }

        private static string ValidateMcpStringArgument(string toolName, JToken value, string argumentName, int maxLength)
        {
            if (value.Type != JTokenType.String)
            {
                throw new InvalidOperationException($"Argument for {toolName} must be a string: {argumentName}");
            }
            string text = value.Value<string>() ?? "";
            if (string.IsNullOrWhiteSpace(text))
            {
                throw new InvalidOperationException($"Required argument for {toolName} may not be blank: {argumentName}");
            }
            if (text.Length > maxLength)
            {
                throw new InvalidOperationException($"Argument for {toolName} must be {maxLength} characters or fewer: {argumentName}");
            }
            foreach (char c in text)
            {
                if (char.IsControl(c))
                {
                    throw new InvalidOperationException($"Argument for {toolName} may not contain control characters: {argumentName}");
                }
            }
            return text;
        }

        private static void ValidateMcpVector3Arguments(string toolName, JObject args)
        {
            if (toolName != "unity.createGameObject") return;
            ValidateOptionalMcpVector3Argument(toolName, args, "position");
            ValidateOptionalMcpVector3Argument(toolName, args, "rotation");
            ValidateOptionalMcpVector3Argument(toolName, args, "scale");
        }

        private static void ValidateOptionalMcpVector3Argument(string toolName, JObject args, string argumentName)
        {
            if (!args.TryGetValue(argumentName, out JToken value) || value == null || value.Type == JTokenType.Null) return;
            try
            {
                ReadVector3(value);
            }
            catch (InvalidOperationException error)
            {
                throw new InvalidOperationException($"Argument for {toolName} has invalid Vector3 {argumentName}: {error.Message}");
            }
        }

        private static void ValidateMcpSetFieldValueArgument(string toolName, JObject args)
        {
            if (toolName != "unity.setField") return;
            ValidateMcpSetFieldValueShape(RequireMcpArgument(toolName, args, "value"));
        }

        private static void ValidateMcpSetFieldValueShape(JToken value)
        {
            if (value.Type == JTokenType.String)
            {
                string text = value.Value<string>() ?? "";
                if (text.Length > MaxMcpSetFieldStringValueLength)
                {
                    throw new InvalidOperationException($"Argument for unity.setField string value must be {MaxMcpSetFieldStringValueLength} characters or fewer.");
                }
                return;
            }
            if (value.Type == JTokenType.Integer || value.Type == JTokenType.Float)
            {
                if (!IsJsonFiniteNumber(value))
                {
                    throw new InvalidOperationException("Argument for unity.setField numeric value must be finite.");
                }
                return;
            }
            if (value.Type == JTokenType.Boolean) return;
            if (value is JArray || value is JObject)
            {
                if (CanReadVector3(value) || CanReadColor(value)) return;
                if (CanReadMcpStringArray(value)) return;
                string finiteShapeError = ReadNonFiniteMcpSetFieldShapeError(value);
                if (!string.IsNullOrEmpty(finiteShapeError))
                {
                    throw new InvalidOperationException($"Argument for unity.setField {finiteShapeError}");
                }
            }
            throw new InvalidOperationException("Argument for unity.setField must be a string, string array, number, boolean, Vector3, or Color value.");
        }

        private static bool CanReadVector3(JToken value)
        {
            try
            {
                ReadVector3(value);
                return true;
            }
            catch (InvalidOperationException)
            {
                return false;
            }
        }

        private static string ReadNonFiniteMcpSetFieldShapeError(JToken value)
        {
            try
            {
                ReadVector3(value);
            }
            catch (InvalidOperationException error)
            {
                if (MessageMentionsFinite(error.Message)) return error.Message;
            }

            try
            {
                ReadColor(value);
            }
            catch (InvalidOperationException error)
            {
                if (MessageMentionsFinite(error.Message)) return error.Message;
            }

            return "";
        }

        private static bool MessageMentionsFinite(string message)
        {
            return !string.IsNullOrEmpty(message) && message.IndexOf("finite", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        private static bool CanReadColor(JToken value)
        {
            try
            {
                ReadColor(value);
                return true;
            }
            catch (InvalidOperationException)
            {
                return false;
            }
        }

        private static bool IsMcpBridgeAllowed(GreyboxConfig config, out string message)
        {
            if (!config)
            {
                message = "Create a Greybox config before starting the MCP bridge.";
                return false;
            }
            if (!config.McpBridgeEnabled)
            {
                message = "Enable the MCP bridge in Greybox Studio before starting it.";
                return false;
            }
            if (!GreyboxLicenseState.CurrentCapabilities().CanUseMcpBridge)
            {
                message = "Greybox MCP bridge requires a Pro or Studio license.";
                return false;
            }
            return GreyboxProjectEntitlements.RegisterCurrentProject(config, out message);
        }

        private static JArray GetSceneHierarchy()
        {
            var arr = new JArray();
            var budget = new McpHierarchyBudget(MaxMcpSceneHierarchyNodes, MaxMcpSceneHierarchyDepth);
            foreach (GameObject root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
            {
                if (!budget.HasNodeCapacity)
                {
                    budget.MarkNodeBudgetExceeded();
                    arr.Add(TruncatedMcpHierarchyNode("<additional scene roots>", budget, 0));
                    break;
                }
                arr.Add(DescribeForMcp(root, budget, 0));
            }
            return arr;
        }

        public static JObject DescribeForMcp(GameObject go)
        {
            return DescribeForMcp(go, new McpHierarchyBudget(MaxMcpSceneHierarchyNodes, MaxMcpSceneHierarchyDepth), 0);
        }

        private static JObject DescribeForMcp(GameObject go, McpHierarchyBudget budget, int depth)
        {
            budget.ConsumeNode();
            var children = new JArray();
            bool childrenTruncated = false;
            if (depth >= budget.MaxDepth && go.transform.childCount > 0)
            {
                childrenTruncated = true;
                budget.MarkDepthExceeded();
            }
            else
            {
                foreach (Transform child in go.transform)
                {
                    if (!budget.HasNodeCapacity)
                    {
                        childrenTruncated = true;
                        budget.MarkNodeBudgetExceeded();
                        break;
                    }
                    children.Add(DescribeForMcp(child.gameObject, budget, depth + 1));
                }
            }
            var components = new JArray();
            var componentDetails = new JArray();
            foreach (Component component in go.GetComponents<Component>())
            {
                components.Add(component ? component.GetType().FullName : "<missing>");
                if (component) componentDetails.Add(DescribeComponent(component));
            }
            return new JObject
            {
                ["id"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                ["name"] = go.name,
                ["path"] = HierarchyPath(go.transform),
                ["activeSelf"] = go.activeSelf,
                ["transform"] = new JObject
                {
                    ["localPosition"] = ToJson(go.transform.localPosition),
                    ["localRotationEuler"] = ToJson(go.transform.localEulerAngles),
                    ["localScale"] = ToJson(go.transform.localScale)
                },
                ["roundTripTransform"] = DescribeRoundTripTransform(go.transform),
                ["greybox"] = DescribeGreyboxMarker(go.GetComponent<GreyboxMarker>()),
                ["greyboxDesign"] = DescribeGreyboxDesignNode(go.GetComponent<GreyboxDesignNode>()),
                ["greyboxImport"] = DescribeGreyboxImportedArtifact(go.GetComponent<GreyboxImportedArtifact>()),
                ["unityPrefab"] = DescribeUnityPrefabMetadata(go),
                ["writableGameObjectFields"] = DescribeWritableGameObjectFields(go),
                ["addableComponents"] = DescribeAddableComponents(go),
                ["mcpHierarchy"] = new JObject
                {
                    ["depth"] = depth,
                    ["maxDepth"] = budget.MaxDepth,
                    ["maxNodes"] = budget.MaxNodes,
                    ["nodesVisited"] = budget.NodesVisited,
                    ["childrenTruncated"] = childrenTruncated,
                    ["nodeBudgetExceeded"] = budget.NodeBudgetExceeded,
                    ["depthExceeded"] = budget.DepthExceeded
                },
                ["components"] = components,
                ["componentDetails"] = componentDetails,
                ["children"] = children
            };
        }

        private static JObject TruncatedMcpHierarchyNode(string name, McpHierarchyBudget budget, int depth)
        {
            return new JObject
            {
                ["id"] = "",
                ["name"] = name,
                ["path"] = name,
                ["activeSelf"] = false,
                ["transform"] = new JObject(),
                ["roundTripTransform"] = new JObject(),
                ["greybox"] = new JObject(),
                ["greyboxDesign"] = new JObject(),
                ["greyboxImport"] = new JObject(),
                ["unityPrefab"] = new JObject(),
                ["writableGameObjectFields"] = new JObject(),
                ["addableComponents"] = new JArray(),
                ["mcpHierarchy"] = new JObject
                {
                    ["depth"] = depth,
                    ["maxDepth"] = budget.MaxDepth,
                    ["maxNodes"] = budget.MaxNodes,
                    ["nodesVisited"] = budget.NodesVisited,
                    ["childrenTruncated"] = true,
                    ["nodeBudgetExceeded"] = budget.NodeBudgetExceeded,
                    ["depthExceeded"] = budget.DepthExceeded
                },
                ["components"] = new JArray(),
                ["componentDetails"] = new JArray(),
                ["children"] = new JArray()
            };
        }

        private static JArray DescribeAddableComponents(GameObject go)
        {
            var result = new JArray();
            foreach (Type type in RecommendedMcpAddableComponentTypes)
            {
                if (!IsAddableComponentType(type)) continue;
                bool alreadyAttached = go.GetComponent(type) ? true : false;
                bool allowMultiple = AllowsMultipleMcpComponent(type);
                result.Add(new JObject
                {
                    ["componentType"] = type.FullName,
                    ["componentName"] = type.Name,
                    ["category"] = AddableComponentCategory(type),
                    ["addTool"] = "unity.addComponent",
                    ["alreadyAttached"] = alreadyAttached,
                    ["allowMultiple"] = allowMultiple,
                    ["canAdd"] = allowMultiple || !alreadyAttached,
                    ["acceptedAliases"] = new JArray(type.Name, type.FullName)
                });
            }
            return result;
        }

        private static bool IsAddableComponentType(Type type)
        {
            return type != null
                && typeof(Component).IsAssignableFrom(type)
                && !type.IsAbstract
                && !type.ContainsGenericParameters;
        }

        private static bool AllowsMultipleMcpComponent(Type type)
        {
            return !Attribute.IsDefined(type, typeof(DisallowMultipleComponent), true)
                && type.Namespace != typeof(GreyboxMarker).Namespace;
        }

        private static void RequireCanAddMcpComponent(GameObject go, Type type)
        {
            if (AllowsMultipleMcpComponent(type) || !go.GetComponent(type)) return;
            throw new InvalidOperationException($"GameObject already has a single-instance component: {type.FullName}");
        }

        private static string AddableComponentCategory(Type type)
        {
            if (type.Namespace == typeof(GreyboxMarker).Namespace) return "Greybox Runtime";
            if (type == typeof(Rigidbody) || type == typeof(Rigidbody2D)
                || type == typeof(BoxCollider) || type == typeof(SphereCollider) || type == typeof(CapsuleCollider)
                || type == typeof(BoxCollider2D) || type == typeof(CircleCollider2D) || type == typeof(PolygonCollider2D))
            {
                return "Physics";
            }
            if (type == typeof(MeshFilter) || type == typeof(MeshRenderer) || type == typeof(SpriteRenderer)) return "Rendering";
            if (type == typeof(Camera) || type == typeof(Light) || type == typeof(AudioSource)) return "Scene";
            if (type == typeof(Animator)) return "Animation";
            return "Unity";
        }

        private static JObject DescribeWritableGameObjectFields(GameObject go)
        {
            var layer = DescribeWritableGameObjectField(
                go,
                nameof(GameObject.layer),
                typeof(int),
                new JValue(go.layer),
                new JArray("layer", "unityLayer", "unityLayerName", "layerName")
            );
            layer["layerName"] = LayerMask.LayerToName(go.layer) ?? "";
            layer["propagatesToChildren"] = true;
            layer["allowedLayers"] = DefinedUnityLayers();

            var tag = DescribeWritableGameObjectField(
                go,
                nameof(GameObject.tag),
                typeof(string),
                new JValue(go.tag),
                new JArray("tag", "unityTag", "gameObjectTag")
            );
            tag["allowedTags"] = DefinedUnityTags();

            return new JObject
            {
                [nameof(GameObject.tag)] = tag,
                [nameof(GameObject.layer)] = layer,
                [nameof(GameObject.isStatic)] = DescribeWritableGameObjectField(
                    go,
                    nameof(GameObject.isStatic),
                    typeof(bool),
                    new JValue(go.isStatic),
                    new JArray("isStatic", "static", "unityStatic")
                ),
                [nameof(GameObject.activeSelf)] = DescribeWritableGameObjectField(
                    go,
                    nameof(GameObject.activeSelf),
                    typeof(bool),
                    new JValue(go.activeSelf),
                    new JArray("activeSelf", "active", "unityActive")
                )
            };
        }

        private static JObject DescribeWritableGameObjectField(GameObject go, string fieldName, Type valueType, JToken value, JArray aliases)
        {
            var result = new JObject
            {
                ["fieldName"] = fieldName,
                ["componentType"] = typeof(GameObject).FullName,
                ["valueType"] = valueType.FullName,
                ["valueSchema"] = DescribeMcpValueSchema(valueType),
                ["value"] = value,
                ["setTool"] = "unity.setField",
                ["acceptedAliases"] = aliases
            };
            if (GreyboxRoundTripFieldMapper.TryMap(go, fieldName, out GreyboxRoundTripFieldEdit roundTripEdit))
            {
                result["roundTrip"] = DescribeRoundTripEdit(roundTripEdit);
            }
            return result;
        }

        private static JArray DefinedUnityTags()
        {
            var tags = new JArray();
            foreach (string tag in UnityEditorInternal.InternalEditorUtility.tags)
            {
                tags.Add(tag);
            }
            return tags;
        }

        private static JArray DefinedUnityLayers()
        {
            var layers = new JArray();
            for (int index = 0; index <= 31; index++)
            {
                string layerName = LayerMask.LayerToName(index);
                if (string.IsNullOrWhiteSpace(layerName)) continue;
                layers.Add(new JObject
                {
                    ["index"] = index,
                    ["name"] = layerName
                });
            }
            return layers;
        }

        private static JObject DescribeComponent(Component component)
        {
            Type type = component.GetType();
            var fields = new JObject();
            var roundTripFields = new JObject();
            foreach (FieldInfo field in type.GetFields(BindingFlags.Instance | BindingFlags.Public))
            {
                if (IsWritableMcpValueField(field))
                {
                    fields[field.Name] = ToJsonValue(field.GetValue(component), field.FieldType);
                    if (GreyboxRoundTripFieldMapper.TryMap(component, field.Name, out GreyboxRoundTripFieldEdit roundTripEdit))
                    {
                        roundTripFields[field.Name] = DescribeRoundTripEdit(roundTripEdit);
                    }
                }
            }
            return new JObject
            {
                ["type"] = type.FullName,
                ["fields"] = fields,
                ["writableProperties"] = DescribeWritableProperties(component),
                ["writableFields"] = DescribeWritableFields(component),
                ["assetReferenceFields"] = DescribeAssetReferenceFields(component),
                ["greyboxTilemap"] = DescribeGreyboxTilemap(component as GreyboxLevelTilemap),
                ["roundTripFields"] = roundTripFields
            };
        }

        private static JObject DescribeGreyboxTilemap(GreyboxLevelTilemap tilemap)
        {
            if (!tilemap) return new JObject();
            GreyboxLevelTileRecord[] records = tilemap.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>();
            var unityTilemap = tilemap.GetComponent<Tilemap>();
            var readback = new JArray();
            int count = Math.Min(records.Length, MaxMcpTilemapRecordReadback);
            for (int i = 0; i < count; i++)
            {
                GreyboxLevelTileRecord record = records[i];
                if (record == null) continue;
                GreyboxMarker marker = TileMarkerForTileRecord(tilemap, record.TileId);
                var item = new JObject
                {
                    ["tileId"] = record.TileId ?? "",
                    ["tileType"] = record.TileType ?? "",
                    ["sourceJsonPath"] = record.SourceJsonPath ?? "",
                    ["position"] = ToJson(record.Position),
                    ["worldPosition"] = ToJson(TileRecordWorldPosition(tilemap, unityTilemap, record)),
                    ["colorHex"] = record.ColorHex ?? "",
                    ["walkable"] = record.Walkable,
                    ["blocksMovement"] = record.BlocksMovement,
                    ["isSpawn"] = record.IsSpawn,
                    ["isExit"] = record.IsExit,
                    ["isHazard"] = record.IsHazard,
                    ["editableFields"] = DescribeTileRecordEditableFields(record)
                };
                if (marker)
                {
                    item["markerGameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(marker.gameObject).ToString();
                    item["markerName"] = marker.MarkerName ?? "";
                    item["markerHierarchyPath"] = HierarchyPath(marker.transform);
                }
                readback.Add(item);
            }

            return new JObject
            {
                ["sourceJsonPath"] = tilemap.SourceJsonPath ?? "",
                ["tileCount"] = tilemap.TileCount,
                ["recordCount"] = records.Length,
                ["records"] = readback,
                ["recordsTruncated"] = records.Length > MaxMcpTilemapRecordReadback,
                ["maxRecords"] = MaxMcpTilemapRecordReadback,
                ["tileAssetCount"] = (tilemap.TileAssets ?? Array.Empty<TileBase>()).Count(tile => tile),
                ["tileTextureCount"] = (tilemap.TileTextures ?? Array.Empty<Texture2D>()).Count(texture => texture),
                ["tileSpriteCount"] = (tilemap.TileSprites ?? Array.Empty<Sprite>()).Count(sprite => sprite),
                ["boundsOrigin"] = ToJson(tilemap.BoundsOrigin),
                ["boundsSize"] = ToJson(tilemap.BoundsSize),
                ["colliderEnabled"] = tilemap.ColliderEnabled,
                ["compositeColliderEnabled"] = tilemap.CompositeColliderEnabled
            };
        }

        private static Vector3 TileRecordWorldPosition(GreyboxLevelTilemap metadata, Tilemap tilemap, GreyboxLevelTileRecord record)
        {
            if (record == null) return Vector3.zero;
            if (tilemap) return tilemap.CellToWorld(record.Position);
            return metadata ? metadata.transform.TransformPoint(record.Position) : (Vector3)record.Position;
        }

        private static JObject DescribeTileRecordEditableFields(GreyboxLevelTileRecord record)
        {
            if (record == null || !IsSafeMcpTileRecordSelector(record.TileId)) return new JObject();
            return new JObject
            {
                ["type"] = DescribeTileRecordEditableField(record, "type", typeof(string), new JValue(record.TileType ?? "")),
                ["walkable"] = DescribeTileRecordEditableField(record, "walkable", typeof(bool), new JValue(record.Walkable)),
                ["blocksMovement"] = DescribeTileRecordEditableField(record, "blocksMovement", typeof(bool), new JValue(record.BlocksMovement)),
                ["isSpawn"] = DescribeTileRecordEditableField(record, "isSpawn", typeof(bool), new JValue(record.IsSpawn)),
                ["isExit"] = DescribeTileRecordEditableField(record, "isExit", typeof(bool), new JValue(record.IsExit)),
                ["isHazard"] = DescribeTileRecordEditableField(record, "isHazard", typeof(bool), new JValue(record.IsHazard)),
                ["colorHex"] = DescribeTileRecordEditableField(record, "colorHex", typeof(string), new JValue(record.ColorHex ?? "")),
                ["position"] = DescribeTileRecordEditableField(record, "position", typeof(Vector3), ToJson(record.Position))
            };
        }

        private static JObject DescribeTileRecordEditableField(GreyboxLevelTileRecord record, string fieldKey, Type valueType, JToken value)
        {
            string fieldName = TileRecordSetFieldName(record.TileId, fieldKey);
            var result = new JObject
            {
                ["fieldName"] = fieldName,
                ["componentType"] = typeof(GreyboxLevelTilemap).FullName,
                ["valueType"] = valueType.FullName,
                ["valueSchema"] = DescribeMcpValueSchema(valueType),
                ["value"] = value,
                ["setTool"] = "unity.setField"
            };
            string roundTripPath = TileRecordJsonPath(record, fieldKey);
            if (!string.IsNullOrWhiteSpace(roundTripPath))
            {
                result["roundTrip"] = new JObject
                {
                    ["path"] = roundTripPath,
                    ["value"] = value?.DeepClone() ?? JValue.CreateNull()
                };
            }
            return result;
        }

        private static JArray DescribeWritableFields(Component component)
        {
            Type type = component.GetType();
            var members = new JArray();
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public;
            foreach (FieldInfo field in type.GetFields(flags))
            {
                if (!IsWritableMcpValueField(field)) continue;
                members.Add(DescribeWritableField(component, field));
            }
            return members;
        }

        private static bool IsWritableMcpValueField(FieldInfo field)
        {
            if (!IsEditorSerializedMcpField(field)) return false;
            if (!ShouldExposeMcpValue(field.FieldType)) return false;
            return true;
        }

        private static JObject DescribeWritableField(Component component, FieldInfo field)
        {
            var result = new JObject
            {
                ["name"] = field.Name,
                ["memberKind"] = "field",
                ["valueType"] = field.FieldType.FullName,
                ["valueSchema"] = DescribeMcpValueSchema(field.FieldType),
                ["setTool"] = "unity.setField"
            };
            if (field.FieldType.IsEnum)
            {
                result["allowedEnumValues"] = new JArray(Enum.GetNames(field.FieldType));
            }
            try
            {
                object value = field.GetValue(component);
                result["readable"] = true;
                result["value"] = ToJsonValue(value, field.FieldType);
                if (GreyboxRoundTripFieldMapper.TryMap(component, field.Name, out GreyboxRoundTripFieldEdit roundTripEdit))
                {
                    result["roundTrip"] = DescribeRoundTripEdit(roundTripEdit);
                }
            }
            catch (Exception ex)
            {
                result["readable"] = false;
                result["value"] = JValue.CreateNull();
                result["readError"] = ex.GetBaseException().Message;
            }
            return result;
        }

        private static JArray DescribeWritableProperties(Component component)
        {
            Type type = component.GetType();
            var members = new JArray();
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public;
            foreach (PropertyInfo property in type.GetProperties(flags))
            {
                if (!IsWritableMcpValueProperty(property)) continue;
                members.Add(DescribeWritableProperty(component, property));
            }
            return members;
        }

        private static bool IsWritableMcpValueProperty(PropertyInfo property)
        {
            if (property.GetIndexParameters().Length != 0) return false;
            if (property.GetGetMethod(false) == null || property.GetSetMethod(false) == null) return false;
            if (!ShouldExposeMcpValue(property.PropertyType)) return false;
            if (property.DeclaringType == typeof(UnityEngine.Object) || property.DeclaringType == typeof(Component)) return false;
            return !Attribute.IsDefined(property, typeof(ObsoleteAttribute));
        }

        private static JObject DescribeWritableProperty(Component component, PropertyInfo property)
        {
            var result = new JObject
            {
                ["name"] = property.Name,
                ["memberKind"] = "property",
                ["valueType"] = property.PropertyType.FullName,
                ["valueSchema"] = DescribeMcpValueSchema(property.PropertyType),
                ["setTool"] = "unity.setField"
            };
            if (property.PropertyType.IsEnum)
            {
                result["allowedEnumValues"] = new JArray(Enum.GetNames(property.PropertyType));
            }
            try
            {
                object value = property.GetValue(component);
                result["readable"] = true;
                result["value"] = ToJsonValue(value, property.PropertyType);
                if (GreyboxRoundTripFieldMapper.TryMap(component, property.Name, out GreyboxRoundTripFieldEdit roundTripEdit))
                {
                    result["roundTrip"] = DescribeRoundTripEdit(roundTripEdit);
                }
            }
            catch (Exception ex)
            {
                result["readable"] = false;
                result["value"] = JValue.CreateNull();
                result["readError"] = ex.GetBaseException().Message;
            }
            return result;
        }

        private static JArray DescribeAssetReferenceFields(Component component)
        {
            Type type = component.GetType();
            var members = new JArray();
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public;
            foreach (FieldInfo field in type.GetFields(flags))
            {
                if (!IsAssignableAssetReferenceField(field)) continue;
                members.Add(DescribeAssetReferenceMember(
                    field.Name,
                    "field",
                    field.FieldType,
                    () => field.GetValue(component) as UnityEngine.Object
                ));
            }

            foreach (PropertyInfo property in type.GetProperties(flags))
            {
                if (!IsAssignableAssetReferenceProperty(property)) continue;
                members.Add(DescribeAssetReferenceMember(
                    property.Name,
                    "property",
                    property.PropertyType,
                    () => property.GetValue(component) as UnityEngine.Object
                ));
            }
            return members;
        }

        private static bool IsAssignableAssetReferenceProperty(PropertyInfo property)
        {
            if (property.GetIndexParameters().Length != 0) return false;
            if (property.GetGetMethod(false) == null || property.GetSetMethod(false) == null) return false;
            if (!typeof(UnityEngine.Object).IsAssignableFrom(property.PropertyType)) return false;
            if (property.DeclaringType == typeof(UnityEngine.Object) || property.DeclaringType == typeof(Component)) return false;
            if (Attribute.IsDefined(property, typeof(ObsoleteAttribute))) return false;
            return property.Name != "material";
        }

        private static JObject DescribeAssetReferenceMember(string name, string memberKind, Type valueType, Func<UnityEngine.Object> readValue)
        {
            var result = new JObject
            {
                ["name"] = name,
                ["memberKind"] = memberKind,
                ["valueType"] = valueType.FullName,
                ["assignTool"] = "unity.assignAsset"
            };
            try
            {
                UnityEngine.Object value = readValue();
                string assetPath = value ? AssetDatabase.GetAssetPath(value) ?? "" : "";
                result["readable"] = true;
                result["isAssigned"] = value ? true : false;
                result["objectName"] = value ? value.name ?? "" : "";
                result["assetPath"] = assetPath;
                result["assetGuid"] = string.IsNullOrWhiteSpace(assetPath) ? "" : AssetDatabase.AssetPathToGUID(assetPath);
            }
            catch (Exception ex)
            {
                result["readable"] = false;
                result["isAssigned"] = false;
                result["objectName"] = "";
                result["assetPath"] = "";
                result["assetGuid"] = "";
                result["readError"] = ex.GetBaseException().Message;
            }
            return result;
        }

        private static JObject DescribeRoundTripTransform(Transform transform)
        {
            var result = new JObject();
            AddRoundTripTransform(result, "localPosition", transform, nameof(Transform.localPosition));
            AddRoundTripTransform(result, "localRotationEuler", transform, nameof(Transform.localEulerAngles));
            AddRoundTripTransform(result, "localScale", transform, nameof(Transform.localScale));
            return result;
        }

        private static void AddRoundTripTransform(JObject result, string name, Transform transform, string fieldName)
        {
            if (GreyboxRoundTripFieldMapper.TryMap(transform, fieldName, out GreyboxRoundTripFieldEdit edit))
            {
                result[name] = DescribeRoundTripEdit(edit);
            }
        }

        private static JObject DescribeRoundTripEdit(GreyboxRoundTripFieldEdit edit)
        {
            var result = new JObject
            {
                ["path"] = edit.Path,
                ["value"] = edit.Value
            };
            if (edit.Marker)
            {
                result["artifactKind"] = edit.Marker.ArtifactKind.ToString();
                result["sourceFileName"] = edit.Marker.SourceFileName;
                result["collection"] = edit.Marker.Collection;
                result["markerId"] = edit.Marker.MarkerId;
            }
            return result;
        }

        private static JObject DescribeGreyboxMarker(GreyboxMarker marker)
        {
            if (!marker) return new JObject();
            return new JObject
            {
                ["artifactKind"] = marker.ArtifactKind.ToString(),
                ["sourceFileName"] = marker.SourceFileName,
                ["collection"] = marker.Collection,
                ["markerId"] = marker.MarkerId,
                ["markerName"] = marker.MarkerName,
                ["jsonPath"] = marker.JsonPath,
                ["positionJsonPath"] = marker.PositionJsonPath,
                ["unityAssetPath"] = marker.UnityAssetPath,
                ["unityAssetGuid"] = marker.UnityAssetGuid,
                ["primitive"] = marker.Primitive
            };
        }

        private static JObject DescribeGreyboxDesignNode(GreyboxDesignNode designNode)
        {
            if (!designNode) return new JObject();
            var tags = new JArray();
            foreach (string tag in designNode.Tags ?? new List<string>())
            {
                if (!string.IsNullOrWhiteSpace(tag)) tags.Add(tag);
            }

            var properties = new JArray();
            foreach (GreyboxDesignProperty property in designNode.Properties ?? new List<GreyboxDesignProperty>())
            {
                if (property == null) continue;
                properties.Add(new JObject
                {
                    ["key"] = property.Key ?? "",
                    ["kind"] = property.Kind.ToString(),
                    ["value"] = property.Value ?? ""
                });
            }

            return new JObject
            {
                ["artifactKind"] = designNode.ArtifactKind.ToString(),
                ["collection"] = designNode.Collection,
                ["nodeId"] = designNode.NodeId,
                ["displayName"] = designNode.DisplayName,
                ["jsonPath"] = designNode.JsonPath,
                ["authoredPosition"] = ToJson(designNode.AuthoredPosition),
                ["authoredRotationEuler"] = ToJson(designNode.AuthoredRotationEuler),
                ["authoredScale"] = ToJson(designNode.AuthoredScale),
                ["tags"] = tags,
                ["properties"] = properties
            };
        }

        private static JObject DescribeGreyboxImportedArtifact(GreyboxImportedArtifact imported)
        {
            if (!imported) return new JObject();
            string importReceiptPath = imported.ImportReceiptPath ?? "";
            string importReceiptGuid = IsSafeMcpImportReceiptPath(importReceiptPath) ? AssetDatabase.AssetPathToGUID(importReceiptPath) : "";
            bool importReceiptExists = !string.IsNullOrWhiteSpace(importReceiptGuid);
            GreyboxImportReceipt receipt = importReceiptExists ? AssetDatabase.LoadAssetAtPath<GreyboxImportReceipt>(importReceiptPath) : null;
            return new JObject
            {
                ["artifactId"] = imported.ArtifactId ?? "",
                ["kind"] = imported.Kind.ToString(),
                ["sourcePath"] = imported.SourcePath ?? "",
                ["sourceHash"] = imported.SourceHash ?? "",
                ["generatorCredit"] = imported.GeneratorCredit ?? "",
                ["humanDesignerCredit"] = imported.HumanDesignerCredit ?? "",
                ["aiDisclosure"] = imported.AiDisclosure ?? "",
                ["canonicalGeneratedAssetPath"] = imported.CanonicalGeneratedAssetPath ?? "",
                ["exportedAssetPath"] = imported.ExportedAssetPath ?? "",
                ["importReceiptId"] = imported.ImportReceiptId ?? "",
                ["importReceiptPath"] = importReceiptPath,
                ["importReceiptExists"] = importReceiptExists,
                ["importReceiptGuid"] = importReceiptGuid,
                ["importReceipt"] = DescribeImportReceiptSummary(receipt),
                ["exportedToIncomingSidecar"] = imported.ExportedToIncomingSidecar,
                ["watermarked"] = imported.Watermarked
            };
        }

        private static JObject DescribeImportReceiptSummary(GreyboxImportReceipt receipt)
        {
            if (!receipt) return new JObject
            {
                ["generatedAssetPaths"] = new JArray(),
                ["generatedAssetPathCount"] = 0,
                ["generatedAssetPathsTruncated"] = false,
                ["addressableLabels"] = new JArray(),
                ["addressableLabelCount"] = 0,
                ["addressableLabelsTruncated"] = false,
                ["missingReferences"] = new JArray(),
                ["missingReferenceCount"] = 0,
                ["missingReferencesTruncated"] = false,
                ["hasMissingReferences"] = false,
                ["maxEntries"] = MaxMcpImportReceiptSummaryEntries
            };

            return new JObject
            {
                ["receiptId"] = receipt.ReceiptId ?? "",
                ["artifactId"] = receipt.ArtifactId ?? "",
                ["kind"] = receipt.Kind.ToString(),
                ["importReceiptPath"] = receipt.ImportReceiptPath ?? "",
                ["updatedAtUnixMs"] = receipt.UpdatedAtUnixMs,
                ["canonicalGeneratedAssetPath"] = receipt.CanonicalGeneratedAssetPath ?? "",
                ["exportedAssetPath"] = receipt.ExportedAssetPath ?? "",
                ["exportedToIncomingSidecar"] = receipt.ExportedToIncomingSidecar,
                ["watermarked"] = receipt.Watermarked,
                ["generatedAssetPaths"] = BoundedStringArray(receipt.GeneratedAssetPaths, MaxMcpImportReceiptSummaryEntries),
                ["generatedAssetPathCount"] = receipt.GeneratedAssetPaths?.Count ?? 0,
                ["generatedAssetPathsTruncated"] = (receipt.GeneratedAssetPaths?.Count ?? 0) > MaxMcpImportReceiptSummaryEntries,
                ["addressableLabels"] = BoundedStringArray(receipt.AddressableLabels, MaxMcpImportReceiptSummaryEntries),
                ["addressableLabelCount"] = receipt.AddressableLabels?.Count ?? 0,
                ["addressableLabelsTruncated"] = (receipt.AddressableLabels?.Count ?? 0) > MaxMcpImportReceiptSummaryEntries,
                ["missingReferences"] = BoundedMissingReferenceArray(receipt.MissingReferences, MaxMcpImportReceiptSummaryEntries),
                ["missingReferenceCount"] = receipt.MissingReferences?.Count ?? 0,
                ["missingReferencesTruncated"] = (receipt.MissingReferences?.Count ?? 0) > MaxMcpImportReceiptSummaryEntries,
                ["hasMissingReferences"] = receipt.HasMissingReferences,
                ["maxEntries"] = MaxMcpImportReceiptSummaryEntries
            };
        }

        private static JArray BoundedStringArray(IEnumerable<string> values, int maxItems)
        {
            var result = new JArray();
            foreach (string value in values ?? Array.Empty<string>())
            {
                if (result.Count >= maxItems) break;
                if (!string.IsNullOrWhiteSpace(value)) result.Add(value);
            }
            return result;
        }

        private static JArray BoundedMissingReferenceArray(IEnumerable<GreyboxMissingReferenceRecord> values, int maxItems)
        {
            var result = new JArray();
            foreach (GreyboxMissingReferenceRecord value in values ?? Array.Empty<GreyboxMissingReferenceRecord>())
            {
                if (result.Count >= maxItems) break;
                if (value == null) continue;
                result.Add(new JObject
                {
                    ["objectPath"] = value.ObjectPath ?? "",
                    ["componentType"] = value.ComponentType ?? "",
                    ["referenceName"] = value.ReferenceName ?? "",
                    ["expectedAssetPath"] = value.ExpectedAssetPath ?? ""
                });
            }
            return result;
        }

        private static bool IsSafeMcpImportReceiptPath(string path)
        {
            string normalized = GreyboxGeneratedAssetPaths.NormalizePath(path);
            if (string.IsNullOrWhiteSpace(normalized)) return false;
            if (!normalized.StartsWith(GreyboxGeneratedAssetPaths.Root + "/", StringComparison.Ordinal)) return false;
            if (!normalized.EndsWith(".asset", StringComparison.OrdinalIgnoreCase)) return false;
            if (normalized.Contains("//")) return false;
            if (normalized.Any(char.IsControl)) return false;

            string[] segments = normalized.Split('/');
            if (segments.Length < 6) return false;
            if (!string.Equals(segments[segments.Length - 2], GreyboxGeneratedAssetPaths.ReceiptsFolder, StringComparison.Ordinal)) return false;
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }
            return true;
        }

        private static JObject DescribeUnityPrefabMetadata(GameObject go)
        {
            string assetPath = AssetDatabase.GetAssetPath(go) ?? "";
            string nearestPrefabAssetPath = PrefabUtility.GetPrefabAssetPathOfNearestInstanceRoot(go) ?? "";
            UnityEngine.Object source = PrefabUtility.GetCorrespondingObjectFromSource(go);
            string sourcePrefabAssetPath = source ? AssetDatabase.GetAssetPath(source) ?? "" : "";
            return new JObject
            {
                ["isPartOfPrefabAsset"] = PrefabUtility.IsPartOfPrefabAsset(go),
                ["isPartOfPrefabInstance"] = PrefabUtility.IsPartOfPrefabInstance(go),
                ["isAnyPrefabInstanceRoot"] = PrefabUtility.IsAnyPrefabInstanceRoot(go),
                ["prefabInstanceStatus"] = PrefabUtility.GetPrefabInstanceStatus(go).ToString(),
                ["assetPath"] = assetPath,
                ["assetGuid"] = string.IsNullOrWhiteSpace(assetPath) ? "" : AssetDatabase.AssetPathToGUID(assetPath),
                ["nearestPrefabAssetPath"] = nearestPrefabAssetPath,
                ["nearestPrefabAssetGuid"] = string.IsNullOrWhiteSpace(nearestPrefabAssetPath) ? "" : AssetDatabase.AssetPathToGUID(nearestPrefabAssetPath),
                ["sourcePrefabAssetPath"] = sourcePrefabAssetPath,
                ["sourcePrefabAssetGuid"] = string.IsNullOrWhiteSpace(sourcePrefabAssetPath) ? "" : AssetDatabase.AssetPathToGUID(sourcePrefabAssetPath)
            };
        }

        private static JObject CreateGameObject(JObject args)
        {
            string parentId = ReadMcpCreateGameObjectParentId(args);
            GameObject parent = null;
            if (!string.IsNullOrWhiteSpace(parentId))
            {
                parent = ResolveObject(parentId);
            }
            string objectName = UniqueGameObjectName(parent, args.Value<string>("name") ?? "Greybox Object");
            var go = new GameObject(objectName);
            if (parent) go.transform.SetParent(parent.transform, false);
            ApplyInitialTransform(go.transform, args);
            Undo.RegisterCreatedObjectUndo(go, "Greybox create object");
            bool mapped = TryStampCreatedGreyboxNode(go, parent, out GreyboxRoundTripFieldEdit createEdit);
            if (mapped) GreyboxSceneChangeWatcher.QueueFieldEdit(go, createEdit);
            bool sceneDirty = MarkMcpEditedSceneDirty(go);
            return new JObject
            {
                ["id"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                ["name"] = go.name,
                ["parentId"] = parentId ?? "",
                ["roundTripPath"] = mapped ? createEdit.Path : "",
                ["roundTripValue"] = mapped ? createEdit.Value : JValue.CreateNull(),
                ["sceneDirty"] = sceneDirty
            };
        }

        private static string ReadMcpCreateGameObjectParentId(JObject args)
        {
            string parent = (args.Value<string>("parent") ?? "").Trim();
            string parentId = (args.Value<string>("parentId") ?? "").Trim();
            if (!string.IsNullOrWhiteSpace(parent)
                && !string.IsNullOrWhiteSpace(parentId)
                && !string.Equals(parent, parentId, StringComparison.Ordinal))
            {
                throw new InvalidOperationException("unity.createGameObject parent and parentId must match when both are provided.");
            }
            return !string.IsNullOrWhiteSpace(parent) ? parent : parentId;
        }

        private static void ApplyInitialTransform(Transform transform, JObject args)
        {
            JToken position = args["position"] ?? args["localPosition"];
            if (position != null) transform.localPosition = ReadVector3(position);
            JToken rotation = args["rotation"] ?? args["rotationEuler"] ?? args["localRotation"];
            if (rotation != null) transform.localEulerAngles = ReadVector3(rotation);
            JToken scale = args["scale"] ?? args["localScale"];
            if (scale != null) transform.localScale = ReadVector3(scale);
        }

        private static string UniqueGameObjectName(GameObject parent, string requestedName)
        {
            string seed = SafeGameObjectName(requestedName);
            var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (parent)
            {
                for (int i = 0; i < parent.transform.childCount; i++)
                {
                    taken.Add(parent.transform.GetChild(i).name);
                }
            }
            else
            {
                foreach (GameObject root in EditorSceneManager.GetActiveScene().GetRootGameObjects())
                {
                    taken.Add(root.name);
                }
            }

            string candidate = seed;
            int suffix = 2;
            while (taken.Contains(candidate))
            {
                candidate = $"{seed} {suffix}";
                suffix++;
            }
            return candidate;
        }

        private static string SafeGameObjectName(string value)
        {
            string clean = string.IsNullOrWhiteSpace(value) ? "Greybox Object" : value.Trim();
            foreach (char c in Path.GetInvalidFileNameChars())
            {
                clean = clean.Replace(c, '_');
            }
            clean = clean.Replace('/', '_').Replace('\\', '_');
            return string.IsNullOrWhiteSpace(clean) ? "Greybox Object" : clean;
        }

        private static bool TryStampCreatedGreyboxNode(GameObject go, GameObject parent, out GreyboxRoundTripFieldEdit edit)
        {
            edit = default;
            var parentMarker = parent ? parent.GetComponent<GreyboxMarker>() : null;
            if (!parentMarker || !IsCollectionRoot(parentMarker)) return false;
            string sourceFileName = SafeMcpMarkerSourceFileName(parentMarker);
            if (string.IsNullOrWhiteSpace(sourceFileName)) return false;
            string markerId = UniqueMarkerId(parent, parentMarker, SafeMarkerId(go.name));
            if (string.IsNullOrWhiteSpace(markerId)) return false;
            string idField = RoundTripIdFieldForCollection(parentMarker.Collection);
            string jsonPath = $"{parentMarker.JsonPath}[{idField}={markerId}]";
            var marker = go.AddComponent<GreyboxMarker>();
            marker.ArtifactKind = parentMarker.ArtifactKind;
            marker.SourcePath = SafeMcpMarkerSourcePath(parentMarker.SourcePath);
            marker.SourceFileName = sourceFileName;
            marker.Collection = parentMarker.Collection;
            marker.MarkerId = markerId;
            marker.MarkerName = go.name;
            marker.JsonPath = jsonPath;
            marker.PositionJsonPath = $"{jsonPath}.position";

            var designNode = go.AddComponent<GreyboxDesignNode>();
            designNode.ArtifactKind = marker.ArtifactKind;
            designNode.Collection = marker.Collection;
            designNode.NodeId = markerId;
            designNode.DisplayName = go.name;
            designNode.JsonPath = jsonPath;
            designNode.AuthoredPosition = go.transform.localPosition;
            designNode.AuthoredRotationEuler = go.transform.localEulerAngles;
            designNode.AuthoredScale = go.transform.localScale;
            AttachDefaultRuntimeComponent(go, marker);

            JObject node = CreatedNodeJson(marker.Collection, idField, markerId, go.name, go.transform.localPosition, go.transform.localEulerAngles, go.transform.localScale);
            ApplyCreatedTilemapCell(go, parent, marker, node);
            edit = new GreyboxRoundTripFieldEdit(marker, jsonPath, node);
            return true;
        }

        private static void AttachDefaultRuntimeComponent(GameObject go, GreyboxMarker marker)
        {
            switch (marker.Collection)
            {
                case "actors":
                    var actor = go.AddComponent<GreyboxActorDefinition>();
                    actor.ActorId = marker.MarkerId;
                    actor.DisplayName = marker.MarkerName;
                    actor.Health = 1;
                    actor.MoveSpeed = 1f;
                    actor.Damage = 1;
                    actor.AttackRange = 1f;
                    actor.AttackCooldownSeconds = 1f;
                    actor.AggroRadius = 5f;
                    break;
                case "spawnPoints":
                    var spawn = go.AddComponent<GreyboxSpawnPoint>();
                    spawn.SpawnId = marker.MarkerId;
                    spawn.DisplayName = marker.MarkerName;
                    spawn.SpawnRadius = 0.5f;
                    break;
                case "objectives":
                    var objective = go.AddComponent<GreyboxObjective>();
                    objective.ObjectiveId = marker.MarkerId;
                    objective.DisplayName = marker.MarkerName;
                    objective.ObjectiveType = "objective";
                    objective.RequiredCount = 1;
                    break;
                case "hazards":
                    var hazard = go.AddComponent<GreyboxHazard>();
                    hazard.HazardId = marker.MarkerId;
                    hazard.DisplayName = marker.MarkerName;
                    hazard.Damage = 1f;
                    hazard.TickSeconds = 1f;
                    hazard.Radius = 1f;
                    break;
                case "rooms":
                    var room = go.AddComponent<GreyboxLevelRoom>();
                    room.RoomId = marker.MarkerId;
                    room.DisplayName = marker.MarkerName;
                    room.RoomType = "room";
                    room.Size = Vector3.one;
                    break;
                case "encounters":
                    var encounter = go.AddComponent<GreyboxEncounter>();
                    encounter.EncounterId = marker.MarkerId;
                    encounter.DisplayName = marker.MarkerName;
                    encounter.EncounterType = "encounter";
                    encounter.Radius = 1f;
                    break;
                case "connections":
                    var connection = go.AddComponent<GreyboxLevelConnection>();
                    connection.ConnectionId = marker.MarkerId;
                    connection.ConnectionType = "connection";
                    connection.TravelCost = 1f;
                    break;
                case "checkpoints":
                    var checkpointHitbox = go.GetComponent<BoxCollider2D>() ?? go.AddComponent<BoxCollider2D>();
                    checkpointHitbox.isTrigger = true;
                    var checkpoint = go.AddComponent<GreyboxPlatformerSampleCheckpoint>();
                    checkpoint.CheckpointId = marker.MarkerId;
                    checkpoint.DisplayName = marker.MarkerName;
                    checkpoint.SourceArtifactKind = "gameview.checkpoint";
                    checkpoint.SourceArtifactId = marker.MarkerId;
                    checkpoint.SourceArtifactDisplayName = marker.MarkerName;
                    checkpoint.MaxActivations = 1;
                    checkpoint.RespawnPoint = go.transform.localPosition;
                    break;
                case "goals":
                    var goalHitbox = go.GetComponent<BoxCollider2D>() ?? go.AddComponent<BoxCollider2D>();
                    goalHitbox.isTrigger = true;
                    var goal = go.AddComponent<GreyboxPlatformerSampleGoal>();
                    goal.GoalId = marker.MarkerId;
                    goal.DisplayName = marker.MarkerName;
                    goal.ObjectiveType = "exit";
                    goal.SourceArtifactKind = "gameview.objective";
                    goal.SourceArtifactId = marker.MarkerId;
                    goal.SourceArtifactDisplayName = marker.MarkerName;
                    goal.RequiredCount = 1;
                    break;
                case "coins":
                    var coinHitbox = go.GetComponent<CircleCollider2D>() ?? go.AddComponent<CircleCollider2D>();
                    coinHitbox.isTrigger = true;
                    var coin = go.AddComponent<GreyboxPlatformerSampleCollectible>();
                    coin.CoinId = marker.MarkerId;
                    coin.DisplayName = marker.MarkerName;
                    coin.SourceArtifactKind = "gameview.collectible";
                    coin.SourceArtifactId = marker.MarkerId;
                    coin.SourceArtifactDisplayName = marker.MarkerName;
                    coin.SourceObjectiveId = marker.MarkerId;
                    coin.SourceObjectiveDisplayName = marker.MarkerName;
                    coin.SourceObjectiveType = "collectible";
                    break;
            }
        }

        private static string RoundTripIdFieldForCollection(string collection)
        {
            switch (collection)
            {
                case "actors": return "actorId";
                case "spawnPoints": return "spawnId";
                case "objectives": return "objectiveId";
                case "hazards": return "hazardId";
                case "rooms": return "roomId";
                case "encounters": return "encounterId";
                case "connections": return "connectionId";
                case "tiles": return "tileId";
                case "checkpoints": return "checkpointId";
                case "goals": return "goalId";
                case "coins": return "coinId";
                default: return "id";
            }
        }

        private static JObject CreatedNodeJson(string collection, string idField, string id, string name, Vector3 position, Vector3 rotationEuler, Vector3 scale)
        {
            var node = new JObject
            {
                [idField] = id,
                ["name"] = name,
                ["position"] = ToJson(position),
                ["rotation"] = ToJson(rotationEuler),
                ["scale"] = ToJson(scale)
            };
            ApplyCreatedNodeDefaults(collection, node, id, name, position);
            return node;
        }

        private static void ApplyCreatedNodeDefaults(string collection, JObject node, string id, string name, Vector3 position)
        {
            switch (collection)
            {
                case "actors":
                    node["health"] = 1;
                    node["moveSpeed"] = 1f;
                    node["damage"] = 1;
                    node["attackRange"] = 1f;
                    node["attackCooldownSeconds"] = 1f;
                    node["aggroRadius"] = 5f;
                    break;
                case "spawnPoints":
                    node["spawnRadius"] = 0.5f;
                    break;
                case "objectives":
                    node["objectiveType"] = "objective";
                    node["requiredCount"] = 1;
                    break;
                case "hazards":
                    node["damage"] = 1f;
                    node["tickSeconds"] = 1f;
                    node["radius"] = 1f;
                    break;
                case "rooms":
                    node["roomType"] = "room";
                    node["size"] = ToJson(Vector3.one);
                    break;
                case "encounters":
                    node["encounterType"] = "encounter";
                    node["radius"] = 1f;
                    break;
                case "tiles":
                    string tileType = InferCreatedTileType(name);
                    node["type"] = tileType;
                    node["walkable"] = !BlocksMovementForCreatedTileType(tileType);
                    node["blocksMovement"] = BlocksMovementForCreatedTileType(tileType);
                    node["isSpawn"] = LooksLikeCreatedTileType(tileType, "spawn", "start", "checkpoint");
                    node["isExit"] = LooksLikeCreatedTileType(tileType, "exit", "goal", "finish");
                    node["isHazard"] = LooksLikeCreatedTileType(tileType, "hazard", "lava", "spike", "damage");
                    break;
                case "connections":
                    node["type"] = "connection";
                    node["travelCost"] = 1f;
                    break;
                case "checkpoints":
                    node["maxActivations"] = 1;
                    node["spawnOnStart"] = true;
                    node["respawnPoint"] = ToJson(position);
                    break;
                case "goals":
                    node["objectiveType"] = "exit";
                    node["requiredCount"] = 1;
                    break;
                case "coins":
                    node["sourceObjectiveId"] = id;
                    node["sourceObjectiveDisplayName"] = name;
                    node["sourceObjectiveType"] = "collectible";
                    break;
            }
        }

        private static void ApplyCreatedTilemapCell(GameObject go, GameObject parent, GreyboxMarker marker, JObject node)
        {
            if (!parent || marker == null || !string.Equals(marker.Collection, "tiles", StringComparison.Ordinal)) return;
            var tilemap = parent.GetComponent<Tilemap>();
            var metadata = parent.GetComponent<GreyboxLevelTilemap>();
            if (!tilemap && !metadata) return;

            Vector3Int cell = tilemap ? tilemap.WorldToCell(go.transform.position) : Vector3Int.RoundToInt(go.transform.localPosition);
            node["x"] = cell.x;
            node["y"] = cell.y;
            node["z"] = cell.z;

            string tileType = node.Value<string>("type");
            if (string.IsNullOrWhiteSpace(tileType))
            {
                tileType = InferCreatedTileType(go.name);
                node["type"] = tileType;
            }

            if (tilemap)
            {
                TileBase tile = FindTileForCreatedType(metadata, tileType)
                    ?? tilemap.GetTile(cell)
                    ?? CreateGeneratedTileForCreatedType(metadata, tileType)
                    ?? FirstGeneratedTile(metadata);
                if (tile)
                {
                    tilemap.SetTile(cell, tile);
                    tilemap.RefreshTile(cell);
                    tilemap.CompressBounds();
                }
            }

            if (metadata)
            {
                UpsertCreatedTileRecord(metadata, marker, cell, tileType, tilemap);
            }
        }

        private static void UpsertCreatedTileRecord(GreyboxLevelTilemap metadata, GreyboxMarker marker, Vector3Int cell, string tileType, Tilemap tilemap)
        {
            var records = new List<GreyboxLevelTileRecord>();
            bool replaced = false;
            foreach (GreyboxLevelTileRecord existing in metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (existing == null) continue;
                if (!replaced && string.Equals(existing.TileId, marker.MarkerId, StringComparison.Ordinal))
                {
                    records.Add(CreatedTileRecord(marker, cell, tileType));
                    replaced = true;
                    continue;
                }
                records.Add(existing);
            }

            if (!replaced) records.Add(CreatedTileRecord(marker, cell, tileType));
            metadata.TileRecords = records.ToArray();
            metadata.TileCount = metadata.TileRecords.Length;
            if (tilemap)
            {
                BoundsInt bounds = tilemap.cellBounds;
                metadata.BoundsOrigin = bounds.position;
                metadata.BoundsSize = bounds.size;
            }
        }

        private static GreyboxLevelTileRecord CreatedTileRecord(GreyboxMarker marker, Vector3Int cell, string tileType)
        {
            return new GreyboxLevelTileRecord
            {
                TileId = marker.MarkerId,
                TileType = tileType,
                SourceJsonPath = marker.JsonPath,
                Position = cell,
                ColorHex = ColorHexForCreatedTileType(tileType),
                Walkable = !BlocksMovementForCreatedTileType(tileType),
                BlocksMovement = BlocksMovementForCreatedTileType(tileType),
                IsSpawn = LooksLikeCreatedTileType(tileType, "spawn", "start", "checkpoint"),
                IsExit = LooksLikeCreatedTileType(tileType, "exit", "goal", "finish"),
                IsHazard = LooksLikeCreatedTileType(tileType, "hazard", "lava", "spike", "damage")
            };
        }

        private static TileBase FindTileForCreatedType(GreyboxLevelTilemap metadata, string tileType)
        {
            if (!metadata) return null;
            TileBase namedTile = FindNamedTileForCreatedType(metadata, tileType);
            if (namedTile) return namedTile;
            GreyboxLevelTileRecord[] records = metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>();
            TileBase[] tiles = metadata.TileAssets ?? Array.Empty<TileBase>();
            int count = Math.Min(records.Length, tiles.Length);
            for (int i = 0; i < count; i++)
            {
                if (!tiles[i] || records[i] == null) continue;
                if (string.Equals(records[i].TileType, tileType, StringComparison.OrdinalIgnoreCase)) return tiles[i];
            }
            return null;
        }

        private static TileBase FindNamedTileForCreatedType(GreyboxLevelTilemap metadata, string tileType)
        {
            if (!metadata) return null;
            string wanted = NormalizeTileAssetMatchToken(tileType);
            if (string.IsNullOrWhiteSpace(wanted)) return null;
            foreach (TileBase tile in metadata.TileAssets ?? Array.Empty<TileBase>())
            {
                if (!tile) continue;
                string candidate = NormalizeTileAssetMatchToken(tile.name);
                if (candidate.Contains(wanted)) return tile;
            }
            return null;
        }

        private static TileBase FirstGeneratedTile(GreyboxLevelTilemap metadata)
        {
            if (!metadata) return null;
            foreach (TileBase tile in metadata.TileAssets ?? Array.Empty<TileBase>())
            {
                if (tile) return tile;
            }
            return null;
        }

        private static TileBase CreateGeneratedTileForCreatedType(GreyboxLevelTilemap metadata, string tileType)
        {
            if (!metadata) return null;
            return CreateGeneratedTile(metadata, tileType, ColorHexForCreatedTileType(tileType), BlocksMovementForCreatedTileType(tileType));
        }

        private static TileBase CreateGeneratedTileForRecord(GreyboxLevelTilemap metadata, GreyboxLevelTileRecord record)
        {
            if (!metadata || record == null) return null;
            string tileType = string.IsNullOrWhiteSpace(record.TileType) ? "tile" : record.TileType;
            string colorHex = string.IsNullOrWhiteSpace(record.ColorHex) ? ColorHexForCreatedTileType(tileType) : record.ColorHex;
            return CreateGeneratedTile(metadata, tileType, colorHex, record.BlocksMovement);
        }

        private static TileBase CreateGeneratedTile(GreyboxLevelTilemap metadata, string tileType, string colorHex, bool blocksMovement)
        {
            if (!metadata) return null;
            Color color = ColorUtility.TryParseHtmlString(colorHex, out Color authoredColor) ? authoredColor : ColorForCreatedTileType(tileType);
            Texture2D texture = CreateGeneratedTileTexture(tileType, color);
            Sprite sprite = CreateGeneratedTileSprite(tileType, texture);
            var tile = ScriptableObject.CreateInstance<Tile>();
            tile.name = $"Greybox MCP {SafeGameObjectName(tileType)} Tile";
            tile.sprite = sprite;
            tile.color = Color.white;
            tile.colliderType = blocksMovement ? Tile.ColliderType.Sprite : Tile.ColliderType.None;

            metadata.TileAssets = AppendGeneratedTileAsset(metadata.TileAssets, tile);
            metadata.TileTextures = AppendGeneratedTileAsset(metadata.TileTextures, texture);
            metadata.TileSprites = AppendGeneratedTileAsset(metadata.TileSprites, sprite);
            return tile;
        }

        private static Texture2D CreateGeneratedTileTexture(string tileType)
        {
            return CreateGeneratedTileTexture(tileType, ColorForCreatedTileType(tileType));
        }

        private static Texture2D CreateGeneratedTileTexture(string tileType, Color color)
        {
            var texture = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            texture.name = $"Greybox MCP {SafeGameObjectName(tileType)} Tile Texture";
            texture.SetPixel(0, 0, color);
            texture.Apply(false, true);
            return texture;
        }

        private static Sprite CreateGeneratedTileSprite(string tileType, Texture2D texture)
        {
            var sprite = Sprite.Create(texture, new Rect(0f, 0f, texture.width, texture.height), new Vector2(0.5f, 0.5f), 1f);
            sprite.name = $"Greybox MCP {SafeGameObjectName(tileType)} Tile Sprite";
            return sprite;
        }

        private static T[] AppendGeneratedTileAsset<T>(T[] existing, T item) where T : UnityEngine.Object
        {
            if (!item) return existing ?? Array.Empty<T>();
            var values = new List<T>();
            foreach (T value in existing ?? Array.Empty<T>())
            {
                if (value) values.Add(value);
            }
            if (!values.Contains(item)) values.Add(item);
            return values.ToArray();
        }

        private static string InferCreatedTileType(string name)
        {
            if (LooksLikeCreatedTileType(name, "hazard", "lava", "spike", "damage")) return "hazard";
            if (LooksLikeCreatedTileType(name, "wall", "block", "solid", "rock", "door", "gate")) return "wall";
            if (LooksLikeCreatedTileType(name, "spawn", "start", "checkpoint")) return "spawn";
            if (LooksLikeCreatedTileType(name, "exit", "goal", "finish")) return "exit";
            return "floor";
        }

        private static bool BlocksMovementForCreatedTileType(string tileType)
        {
            return LooksLikeCreatedTileType(tileType, "wall", "block", "solid", "rock", "door", "gate");
        }

        private static bool LooksLikeCreatedTileType(string value, params string[] fragments)
        {
            string normalized = (value ?? "").Trim().ToLowerInvariant();
            if (string.IsNullOrWhiteSpace(normalized)) return false;
            foreach (string fragment in fragments)
            {
                if (normalized.Contains(fragment)) return true;
            }
            return false;
        }

        private static Color ColorForCreatedTileType(string tileType)
        {
            return ColorUtility.TryParseHtmlString(ColorHexForCreatedTileType(tileType), out Color color) ? color : Color.gray;
        }

        private static string ColorHexForCreatedTileType(string tileType)
        {
            if (LooksLikeCreatedTileType(tileType, "hazard", "lava", "spike", "damage")) return "#E94B3CFF";
            if (BlocksMovementForCreatedTileType(tileType)) return "#1A1A1FFF";
            if (LooksLikeCreatedTileType(tileType, "exit", "goal", "finish")) return "#2ECC71FF";
            if (LooksLikeCreatedTileType(tileType, "spawn", "start", "checkpoint")) return "#3CC2E0FF";
            return "#5C6166FF";
        }

        private static string NormalizeTileAssetMatchToken(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "";
            var builder = new StringBuilder(value.Length);
            foreach (char c in value.ToLowerInvariant())
            {
                if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) builder.Append(c);
            }
            return builder.ToString();
        }

        private static bool IsCollectionRoot(GreyboxMarker marker)
        {
            return marker
                && IsCollectionRootMarkerId(marker)
                && !string.IsNullOrWhiteSpace(marker.Collection)
                && KnownRoundTripCollections.Contains(marker.Collection)
                && !string.IsNullOrWhiteSpace(marker.JsonPath)
                && IsExactCollectionRootJsonPath(marker.JsonPath, marker.Collection);
        }

        private static bool IsCollectionRootMarkerId(GreyboxMarker marker)
        {
            if (!marker) return false;
            if (string.IsNullOrWhiteSpace(marker.MarkerId)) return true;
            return string.Equals(marker.Collection, "tiles", StringComparison.Ordinal)
                && string.Equals(marker.MarkerId, "tiles", StringComparison.Ordinal);
        }

        private static bool IsExactCollectionRootJsonPath(string jsonPath, string collection)
        {
            string path = (jsonPath ?? "").Trim();
            if (string.Equals(path, $"$.{collection}", StringComparison.Ordinal)) return true;
            return string.Equals(collection, "tiles", StringComparison.Ordinal)
                && (string.Equals(path, "$.tilemap.tiles", StringComparison.Ordinal)
                    || string.Equals(path, "$.tilemap.cells", StringComparison.Ordinal)
                    || string.Equals(path, "$.grid.tiles", StringComparison.Ordinal));
        }

        private static string SafeMcpMarkerSourceFileName(GreyboxMarker marker)
        {
            if (!marker) return "";
            string authoredFileName = string.IsNullOrWhiteSpace(marker.SourceFileName) ? marker.SourcePath : marker.SourceFileName;
            return GreyboxConflictResolver.SafeRoundTripFileName(authoredFileName);
        }

        private static string SafeMcpMarkerSourcePath(string sourcePath)
        {
            string input = (sourcePath ?? "").Trim().Replace('\\', '/');
            if (string.IsNullOrWhiteSpace(input) || input.Contains("://")) return "";

            var builder = new StringBuilder(Math.Min(input.Length, MaxMcpSourcePathLength));
            foreach (char c in input)
            {
                if (char.IsControl(c)) continue;
                builder.Append(c);
                if (builder.Length >= MaxMcpSourcePathLength) break;
            }

            string normalized = builder.ToString().Trim();
            return IsSafeMcpMarkerSourcePath(normalized) ? normalized : "";
        }

        private static bool IsSafeMcpMarkerSourcePath(string sourcePath)
        {
            if (string.IsNullOrWhiteSpace(sourcePath)) return false;
            if (sourcePath.StartsWith("/", StringComparison.Ordinal) || sourcePath.StartsWith("~", StringComparison.Ordinal)) return false;
            if (sourcePath.Length >= 2 && sourcePath[1] == ':') return false;
            string[] segments = sourcePath.Split('/');
            foreach (string segment in segments)
            {
                if (string.IsNullOrWhiteSpace(segment) || segment == "." || segment == "..") return false;
            }

            return true;
        }

        private static string SafeMarkerId(string value)
        {
            string clean = Regex.Replace((value ?? "").Trim().ToLowerInvariant(), @"[^a-z0-9_-]+", "-").Trim('-');
            return string.IsNullOrWhiteSpace(clean) ? "greybox-node" : clean;
        }

        private static string UniqueMarkerId(GameObject parent, GreyboxMarker parentMarker, string baseId)
        {
            string seed = string.IsNullOrWhiteSpace(baseId) ? "greybox-node" : baseId;
            var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (parent)
            {
                foreach (GreyboxMarker marker in parent.GetComponentsInChildren<GreyboxMarker>(true))
                {
                    if (!marker || marker == parentMarker) continue;
                    if (marker.ArtifactKind != parentMarker.ArtifactKind) continue;
                    if (marker.Collection != parentMarker.Collection) continue;
                    if (!string.IsNullOrWhiteSpace(marker.MarkerId)) taken.Add(marker.MarkerId);
                }
            }
            string candidate = seed;
            int suffix = 2;
            while (taken.Contains(candidate))
            {
                candidate = $"{seed}-{suffix}";
                suffix++;
            }
            return candidate;
        }

        private static JObject AddComponent(JObject args)
        {
            var go = ResolveObject(args.Value<string>("gameObjectId"));
            Type type = ResolveMcpAddableComponentType(args.Value<string>("componentType"));
            RequireCanAddMcpComponent(go, type);
            var component = Undo.AddComponent(go, type);
            bool sceneDirty = MarkMcpEditedSceneDirty(go);
            return new JObject
            {
                ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                ["component"] = component.GetType().FullName,
                ["componentName"] = component.GetType().Name,
                ["componentDetail"] = DescribeComponent(component),
                ["sceneDirty"] = sceneDirty
            };
        }

        private static Type ResolveMcpAddableComponentType(string componentTypeName)
        {
            Type type = RequireComponentType(ResolveType(componentTypeName));
            if (!IsAddableComponentType(type))
            {
                throw new InvalidOperationException($"Component type is not addable: {type.FullName}");
            }
            if (!IsRecommendedMcpAddableComponentType(type))
            {
                throw new InvalidOperationException($"Component type is not advertised by scene hierarchy addableComponents: {type.FullName}");
            }
            return type;
        }

        private static bool IsRecommendedMcpAddableComponentType(Type type)
        {
            foreach (Type candidate in RecommendedMcpAddableComponentTypes)
            {
                if (candidate == type) return true;
            }
            return false;
        }

        private static JObject SetField(JObject args)
        {
            ValidateMcpSetFieldValueShape(RequireMcpArgument("unity.setField", args, "value"));
            var go = ResolveObject(args.Value<string>("gameObjectId"));
            Type resolvedType = ResolveType(args.Value<string>("componentType"));
            string fieldName = args.Value<string>("fieldName") ?? "";
            if (resolvedType == typeof(GameObject)) return SetGameObjectField(go, fieldName, args["value"]);
            Type type = RequireComponentType(resolvedType);
            var component = GetRequiredComponent(go, type);
            if (component is GreyboxLevelTilemap tilemapMetadata && IsTileRecordFieldName(fieldName))
            {
                return SetTileRecordField(go, tilemapMetadata, fieldName, args["value"]);
            }
            var member = ResolveAssignableMember(type, fieldName);
            RequireMcpSetFieldValueType(member);
            object previous = member.GetValue(component);
            object value = ConvertValue(args["value"], member.ValueType);
            Undo.RecordObject(component, $"Greybox set {fieldName}");
            member.SetValue(component, value);
            EditorUtility.SetDirty(component);
            PrefabUtility.RecordPrefabInstancePropertyModifications(component);
            UpdateDesignNodeTransformMetadata(go, component, member.Name);
            JObject tilemapCell = SyncMovedTilemapCell(go, component as Transform, member.Name, previous);
            bool mapped = GreyboxRoundTripFieldMapper.TryMap(component, member.Name, out GreyboxRoundTripFieldEdit roundTripEdit);
            if (mapped) GreyboxSceneChangeWatcher.QueueFieldEdit(component, roundTripEdit);
            UpdateGreyboxDisplayNameMetadata(component, member.Name);
            bool sceneDirty = MarkMcpEditedSceneDirty(go);
            var result = new JObject
            {
                ["ok"] = true,
                ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                ["componentType"] = type.FullName,
                ["fieldName"] = member.Name,
                ["valueType"] = member.ValueType.FullName,
                ["previousValue"] = ToJsonValue(previous, member.ValueType),
                ["value"] = ToJsonValue(value, member.ValueType),
                ["roundTripPath"] = mapped ? roundTripEdit.Path : "",
                ["roundTripValue"] = mapped ? roundTripEdit.Value : JValue.CreateNull(),
                ["sceneDirty"] = sceneDirty
            };
            if (tilemapCell != null) result["tilemapCell"] = tilemapCell;
            return result;
        }

        private static JObject SetGameObjectField(GameObject go, string requestedFieldName, JToken valueToken)
        {
            string fieldName = CanonicalGameObjectFieldName(requestedFieldName);
            if (string.IsNullOrWhiteSpace(fieldName))
            {
                throw new InvalidOperationException($"Writable GameObject metadata field not found: {requestedFieldName}");
            }

            JToken previous;
            JToken value;
            string valueType;
            string previousLayerName = "";
            string layerName = "";
            bool propagatesToChildren = false;
            Undo.RecordObject(go, $"Greybox set {fieldName}");
            switch (fieldName)
            {
                case nameof(GameObject.tag):
                    previous = new JValue(go.tag);
                    string tag = ReadDefinedUnityTag(valueToken);
                    go.tag = tag;
                    value = new JValue(tag);
                    valueType = typeof(string).FullName;
                    break;
                case nameof(GameObject.layer):
                    previous = new JValue(go.layer);
                    previousLayerName = LayerMask.LayerToName(go.layer) ?? "";
                    int layer = ReadUnityLayerValue(valueToken);
                    SetGameObjectLayerRecursively(go, layer);
                    value = new JValue(layer);
                    layerName = LayerMask.LayerToName(layer) ?? "";
                    propagatesToChildren = true;
                    valueType = typeof(int).FullName;
                    break;
                case nameof(GameObject.isStatic):
                    previous = new JValue(go.isStatic);
                    bool isStatic = ReadMcpBoolFieldValue(valueToken, typeof(bool));
                    go.isStatic = isStatic;
                    value = new JValue(isStatic);
                    valueType = typeof(bool).FullName;
                    break;
                case nameof(GameObject.activeSelf):
                    previous = new JValue(go.activeSelf);
                    bool active = ReadMcpBoolFieldValue(valueToken, typeof(bool));
                    go.SetActive(active);
                    value = new JValue(active);
                    valueType = typeof(bool).FullName;
                    break;
                default:
                    throw new InvalidOperationException($"Writable GameObject metadata field not found: {requestedFieldName}");
            }

            EditorUtility.SetDirty(go);
            PrefabUtility.RecordPrefabInstancePropertyModifications(go);
            bool mapped = GreyboxRoundTripFieldMapper.TryMap(go, fieldName, out GreyboxRoundTripFieldEdit roundTripEdit);
            if (mapped) GreyboxSceneChangeWatcher.QueueFieldEdit(go, roundTripEdit);
            bool sceneDirty = MarkMcpEditedSceneDirty(go);
            var result = new JObject
            {
                ["ok"] = true,
                ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                ["componentType"] = typeof(GameObject).FullName,
                ["fieldName"] = fieldName,
                ["valueType"] = valueType ?? "",
                ["previousValue"] = previous,
                ["value"] = value,
                ["roundTripPath"] = mapped ? roundTripEdit.Path : "",
                ["roundTripValue"] = mapped ? roundTripEdit.Value : JValue.CreateNull(),
                ["sceneDirty"] = sceneDirty
            };
            if (fieldName == nameof(GameObject.layer))
            {
                result["previousLayerName"] = previousLayerName;
                result["layerName"] = layerName;
                result["propagatesToChildren"] = propagatesToChildren;
            }
            return result;
        }

        private static string CanonicalGameObjectFieldName(string fieldName)
        {
            switch ((fieldName ?? "").Trim())
            {
                case "m_TagString":
                case "tag":
                case "unityTag":
                case "gameObjectTag":
                    return nameof(GameObject.tag);
                case "m_Layer":
                case "layer":
                case "unityLayer":
                case "unityLayerName":
                case "layerName":
                    return nameof(GameObject.layer);
                case "m_StaticEditorFlags":
                case "isStatic":
                case "static":
                case "unityStatic":
                    return nameof(GameObject.isStatic);
                case "m_IsActive":
                case "active":
                case "activeSelf":
                case "unityActive":
                    return nameof(GameObject.activeSelf);
                default:
                    return "";
            }
        }

        private static string ReadDefinedUnityTag(JToken token)
        {
            string tag = ReadMcpStringFieldValue(token, typeof(string));
            foreach (string definedTag in UnityEditorInternal.InternalEditorUtility.tags)
            {
                if (string.Equals(definedTag, tag, StringComparison.Ordinal)) return tag;
            }
            throw new InvalidOperationException($"Unity tag is not defined in this project: {tag}");
        }

        private static int ReadUnityLayerValue(JToken token)
        {
            if (token.Type == JTokenType.Integer)
            {
                int layer = ReadMcpInt32Value(token, "Unity layer must fit in a 32-bit integer.");
                if (layer >= 0 && layer <= 31) return layer;
                throw new InvalidOperationException("Unity layer must be between 0 and 31.");
            }

            if (token.Type == JTokenType.String)
            {
                int layer = LayerMask.NameToLayer(token.Value<string>() ?? "");
                if (layer >= 0) return layer;
                throw new InvalidOperationException($"Unity layer is not defined in this project: {token.Value<string>()}");
            }

            throw new InvalidOperationException("Unity layer value must be a JSON integer or defined layer name string.");
        }

        private static void SetGameObjectLayerRecursively(GameObject go, int layer)
        {
            if (!go) return;
            if (go.layer != layer)
            {
                Undo.RecordObject(go, $"Greybox set {nameof(GameObject.layer)}");
                go.layer = layer;
                EditorUtility.SetDirty(go);
                PrefabUtility.RecordPrefabInstancePropertyModifications(go);
            }

            foreach (Transform child in go.transform)
            {
                SetGameObjectLayerRecursively(child.gameObject, layer);
            }
        }

        private static void UpdateDesignNodeTransformMetadata(GameObject go, Component component, string fieldName)
        {
            var transform = component as Transform;
            if (!transform) return;
            var designNode = go.GetComponentInParent<GreyboxDesignNode>();
            if (!designNode) return;
            Undo.RecordObject(designNode, "Greybox update design transform metadata");
            if (fieldName == nameof(Transform.localPosition)) designNode.AuthoredPosition = transform.localPosition;
            if (fieldName == nameof(Transform.localEulerAngles) || fieldName == nameof(Transform.localRotation)) designNode.AuthoredRotationEuler = transform.localEulerAngles;
            if (fieldName == nameof(Transform.localScale)) designNode.AuthoredScale = transform.localScale;
            EditorUtility.SetDirty(designNode);
            PrefabUtility.RecordPrefabInstancePropertyModifications(designNode);
        }

        private static JObject SyncMovedTilemapCell(GameObject go, Transform transform, string fieldName, object previousValue)
        {
            if (!transform || fieldName != nameof(Transform.localPosition)) return null;
            var marker = go.GetComponent<GreyboxMarker>();
            if (!marker || !string.Equals(marker.Collection, "tiles", StringComparison.Ordinal)) return null;
            Transform parent = transform.parent;
            if (!parent) return null;
            var tilemap = parent.GetComponent<Tilemap>();
            var metadata = parent.GetComponent<GreyboxLevelTilemap>();
            if (!tilemap && !metadata) return null;

            Vector3 previousLocal = previousValue is Vector3 vector ? vector : transform.localPosition;
            Vector3Int previousCell = tilemap ? tilemap.WorldToCell(parent.TransformPoint(previousLocal)) : Vector3Int.RoundToInt(previousLocal);
            Vector3Int currentCell = tilemap ? tilemap.WorldToCell(transform.position) : Vector3Int.RoundToInt(transform.localPosition);
            string tileType = FindTileRecord(metadata, marker.MarkerId)?.TileType ?? InferCreatedTileType(marker.MarkerName);

            if (tilemap)
            {
                Undo.RecordObject(tilemap, "Greybox move tilemap cell");
                TileBase tile = tilemap.GetTile(previousCell)
                    ?? FindTileForCreatedType(metadata, tileType)
                    ?? tilemap.GetTile(currentCell)
                    ?? CreateGeneratedTileForCreatedType(metadata, tileType)
                    ?? FirstGeneratedTile(metadata);
                if (tile && previousCell != currentCell)
                {
                    tilemap.SetTile(previousCell, null);
                    tilemap.SetTile(currentCell, tile);
                    tilemap.RefreshTile(previousCell);
                    tilemap.RefreshTile(currentCell);
                    tilemap.CompressBounds();
                }
                else if (tile)
                {
                    tilemap.SetTile(currentCell, tile);
                    tilemap.RefreshTile(currentCell);
                    tilemap.CompressBounds();
                }
                EditorUtility.SetDirty(tilemap);
            }

            if (metadata)
            {
                Undo.RecordObject(metadata, "Greybox move tilemap record");
                UpsertCreatedTileRecord(metadata, marker, currentCell, tileType, tilemap);
                EditorUtility.SetDirty(metadata);
                PrefabUtility.RecordPrefabInstancePropertyModifications(metadata);
            }

            return new JObject
            {
                ["tileId"] = marker.MarkerId,
                ["tileType"] = tileType,
                ["previousCell"] = ToJson(previousCell),
                ["cell"] = ToJson(currentCell),
                ["tilemapSynced"] = tilemap ? true : false,
                ["metadataSynced"] = metadata ? true : false
            };
        }

        private static GreyboxLevelTileRecord FindTileRecord(GreyboxLevelTilemap metadata, string tileId)
        {
            if (!metadata || string.IsNullOrWhiteSpace(tileId)) return null;
            foreach (GreyboxLevelTileRecord record in metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>())
            {
                if (record == null) continue;
                if (string.Equals(record.TileId, tileId, StringComparison.Ordinal)) return record;
            }
            return null;
        }

        private static bool IsTileRecordFieldName(string fieldName)
        {
            return McpTileRecordFieldPattern.IsMatch(fieldName ?? "");
        }

        private static JObject SetTileRecordField(GameObject go, GreyboxLevelTilemap metadata, string fieldName, JToken valueToken)
        {
            if (!TryParseTileRecordFieldName(fieldName, out string tileId, out string fieldKey))
            {
                throw new InvalidOperationException($"Writable tile record field not found: {fieldName}");
            }
            GreyboxLevelTileRecord record = FindTileRecord(metadata, tileId);
            if (record == null)
            {
                throw new InvalidOperationException($"Greybox tile record not found: {tileId}");
            }

            JToken previousValue = TileRecordFieldValue(record, fieldKey);
            Vector3Int previousCell = record.Position;
            Undo.RecordObject(metadata, "Greybox set tile record field");
            ApplyTileRecordField(record, fieldKey, valueToken);
            metadata.TileCount = (metadata.TileRecords ?? Array.Empty<GreyboxLevelTileRecord>()).Count(candidate => candidate != null);
            EditorUtility.SetDirty(metadata);
            PrefabUtility.RecordPrefabInstancePropertyModifications(metadata);

            JObject tilemapCell = SyncTileRecordFieldToTilemap(go, metadata, record, fieldKey, previousCell);
            JToken roundTripValue = TileRecordFieldValue(record, fieldKey);
            string roundTripPath = TileRecordJsonPath(record, fieldKey);
            GreyboxMarker marker = RoundTripMarkerForTileRecord(metadata, tileId);
            bool mapped = marker && !string.IsNullOrWhiteSpace(roundTripPath);
            if (mapped)
            {
                GreyboxSceneChangeWatcher.QueueFieldEdit(metadata, new GreyboxRoundTripFieldEdit(marker, roundTripPath, roundTripValue));
            }
            bool sceneDirty = MarkMcpEditedSceneDirty(go);

            return new JObject
            {
                ["ok"] = true,
                ["gameObjectId"] = GlobalObjectId.GetGlobalObjectIdSlow(go).ToString(),
                ["componentType"] = typeof(GreyboxLevelTilemap).FullName,
                ["fieldName"] = fieldName,
                ["tileId"] = tileId,
                ["tileField"] = fieldKey,
                ["previousValue"] = previousValue,
                ["value"] = roundTripValue,
                ["roundTripPath"] = mapped ? roundTripPath : "",
                ["roundTripValue"] = mapped ? roundTripValue.DeepClone() : JValue.CreateNull(),
                ["tilemapCell"] = tilemapCell,
                ["sceneDirty"] = sceneDirty
            };
        }

        private static bool TryParseTileRecordFieldName(string fieldName, out string tileId, out string fieldKey)
        {
            tileId = "";
            fieldKey = "";
            Match match = McpTileRecordFieldPattern.Match(fieldName ?? "");
            if (!match.Success) return false;
            tileId = match.Groups[1].Value;
            fieldKey = NormalizeTileRecordFieldKey(match.Groups[2].Value);
            return IsSafeMcpTileRecordSelector(tileId) && !string.IsNullOrWhiteSpace(fieldKey);
        }

        private static string NormalizeTileRecordFieldKey(string fieldKey)
        {
            switch (fieldKey ?? "")
            {
                case "type":
                case "tileType":
                    return "type";
                case "walkable":
                case "blocksMovement":
                case "isSpawn":
                case "isExit":
                case "isHazard":
                case "colorHex":
                case "position":
                    return fieldKey;
                default:
                    return "";
            }
        }

        private static void ApplyTileRecordField(GreyboxLevelTileRecord record, string fieldKey, JToken valueToken)
        {
            switch (fieldKey)
            {
                case "type":
                    ApplyTileRecordType(record, ReadMcpTileRecordText(valueToken, "tile type"));
                    break;
                case "walkable":
                    record.Walkable = ReadMcpBoolFieldValue(valueToken, typeof(bool));
                    break;
                case "blocksMovement":
                    record.BlocksMovement = ReadMcpBoolFieldValue(valueToken, typeof(bool));
                    if (record.BlocksMovement) record.Walkable = false;
                    break;
                case "isSpawn":
                    record.IsSpawn = ReadMcpBoolFieldValue(valueToken, typeof(bool));
                    break;
                case "isExit":
                    record.IsExit = ReadMcpBoolFieldValue(valueToken, typeof(bool));
                    break;
                case "isHazard":
                    record.IsHazard = ReadMcpBoolFieldValue(valueToken, typeof(bool));
                    break;
                case "colorHex":
                    record.ColorHex = ReadMcpTileColorHex(valueToken);
                    break;
                case "position":
                    record.Position = ReadMcpTileRecordPosition(valueToken);
                    break;
                default:
                    throw new InvalidOperationException($"Writable tile record field not found: {fieldKey}");
            }
        }

        private static void ApplyTileRecordType(GreyboxLevelTileRecord record, string tileType)
        {
            record.TileType = tileType;
            record.ColorHex = ColorHexForCreatedTileType(tileType);
            record.Walkable = !BlocksMovementForCreatedTileType(tileType);
            record.BlocksMovement = BlocksMovementForCreatedTileType(tileType);
            record.IsSpawn = LooksLikeCreatedTileType(tileType, "spawn", "start", "checkpoint");
            record.IsExit = LooksLikeCreatedTileType(tileType, "exit", "goal", "finish");
            record.IsHazard = LooksLikeCreatedTileType(tileType, "hazard", "lava", "spike", "damage");
        }

        private static string ReadMcpTileRecordText(JToken token, string label)
        {
            string value = (ReadMcpStringFieldValue(token, typeof(string)) ?? "").Trim();
            if (string.IsNullOrWhiteSpace(value)) throw new InvalidOperationException($"Greybox {label} must not be empty.");
            if (value.Length > MaxMcpEnumValueLength) throw new InvalidOperationException($"Greybox {label} must be {MaxMcpEnumValueLength} characters or fewer.");
            foreach (char c in value)
            {
                if (char.IsControl(c)) throw new InvalidOperationException($"Greybox {label} must not contain control characters.");
            }
            return value;
        }

        private static string ReadMcpTileColorHex(JToken token)
        {
            string value = ReadMcpTileRecordText(token, "tile color").Trim();
            if (!value.StartsWith("#", StringComparison.Ordinal)) value = "#" + value;
            string digits = value.Substring(1);
            bool sized = digits.Length == 6 || digits.Length == 8;
            bool hex = digits.All(Uri.IsHexDigit);
            if (!sized || !hex || !ColorUtility.TryParseHtmlString(value, out _))
            {
                throw new InvalidOperationException("Greybox tile color must be a 6- or 8-digit HTML color.");
            }
            string clean = value.ToUpperInvariant();
            if (clean.Length == 7) clean += "FF";
            return clean;
        }

        private static Vector3Int ReadMcpTileRecordPosition(JToken token)
        {
            Vector3 value = ReadVector3(token);
            return Vector3Int.RoundToInt(value);
        }

        private static JToken TileRecordFieldValue(GreyboxLevelTileRecord record, string fieldKey)
        {
            switch (fieldKey)
            {
                case "type": return new JValue(record.TileType ?? "");
                case "walkable": return new JValue(record.Walkable);
                case "blocksMovement": return new JValue(record.BlocksMovement);
                case "isSpawn": return new JValue(record.IsSpawn);
                case "isExit": return new JValue(record.IsExit);
                case "isHazard": return new JValue(record.IsHazard);
                case "colorHex": return new JValue(record.ColorHex ?? "");
                case "position": return ToJson(record.Position);
                default: return JValue.CreateNull();
            }
        }

        private static JObject SyncTileRecordFieldToTilemap(GameObject go, GreyboxLevelTilemap metadata, GreyboxLevelTileRecord record, string fieldKey, Vector3Int previousCell)
        {
            var tilemap = go.GetComponent<Tilemap>();
            bool visualField = fieldKey == "type" || fieldKey == "colorHex" || fieldKey == "blocksMovement";
            bool positionField = fieldKey == "position";
            TileBase tile = null;
            bool markerSynced = false;
            if (tilemap && (visualField || positionField))
            {
                Undo.RecordObject(tilemap, "Greybox sync tile record field");
                tile = positionField
                    ? tilemap.GetTile(previousCell) ?? tilemap.GetTile(record.Position) ?? FindTileForCreatedType(metadata, record.TileType) ?? CreateGeneratedTileForRecord(metadata, record)
                    : CreateGeneratedTileForRecord(metadata, record);
                if (tile)
                {
                    if (positionField && previousCell != record.Position)
                    {
                        tilemap.SetTile(previousCell, null);
                        tilemap.RefreshTile(previousCell);
                    }
                    tilemap.SetTile(record.Position, tile);
                    tilemap.RefreshTile(record.Position);
                    tilemap.CompressBounds();
                    EditorUtility.SetDirty(tilemap);
                }
            }
            if (positionField)
            {
                markerSynced = SyncTileRecordMarkerPosition(metadata, tilemap, record);
                if (tilemap)
                {
                    BoundsInt bounds = tilemap.cellBounds;
                    metadata.BoundsOrigin = bounds.position;
                    metadata.BoundsSize = bounds.size;
                }
            }
            bool tilemapSynced = tilemap && ((!visualField && !positionField) || tile);

            return new JObject
            {
                ["tileId"] = record.TileId ?? "",
                ["tileType"] = record.TileType ?? "",
                ["previousCell"] = ToJson(previousCell),
                ["cell"] = ToJson(record.Position),
                ["field"] = fieldKey,
                ["tilemapSynced"] = tilemapSynced,
                ["markerSynced"] = markerSynced,
                ["metadataSynced"] = true,
                ["tileAssetCount"] = (metadata.TileAssets ?? Array.Empty<TileBase>()).Count(candidate => candidate)
            };
        }

        private static bool SyncTileRecordMarkerPosition(GreyboxLevelTilemap metadata, Tilemap tilemap, GreyboxLevelTileRecord record)
        {
            GreyboxMarker marker = TileMarkerForTileRecord(metadata, record?.TileId);
            if (!marker) return false;
            Vector3 target = tilemap ? tilemap.CellToWorld(record.Position) : metadata.transform.TransformPoint(record.Position);
            if (marker.transform.position == target) return false;
            Undo.RecordObject(marker.transform, "Greybox sync tile record marker");
            marker.transform.position = target;
            EditorUtility.SetDirty(marker.transform);
            PrefabUtility.RecordPrefabInstancePropertyModifications(marker.transform);
            return true;
        }

        private static GreyboxMarker TileMarkerForTileRecord(GreyboxLevelTilemap metadata, string tileId)
        {
            if (!metadata || string.IsNullOrWhiteSpace(tileId)) return null;
            foreach (GreyboxMarker marker in metadata.GetComponentsInChildren<GreyboxMarker>(true))
            {
                if (!marker || !string.Equals(marker.Collection, "tiles", StringComparison.Ordinal)) continue;
                if (string.Equals(marker.MarkerId, tileId, StringComparison.Ordinal)) return marker;
            }
            return null;
        }

        private static GreyboxMarker RoundTripMarkerForTileRecord(GreyboxLevelTilemap metadata, string tileId)
        {
            if (!metadata) return null;
            foreach (GreyboxMarker marker in metadata.GetComponentsInChildren<GreyboxMarker>(true))
            {
                if (!marker || !string.Equals(marker.Collection, "tiles", StringComparison.Ordinal)) continue;
                if (string.Equals(marker.MarkerId, tileId, StringComparison.Ordinal)) return marker;
            }
            var self = metadata.GetComponent<GreyboxMarker>();
            if (self) return self;
            return null;
        }

        private static string TileRecordSetFieldName(string tileId, string fieldKey)
        {
            return IsSafeMcpTileRecordSelector(tileId) && !string.IsNullOrWhiteSpace(fieldKey)
                ? $"tiles[tileId={tileId}].{fieldKey}"
                : "";
        }

        private static string TileRecordJsonPath(GreyboxLevelTileRecord record, string fieldKey)
        {
            if (record == null || string.IsNullOrWhiteSpace(fieldKey)) return "";
            string root = string.IsNullOrWhiteSpace(record.SourceJsonPath) && IsSafeMcpTileRecordSelector(record.TileId)
                ? $"$.tilemap.tiles[tileId={record.TileId}]"
                : record.SourceJsonPath;
            return string.IsNullOrWhiteSpace(root) ? "" : $"{root}.{fieldKey}";
        }

        private static bool IsSafeMcpTileRecordSelector(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value.Length > 128) return false;
            foreach (char c in value)
            {
                bool ok = (c >= 'a' && c <= 'z')
                    || (c >= 'A' && c <= 'Z')
                    || (c >= '0' && c <= '9')
                    || c == '-'
                    || c == '_';
                if (!ok) return false;
            }
            return true;
        }

        private static void UpdateGreyboxDisplayNameMetadata(Component component, string fieldName)
        {
            GreyboxRoundTripMetadataSync.UpdateDisplayNameMetadata(component, fieldName, true);
        }

        private static JObject AssignAsset(JObject args)
        {
            var go = ResolveObject(args.Value<string>("gameObjectId"));
            Type type = RequireComponentType(ResolveType(args.Value<string>("componentType")));
            var component = GetRequiredComponent(go, type);
            string fieldName = args.Value<string>("fieldName") ?? "";
            var member = ResolveAssignableAssetMember(type, fieldName);
            if (!typeof(UnityEngine.Object).IsAssignableFrom(member.ValueType))
            {
                throw new InvalidOperationException($"Member is not an asset reference: {fieldName}");
            }
            var previousAsset = member.GetValue(component) as UnityEngine.Object;
            string previousAssetPath = previousAsset ? AssetDatabase.GetAssetPath(previousAsset) ?? "" : "";
            string previousAssetGuid = string.IsNullOrWhiteSpace(previousAssetPath) ? "" : AssetDatabase.AssetPathToGUID(previousAssetPath);
            string previousObjectName = previousAsset ? previousAsset.name ?? "" : "";
            string assetPath = NormalizeMcpAssetPath(args.Value<string>("assetPath"));
            var asset = AssetDatabase.LoadAssetAtPath(assetPath, member.ValueType);
            if (!asset) throw new InvalidOperationException($"Asset not found or not assignable to {member.ValueType.FullName}: {assetPath}");
            Undo.RecordObject(component, $"Greybox assign {fieldName}");
            member.SetValue(component, asset);
            EditorUtility.SetDirty(component);
            PrefabUtility.RecordPrefabInstancePropertyModifications(component);
            bool mapped = GreyboxRoundTripFieldMapper.TryMapAsset(component, member.Name, assetPath, out GreyboxRoundTripFieldEdit assetEdit);
            if (mapped) GreyboxSceneChangeWatcher.QueueFieldEdit(component, assetEdit);
            UpdateMarkerAssetMetadata(go, component, member.Name, assetPath);
            bool sceneDirty = MarkMcpEditedSceneDirty(go);
            return new JObject
            {
                ["ok"] = true,
                ["assetPath"] = assetPath,
                ["assetGuid"] = AssetDatabase.AssetPathToGUID(assetPath),
                ["objectName"] = asset.name ?? "",
                ["previousAssetPath"] = previousAssetPath,
                ["previousAssetGuid"] = previousAssetGuid,
                ["previousObjectName"] = previousObjectName,
                ["componentType"] = type.FullName,
                ["fieldName"] = member.Name,
                ["roundTripPath"] = mapped ? assetEdit.Path : "",
                ["roundTripValue"] = mapped ? assetEdit.Value : JValue.CreateNull(),
                ["sceneDirty"] = sceneDirty
            };
        }

        private static bool MarkMcpEditedSceneDirty(GameObject go)
        {
            if (!go || !go.scene.IsValid()) return false;
            EditorSceneManager.MarkSceneDirty(go.scene);
            return true;
        }

        private static string NormalizeMcpAssetPath(string assetPath)
        {
            string path = assetPath ?? "";
            string trimmed = path.Trim();
            if (!string.Equals(path, trimmed, StringComparison.Ordinal) || path.IndexOf('\\') >= 0)
            {
                throw new InvalidOperationException("Asset path must be a canonical project-relative Assets/ path without traversal.");
            }
            if (!IsSafeProjectAssetPath(path))
            {
                throw new InvalidOperationException("Asset path must be a project-relative Assets/ path without traversal.");
            }
            return path;
        }

        private static bool IsSafeProjectAssetPath(string assetPath)
        {
            string normalized = assetPath ?? "";
            if (normalized.Length < 8) return false;
            if (!normalized.StartsWith("Assets/", StringComparison.Ordinal)) return false;
            if (normalized.Contains("://") || normalized.Contains("//") || normalized.IndexOf('\\') >= 0) return false;
            foreach (string part in normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries))
            {
                if (string.IsNullOrWhiteSpace(part) || part == "." || part == "..") return false;
                foreach (char c in part)
                {
                    if (char.IsControl(c)) return false;
                }
            }
            return true;
        }

        private static void UpdateMarkerAssetMetadata(GameObject go, Component component, string fieldName, string assetPath)
        {
            if (!(component is MeshFilter) || (fieldName != nameof(MeshFilter.sharedMesh) && fieldName != nameof(MeshFilter.mesh))) return;
            var marker = go.GetComponentInParent<GreyboxMarker>();
            if (!marker) return;
            Undo.RecordObject(marker, "Greybox update asset marker");
            marker.UnityAssetPath = assetPath;
            marker.UnityAssetGuid = AssetDatabase.AssetPathToGUID(assetPath);
            marker.Primitive = "Mesh";
            EditorUtility.SetDirty(marker);
            PrefabUtility.RecordPrefabInstancePropertyModifications(marker);
        }

        private static JObject RunEditModeTest(JObject args)
        {
            string testName = NormalizeMcpTestName(args.Value<string>("testName"));
            return SubmitMcpEditModeTestRun(testName, DateTimeOffset.UtcNow, settings =>
            {
                Type apiType = ResolveType("UnityEditor.TestTools.TestRunner.Api.TestRunnerApi");
                Type settingsType = ResolveType("UnityEditor.TestTools.TestRunner.Api.ExecutionSettings");
                var api = ScriptableObject.CreateInstance(apiType);
                MethodInfo execute = apiType.GetMethod("Execute", new[] { settingsType });
                if (execute == null) throw new InvalidOperationException("Unity Test Runner Execute method not found.");
                return NormalizeMcpUnityRunGuid(execute.Invoke(api, new[] { settings }));
            });
        }

        private static async Task<JObject> RunEditModeTestAsync(JObject args)
        {
            string testName = NormalizeMcpTestName(args.Value<string>("testName"));
            return await SubmitMcpEditModeTestRunAndWait(testName, DateTimeOffset.UtcNow);
        }

        private static JObject SubmitMcpEditModeTestRun(
            string testName,
            DateTimeOffset submittedAtUtc,
            Func<object, string> executeTestRun)
        {
            testName = NormalizeMcpTestName(testName);
            Type filterType = ResolveType("UnityEditor.TestTools.TestRunner.Api.Filter");
            Type settingsType = ResolveType("UnityEditor.TestTools.TestRunner.Api.ExecutionSettings");
            Type testModeType = ResolveType("UnityEditor.TestTools.TestRunner.Api.TestMode");

            object filter = Activator.CreateInstance(filterType);
            SetMember(filterType, filter, "testMode", Enum.Parse(testModeType, "EditMode"));
            SetMember(filterType, filter, "testNames", new[] { testName });

            object settings = CreateExecutionSettings(settingsType, filter);
            string unityRunGuid = executeTestRun?.Invoke(settings) ?? "";
            return DescribeMcpEditModeTestSubmission(testName, FormatMcpUtcTimestamp(submittedAtUtc), unityRunGuid);
        }

        private static async Task<JObject> SubmitMcpEditModeTestRunAndWait(string testName, DateTimeOffset submittedAtUtc)
        {
            if (mcpEditModeTestRunInProgress)
            {
                throw new InvalidOperationException("unity.runEditModeTest is already waiting for a Unity Test Runner result. Retry after the active EditMode run completes.");
            }

            testName = NormalizeMcpTestName(testName);
            Type apiType = ResolveType("UnityEditor.TestTools.TestRunner.Api.TestRunnerApi");
            Type settingsType = ResolveType("UnityEditor.TestTools.TestRunner.Api.ExecutionSettings");
            Type filterType = ResolveType("UnityEditor.TestTools.TestRunner.Api.Filter");
            Type testModeType = ResolveType("UnityEditor.TestTools.TestRunner.Api.TestMode");
            Type callbacksType = ResolveType("UnityEditor.TestTools.TestRunner.Api.ICallbacks");

            var api = ScriptableObject.CreateInstance(apiType);
            var collector = new McpEditModeTestResultCollector();
            object callbacks = McpTestRunCallbackProxy.Create(callbacksType, collector.HandleCallback);
            string submittedAt = FormatMcpUtcTimestamp(submittedAtUtc);
            string unityRunGuid = "";
            mcpEditModeTestRunInProgress = true;
            try
            {
                RegisterMcpTestRunCallbacks(apiType, api, callbacks);

                object filter = Activator.CreateInstance(filterType);
                SetMember(filterType, filter, "testMode", Enum.Parse(testModeType, "EditMode"));
                SetMember(filterType, filter, "testNames", new[] { testName });
                object settings = CreateExecutionSettings(settingsType, filter);

                MethodInfo execute = apiType.GetMethod("Execute", new[] { settingsType });
                if (execute == null) throw new InvalidOperationException("Unity Test Runner Execute method not found.");
                unityRunGuid = NormalizeMcpUnityRunGuid(execute.Invoke(api, new[] { settings }));
                JObject submission = DescribeMcpEditModeTestSubmission(testName, submittedAt, unityRunGuid);

                Task completed = collector.Completion.Task;
                Task timeout = Task.Delay(McpEditModeTestCompletionTimeoutMs);
                Task winner = await Task.WhenAny(completed, timeout);
                if (winner == completed)
                {
                    return DescribeMcpEditModeTestCompletion(
                        submission,
                        collector.RunFinishedResult,
                        collector.FinishedTests,
                        FormatMcpUtcTimestamp(DateTimeOffset.UtcNow));
                }
                return DescribeMcpEditModeTestTimeout(submission, FormatMcpUtcTimestamp(DateTimeOffset.UtcNow));
            }
            finally
            {
                try
                {
                    UnregisterMcpTestRunCallbacks(apiType, api, callbacks);
                }
                catch
                {
                    // Best effort cleanup; the response should preserve the actual test result or timeout.
                }
                if (api) UnityEngine.Object.DestroyImmediate(api);
                mcpEditModeTestRunInProgress = false;
            }
        }

        private static JObject DescribeMcpEditModeTestSubmission(string testName, string submittedAtUtc, string unityRunGuid)
        {
            string runId = CreateMcpEditModeTestRunId(testName, submittedAtUtc);
            string followUpIdentifier = string.IsNullOrWhiteSpace(unityRunGuid) ? "runId" : "unityRunGuid";
            string followUpValue = string.IsNullOrWhiteSpace(unityRunGuid) ? runId : unityRunGuid;
            return new JObject
            {
                ["submitted"] = true,
                ["status"] = "submitted",
                ["runId"] = runId,
                ["unityRunGuid"] = unityRunGuid ?? "",
                ["testName"] = testName,
                ["sanitizedTestName"] = testName,
                ["testNameLength"] = testName.Length,
                ["testNameMaxLength"] = MaxMcpTestNameLength,
                ["submittedAtUtc"] = submittedAtUtc,
                ["editModeFilter"] = new JObject
                {
                    ["testMode"] = "EditMode",
                    ["selector"] = "testNames",
                    ["testNames"] = new JArray(testName),
                    ["testNameCount"] = 1,
                    ["testNameMaxLength"] = MaxMcpTestNameLength,
                    ["usesRegex"] = false
                },
                ["resultContract"] = new JObject
                {
                    ["kind"] = "unity.editModeTest.submission",
                    ["status"] = "submitted",
                    ["finalResultInResponse"] = false,
                    ["statusHint"] = "Unity Test Runner execution was submitted asynchronously; listen for Unity Test Runner callbacks or use the returned identifier for client-side correlation.",
                    ["followUpIdentifier"] = followUpIdentifier,
                    ["followUpValue"] = followUpValue,
                    ["nonTerminalStatuses"] = new JArray("submitted", "running"),
                    ["terminalStatuses"] = new JArray("passed", "failed", "inconclusive", "skipped", "error", "cancelled")
                }
            };
        }

        private static JObject DescribeMcpEditModeTestCompletion(
            JObject submission,
            object runFinishedResult,
            IReadOnlyList<object> finishedTests,
            string completedAtUtc)
        {
            JObject response = (JObject)submission.DeepClone();
            JObject result = DescribeMcpTestResult(runFinishedResult);
            string status = result.Value<string>("status") ?? "unknown";
            var testResults = new JArray();
            if (finishedTests != null)
            {
                foreach (object test in finishedTests.Take(MaxMcpEditModeTestResultChildren))
                {
                    testResults.Add(DescribeMcpTestResult(test));
                }
            }

            response["completed"] = true;
            response["status"] = status;
            response["completedAtUtc"] = completedAtUtc;
            response["result"] = result;
            response["testResults"] = testResults;
            response["testResultsTruncated"] = finishedTests != null && finishedTests.Count > MaxMcpEditModeTestResultChildren;
            response["maxTestResults"] = MaxMcpEditModeTestResultChildren;
            response["resultContract"] = new JObject
            {
                ["kind"] = "unity.editModeTest.result",
                ["status"] = status,
                ["finalResultInResponse"] = true,
                ["statusHint"] = "Unity Test Runner reported a terminal EditMode result before the MCP response timeout.",
                ["terminalStatuses"] = new JArray("passed", "failed", "inconclusive", "skipped", "error", "cancelled")
            };
            return response;
        }

        private static JObject DescribeMcpEditModeTestTimeout(JObject submission, string completedAtUtc)
        {
            JObject response = (JObject)submission.DeepClone();
            response["completed"] = false;
            response["status"] = "running";
            response["completedAtUtc"] = completedAtUtc;
            response["resultContract"] = new JObject
            {
                ["kind"] = "unity.editModeTest.result",
                ["status"] = "running",
                ["finalResultInResponse"] = false,
                ["waitTimeoutMs"] = McpEditModeTestCompletionTimeoutMs,
                ["statusHint"] = "Unity Test Runner did not report a terminal result before the MCP response timeout.",
                ["nonTerminalStatuses"] = new JArray("submitted", "running"),
                ["terminalStatuses"] = new JArray("passed", "failed", "inconclusive", "skipped", "error", "cancelled")
            };
            return response;
        }

        private static JObject DescribeMcpTestResult(object result)
        {
            var description = new JObject
            {
                ["name"] = ReadMcpResultString(result, "Name"),
                ["fullName"] = ReadMcpResultString(result, "FullName"),
                ["testStatus"] = ReadMcpResultString(result, "TestStatus"),
                ["resultState"] = ReadMcpResultString(result, "ResultState"),
                ["duration"] = ReadMcpResultDouble(result, "Duration"),
                ["assertCount"] = ReadMcpResultInt(result, "AssertCount"),
                ["passCount"] = ReadMcpResultInt(result, "PassCount"),
                ["failCount"] = ReadMcpResultInt(result, "FailCount"),
                ["skipCount"] = ReadMcpResultInt(result, "SkipCount"),
                ["inconclusiveCount"] = ReadMcpResultInt(result, "InconclusiveCount"),
                ["hasChildren"] = ReadMcpResultBool(result, "HasChildren"),
                ["message"] = SafeMcpErrorMessage(ReadMcpResultString(result, "Message")),
                ["stackTrace"] = SafeMcpErrorMessage(ReadMcpResultString(result, "StackTrace"))
            };
            description["status"] = NormalizeMcpTestResultStatus(description);
            return description;
        }

        private static string NormalizeMcpTestResultStatus(JObject result)
        {
            int failCount = result.Value<int?>("failCount") ?? 0;
            int passCount = result.Value<int?>("passCount") ?? 0;
            int skipCount = result.Value<int?>("skipCount") ?? 0;
            int inconclusiveCount = result.Value<int?>("inconclusiveCount") ?? 0;
            string state = (result.Value<string>("resultState") ?? "") + " " + (result.Value<string>("testStatus") ?? "");
            if (state.IndexOf("cancel", StringComparison.OrdinalIgnoreCase) >= 0) return "cancelled";
            if (state.IndexOf("error", StringComparison.OrdinalIgnoreCase) >= 0) return "error";
            if (failCount > 0 || state.IndexOf("fail", StringComparison.OrdinalIgnoreCase) >= 0) return "failed";
            if (state.IndexOf("inconclusive", StringComparison.OrdinalIgnoreCase) >= 0 || inconclusiveCount > 0) return "inconclusive";
            if (state.IndexOf("skip", StringComparison.OrdinalIgnoreCase) >= 0 || (skipCount > 0 && passCount == 0)) return "skipped";
            if (passCount > 0 || state.IndexOf("pass", StringComparison.OrdinalIgnoreCase) >= 0 || state.IndexOf("success", StringComparison.OrdinalIgnoreCase) >= 0) return "passed";
            return "unknown";
        }

        private static string CreateMcpEditModeTestRunId(string testName, string submittedAtUtc)
        {
            string source = "unity.runEditModeTest\nEditMode\n" + testName + "\n" + submittedAtUtc;
            using var sha = SHA256.Create();
            byte[] digest = sha.ComputeHash(Encoding.UTF8.GetBytes(source));
            var builder = new StringBuilder(32);
            for (int index = 0; index < digest.Length && builder.Length < 32; index++)
            {
                builder.Append(digest[index].ToString("x2", CultureInfo.InvariantCulture));
            }
            return McpEditModeTestRunIdPrefix + builder;
        }

        private static string FormatMcpUtcTimestamp(DateTimeOffset value)
        {
            return value.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", CultureInfo.InvariantCulture);
        }

        private static string NormalizeMcpUnityRunGuid(object value)
        {
            string text = Convert.ToString(value, CultureInfo.InvariantCulture)?.Trim() ?? "";
            if (text.Length == 0 || text.Length > 128) return "";
            foreach (char c in text)
            {
                bool allowed = c >= 'a' && c <= 'z'
                    || c >= 'A' && c <= 'Z'
                    || c >= '0' && c <= '9'
                    || c == '-' || c == '_';
                if (!allowed) return "";
            }
            return text;
        }

        private static JObject CaptureGameViewScreenshot(JObject args)
        {
            int width = NormalizeMcpScreenshotDimension(RequireMcpIntegerArgument("unity.captureGameViewScreenshot", args, "width"), "width");
            int height = NormalizeMcpScreenshotDimension(RequireMcpIntegerArgument("unity.captureGameViewScreenshot", args, "height"), "height");
            bool gameViewSized = TryApplyGameViewSize(width, height, out string sizingMessage);
            string path = CreateMcpScreenshotPath(width, height);
            string absolutePath = Path.GetFullPath(path);
            ScreenCapture.CaptureScreenshot(path);
            PruneMcpScreenshotCache(path);
            return DescribeMcpScreenshotCapture(path, absolutePath, width, height, gameViewSized, sizingMessage);
        }

        private static JObject DescribeMcpScreenshotCapture(
            string path,
            string absolutePath,
            int width,
            int height,
            bool gameViewSized,
            string sizingMessage)
        {
            return new JObject
            {
                ["path"] = path,
                ["absolutePath"] = absolutePath,
                ["fileName"] = Path.GetFileName(path),
                ["width"] = width,
                ["height"] = height,
                ["asyncCapture"] = true,
                ["pollAfterMs"] = McpScreenshotPollAfterMs,
                ["gameViewSized"] = gameViewSized,
                ["sizingMessage"] = sizingMessage
            };
        }

        private static string CreateMcpScreenshotPath(int width, int height)
        {
            Directory.CreateDirectory(McpScreenshotDirectory);
            string stamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString();
            string nonce = Guid.NewGuid().ToString("N").Substring(0, 12);
            return $"{McpScreenshotDirectory}/{McpScreenshotFilePrefix}{width}x{height}-{stamp}-{nonce}{McpScreenshotExtension}";
        }

        private static void PruneMcpScreenshotCache(string keepPath)
        {
            try
            {
                if (!Directory.Exists(McpScreenshotDirectory)) return;
                string keepFullPath = Path.GetFullPath(keepPath ?? "");
                string[] paths = Directory.GetFiles(McpScreenshotDirectory, $"{McpScreenshotFilePrefix}*{McpScreenshotExtension}");
                var files = new List<FileInfo>();
                foreach (string candidate in paths)
                {
                    var file = new FileInfo(candidate);
                    if (file.Exists && IsSafeMcpScreenshotFileName(file.Name)) files.Add(file);
                }
                files.Sort((left, right) => right.LastWriteTimeUtc.CompareTo(left.LastWriteTimeUtc));
                for (int index = MaxMcpScreenshotFiles; index < files.Count; index++)
                {
                    if (string.Equals(files[index].FullName, keepFullPath, StringComparison.OrdinalIgnoreCase)) continue;
                    files[index].Delete();
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning("Greybox MCP screenshot cache cleanup failed: " + ex.Message);
            }
        }

        private static bool IsSafeMcpScreenshotFileName(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName)) return false;
            if (!fileName.StartsWith(McpScreenshotFilePrefix, StringComparison.Ordinal)) return false;
            if (!fileName.EndsWith(McpScreenshotExtension, StringComparison.OrdinalIgnoreCase)) return false;
            foreach (char c in fileName)
            {
                bool allowed = c >= 'a' && c <= 'z'
                    || c >= 'A' && c <= 'Z'
                    || c >= '0' && c <= '9'
                    || c == '-' || c == '_' || c == '.' || c == 'x';
                if (!allowed) return false;
            }
            return true;
        }

        private static string NormalizeMcpTestName(string testName)
        {
            string trimmed = (testName ?? "").Trim();
            if (string.IsNullOrWhiteSpace(trimmed)) throw new InvalidOperationException("testName is required.");
            if (trimmed.Length > MaxMcpTestNameLength)
            {
                throw new InvalidOperationException($"testName must be {MaxMcpTestNameLength} characters or fewer.");
            }
            foreach (char c in trimmed)
            {
                if (char.IsControl(c)) throw new InvalidOperationException("testName may not contain control characters.");
            }
            if (trimmed.IndexOf('/') >= 0 || trimmed.IndexOf('\\') >= 0)
            {
                throw new InvalidOperationException("testName may not contain path separators.");
            }
            if (ContainsMcpSensitiveText(trimmed))
            {
                throw new InvalidOperationException("testName may not contain paths or secrets.");
            }
            return trimmed;
        }

        private static bool ContainsMcpSensitiveText(string text)
        {
            if (string.IsNullOrEmpty(text)) return false;
            return McpBearerTokenPattern.IsMatch(text)
                || McpStripeSecretPattern.IsMatch(text)
                || McpEmailPattern.IsMatch(text)
                || McpIpAddressPattern.IsMatch(text)
                || McpCardLikePattern.IsMatch(text)
                || McpStripeObjectPattern.IsMatch(text)
                || McpAbsolutePathPattern.IsMatch(text);
        }

        private static int NormalizeMcpScreenshotDimension(int value, string label)
        {
            if (value < MinMcpScreenshotDimension || value > MaxMcpScreenshotDimension)
            {
                throw new InvalidOperationException($"Screenshot {label} must be between {MinMcpScreenshotDimension} and {MaxMcpScreenshotDimension} pixels.");
            }
            return value;
        }

        private static bool TryApplyGameViewSize(int width, int height, out string message)
        {
            try
            {
                Assembly editorAssembly = typeof(EditorWindow).Assembly;
                Type gameViewType = editorAssembly.GetType("UnityEditor.GameView");
                Type gameViewSizesType = editorAssembly.GetType("UnityEditor.GameViewSizes");
                Type gameViewSizeType = editorAssembly.GetType("UnityEditor.GameViewSize");
                Type gameViewSizeKindType = editorAssembly.GetType("UnityEditor.GameViewSizeType");
                Type groupType = editorAssembly.GetType("UnityEditor.GameViewSizeGroupType");
                if (gameViewType == null || gameViewSizesType == null || gameViewSizeType == null || gameViewSizeKindType == null || groupType == null)
                {
                    message = "Unity Game View sizing API was not available.";
                    return false;
                }

                object gameViewSizes = GetStaticProperty(gameViewSizesType, "instance");
                object group = InvokeMethod(
                    gameViewSizes,
                    "GetGroup",
                    CurrentGameViewSizeGroup(groupType)
                );
                int index = FindOrCreateGameViewSize(group, gameViewSizeType, gameViewSizeKindType, width, height);
                EditorWindow gameView = EditorWindow.GetWindow(gameViewType);
                SetMember(gameViewType, gameView, "selectedSizeIndex", index);
                gameView.Focus();
                gameView.Repaint();
                message = $"Game View set to {width}x{height}.";
                return true;
            }
            catch (Exception ex)
            {
                message = ex.Message;
                return false;
            }
        }

        private static object CurrentGameViewSizeGroup(Type groupType)
        {
            string candidate = EditorUserBuildSettings.activeBuildTarget switch
            {
                BuildTarget.Android => "Android",
                BuildTarget.iOS => "iOS",
                BuildTarget.tvOS => "tvOS",
                BuildTarget.WebGL => "WebGL",
                _ => "Standalone"
            };
            if (Enum.IsDefined(groupType, candidate)) return Enum.Parse(groupType, candidate);
            return Enum.Parse(groupType, "Standalone");
        }

        private static int FindOrCreateGameViewSize(object group, Type gameViewSizeType, Type gameViewSizeKindType, int width, int height)
        {
            int count = Convert.ToInt32(InvokeMethod(group, "GetTotalCount"));
            for (int i = 0; i < count; i++)
            {
                object size = InvokeMethod(group, "GetGameViewSize", i);
                if (ReadIntProperty(size, "width") == width && ReadIntProperty(size, "height") == height)
                {
                    return i;
                }
            }

            object fixedResolution = Enum.Parse(gameViewSizeKindType, "FixedResolution");
            object customSize = Activator.CreateInstance(
                gameViewSizeType,
                fixedResolution,
                width,
                height,
                $"Greybox MCP {width}x{height}"
            );
            InvokeMethod(group, "AddCustomSize", customSize);
            return count;
        }

        private static object GetStaticProperty(Type type, string propertyName)
        {
            PropertyInfo property = type.GetProperty(propertyName, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic);
            if (property == null) throw new InvalidOperationException($"Static property not found: {type.FullName}.{propertyName}");
            return property.GetValue(null);
        }

        private static object InvokeMethod(object target, string methodName, params object[] args)
        {
            MethodInfo method = target.GetType().GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (method == null) throw new InvalidOperationException($"Method not found: {target.GetType().FullName}.{methodName}");
            return method.Invoke(target, args);
        }

        private static int ReadIntProperty(object target, string propertyName)
        {
            PropertyInfo property = target.GetType().GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
            if (property == null) throw new InvalidOperationException($"Property not found: {target.GetType().FullName}.{propertyName}");
            return Convert.ToInt32(property.GetValue(target));
        }

        private static JObject BuildAddressables()
        {
            AddressablesTagger.FlushPending();
            AddressableAssetSettings settings = AddressableAssetSettingsDefaultObject.Settings;
            if (!settings)
            {
                throw new InvalidOperationException("Addressables settings are not configured for this project.");
            }
            System.Diagnostics.Stopwatch timer = System.Diagnostics.Stopwatch.StartNew();
            AddressableAssetSettings.BuildPlayerContent();
            timer.Stop();
            AddressableAssetGroup group = settings.FindGroup(AddressablesTagger.GeneratedGroupName);
            return AnnotateAddressablesBuildTiming(DescribeAddressablesBuild(group), timer.ElapsedMilliseconds, DateTime.UtcNow);
        }

        private static JObject DescribeAddressablesBuild(AddressableAssetGroup group)
        {
            JArray generatedEntries = DescribeAddressableEntries(group);
            int generatedEntryCount = group?.entries?.Count ?? 0;
            JObject labelCounts = CountAddressableLabels(group);
            return new JObject
            {
                ["ok"] = true,
                ["groupName"] = AddressablesTagger.GeneratedGroupName,
                ["label"] = AddressablesTagger.GeneratedLabel,
                ["labels"] = new JArray
                {
                    AddressablesTagger.GeneratedLabel,
                    AddressablesTagger.GameViewportLabel,
                    AddressablesTagger.ArtBibleLabel,
                    AddressablesTagger.HudLayoutLabel,
                    AddressablesTagger.LevelBoardLabel,
                    AddressablesTagger.SampleSceneLabel,
                    AddressablesTagger.PlatformerSampleLabel
                },
                ["labelCounts"] = labelCounts,
                ["missingLabels"] = DescribeMissingAddressableLabels(labelCounts),
                ["generatedEntryCount"] = generatedEntryCount,
                ["generatedEntries"] = generatedEntries,
                ["generatedEntriesTruncated"] = generatedEntryCount > generatedEntries.Count,
                ["maxGeneratedEntries"] = MaxMcpAddressablesSummaryEntries
            };
        }

        private static JObject CountAddressableLabels(AddressableAssetGroup group)
        {
            string[] labels =
            {
                AddressablesTagger.GeneratedLabel,
                AddressablesTagger.GameViewportLabel,
                AddressablesTagger.ArtBibleLabel,
                AddressablesTagger.HudLayoutLabel,
                AddressablesTagger.LevelBoardLabel,
                AddressablesTagger.SampleSceneLabel,
                AddressablesTagger.PlatformerSampleLabel
            };
            var counts = new JObject();
            foreach (string label in labels) counts[label] = 0;
            if (group?.entries == null) return counts;
            foreach (AddressableAssetEntry entry in group.entries)
            {
                if (entry?.labels == null) continue;
                foreach (string label in labels)
                {
                    if (entry.labels.Contains(label)) counts[label] = counts.Value<int>(label) + 1;
                }
            }
            return counts;
        }

        private static JObject AnnotateAddressablesBuildTiming(JObject summary, long buildDurationMs, DateTime buildCompletedAtUtc)
        {
            JObject result = summary ?? new JObject();
            result["buildDurationMs"] = Math.Max(0L, buildDurationMs);
            result["buildCompletedAtUtc"] = buildCompletedAtUtc.ToUniversalTime().ToString("o");
            return result;
        }

        private static JArray DescribeMissingAddressableLabels(JObject labelCounts)
        {
            var missingLabels = new JArray();
            if (labelCounts == null) return missingLabels;
            foreach (JProperty property in labelCounts.Properties())
            {
                if (property.Value.Value<int>() <= 0) missingLabels.Add(property.Name);
            }
            return missingLabels;
        }

        private static JArray DescribeAddressableEntries(AddressableAssetGroup group)
        {
            var entries = new JArray();
            if (group?.entries == null) return entries;
            var sortedEntries = new List<AddressableAssetEntry>();
            foreach (AddressableAssetEntry entry in group.entries)
            {
                if (entry != null) sortedEntries.Add(entry);
            }
            sortedEntries.Sort(CompareAddressableEntriesForMcp);
            foreach (AddressableAssetEntry entry in sortedEntries)
            {
                if (entries.Count >= MaxMcpAddressablesSummaryEntries) break;
                entries.Add(DescribeAddressableEntry(entry));
            }
            return entries;
        }

        private static int CompareAddressableEntriesForMcp(AddressableAssetEntry left, AddressableAssetEntry right)
        {
            int address = string.Compare(left?.address ?? "", right?.address ?? "", StringComparison.Ordinal);
            if (address != 0) return address;
            return string.Compare(left?.guid ?? "", right?.guid ?? "", StringComparison.Ordinal);
        }

        private static JObject DescribeAddressableEntry(AddressableAssetEntry entry)
        {
            string guid = entry?.guid ?? "";
            string assetPath = string.IsNullOrEmpty(guid) ? "" : AssetDatabase.GUIDToAssetPath(guid);
            UnityEngine.Object asset = string.IsNullOrEmpty(assetPath) ? null : AssetDatabase.LoadMainAssetAtPath(assetPath);
            return new JObject
            {
                ["guid"] = guid,
                ["address"] = entry?.address ?? "",
                ["assetPath"] = assetPath,
                ["assetExists"] = asset != null,
                ["assetType"] = asset != null ? asset.GetType().FullName : "",
                ["labels"] = DescribeAddressableEntryLabels(entry)
            };
        }

        private static JArray DescribeAddressableEntryLabels(AddressableAssetEntry entry)
        {
            var sortedLabels = new List<string>();
            if (entry?.labels == null) return new JArray();
            foreach (string label in entry.labels)
            {
                if (!string.IsNullOrWhiteSpace(label)) sortedLabels.Add(label);
            }
            sortedLabels.Sort(StringComparer.Ordinal);
            var labels = new JArray();
            foreach (string label in sortedLabels) labels.Add(label);
            return labels;
        }

        private static GameObject ResolveObject(string id)
        {
            if (GlobalObjectId.TryParse(id, out GlobalObjectId globalId))
            {
                var obj = GlobalObjectId.GlobalObjectIdentifierToObjectSlow(globalId) as GameObject;
                if (obj) return obj;
            }
            throw new InvalidOperationException($"GameObject not found: {id}");
        }

        private static Type ResolveType(string typeName)
        {
            if (string.IsNullOrWhiteSpace(typeName)) throw new InvalidOperationException("Type name is required.");
            var simpleNameMatches = new List<Type>();
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type type = assembly.GetType(typeName, false);
                if (type != null) return type;
                foreach (Type candidate in SafeGetTypes(assembly))
                {
                    if (candidate.FullName == typeName) return candidate;
                    if (candidate.Name == typeName) simpleNameMatches.Add(candidate);
                }
            }
            if (simpleNameMatches.Count == 1) return simpleNameMatches[0];
            if (simpleNameMatches.Count > 1)
            {
                throw new InvalidOperationException($"Type name is ambiguous: {typeName}. Use the fully qualified component type name.");
            }
            throw new InvalidOperationException($"Type not found: {typeName}");
        }

        private static Type RequireComponentType(Type type)
        {
            if (type == null || !typeof(Component).IsAssignableFrom(type))
            {
                throw new InvalidOperationException($"MCP componentType must resolve to a UnityEngine.Component type: {type?.FullName ?? "<null>"}");
            }
            return type;
        }

        private static IEnumerable<Type> SafeGetTypes(Assembly assembly)
        {
            try
            {
                return assembly.GetTypes();
            }
            catch (ReflectionTypeLoadException ex)
            {
                var types = new List<Type>();
                foreach (Type type in ex.Types)
                {
                    if (type != null) types.Add(type);
                }
                return types;
            }
        }

        private static Component GetRequiredComponent(GameObject go, Type type)
        {
            var component = go.GetComponent(type);
            if (!component) throw new InvalidOperationException($"Component not found on {go.name}: {type.FullName}");
            return component;
        }

        private static AssignableMember ResolveAssignableMember(Type type, string memberName)
        {
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public;
            FieldInfo field = type.GetField(memberName, flags);
            if (field != null && IsResolvableMcpAssignableField(field))
            {
                return new AssignableMember(field.Name, field.FieldType, (target, value) => field.SetValue(target, value), target => field.GetValue(target));
            }
            PropertyInfo property = type.GetProperty(memberName, flags);
            if (property != null && IsResolvableMcpAssignableProperty(property))
            {
                return new AssignableMember(property.Name, property.PropertyType, (target, value) => property.SetValue(target, value), target => property.GetValue(target));
            }
            throw new InvalidOperationException($"Writable field or property not found: {memberName}");
        }

        private static AssignableMember ResolveAssignableAssetMember(Type type, string memberName)
        {
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public;
            FieldInfo field = type.GetField(memberName, flags);
            if (field != null && IsAssignableAssetReferenceField(field))
            {
                return new AssignableMember(field.Name, field.FieldType, (target, value) => field.SetValue(target, value), target => field.GetValue(target));
            }
            PropertyInfo property = type.GetProperty(memberName, flags);
            if (property != null && IsAssignableAssetReferenceProperty(property))
            {
                return new AssignableMember(property.Name, property.PropertyType, (target, value) => property.SetValue(target, value), target => property.GetValue(target));
            }
            throw new InvalidOperationException($"Assignable asset reference field or property not found: {memberName}");
        }

        private static bool IsResolvableMcpAssignableField(FieldInfo field)
        {
            return IsEditorSerializedMcpField(field);
        }

        private static bool IsAssignableAssetReferenceField(FieldInfo field)
        {
            if (!IsEditorSerializedMcpField(field)) return false;
            if (!typeof(UnityEngine.Object).IsAssignableFrom(field.FieldType)) return false;
            return true;
        }

        private static bool IsEditorSerializedMcpField(FieldInfo field)
        {
            if (field.IsInitOnly || field.IsLiteral) return false;
            if (field.IsNotSerialized) return false;
            if (Attribute.IsDefined(field, typeof(NonSerializedAttribute))) return false;
            if (Attribute.IsDefined(field, typeof(HideInInspector))) return false;
            return !Attribute.IsDefined(field, typeof(ObsoleteAttribute));
        }

        private static bool IsResolvableMcpAssignableProperty(PropertyInfo property)
        {
            if (property.GetIndexParameters().Length != 0) return false;
            if (property.GetGetMethod(false) == null || property.GetSetMethod(false) == null) return false;
            if (property.DeclaringType == typeof(UnityEngine.Object) || property.DeclaringType == typeof(Component)) return false;
            return !Attribute.IsDefined(property, typeof(ObsoleteAttribute));
        }

        private static void RequireMcpSetFieldValueType(AssignableMember member)
        {
            if (ShouldExposeMcpValue(member.ValueType)) return;
            if (typeof(UnityEngine.Object).IsAssignableFrom(member.ValueType))
            {
                throw new InvalidOperationException($"unity.setField does not assign UnityEngine.Object references. Use unity.assignAsset for asset field: {member.Name}");
            }
            throw new InvalidOperationException($"unity.setField only supports scalar, string array, enum, Vector3, and Color values: {member.Name} ({member.ValueType.FullName})");
        }

        private static void SetMember(Type type, object target, string memberName, object value)
        {
            const BindingFlags flags = BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic;
            FieldInfo field = type.GetField(memberName, flags);
            if (field != null)
            {
                field.SetValue(target, value);
                return;
            }
            PropertyInfo property = type.GetProperty(memberName, flags);
            if (property != null && property.CanWrite)
            {
                property.SetValue(target, value);
                return;
            }
            throw new InvalidOperationException($"Writable field or property not found: {memberName}");
        }

        private static void RegisterMcpTestRunCallbacks(Type apiType, object api, object callbacks)
        {
            InvokeMcpTestRunCallbackMethod(apiType, api, callbacks, "RegisterCallbacks");
        }

        private static void UnregisterMcpTestRunCallbacks(Type apiType, object api, object callbacks)
        {
            InvokeMcpTestRunCallbackMethod(apiType, api, callbacks, "UnregisterCallbacks");
        }

        private static void InvokeMcpTestRunCallbackMethod(Type apiType, object api, object callbacks, string methodName)
        {
            foreach (MethodInfo method in apiType.GetMethods(BindingFlags.Instance | BindingFlags.Public))
            {
                if (method.Name != methodName) continue;
                ParameterInfo[] parameters = method.GetParameters();
                if (parameters.Length < 1 || parameters.Length > 2) continue;
                if (!parameters[0].ParameterType.IsInstanceOfType(callbacks)) continue;
                if (parameters.Length == 1)
                {
                    method.Invoke(api, new[] { callbacks });
                    return;
                }
                if (parameters[1].ParameterType == typeof(int))
                {
                    method.Invoke(api, new[] { callbacks, 0 });
                    return;
                }
            }
            throw new InvalidOperationException("Unity Test Runner " + methodName + " method not found.");
        }

        private static string ReadMcpResultString(object target, string propertyName)
        {
            object value = ReadMcpResultProperty(target, propertyName);
            return Convert.ToString(value, CultureInfo.InvariantCulture) ?? "";
        }

        private static int ReadMcpResultInt(object target, string propertyName)
        {
            object value = ReadMcpResultProperty(target, propertyName);
            if (value == null) return 0;
            try
            {
                return Convert.ToInt32(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                return 0;
            }
        }

        private static double ReadMcpResultDouble(object target, string propertyName)
        {
            object value = ReadMcpResultProperty(target, propertyName);
            if (value == null) return 0d;
            try
            {
                double number = Convert.ToDouble(value, CultureInfo.InvariantCulture);
                return double.IsNaN(number) || double.IsInfinity(number) ? 0d : number;
            }
            catch
            {
                return 0d;
            }
        }

        private static bool ReadMcpResultBool(object target, string propertyName)
        {
            object value = ReadMcpResultProperty(target, propertyName);
            if (value == null) return false;
            try
            {
                return Convert.ToBoolean(value, CultureInfo.InvariantCulture);
            }
            catch
            {
                return false;
            }
        }

        private static object ReadMcpResultProperty(object target, string propertyName)
        {
            if (target == null || string.IsNullOrWhiteSpace(propertyName)) return null;
            PropertyInfo property = target.GetType().GetProperty(propertyName, BindingFlags.Instance | BindingFlags.Public);
            if (property == null || property.GetIndexParameters().Length != 0 || property.GetGetMethod(false) == null) return null;
            try
            {
                return property.GetValue(target);
            }
            catch
            {
                return null;
            }
        }

        private static object CreateExecutionSettings(Type settingsType, object filter)
        {
            ConstructorInfo exact = settingsType.GetConstructor(new[] { filter.GetType() });
            if (exact != null) return exact.Invoke(new[] { filter });
            ConstructorInfo array = settingsType.GetConstructor(new[] { filter.GetType().MakeArrayType() });
            if (array != null)
            {
                Array filters = Array.CreateInstance(filter.GetType(), 1);
                filters.SetValue(filter, 0);
                return array.Invoke(new object[] { filters });
            }
            object settings = Activator.CreateInstance(settingsType);
            SetMember(settingsType, settings, "filters", new[] { filter });
            return settings;
        }

        private static object ConvertValue(JToken token, Type targetType)
        {
            Type nullable = Nullable.GetUnderlyingType(targetType);
            if (nullable != null) targetType = nullable;
            if (token == null || token.Type == JTokenType.Null) return targetType.IsValueType ? Activator.CreateInstance(targetType) : null;
            if (targetType == typeof(string)) return ReadMcpStringFieldValue(token, targetType);
            if (targetType == typeof(string[])) return ReadMcpStringArrayValue(token, targetType);
            if (targetType == typeof(int)) return ReadMcpIntFieldValue(token, targetType);
            if (targetType == typeof(float)) return ReadMcpFloatFieldValue(token, targetType);
            if (targetType == typeof(double)) return ReadMcpDoubleFieldValue(token, targetType);
            if (targetType == typeof(bool)) return ReadMcpBoolFieldValue(token, targetType);
            if (targetType == typeof(Vector3)) return ReadVector3(token);
            if (targetType == typeof(Color)) return ReadColor(token);
            if (targetType.IsEnum) return ConvertEnumValue(token, targetType);
            return token.ToObject(targetType);
        }

        private static string ReadMcpStringFieldValue(JToken token, Type targetType)
        {
            if (token.Type != JTokenType.String)
            {
                throw new InvalidOperationException($"String value for {targetType.FullName} must be a JSON string.");
            }
            return token.Value<string>() ?? "";
        }

        private static string[] ReadMcpStringArrayValue(JToken token, Type targetType)
        {
            if (!CanReadMcpStringArray(token))
            {
                throw new InvalidOperationException($"String array value for {targetType.FullName} must be a JSON array of strings.");
            }
            var values = new List<string>();
            foreach (JToken item in (JArray)token)
            {
                string text = (item.Value<string>() ?? "").Trim();
                if (!string.IsNullOrWhiteSpace(text)) values.Add(text);
            }
            return values.ToArray();
        }

        private static int ReadMcpIntFieldValue(JToken token, Type targetType)
        {
            if (token.Type != JTokenType.Integer)
            {
                throw new InvalidOperationException($"Integer value for {targetType.FullName} must be a JSON integer.");
            }
            return ReadMcpInt32Value(token, $"Integer value for {targetType.FullName} must fit in a 32-bit integer.");
        }

        private static float ReadMcpFloatFieldValue(JToken token, Type targetType)
        {
            if (!IsJsonFiniteNumber(token))
            {
                throw new InvalidOperationException($"Float value for {targetType.FullName} must be a JSON number with a finite value.");
            }
            return ReadFiniteFloat(token, $"Float value for {targetType.FullName}");
        }

        private static double ReadMcpDoubleFieldValue(JToken token, Type targetType)
        {
            if (!IsJsonFiniteNumber(token))
            {
                throw new InvalidOperationException($"Double value for {targetType.FullName} must be a JSON number with a finite value.");
            }
            return ReadFiniteDouble(token, $"Double value for {targetType.FullName}");
        }

        private static bool ReadMcpBoolFieldValue(JToken token, Type targetType)
        {
            if (token.Type != JTokenType.Boolean)
            {
                throw new InvalidOperationException($"Boolean value for {targetType.FullName} must be a JSON boolean.");
            }
            return token.Value<bool>();
        }

        private static object ConvertEnumValue(JToken token, Type targetType)
        {
            if (token.Type != JTokenType.String)
            {
                throw new InvalidOperationException($"Enum value must be a string for {targetType.FullName}.");
            }
            string text = (token.Value<string>() ?? "").Trim();
            if (string.IsNullOrWhiteSpace(text))
            {
                throw new InvalidOperationException($"Enum value is required for {targetType.FullName}.");
            }
            if (text.Length > MaxMcpEnumValueLength)
            {
                throw new InvalidOperationException($"Enum value for {targetType.FullName} must be {MaxMcpEnumValueLength} characters or fewer.");
            }
            if (!Enum.TryParse(targetType, text, true, out object parsed) || !Enum.IsDefined(targetType, parsed))
            {
                throw new InvalidOperationException($"Enum value for {targetType.FullName} must be a named enum value.");
            }
            return parsed;
        }

        private static bool ShouldExposeMcpValue(Type type)
        {
            Type nullable = Nullable.GetUnderlyingType(type);
            if (nullable != null) type = nullable;
            return type == typeof(string)
                || type == typeof(string[])
                || type == typeof(int)
                || type == typeof(float)
                || type == typeof(double)
                || type == typeof(bool)
                || type == typeof(Vector3)
                || type == typeof(Color)
                || type.IsEnum;
        }

        private static JObject DescribeMcpValueSchema(Type type)
        {
            Type nullable = Nullable.GetUnderlyingType(type);
            if (nullable != null) type = nullable;
            if (type == typeof(string))
            {
                return new JObject
                {
                    ["kind"] = "string",
                    ["jsonType"] = "string",
                    ["maxLength"] = MaxMcpSetFieldStringValueLength
                };
            }
            if (type == typeof(string[]))
            {
                return new JObject
                {
                    ["kind"] = "stringArray",
                    ["jsonType"] = "array",
                    ["itemJsonType"] = "string",
                    ["maxItems"] = MaxMcpSetFieldStringArrayItems,
                    ["maxItemLength"] = MaxMcpSetFieldStringArrayItemLength
                };
            }
            if (type == typeof(int))
            {
                return new JObject
                {
                    ["kind"] = "integer",
                    ["jsonType"] = "integer",
                    ["minimum"] = int.MinValue,
                    ["maximum"] = int.MaxValue
                };
            }
            if (type == typeof(float) || type == typeof(double))
            {
                return new JObject
                {
                    ["kind"] = "number",
                    ["jsonType"] = "number",
                    ["finite"] = true
                };
            }
            if (type == typeof(bool))
            {
                return new JObject
                {
                    ["kind"] = "boolean",
                    ["jsonType"] = "boolean"
                };
            }
            if (type == typeof(Vector3))
            {
                return new JObject
                {
                    ["kind"] = "vector3",
                    ["jsonTypes"] = new JArray("object", "array"),
                    ["required"] = new JArray("x", "y", "z"),
                    ["components"] = new JArray("x", "y", "z"),
                    ["finite"] = true
                };
            }
            if (type == typeof(Color))
            {
                return new JObject
                {
                    ["kind"] = "color",
                    ["jsonTypes"] = new JArray("string", "object", "array"),
                    ["components"] = new JArray("r", "g", "b", "a"),
                    ["formats"] = new JArray("#RRGGBB", "#RRGGBBAA", "{r,g,b,a}", "[r,g,b,a]"),
                    ["finite"] = true
                };
            }
            if (type.IsEnum)
            {
                return new JObject
                {
                    ["kind"] = "enum",
                    ["jsonType"] = "string",
                    ["allowedEnumValues"] = new JArray(Enum.GetNames(type))
                };
            }
            return new JObject
            {
                ["kind"] = "unknown",
                ["valueType"] = type.FullName
            };
        }

        private static JToken ToJsonValue(object value, Type type)
        {
            if (value == null) return JValue.CreateNull();
            Type nullable = Nullable.GetUnderlyingType(type);
            if (nullable != null) type = nullable;
            if (type == typeof(Vector3)) return ToJson((Vector3)value);
            if (type == typeof(Color)) return ToJson((Color)value);
            if (type.IsEnum) return new JValue(value.ToString());
            if (type == typeof(string)) return new JValue((string)value);
            if (type == typeof(string[])) return ToJson((string[])value);
            if (type == typeof(int)) return new JValue((int)value);
            if (type == typeof(float)) return new JValue((float)value);
            if (type == typeof(double)) return new JValue((double)value);
            if (type == typeof(bool)) return new JValue((bool)value);
            return JToken.FromObject(value);
        }

        private static JObject ToJson(Vector3 value)
        {
            return new JObject
            {
                ["x"] = value.x,
                ["y"] = value.y,
                ["z"] = value.z
            };
        }

        private static JObject ToJson(Vector3Int value)
        {
            return new JObject
            {
                ["x"] = value.x,
                ["y"] = value.y,
                ["z"] = value.z
            };
        }

        private static JObject ToJson(Color value)
        {
            return new JObject
            {
                ["r"] = value.r,
                ["g"] = value.g,
                ["b"] = value.b,
                ["a"] = value.a
            };
        }

        private static JArray ToJson(string[] values)
        {
            var array = new JArray();
            if (values == null) return array;
            foreach (string value in values)
            {
                string text = (value ?? "").Trim();
                if (string.IsNullOrWhiteSpace(text) || ContainsControlCharacter(text)) continue;
                if (text.Length > MaxMcpSetFieldStringArrayItemLength)
                {
                    text = text.Substring(0, MaxMcpSetFieldStringArrayItemLength);
                }
                array.Add(text);
                if (array.Count >= MaxMcpSetFieldStringArrayItems) break;
            }
            return array;
        }

        private static bool ContainsControlCharacter(string value)
        {
            foreach (char c in value)
            {
                if (char.IsControl(c)) return true;
            }
            return false;
        }

        private static string HierarchyPath(Transform transform)
        {
            var parts = new List<string>();
            while (transform)
            {
                parts.Add(transform.name);
                transform = transform.parent;
            }
            parts.Reverse();
            return string.Join("/", parts);
        }

        private static Vector3 ReadVector3(JToken token)
        {
            if (token is JArray array)
            {
                if (array.Count != 3 || !IsJsonFiniteNumber(array[0]) || !IsJsonFiniteNumber(array[1]) || !IsJsonFiniteNumber(array[2]))
                {
                    throw new InvalidOperationException("Vector3 array must contain exactly 3 numbers, all finite.");
                }
                return new Vector3(ReadFiniteFloat(array[0], "Vector3 x"), ReadFiniteFloat(array[1], "Vector3 y"), ReadFiniteFloat(array[2], "Vector3 z"));
            }
            JObject obj = token as JObject;
            if (obj == null) throw new InvalidOperationException("Vector3 value must be an object with numeric x/y/z and no extra fields or an array of exactly 3 numbers.");
            var axes = new HashSet<string>(new[] { "x", "y", "z" }, StringComparer.Ordinal);
            foreach (JProperty property in obj.Properties())
            {
                if (!axes.Contains(property.Name))
                {
                    throw new InvalidOperationException("Vector3 object must contain only numeric x/y/z fields.");
                }
            }
            if (!obj.TryGetValue("x", out JToken x) || !IsJsonFiniteNumber(x)
                || !obj.TryGetValue("y", out JToken y) || !IsJsonFiniteNumber(y)
                || !obj.TryGetValue("z", out JToken z) || !IsJsonFiniteNumber(z))
            {
                throw new InvalidOperationException("Vector3 object must contain numeric x/y/z fields with finite values.");
            }
            return new Vector3(ReadFiniteFloat(x, "Vector3 x"), ReadFiniteFloat(y, "Vector3 y"), ReadFiniteFloat(z, "Vector3 z"));
        }

        private static bool IsJsonNumber(JToken token)
        {
            return token != null && (token.Type == JTokenType.Integer || token.Type == JTokenType.Float);
        }

        private static bool CanReadMcpStringArray(JToken value)
        {
            if (!(value is JArray array)) return false;
            if (array.Count > MaxMcpSetFieldStringArrayItems)
            {
                throw new InvalidOperationException($"Argument for unity.setField string array must contain {MaxMcpSetFieldStringArrayItems} items or fewer.");
            }
            foreach (JToken item in array)
            {
                if (item.Type != JTokenType.String) return false;
                string text = item.Value<string>() ?? "";
                if (text.Length > MaxMcpSetFieldStringArrayItemLength)
                {
                    throw new InvalidOperationException($"Argument for unity.setField string array items must be {MaxMcpSetFieldStringArrayItemLength} characters or fewer.");
                }
                foreach (char c in text)
                {
                    if (char.IsControl(c))
                    {
                        throw new InvalidOperationException("Argument for unity.setField string array items may not contain control characters.");
                    }
                }
            }
            return true;
        }

        private static int ReadMcpInt32Value(JToken token, string rangeMessage)
        {
            long value;
            try
            {
                value = token.Value<long>();
            }
            catch (Exception)
            {
                throw new InvalidOperationException(rangeMessage);
            }
            if (value < int.MinValue || value > int.MaxValue)
            {
                throw new InvalidOperationException(rangeMessage);
            }
            return (int)value;
        }

        private static bool IsJsonFiniteNumber(JToken token)
        {
            if (!IsJsonNumber(token)) return false;
            double number;
            try
            {
                number = token.Value<double>();
            }
            catch (Exception)
            {
                return false;
            }
            return !double.IsNaN(number) && !double.IsInfinity(number);
        }

        private static float ReadFiniteFloat(JToken token, string label)
        {
            if (!IsJsonFiniteNumber(token))
            {
                throw new InvalidOperationException($"{label} must be a finite JSON number.");
            }
            float value = token.Value<float>();
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                throw new InvalidOperationException($"{label} must fit in a finite System.Single value.");
            }
            return value;
        }

        private static double ReadFiniteDouble(JToken token, string label)
        {
            if (!IsJsonFiniteNumber(token))
            {
                throw new InvalidOperationException($"{label} must be a finite JSON number.");
            }
            return token.Value<double>();
        }

        private static Color ReadColor(JToken token)
        {
            if (token.Type == JTokenType.String)
            {
                string text = token.Value<string>() ?? "";
                if (!Regex.IsMatch(text, @"^#?[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$"))
                {
                    throw new InvalidOperationException("Color string must be a 6- or 8-digit HTML hex color.");
                }
                if (ColorUtility.TryParseHtmlString(text, out Color parsed)) return parsed;
                throw new InvalidOperationException("Color string must be a valid HTML color.");
            }
            if (token is JArray array)
            {
                if ((array.Count != 3 && array.Count != 4)
                    || !IsJsonFiniteNumber(array[0])
                    || !IsJsonFiniteNumber(array[1])
                    || !IsJsonFiniteNumber(array[2])
                    || (array.Count == 4 && !IsJsonFiniteNumber(array[3])))
                {
                    throw new InvalidOperationException("Color array must contain exactly 3 or 4 numbers, all finite.");
                }
                return new Color(
                    ReadFiniteFloat(array[0], "Color r"),
                    ReadFiniteFloat(array[1], "Color g"),
                    ReadFiniteFloat(array[2], "Color b"),
                    array.Count == 4 ? ReadFiniteFloat(array[3], "Color a") : 1f);
            }
            JObject obj = token as JObject;
            if (obj == null) throw new InvalidOperationException("Color value must be an object with numeric r/g/b/a, an array, or a hex string.");
            var channels = new HashSet<string>(new[] { "r", "g", "b", "a" }, StringComparer.Ordinal);
            foreach (JProperty property in obj.Properties())
            {
                if (!channels.Contains(property.Name))
                {
                    throw new InvalidOperationException("Color object must contain only numeric r/g/b/a fields.");
                }
            }
            if (!obj.TryGetValue("r", out JToken r) || !IsJsonFiniteNumber(r)
                || !obj.TryGetValue("g", out JToken g) || !IsJsonFiniteNumber(g)
                || !obj.TryGetValue("b", out JToken b) || !IsJsonFiniteNumber(b))
            {
                throw new InvalidOperationException("Color object must contain numeric r/g/b fields with finite values.");
            }
            if (obj.TryGetValue("a", out JToken a) && !IsJsonFiniteNumber(a))
            {
                throw new InvalidOperationException("Color object alpha must be numeric and finite.");
            }
            return new Color(
                ReadFiniteFloat(r, "Color r"),
                ReadFiniteFloat(g, "Color g"),
                ReadFiniteFloat(b, "Color b"),
                obj.TryGetValue("a", out a) ? ReadFiniteFloat(a, "Color a") : 1f);
        }

        private sealed class AssignableMember
        {
            public readonly string Name;
            public readonly Type ValueType;
            private readonly Action<object, object> setter;
            private readonly Func<object, object> getter;

            public AssignableMember(string name, Type valueType, Action<object, object> setter, Func<object, object> getter)
            {
                Name = name;
                ValueType = valueType;
                this.setter = setter;
                this.getter = getter;
            }

            public object GetValue(object target)
            {
                return getter(target);
            }

            public void SetValue(object target, object value)
            {
                setter(target, value);
            }
        }

        private sealed class McpHierarchyBudget
        {
            public readonly int MaxNodes;
            public readonly int MaxDepth;
            public int NodesVisited { get; private set; }
            public bool NodeBudgetExceeded { get; private set; }
            public bool DepthExceeded { get; private set; }

            public McpHierarchyBudget(int maxNodes, int maxDepth)
            {
                MaxNodes = maxNodes;
                MaxDepth = maxDepth;
            }

            public bool HasNodeCapacity => NodesVisited < MaxNodes;

            public void ConsumeNode()
            {
                NodesVisited++;
            }

            public void MarkNodeBudgetExceeded()
            {
                NodeBudgetExceeded = true;
            }

            public void MarkDepthExceeded()
            {
                DepthExceeded = true;
            }
        }
    }
}
