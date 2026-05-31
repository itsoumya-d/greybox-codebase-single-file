// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxSyncClient.h"

#include "GenericPlatform/GenericPlatformHttp.h"

FGreyboxSyncClient::FGreyboxSyncClient(FString InDaemonUrl)
    : DaemonUrl(MoveTemp(InDaemonUrl))
{
}

FString FGreyboxSyncClient::UnityCompatibilityPackageUrl(const FString& ProjectId) const
{
    return FString::Printf(TEXT("%s/api/projects/%s/unity-package"), *DaemonUrl, *ProjectId);
}

FString FGreyboxSyncClient::UnrealEnginePackagePreflightUrl(const FString& ProjectId) const
{
    return FString::Printf(TEXT("%s/api/game-deliverables/%s/engine-package/unreal/preflight"), *DaemonUrl, *ProjectId);
}

FString FGreyboxSyncClient::UnrealEnginePackageUrl(const FString& ProjectId, const FString& FileName) const
{
    const FString Query = FileName.IsEmpty()
        ? TEXT("")
        : FString::Printf(TEXT("?fileName=%s"), *FGenericPlatformHttp::UrlEncode(FileName));
    return FString::Printf(TEXT("%s/api/projects/%s/engine-package/unreal%s"), *DaemonUrl, *ProjectId, *Query);
}

FString FGreyboxSyncClient::UnrealSyncWebSocketUrl(const FString& ProjectId) const
{
    return FString::Printf(TEXT("%s/api/sync/unreal?projectId=%s"), *DaemonUrl, *ProjectId);
}

FString FGreyboxSyncClient::RoundTripMergeUrl(const FString& ProjectId) const
{
    return FString::Printf(TEXT("%s/api/projects/%s/round-trip-merge"), *DaemonUrl, *ProjectId);
}
