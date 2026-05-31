// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

using UnrealBuildTool;

public class GreyboxStudio : ModuleRules
{
    public GreyboxStudio(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new[]
        {
            "Core",
            "CoreUObject",
            "Engine",
            "DeveloperSettings"
        });

        PrivateDependencyModuleNames.AddRange(new[]
        {
            "Json",
            "JsonUtilities"
        });
    }
}
