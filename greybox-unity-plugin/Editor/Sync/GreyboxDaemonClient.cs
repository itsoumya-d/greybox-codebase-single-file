// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Greybox.Editor.Windows;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Sync
{
    public sealed class GreyboxDaemonClient : IDisposable
    {
        public const int RoundTripLatencyBudgetMs = 2000;
        public const int ConnectTimeoutMs = 750;
        public const int SendTimeoutMs = 750;
        private const int ReceiveChunkBytes = 32 * 1024;
        private const int MaxSyncMessageBytes = 1024 * 1024;
        private const int MaxRoundTripEditPathChars = 512;
        private const int MaxRoundTripEditValueDepth = 16;
        private const int MaxRoundTripEditObjectProperties = 128;
        private const int MaxRoundTripEditArrayItems = 512;
        private const int MaxRoundTripEditStringChars = 4096;
        private static readonly string[] ForbiddenRoundTripEditValueKeys =
        {
            "__proto__",
            "prototype",
            "constructor"
        };

        private readonly GreyboxConfig config;
        private ClientWebSocket socket;
        private CancellationTokenSource cts;
        private Task connectTask;

        public event Action<JObject> ArtifactChanged;
        public bool IsConnected => socket != null && socket.State == WebSocketState.Open;

        public GreyboxDaemonClient(GreyboxConfig config)
        {
            this.config = config;
        }

        public async Task ConnectAsync()
        {
            if (IsConnected) return;
            if (!GreyboxProjectEntitlements.RegisterCurrentProject(config, out string accessMessage))
            {
                Debug.LogWarning(accessMessage);
                return;
            }
            DisposeSocket();
            Uri uri;
            try
            {
                uri = BuildSyncUri();
            }
            catch (Exception error)
            {
                Debug.LogWarning($"Greybox could not build Unity sync URL: {error.Message}");
                return;
            }
            cts = new CancellationTokenSource();
            socket = new ClientWebSocket();
            using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
            connectCts.CancelAfter(ConnectTimeoutMs);
            await socket.ConnectAsync(uri, connectCts.Token);
            _ = ReceiveLoop();
            Debug.Log($"Greybox connected to {uri}");
        }

        public async Task EnsureConnectedAsync()
        {
            if (IsConnected) return;
            if (connectTask != null)
            {
                await connectTask;
                return;
            }
            connectTask = ConnectAsync();
            try
            {
                await connectTask;
            }
            finally
            {
                connectTask = null;
            }
        }

        public async Task SendUnityEditAsync(string fileName, string path, JToken value)
        {
            try
            {
                if (!GreyboxLicenseState.CurrentCapabilities().CanRoundTrip)
                {
                    Debug.LogWarning("Greybox round-trip sync requires a Pro or Studio license.");
                    return;
                }
                if (!TryBuildUnityEditFrame(fileName, path, value, out byte[] bytes, out string rejectionMessage))
                {
                    Debug.LogWarning(rejectionMessage);
                    return;
                }
                if (!IsConnected)
                {
                    await EnsureConnectedAsync();
                }
                if (socket == null || socket.State != WebSocketState.Open) return;
                using var sendCts = CancellationTokenSource.CreateLinkedTokenSource(cts.Token);
                sendCts.CancelAfter(SendTimeoutMs);
                await socket.SendAsync(bytes, WebSocketMessageType.Text, true, sendCts.Token);
            }
            catch (Exception error)
            {
                Debug.LogWarning($"Greybox failed to send Unity edit within the {RoundTripLatencyBudgetMs}ms sync budget: {error.Message}");
            }
        }

        private async Task ReceiveLoop()
        {
            try
            {
                var buffer = new byte[ReceiveChunkBytes];
                ClientWebSocket receiveSocket = socket;
                CancellationTokenSource receiveCts = cts;
                while (receiveSocket != null && receiveSocket.State == WebSocketState.Open && receiveCts != null && !receiveCts.IsCancellationRequested)
                {
                    using var message = new MemoryStream();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await receiveSocket.ReceiveAsync(new ArraySegment<byte>(buffer), receiveCts.Token);
                        if (result.MessageType == WebSocketMessageType.Close) return;
                        if (result.MessageType != WebSocketMessageType.Text) break;
                        if (message.Length + result.Count > MaxSyncMessageBytes)
                        {
                            Debug.LogWarning("Greybox skipped an oversized Unity sync frame from the daemon.");
                            await CloseSocketAsync(receiveSocket, receiveCts);
                            return;
                        }
                        message.Write(buffer, 0, result.Count);
                    }
                    while (!result.EndOfMessage && receiveSocket.State == WebSocketState.Open);

                    if (result.MessageType != WebSocketMessageType.Text || message.Length == 0) continue;
                    string json = Encoding.UTF8.GetString(message.ToArray());
                    JObject evt;
                    try
                    {
                        evt = JObject.Parse(json);
                    }
                    catch (Exception error)
                    {
                        Debug.LogWarning($"Greybox ignored malformed Unity sync frame: {error.Message}");
                        continue;
                    }
                    if (TryReadStringField(evt, "type", out string type)
                        && string.Equals(type, "artifact-changed", StringComparison.Ordinal))
                    {
                        if (!IsArtifactChangedForProject(evt, config.ProjectId))
                        {
                            Debug.LogWarning("Greybox ignored a Unity sync artifact change outside the active project scope.");
                            continue;
                        }
                        EditorApplication.delayCall += () => ArtifactChanged?.Invoke(evt);
                    }
                }
            }
            catch (OperationCanceledException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
            catch (Exception error)
            {
                Debug.LogWarning($"Greybox Unity sync receive loop stopped: {error.Message}");
            }
        }

        private async Task CloseSocketAsync(ClientWebSocket targetSocket, CancellationTokenSource targetCts)
        {
            if (targetSocket == null || targetSocket.State != WebSocketState.Open) return;
            try
            {
                await targetSocket.CloseAsync(
                    WebSocketCloseStatus.MessageTooBig,
                    "Greybox sync frame too large",
                    targetCts?.Token ?? CancellationToken.None
                );
            }
            catch
            {
                if (ReferenceEquals(targetSocket, socket)) DisposeSocket();
                else targetSocket.Dispose();
            }
        }

        private Uri BuildSyncUri()
        {
            bool hasSafeProjectId = GreyboxDaemonUrlBuilder.TrySafeProjectId(config?.ProjectId, out string projectId);
            if (!GreyboxDaemonUrlBuilder.TrySafeDaemonBaseUrl(config?.DaemonUrl, out string baseUrl)
                || !Uri.TryCreate(baseUrl, UriKind.Absolute, out Uri baseUri)
                || !hasSafeProjectId)
            {
                throw new InvalidOperationException("Greybox daemon URL must be an absolute HTTP or HTTPS URL and project id must be set.");
            }
            string scheme = baseUri.Scheme == Uri.UriSchemeHttps ? "wss" : "ws";
            string escapedProjectId = Uri.EscapeDataString(projectId);
            return new Uri($"{scheme}://{baseUri.Authority}/api/sync/unity?projectId={escapedProjectId}");
        }

        private bool TryBuildUnityEditFrame(string fileName, string path, JToken value, out byte[] bytes, out string rejectionMessage)
        {
            bytes = Array.Empty<byte>();
            rejectionMessage = "";
            if (!GreyboxDaemonUrlBuilder.TrySafeProjectId(config?.ProjectId, out string projectId))
            {
                rejectionMessage = "Greybox refused to send a Unity edit without a safe project id.";
                return false;
            }
            string safeFileName = GreyboxConflictResolver.SafeRoundTripFileName(fileName);
            string safePath = SafeRoundTripEditPath(path);
            if (string.IsNullOrWhiteSpace(safeFileName) || string.IsNullOrWhiteSpace(safePath) || !IsSafeRoundTripEditValue(value))
            {
                rejectionMessage = "Greybox refused to send a Unity edit with an unsafe file name, unsafe JSON path, or unsafe value.";
                return false;
            }

            var payload = new JObject
            {
                ["type"] = "unity-edit",
                ["projectId"] = projectId,
                ["fileName"] = safeFileName,
                ["path"] = safePath,
                ["value"] = value.DeepClone(),
                ["sentAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                ["latencyBudgetMs"] = RoundTripLatencyBudgetMs
            };
            bytes = Encoding.UTF8.GetBytes(payload.ToString(Newtonsoft.Json.Formatting.None));
            if (bytes.Length <= MaxSyncMessageBytes) return true;
            bytes = Array.Empty<byte>();
            rejectionMessage = $"Greybox refused to send an oversized Unity edit frame above {MaxSyncMessageBytes} bytes.";
            return false;
        }

        private static string SafeRoundTripEditPath(string path)
        {
            string clean = GreyboxConflictResolver.SafeConflictJsonPath(path);
            if (string.IsNullOrWhiteSpace(clean) || clean.Length > MaxRoundTripEditPathChars) return "";
            return clean;
        }

        private static bool IsSafeRoundTripEditValue(JToken value)
        {
            return IsSafeRoundTripEditValue(value, 0);
        }

        private static bool IsSafeRoundTripEditValue(JToken value, int depth)
        {
            if (value == null || depth > MaxRoundTripEditValueDepth) return false;
            switch (value.Type)
            {
                case JTokenType.Integer:
                case JTokenType.Boolean:
                    return true;
                case JTokenType.Float:
                    double number = value.Value<double>();
                    return !double.IsNaN(number) && !double.IsInfinity(number);
                case JTokenType.String:
                    return (value.Value<string>() ?? "").Length <= MaxRoundTripEditStringChars;
                case JTokenType.Object:
                    int propertyCount = 0;
                    foreach (JProperty property in value.Children<JProperty>())
                    {
                        propertyCount++;
                        if (propertyCount > MaxRoundTripEditObjectProperties) return false;
                        if (!IsSafeRoundTripEditPropertyName(property.Name)) return false;
                        if (!IsSafeRoundTripEditValue(property.Value, depth + 1)) return false;
                    }
                    return true;
                case JTokenType.Array:
                    int itemCount = 0;
                    foreach (JToken child in value.Children())
                    {
                        itemCount++;
                        if (itemCount > MaxRoundTripEditArrayItems) return false;
                        if (!IsSafeRoundTripEditValue(child, depth + 1)) return false;
                    }
                    return true;
                default:
                    return false;
            }
        }

        private static bool IsSafeRoundTripEditPropertyName(string propertyName)
        {
            if (string.IsNullOrWhiteSpace(propertyName) || propertyName.Length > MaxRoundTripEditPathChars) return false;
            foreach (string forbidden in ForbiddenRoundTripEditValueKeys)
            {
                if (string.Equals(propertyName, forbidden, StringComparison.Ordinal)) return false;
            }
            if (propertyName.Contains("://")
                || propertyName.Contains("/")
                || propertyName.Contains("\\")
                || propertyName.Contains("..")
                || ContainsRoundTripEditPathDelimiter(propertyName))
            {
                return false;
            }
            foreach (char c in propertyName)
            {
                if (char.IsControl(c)) return false;
            }
            return true;
        }

        private static bool ContainsRoundTripEditPathDelimiter(string value)
        {
            return value.Contains(".") || value.Contains("[") || value.Contains("]") || value.Contains("=") || value.Contains(" ");
        }

        private static bool IsArtifactChangedForProject(JObject evt, string expectedProjectId)
        {
            if (evt == null || !GreyboxDaemonUrlBuilder.TrySafeProjectId(expectedProjectId, out string safeExpectedProjectId)) return false;
            if (!TryReadStringField(evt, "type", out string type)
                || !string.Equals(type, "artifact-changed", StringComparison.Ordinal))
            {
                return false;
            }

            bool sawScope = false;
            foreach (string candidate in ProjectScopeCandidates(evt))
            {
                sawScope = true;
                if (!GreyboxDaemonUrlBuilder.TrySafeProjectId(candidate, out string safeCandidate)
                    || !string.Equals(safeCandidate, safeExpectedProjectId, StringComparison.Ordinal))
                {
                    return false;
                }
            }
            return sawScope;
        }

        private static System.Collections.Generic.IEnumerable<string> ProjectScopeCandidates(JObject evt)
        {
            if (TryReadStringField(evt, "projectId", out string rootProjectId)) yield return rootProjectId;
            if (evt["payload"] is JObject payload)
            {
                if (TryReadStringField(payload, "projectId", out string payloadProjectId)) yield return payloadProjectId;
            }
        }

        private static bool TryReadStringField(JObject source, string key, out string value)
        {
            value = "";
            JToken token = source?[key];
            if (token == null || token.Type != JTokenType.String) return false;
            value = token.Value<string>() ?? "";
            return !string.IsNullOrWhiteSpace(value);
        }

        public void Dispose()
        {
            cts?.Cancel();
            DisposeSocket();
            cts?.Dispose();
            cts = null;
            connectTask = null;
        }

        private void DisposeSocket()
        {
            socket?.Dispose();
            socket = null;
        }
    }
}
