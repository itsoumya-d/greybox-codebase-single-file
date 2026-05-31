// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Editor.McpBridge;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Newtonsoft.Json.Linq;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Windows
{
    public sealed class GreyboxStudioWindow : EditorWindow
    {
        private GreyboxConfig config;
        private GreyboxDaemonClient daemonClient;
        private Vector2 scroll;
        private GreyboxProModuleStatus proModuleStatus;
        private string proModuleStatusMessage = "Pro module status not refreshed.";
        private bool proModuleStatusLoading;
        private GreyboxEnginePackagePreflight enginePackagePreflight;
        private string enginePackagePreflightMessage = "Unity engine package preflight not checked.";
        private bool enginePackagePreflightLoading;

        [MenuItem("Window/Greybox/Studio")]
        public static void Open()
        {
            GetWindow<GreyboxStudioWindow>("Greybox Studio");
        }

        private void OnEnable()
        {
            config = GreyboxSettings.FindOrCreateConfig();
            daemonClient = new GreyboxDaemonClient(config);
            daemonClient.ArtifactChanged += OnArtifactChanged;
            GreyboxArtifactRefresher.UnityPackageRefreshRequested += OnUnityPackageRefreshRequested;
        }

        private void OnDisable()
        {
            if (daemonClient != null)
            {
                daemonClient.ArtifactChanged -= OnArtifactChanged;
                daemonClient.Dispose();
            }
            GreyboxArtifactRefresher.UnityPackageRefreshRequested -= OnUnityPackageRefreshRequested;
        }

        private void OnArtifactChanged(JObject evt)
        {
            if (!config || !config.RoundTripSyncEnabled || !GreyboxLicenseState.CurrentCapabilities().CanRoundTrip) return;
            if (GreyboxConflictInbox.RecordFromEvent(evt))
            {
                GreyboxConflictWindow.Open();
                return;
            }
            GreyboxArtifactRefresher.PullAndRefreshFromEvent(evt, config);
        }

        private void OnUnityPackageRefreshRequested(string artifactName)
        {
            if (!config || !config.RoundTripSyncEnabled || !GreyboxLicenseState.CurrentCapabilities().CanRoundTrip) return;
            enginePackagePreflightMessage = string.IsNullOrWhiteSpace(artifactName)
                ? "Unity export changed: checking package..."
                : $"Unity export changed for {artifactName}: checking package...";
            RefreshEnginePackagePreflight();
        }

        private void OnGUI()
        {
            config ??= GreyboxSettings.FindOrCreateConfig();
            scroll = EditorGUILayout.BeginScrollView(scroll);
            EditorGUILayout.LabelField("Greybox Studio", EditorStyles.boldLabel);
            config.ProjectId = EditorGUILayout.TextField("Project ID", config.ProjectId);
            config.DaemonUrl = EditorGUILayout.TextField("Daemon URL", config.DaemonUrl);
            config.CloudUrl = EditorGUILayout.TextField("Cloud URL", config.CloudUrl);
            var capabilities = GreyboxLicenseState.CurrentCapabilities();
            var projectAccess = GreyboxProjectEntitlements.CurrentProjectAccess(config);
            EditorGUILayout.LabelField("License tier", capabilities.DisplayName);
            EditorGUILayout.LabelField("Seats", capabilities.SeatLimitLabel);
            EditorGUILayout.LabelField("Priority queue", capabilities.HasPriorityQueue ? "enabled" : "requires Pro or Studio");
            if (capabilities.MaxProjects > 0)
            {
                EditorGUILayout.LabelField("Project usage", $"{projectAccess.UsedProjects}/{capabilities.MaxProjects}");
            }
            using (new EditorGUI.DisabledScope(!capabilities.CanRoundTrip))
            {
                config.RoundTripSyncEnabled = EditorGUILayout.Toggle("Round-trip sync", config.RoundTripSyncEnabled && capabilities.CanRoundTrip);
            }
            using (new EditorGUI.DisabledScope(!capabilities.CanUseMcpBridge))
            {
                config.McpBridgeEnabled = EditorGUILayout.Toggle("MCP bridge", config.McpBridgeEnabled && capabilities.CanUseMcpBridge);
            }
            if (!capabilities.CanRoundTrip || !capabilities.CanUseMcpBridge)
            {
                EditorGUILayout.HelpBox("Round-trip sync and MCP bridge require a Pro or Studio license.", MessageType.Info);
            }
            if (capabilities.IsSiteLicense)
            {
                EditorGUILayout.HelpBox("Studio site license active: SSO and custom skill packs are enabled for up to 25 seats.", MessageType.Info);
            }
            if (!projectAccess.Allowed)
            {
                EditorGUILayout.HelpBox(projectAccess.Message, MessageType.Warning);
            }

            using (new EditorGUILayout.HorizontalScope())
            {
                using (new EditorGUI.DisabledScope(!projectAccess.Allowed))
                {
                    if (GUILayout.Button("Connect Daemon") && GreyboxProjectEntitlements.RegisterCurrentProject(config, out _)) _ = daemonClient.ConnectAsync();
                    if (GUILayout.Button("Pull Unity Package") && GreyboxProjectEntitlements.RegisterCurrentProject(config, out _)) GreyboxPackageDownloader.DownloadUnityPackage(config);
                    if (GUILayout.Button("Check Unity Export") && GreyboxProjectEntitlements.RegisterCurrentProject(config, out _)) RefreshEnginePackagePreflight();
                    if (GUILayout.Button("Refresh Pro Modules") && GreyboxProjectEntitlements.RegisterCurrentProject(config, out _)) RefreshProModuleStatus();
                }
            }

            DrawEnginePackagePreflight();
            DrawProModuleStatus();

            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Artifacts")) GreyboxArtifactWindow.Open();
                if (GUILayout.Button("Conflicts")) GreyboxConflictWindow.Open();
                if (GUILayout.Button("License")) GreyboxLicenseWindow.Open();
                using (new EditorGUI.DisabledScope(!capabilities.CanUseMcpBridge || !config.McpBridgeEnabled || !projectAccess.Allowed))
                {
                    if (GUILayout.Button("Start MCP")) GreyboxMcpServer.Start(config);
                }
            }
            DrawMcpBridgeTokenTools(capabilities, projectAccess);

            if (GUI.changed) EditorUtility.SetDirty(config);
            EditorGUILayout.EndScrollView();
        }

        private void DrawMcpBridgeTokenTools(GreyboxLicenseCapabilities capabilities, GreyboxProjectAccess projectAccess)
        {
            if (!capabilities.CanUseMcpBridge || !config.McpBridgeEnabled || !projectAccess.Allowed) return;
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("MCP bridge", EditorStyles.boldLabel);
            EditorGUILayout.SelectableLabel("http://127.0.0.1:38467/mcp", EditorStyles.textField, GUILayout.Height(EditorGUIUtility.singleLineHeight));
            using (new EditorGUILayout.HorizontalScope())
            {
                if (GUILayout.Button("Copy MCP Config"))
                {
                    string token = GreyboxSettings.GetOrCreateMcpBridgeToken();
                    EditorGUIUtility.systemCopyBuffer = "{\n"
                        + "  \"url\": \"http://127.0.0.1:38467/mcp\",\n"
                        + "  \"headers\": {\n"
                        + $"    \"Authorization\": \"Bearer {token}\"\n"
                        + "  }\n"
                        + "}";
                    ShowNotification(new GUIContent("Copied Greybox MCP config"));
                }
                if (GUILayout.Button("Rotate MCP Token"))
                {
                    GreyboxSettings.RotateMcpBridgeToken();
                    ShowNotification(new GUIContent("Rotated Greybox MCP token"));
                }
            }
            EditorGUILayout.HelpBox("The MCP bridge is loopback-only and requires this local bearer token for /mcp, /tools/list, and /tools/call.", MessageType.Info);
        }

        private async void RefreshProModuleStatus()
        {
            proModuleStatusLoading = true;
            proModuleStatusMessage = "Refreshing Pro module status...";
            Repaint();
            proModuleStatus = await GreyboxProModuleStatusClient.FetchAsync(config);
            proModuleStatusLoading = false;
            proModuleStatusMessage = proModuleStatus.SummaryMessage;
            Repaint();
        }

        private async void RefreshEnginePackagePreflight()
        {
            enginePackagePreflightLoading = true;
            enginePackagePreflightMessage = "Checking Unity engine package preflight...";
            Repaint();
            enginePackagePreflight = await GreyboxEnginePackagePreflightClient.FetchUnityAsync(config);
            enginePackagePreflightLoading = false;
            enginePackagePreflightMessage = enginePackagePreflight.Available
                ? $"Ready: {enginePackagePreflight.PackageFileName}"
                : $"Unavailable: {enginePackagePreflight.ErrorMessage}";
            Repaint();
        }

        private void DrawEnginePackagePreflight()
        {
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("Unity engine package", EditorStyles.boldLabel);
            EditorGUILayout.LabelField(enginePackagePreflightMessage);
            if (enginePackagePreflightLoading) return;
            if (enginePackagePreflight == null) return;
            if (!enginePackagePreflight.Available)
            {
                EditorGUILayout.HelpBox("Create or select a .gameview.json artifact in Greybox before exporting native Unity runtime files.", MessageType.Warning);
                return;
            }
            EditorGUILayout.LabelField("Source", enginePackagePreflight.SourceFileName);
            EditorGUILayout.LabelField("Package", enginePackagePreflight.PackageFileName);
            EditorGUILayout.LabelField("Payload", $"{enginePackagePreflight.FileCount} files, {enginePackagePreflight.SizeLabel}");
            EditorGUILayout.LabelField("Runtime hooks", $"{enginePackagePreflight.TerrainColliderCount} terrain colliders, {enginePackagePreflight.DynamicEventCount} dynamic events, {enginePackagePreflight.FactionCount} factions");
            if (GUILayout.Button("Download Unity Export"))
            {
                GreyboxPackageDownloader.DownloadUnityEnginePackage(config, enginePackagePreflight);
            }
            EditorGUILayout.HelpBox("Preflight calls /api/game-deliverables/:id/engine-package/unity/preflight, so it validates the daemon package without recording shipment analytics or downloading the zip.", MessageType.Info);
        }

        private void DrawProModuleStatus()
        {
            EditorGUILayout.Space(8);
            EditorGUILayout.LabelField("Pro modules", EditorStyles.boldLabel);
            EditorGUILayout.LabelField(proModuleStatusMessage);
            if (proModuleStatusLoading) return;
            if (proModuleStatus == null || !proModuleStatus.HasAny) return;
            EditorGUILayout.LabelField("Licensed bundles", proModuleStatus.LicensedCount.ToString());
            EditorGUILayout.LabelField("Needs license", proModuleStatus.LicenseRequiredCount.ToString());
            if (proModuleStatus.LicenseRequiredCount > 0 && GUILayout.Button("Open License To Activate Pro Modules"))
            {
                GreyboxLicenseWindow.Open();
            }
            EditorGUILayout.LabelField("Blocked bundles", proModuleStatus.BlockedCount.ToString());
            EditorGUILayout.LabelField("Unity export targets", proModuleStatus.EngineTargetCount.ToString());
            if (proModuleStatus.EngineTargetCount > 0)
            {
                EditorGUILayout.HelpBox(
                    $"Unity packages include licensed Pro engine targets: {proModuleStatus.EngineTargetNames}. Native export folders use bodyless Pro target metadata only.",
                    MessageType.Info);
            }
        }
    }
}
