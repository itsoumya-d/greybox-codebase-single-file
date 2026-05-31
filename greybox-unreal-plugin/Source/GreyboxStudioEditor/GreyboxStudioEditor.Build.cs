// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnrealBuildTool;

public class GreyboxStudioEditor : ModuleRules
{
    public GreyboxStudioEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "GreyboxStudio"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "ApplicationCore",
            "AssetTools",
            "AutomationController",
            "BlueprintGraph",
            "DesktopPlatform",
            "EditorFramework",
            "EditorSubsystem",
            "HTTP",
            "Json",
            "JsonUtilities",
            "LevelEditor",
            "Paper2D",
            "Projects",
            "Slate",
            "SlateCore",
            "ToolMenus",
            "UMG",
            "UMGEditor",
            "UnrealEd",
            "WebSockets"
        });
    }
}
