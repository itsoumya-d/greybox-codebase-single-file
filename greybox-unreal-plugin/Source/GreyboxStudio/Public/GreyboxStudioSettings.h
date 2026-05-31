// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "GreyboxStudioSettings.generated.h"

UCLASS(Config = EditorPerProjectUserSettings, DefaultConfig, DisplayName = "Greybox Studio")
class GREYBOXSTUDIO_API UGreyboxStudioSettings : public UDeveloperSettings
{
    GENERATED_BODY()

public:
    UPROPERTY(Config, EditAnywhere, Category = "Greybox")
    FString ProjectId;

    UPROPERTY(Config, EditAnywhere, Category = "Greybox")
    FString DaemonUrl = TEXT("http://127.0.0.1:17345");

    UPROPERTY(Config, EditAnywhere, Category = "Greybox")
    FString CloudUrl = TEXT("https://cloud.greybox.studio");

    UPROPERTY(Config, EditAnywhere, Category = "Greybox")
    bool bRoundTripSyncEnabled = false;

    UPROPERTY(Config, EditAnywhere, Category = "Greybox")
    bool bMcpBridgeEnabled = false;
};
