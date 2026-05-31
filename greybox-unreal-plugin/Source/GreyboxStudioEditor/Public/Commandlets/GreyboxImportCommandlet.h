// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"
#include "GreyboxImportCommandlet.generated.h"

/**
 * Headless CI commandlet that runs the Greybox project importer outside
 * the editor UI.
 *
 * Usage:
 *   Unreal.exe MyProject.uproject -run=GreyboxImport
 *       -ProjectJson=path/to/project.json
 *       -AssetBase=path/to/assets
 *       [-Output=/Game/Greybox]
 *
 * Exit codes:
 *   0   success (all assets parsed, descriptors written).
 *   1   import errors.
 *   2   bad arguments (missing -ProjectJson).
 */
UCLASS()
class GREYBOXSTUDIOEDITOR_API UGreyboxImportCommandlet final : public UCommandlet
{
    GENERATED_BODY()

public:
    UGreyboxImportCommandlet();

    virtual int32 Main(const FString& Params) override;
};
