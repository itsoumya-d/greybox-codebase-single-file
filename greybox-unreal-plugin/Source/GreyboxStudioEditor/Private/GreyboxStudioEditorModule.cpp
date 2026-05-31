// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Modules/ModuleManager.h"
#include "GreyboxMcpBridge.h"
#include "SGreyboxStudioDock.h"

#include "Framework/Docking/TabManager.h"
#include "ToolMenus.h"
#include "Widgets/Docking/SDockTab.h"

DEFINE_LOG_CATEGORY_STATIC(LogGreyboxStudioEditor, Log, All);

namespace
{
const FName GreyboxStudioTabName(TEXT("GreyboxStudio"));
}

class FGreyboxStudioEditorModule final : public IModuleInterface
{
public:
    virtual void StartupModule() override
    {
        FGlobalTabmanager::Get()->RegisterNomadTabSpawner(
            GreyboxStudioTabName,
            FOnSpawnTab::CreateRaw(this, &FGreyboxStudioEditorModule::SpawnGreyboxStudioTab))
            .SetDisplayName(FText::FromString(TEXT("Greybox Studio")))
            .SetTooltipText(FText::FromString(TEXT("Open Greybox Studio Unreal export, sync, and MCP controls.")));
        UToolMenus::RegisterStartupCallback(
            FSimpleMulticastDelegate::FDelegate::CreateRaw(this, &FGreyboxStudioEditorModule::RegisterMenus));
        UE_LOG(LogGreyboxStudioEditor, Log, TEXT("Greybox Studio Unreal editor module loaded."));
    }

    virtual void ShutdownModule() override
    {
        UToolMenus::UnRegisterStartupCallback(this);
        UToolMenus::UnregisterOwner(this);
        FGlobalTabmanager::Get()->UnregisterNomadTabSpawner(GreyboxStudioTabName);
        FGreyboxMcpBridge::Stop();
    }

private:
    TSharedRef<SDockTab> SpawnGreyboxStudioTab(const FSpawnTabArgs& SpawnTabArgs)
    {
        (void)SpawnTabArgs;
        return SNew(SDockTab)
            .TabRole(ETabRole::NomadTab)
            [
                SNew(SGreyboxStudioDock)
            ];
    }

    void RegisterMenus()
    {
        FToolMenuOwnerScoped OwnerScoped(this);
        UToolMenu* WindowMenu = UToolMenus::Get()->ExtendMenu(TEXT("LevelEditor.MainMenu.Window"));
        FToolMenuSection& Section = WindowMenu->FindOrAddSection(TEXT("WindowLayout"));
        Section.AddMenuEntry(
            TEXT("GreyboxStudio"),
            FText::FromString(TEXT("Greybox Studio")),
            FText::FromString(TEXT("Open Greybox Studio Unreal engine-package preflight and MCP controls.")),
            FSlateIcon(),
            FUIAction(FExecuteAction::CreateRaw(this, &FGreyboxStudioEditorModule::OpenGreyboxStudioTab)));
    }

    void OpenGreyboxStudioTab()
    {
        FGlobalTabmanager::Get()->TryInvokeTab(GreyboxStudioTabName);
    }
};

IMPLEMENT_MODULE(FGreyboxStudioEditorModule, GreyboxStudioEditor)
