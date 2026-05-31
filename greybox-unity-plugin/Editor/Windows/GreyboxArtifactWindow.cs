// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using Greybox.Runtime;
using UnityEditor;
using UnityEngine;

namespace Greybox.Editor.Windows
{
    public sealed class GreyboxArtifactWindow : EditorWindow
    {
        [MenuItem("Window/Greybox/Artifacts")]
        public static void Open()
        {
            GetWindow<GreyboxArtifactWindow>("Greybox Artifacts");
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("Imported Artifacts", EditorStyles.boldLabel);
            foreach (string guid in AssetDatabase.FindAssets("t:GreyboxArtifact"))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                var artifact = AssetDatabase.LoadAssetAtPath<GreyboxArtifact>(path);
                if (!artifact) continue;
                using (new EditorGUILayout.VerticalScope(EditorStyles.helpBox))
                {
                    EditorGUILayout.LabelField(artifact.name, EditorStyles.boldLabel);
                    EditorGUILayout.LabelField("Kind", artifact.Kind.ToString());
                    EditorGUILayout.LabelField("Source", artifact.SourcePath);
                    EditorGUILayout.LabelField("Hash", artifact.SourceHash);
                    EditorGUILayout.LabelField("Generator credit", DisplayOrFallback(artifact.GeneratorCredit));
                    EditorGUILayout.LabelField("Human designer", DisplayOrFallback(artifact.HumanDesignerCredit));
                    EditorGUILayout.LabelField("AI disclosure", DisplayOrFallback(artifact.AiDisclosure));
                }
            }
        }

        private static string DisplayOrFallback(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? "Not provided" : value.Trim();
        }
    }
}
