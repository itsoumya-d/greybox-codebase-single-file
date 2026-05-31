// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "SGreyboxStudioDock.h"

#include "GreyboxEnginePackageImporter.h"
#include "GreyboxMcpBridge.h"
#include "GreyboxStudioSettings.h"
#include "HAL/PlatformApplicationMisc.h"
#include "Importers/GreyboxProjectImporter.h"
#include "Misc/Paths.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SUniformGridPanel.h"
#include "Widgets/Text/STextBlock.h"

namespace
{
FString HumanBytes(const int64 Bytes)
{
    if (Bytes >= 1024 * 1024)
    {
        return FString::Printf(TEXT("%.1f MB"), static_cast<double>(Bytes) / (1024.0 * 1024.0));
    }
    if (Bytes >= 1024)
    {
        return FString::Printf(TEXT("%.1f KB"), static_cast<double>(Bytes) / 1024.0);
    }
    return FString::Printf(TEXT("%lld bytes"), Bytes);
}

FString RuntimeHookSummary(const TArray<FString>& Hooks)
{
    return Hooks.Num() == 0 ? TEXT("none") : FString::Join(Hooks, TEXT(", "));
}
}

void SGreyboxStudioDock::Construct(const FArguments& InArgs)
{
    const UGreyboxStudioSettings* Settings = GetDefault<UGreyboxStudioSettings>();

    ChildSlot
    [
        SNew(SScrollBox)
        + SScrollBox::Slot()
        .Padding(12.0f)
        [
            SNew(SVerticalBox)
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 8.0f)
            [
                SNew(STextBlock)
                .Text(FText::FromString(TEXT("Greybox Studio")))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 8.0f)
            [
                SNew(STextBlock)
                .AutoWrapText(true)
                .Text(FText::FromString(TEXT("Preflight Unreal engine packages, extract reviewed runtime hooks, and copy local MCP config from the editor.")))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 6.0f)
            [
                SNew(STextBlock)
                .Text(FText::FromString(TEXT("Daemon URL")))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 10.0f)
            [
                SAssignNew(DaemonUrlTextBox, SEditableTextBox)
                .Text(FText::FromString(Settings->DaemonUrl))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 6.0f)
            [
                SNew(STextBlock)
                .Text(FText::FromString(TEXT("Project ID")))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 12.0f)
            [
                SAssignNew(ProjectIdTextBox, SEditableTextBox)
                .Text(FText::FromString(Settings->ProjectId))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 12.0f)
            [
                SNew(SUniformGridPanel)
                .SlotPadding(6.0f)
                + SUniformGridPanel::Slot(0, 0)
                [
                    SNew(SButton)
                    .Text(FText::FromString(TEXT("Check Unreal Export")))
                    .OnClicked(this, &SGreyboxStudioDock::CheckUnrealExport)
                ]
                + SUniformGridPanel::Slot(1, 0)
                [
                    SNew(SButton)
                    .Text(FText::FromString(TEXT("Download Unreal Export")))
                    .IsEnabled(this, &SGreyboxStudioDock::CanDownloadUnrealExport)
                    .OnClicked(this, &SGreyboxStudioDock::DownloadUnrealExport)
                ]
                + SUniformGridPanel::Slot(2, 0)
                [
                    SNew(SButton)
                    .Text(FText::FromString(TEXT("Copy MCP Config")))
                    .OnClicked(this, &SGreyboxStudioDock::CopyMcpConfig)
                ]
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 6.0f)
            [
                SNew(STextBlock)
                .Text(FText::FromString(TEXT("GameProject JSON path")))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 6.0f)
            [
                SAssignNew(GameProjectJsonPathTextBox, SEditableTextBox)
                .HintText(FText::FromString(TEXT("e.g. C:/projects/my-game/project.json")))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 12.0f)
            [
                SNew(SButton)
                .Text(FText::FromString(TEXT("Import GameProject...")))
                .OnClicked(this, &SGreyboxStudioDock::ImportGameProject)
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            .Padding(0.0f, 0.0f, 0.0f, 12.0f)
            [
                SAssignNew(StatusText, STextBlock)
                .AutoWrapText(true)
                .Text(FText::FromString(TEXT("Enter a Greybox project id, then check the Unreal engine-package preflight.")))
            ]
            + SVerticalBox::Slot()
            .AutoHeight()
            [
                SAssignNew(PreflightText, STextBlock)
                .AutoWrapText(true)
                .Text(FText::FromString(TEXT("No Unreal package preflight has run yet.")))
            ]
        ]
    ];
}

FReply SGreyboxStudioDock::CheckUnrealExport()
{
    PersistSettings();
    const FString ProjectId = CurrentProjectId();
    if (ProjectId.IsEmpty())
    {
        SetStatus(TEXT("Enter a Greybox project id before checking the Unreal export."));
        return FReply::Handled();
    }

    bHasReadyPreflight = false;
    SetStatus(TEXT("Checking Unreal engine-package preflight..."));
    SetPreflightSummary(TEXT("Waiting for /api/game-deliverables/:id/engine-package/unreal/preflight."));
    FGreyboxEnginePackagePreflightClient Client(CurrentDaemonUrl());
    const TWeakPtr<SGreyboxStudioDock> WeakThis = StaticCastSharedRef<SGreyboxStudioDock>(AsShared());
    Client.FetchUnrealAsync(
        ProjectId,
        [WeakThis](bool bSucceeded, const FGreyboxEnginePackagePreflight& Preflight, const FString& Error)
        {
            if (const TSharedPtr<SGreyboxStudioDock> Pinned = WeakThis.Pin())
            {
                Pinned->HandlePreflightComplete(bSucceeded, Preflight, Error);
            }
        });
    return FReply::Handled();
}

FReply SGreyboxStudioDock::DownloadUnrealExport()
{
    PersistSettings();
    if (!CanDownloadUnrealExport())
    {
        SetStatus(TEXT("Run Check Unreal Export before downloading."));
        return FReply::Handled();
    }

    SetStatus(TEXT("Downloading Unreal engine package..."));
    const TWeakPtr<SGreyboxStudioDock> WeakThis = StaticCastSharedRef<SGreyboxStudioDock>(AsShared());
    FGreyboxEnginePackageImporter::DownloadAndStageUnrealPackageAsync(
        CurrentDaemonUrl(),
        CurrentProjectId(),
        LastPreflight.PackageFileName,
        [WeakThis](const FGreyboxEnginePackageStageResult& Result)
        {
            if (const TSharedPtr<SGreyboxStudioDock> Pinned = WeakThis.Pin())
            {
                Pinned->HandleStageComplete(Result);
            }
        });
    return FReply::Handled();
}

FReply SGreyboxStudioDock::CopyMcpConfig()
{
    FGreyboxMcpBridge::Start();
    FPlatformApplicationMisc::ClipboardCopy(*FGreyboxMcpBridge::ClientConfigJson());
    SetStatus(TEXT("Copied Greybox Unreal MCP config with Authorization: Bearer token."));
    return FReply::Handled();
}

FReply SGreyboxStudioDock::ImportGameProject()
{
    FString JsonPath;
    if (GameProjectJsonPathTextBox.IsValid())
    {
        JsonPath = GameProjectJsonPathTextBox->GetText().ToString();
        JsonPath.TrimStartAndEndInline();
    }
    if (JsonPath.IsEmpty())
    {
        SetStatus(TEXT("Enter the absolute path to a Greybox GameProject project.json before importing."));
        return FReply::Handled();
    }

    SetStatus(FString::Printf(TEXT("Importing Greybox GameProject from %s..."), *JsonPath));
    const FString AssetBaseDir = FPaths::GetPath(JsonPath);
    const FGreyboxProjectImportResult Result = FGreyboxProjectImporter::ImportFromJson(
        JsonPath,
        AssetBaseDir,
        FGreyboxProjectImporter::DefaultContentRoot());
    if (!Result.bSucceeded)
    {
        const FString Errors = Result.Errors.Num() > 0 ? FString::Join(Result.Errors, TEXT("; ")) : TEXT("unknown error");
        SetStatus(FString::Printf(TEXT("Greybox GameProject import failed: %s."), *Errors));
        return FReply::Handled();
    }

    SetStatus(FString::Printf(
        TEXT("Imported Greybox GameProject: %d primary objects (plan at %s). First level: %s"),
        Result.PrimaryObjectCount,
        *Result.ImportPlanPath,
        *Result.FirstLevelPackagePath));

    FString Summary;
    for (int32 Index = 0; Index < FMath::Min(Result.ImportedAssets.Num(), 12); ++Index)
    {
        const FGreyboxImportedAsset& Imported = Result.ImportedAssets[Index];
        Summary += FString::Printf(TEXT("[%s] %s (%s)\n"), *Imported.AssetKind, *Imported.PackagePath, *Imported.SourceId);
    }
    if (Result.ImportedAssets.Num() > 12)
    {
        Summary += FString::Printf(TEXT("...and %d more imported assets\n"), Result.ImportedAssets.Num() - 12);
    }
    if (Result.Warnings.Num() > 0)
    {
        Summary += FString::Printf(TEXT("\nWarnings: %d\n"), Result.Warnings.Num());
    }
    SetPreflightSummary(Summary);
    return FReply::Handled();
}

bool SGreyboxStudioDock::CanDownloadUnrealExport() const
{
    return bHasReadyPreflight && LastPreflight.IsReady();
}

FString SGreyboxStudioDock::CurrentDaemonUrl() const
{
    FString Value = DaemonUrlTextBox.IsValid() ? DaemonUrlTextBox->GetText().ToString() : TEXT("http://127.0.0.1:17345");
    Value.TrimStartAndEndInline();
    return Value.IsEmpty() ? TEXT("http://127.0.0.1:17345") : Value;
}

FString SGreyboxStudioDock::CurrentProjectId() const
{
    FString Value = ProjectIdTextBox.IsValid() ? ProjectIdTextBox->GetText().ToString() : TEXT("");
    Value.TrimStartAndEndInline();
    return Value;
}

void SGreyboxStudioDock::PersistSettings() const
{
    UGreyboxStudioSettings* Settings = GetMutableDefault<UGreyboxStudioSettings>();
    Settings->DaemonUrl = CurrentDaemonUrl();
    Settings->ProjectId = CurrentProjectId();
    Settings->SaveConfig();
}

void SGreyboxStudioDock::HandlePreflightComplete(
    const bool bSucceeded,
    const FGreyboxEnginePackagePreflight& Preflight,
    const FString& Error)
{
    bHasReadyPreflight = bSucceeded && Preflight.IsReady();
    LastPreflight = Preflight;
    if (!bHasReadyPreflight)
    {
        SetStatus(Error.IsEmpty() ? TEXT("Unreal engine-package preflight failed.") : Error);
        SetPreflightSummary(TEXT("Preflight did not return a ready Unreal package."));
        return;
    }

    SetStatus(TEXT("Unreal engine-package preflight is ready."));
    SetPreflightSummary(FString::Printf(
        TEXT("Source: %s\nPackage: %s\nFiles: %d (%s)\nRuntime hooks: %s\nTerrain colliders: %d\nDynamic events: %d\nFactions: %d"),
        *Preflight.SourceFileName,
        *Preflight.PackageFileName,
        Preflight.FileCount,
        *HumanBytes(Preflight.SizeBytes),
        *RuntimeHookSummary(Preflight.Manifest.RuntimeHooks),
        Preflight.Manifest.TerrainColliderCount,
        Preflight.Manifest.DynamicEventCount,
        Preflight.Manifest.FactionCount));
}

void SGreyboxStudioDock::HandleStageComplete(const FGreyboxEnginePackageStageResult& Result)
{
    SetStatus(Result.Message);
    if (Result.bSucceeded)
    {
        SetPreflightSummary(FString::Printf(
            TEXT("Extracted package: %s\nBytes written: %s\nFiles extracted: %d\nImport root: %s"),
            *Result.PackagePath,
            *HumanBytes(Result.BytesWritten),
            Result.ExtractedFileCount,
            *Result.ImportRoot));
    }
}

void SGreyboxStudioDock::SetStatus(const FString& Message)
{
    if (StatusText.IsValid())
    {
        StatusText->SetText(FText::FromString(Message));
    }
}

void SGreyboxStudioDock::SetPreflightSummary(const FString& Summary)
{
    if (PreflightText.IsValid())
    {
        PreflightText->SetText(FText::FromString(Summary));
    }
}
