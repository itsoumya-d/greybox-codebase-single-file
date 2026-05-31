// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"

class FGreyboxSyncClient
{
public:
    explicit FGreyboxSyncClient(FString InDaemonUrl);

    FString UnityCompatibilityPackageUrl(const FString& ProjectId) const;
    FString UnrealEnginePackagePreflightUrl(const FString& ProjectId) const;
    FString UnrealEnginePackageUrl(const FString& ProjectId, const FString& FileName = TEXT("")) const;
    FString UnrealSyncWebSocketUrl(const FString& ProjectId) const;
    FString RoundTripMergeUrl(const FString& ProjectId) const;

private:
    FString DaemonUrl;
};
