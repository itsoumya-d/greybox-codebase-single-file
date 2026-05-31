// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using System.Collections;
using Greybox.Editor.Sync;
using Greybox.Runtime;
using Unity.EditorCoroutines.Editor;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Windows
{
    public sealed class GreyboxLicenseWindow : EditorWindow
    {
        private GreyboxConfig config;
        private string licenseKey = "";
        private GreyboxLicenseTier selectedTier;
        private GreyboxLicenseCapabilities? selectedCapabilities;
        private bool validating;
        private string validationStatus = "";
        private MessageType validationMessageType = MessageType.Info;

        [MenuItem("Window/Greybox/License")]
        public static void Open()
        {
            GetWindow<GreyboxLicenseWindow>("Greybox License");
        }

        private void OnEnable()
        {
            config = GreyboxSettings.FindOrCreateConfig();
            licenseKey = GreyboxSettings.GetLicenseKey();
            selectedTier = GreyboxLicenseState.CurrentTier();
            selectedCapabilities = GreyboxLicenseCapabilities.ForTier(selectedTier);
        }

        private void OnGUI()
        {
            config ??= GreyboxSettings.FindOrCreateConfig();
            EditorGUILayout.LabelField("License", EditorStyles.boldLabel);
            licenseKey = EditorGUILayout.PasswordField("License key", licenseKey);
            using (new EditorGUI.DisabledScope(true))
            {
                EditorGUILayout.EnumPopup("Cached tier", selectedTier);
            }
            var capabilities = selectedCapabilities ?? GreyboxLicenseCapabilities.ForTier(selectedTier);
            EditorGUILayout.HelpBox(
                $"Current tier: {capabilities.DisplayName}\n"
                + $"Price: {capabilities.PriceLabel}\n"
                + $"One-way import: {(capabilities.CanImport ? "enabled" : "disabled")}\n"
                + $"Round-trip sync: {(capabilities.CanRoundTrip ? "enabled" : "requires Pro or Studio")}\n"
                + $"MCP bridge: {(capabilities.CanUseMcpBridge ? "enabled" : "requires Pro or Studio")}\n"
                + $"Watermark: {(capabilities.HasWatermark ? "enabled" : "disabled")}\n"
                + $"Project cap: {capabilities.ProjectLimitLabel}\n"
                + $"Priority queue: {(capabilities.HasPriorityQueue ? "enabled" : "requires Pro or Studio")}\n"
                + $"SSO: {(capabilities.HasSso ? "enabled" : "requires Studio site license")}\n"
                + $"Custom skill packs: {(capabilities.HasCustomSkillPacks ? "enabled" : "requires Studio site license")}\n"
                + $"Seats: {capabilities.SeatLimitLabel}\n"
                + $"Site license: {(capabilities.IsSiteLicense ? "enabled" : "disabled")}",
                MessageType.Info);
            if (GUILayout.Button("Save"))
            {
                SaveLocalKey();
            }
            using (new EditorGUI.DisabledScope(validating || string.IsNullOrWhiteSpace(licenseKey)))
            {
                if (GUILayout.Button(validating ? "Validating..." : "Validate With Greybox Cloud"))
                {
                    SaveLocalKey();
                    EditorCoroutineUtility.StartCoroutine(ValidateAgainstCloud(), this);
                }
            }
            if (!string.IsNullOrWhiteSpace(validationStatus))
            {
                EditorGUILayout.HelpBox(validationStatus, validationMessageType);
            }
        }

        private void SaveLocalKey()
        {
            GreyboxSettings.SetLicenseKey(licenseKey);
            selectedTier = GreyboxLicenseTier.FreePersonal;
            selectedCapabilities = GreyboxLicenseCapabilities.ForTier(selectedTier);
            GreyboxSettings.ClearLicenseTier();
            validationStatus = "Saved key locally. Validate with Greybox Cloud to activate paid capabilities.";
            validationMessageType = MessageType.Warning;
            EditorUtility.SetDirty(config);
        }

        private IEnumerator ValidateAgainstCloud()
        {
            validating = true;
            validationStatus = "Validating license with Greybox Cloud...";
            validationMessageType = MessageType.Info;
            Repaint();

            var client = new GreyboxCloudClient(config);
            yield return client.ValidateLicense();

            selectedTier = client.LastValidatedTier ?? GreyboxLicenseState.CurrentTier();
            selectedCapabilities = client.LastValidatedCapabilities ?? GreyboxLicenseCapabilities.ForTier(selectedTier);
            validationStatus = string.IsNullOrWhiteSpace(client.LastLicenseValidationMessage)
                ? "Greybox license validation did not return a status."
                : client.LastLicenseValidationMessage;
            validationMessageType = client.LastLicenseValidationSucceeded ? MessageType.Info : MessageType.Warning;
            validating = false;
            Repaint();
        }
    }
}
