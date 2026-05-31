// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"
#include "GreyboxArtifact.generated.h"

UENUM(BlueprintType)
enum class EGreyboxArtifactKind : uint8
{
    GameView,
    ArtBible,
    HudLayout,
    LevelBoard
};

USTRUCT(BlueprintType)
struct FGreyboxArtifactProvenance
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString ArtifactId;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString DesignerName;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString Generator = TEXT("Greybox + human designer");

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString SourceSha256;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString SyncedAtIso8601;
};

UCLASS(BlueprintType)
class GREYBOXSTUDIO_API UGreyboxArtifact : public UDataAsset
{
    GENERATED_BODY()

public:
    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    EGreyboxArtifactKind Kind = EGreyboxArtifactKind::GameView;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FGreyboxArtifactProvenance Provenance;

    UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "Greybox")
    FString SourcePath;
};
