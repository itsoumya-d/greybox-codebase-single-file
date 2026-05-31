// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "GreyboxEnginePackagePreflight.h"
#include "Widgets/SCompoundWidget.h"

class SEditableTextBox;
class STextBlock;

class SGreyboxStudioDock final : public SCompoundWidget
{
public:
    SLATE_BEGIN_ARGS(SGreyboxStudioDock) {}
    SLATE_END_ARGS()

    void Construct(const FArguments& InArgs);

private:
    FReply CheckUnrealExport();
    FReply DownloadUnrealExport();
    FReply CopyMcpConfig();
    FReply ImportGameProject();

    bool CanDownloadUnrealExport() const;
    FString CurrentDaemonUrl() const;
    FString CurrentProjectId() const;
    void PersistSettings() const;
    void HandlePreflightComplete(
        bool bSucceeded,
        const FGreyboxEnginePackagePreflight& Preflight,
        const FString& Error);
    void HandleStageComplete(const struct FGreyboxEnginePackageStageResult& Result);
    void SetStatus(const FString& Message);
    void SetPreflightSummary(const FString& Summary);

    TSharedPtr<SEditableTextBox> DaemonUrlTextBox;
    TSharedPtr<SEditableTextBox> ProjectIdTextBox;
    TSharedPtr<SEditableTextBox> GameProjectJsonPathTextBox;
    TSharedPtr<STextBlock> StatusText;
    TSharedPtr<STextBlock> PreflightText;
    FGreyboxEnginePackagePreflight LastPreflight;
    bool bHasReadyPreflight = false;
};
