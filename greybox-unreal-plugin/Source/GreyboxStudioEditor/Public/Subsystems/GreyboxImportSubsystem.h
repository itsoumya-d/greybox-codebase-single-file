// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "EditorSubsystem.h"
#include "Importers/GreyboxGameProjectTypes.h"
#include "GreyboxImportSubsystem.generated.h"

/**
 * Editor subsystem entry point for the Greybox project importer.
 *
 * Used by:
 * - The `SGreyboxStudioDock` "Import GameProject..." button.
 * - The `UGreyboxImportCommandlet` headless CI runner.
 *
 * Exposes a Blueprint-callable Import method so users can drive imports
 * from Editor Utility Widgets and from python automation scripts.
 */
UCLASS()
class GREYBOXSTUDIOEDITOR_API UGreyboxImportSubsystem final : public UEditorSubsystem
{
    GENERATED_BODY()

public:
    UFUNCTION(BlueprintCallable, Category = "Greybox")
    FGreyboxProjectImportResult ImportProject(
        const FString& JsonPath,
        const FString& AssetBaseDir,
        const FString& OutputContentDir);
};
