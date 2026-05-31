// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxFlowImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HAL/FileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

namespace
{
FString JoinPath(const FString& Root, const FString& Tail)
{
    if (Root.IsEmpty())
    {
        return Tail;
    }
    if (Tail.IsEmpty())
    {
        return Root;
    }
    return Root.EndsWith(TEXT("/")) ? Root + Tail : Root + TEXT("/") + Tail;
}

FString DescriptorDiskPath()
{
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("GreyboxFlowDispatcher.greybox-flow.json"));
}
}

FString FGreyboxFlowImporter::FlowDispatcherPackagePath(const FString& ContentRoot)
{
    return JoinPath(ContentRoot, TEXT("Runtime/AGreyboxFlowDispatcher"));
}

FGreyboxImportedAsset FGreyboxFlowImporter::BuildFlowDispatcherDescriptor(
    const TArray<FGreyboxFlowEdgeSpec>& FlowEdges,
    const FString& ContentRoot,
    TArray<FString>& OutWarnings)
{
    FGreyboxImportedAsset Imported;
    Imported.PackagePath = FlowDispatcherPackagePath(ContentRoot);
    Imported.AssetKind = TEXT("FlowDispatcher");
    Imported.SourceId = TEXT("flow");

    TSharedRef<FJsonObject> Descriptor = MakeShared<FJsonObject>();
    Descriptor->SetStringField(TEXT("actorClass"), TEXT("AGreyboxFlowDispatcher"));
    Descriptor->SetStringField(TEXT("packagePath"), Imported.PackagePath);
    Descriptor->SetNumberField(TEXT("edgeCount"), FlowEdges.Num());

    TMap<FString, FString> ComponentToScreen;
    TMap<FString, FString> EventToScreen;
    TArray<TSharedPtr<FJsonValue>> EdgeEntries;
    EdgeEntries.Reserve(FlowEdges.Num());
    for (const FGreyboxFlowEdgeSpec& Edge : FlowEdges)
    {
        TSharedRef<FJsonObject> EdgeObject = MakeShared<FJsonObject>();
        EdgeObject->SetStringField(TEXT("edgeId"), Edge.Id);
        EdgeObject->SetStringField(TEXT("from"), Edge.FromScreenId);
        EdgeObject->SetStringField(TEXT("to"), Edge.ToScreenId);
        EdgeObject->SetStringField(TEXT("triggerType"), Edge.TriggerType);
        EdgeObject->SetStringField(TEXT("triggerComponentRef"), Edge.TriggerComponentRef);
        EdgeObject->SetStringField(TEXT("triggerEventId"), Edge.TriggerEventId);
        EdgeObject->SetNumberField(TEXT("triggerDurationSeconds"), Edge.TriggerDurationSeconds);
        EdgeEntries.Add(MakeShared<FJsonValueObject>(EdgeObject));

        if ((Edge.TriggerType == TEXT("tap") || Edge.TriggerType == TEXT("longPress"))
            && !Edge.TriggerComponentRef.IsEmpty())
        {
            const FString* Existing = ComponentToScreen.Find(Edge.TriggerComponentRef);
            if (Existing != nullptr && *Existing != Edge.ToScreenId)
            {
                OutWarnings.Add(FString::Printf(
                    TEXT("Flow dispatcher: component '%s' is bound to multiple destination screens (%s vs %s); last wins."),
                    *Edge.TriggerComponentRef,
                    **Existing,
                    *Edge.ToScreenId));
            }
            ComponentToScreen.Add(Edge.TriggerComponentRef, Edge.ToScreenId);
        }
        if (Edge.TriggerType == TEXT("scriptEvent") && !Edge.TriggerEventId.IsEmpty())
        {
            EventToScreen.Add(Edge.TriggerEventId, Edge.ToScreenId);
        }
    }
    Descriptor->SetArrayField(TEXT("edges"), EdgeEntries);

    TSharedRef<FJsonObject> ComponentMap = MakeShared<FJsonObject>();
    for (const TPair<FString, FString>& Pair : ComponentToScreen)
    {
        ComponentMap->SetStringField(Pair.Key, Pair.Value);
    }
    Descriptor->SetObjectField(TEXT("componentIdToScreenId"), ComponentMap);

    TSharedRef<FJsonObject> EventMap = MakeShared<FJsonObject>();
    for (const TPair<FString, FString>& Pair : EventToScreen)
    {
        EventMap->SetStringField(Pair.Key, Pair.Value);
    }
    Descriptor->SetObjectField(TEXT("eventIdToScreenId"), EventMap);

    const FString OnDiskDescriptor = DescriptorDiskPath();
    FString DescriptorBody;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&DescriptorBody);
    FJsonSerializer::Serialize(Descriptor, Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(OnDiskDescriptor), true);
    FFileHelper::SaveStringToFile(DescriptorBody, *OnDiskDescriptor);

    return Imported;
}
