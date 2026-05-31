// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
//
// MCP tool dispatch and handler implementations.
// Auth/token logic lives in GreyboxMcpBridge.cpp.

#include "GreyboxMcpBridge.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Engine/World.h"
#include "EngineUtils.h"
#include "GameFramework/Actor.h"
#include "HAL/FileManager.h"
#if WITH_AUTOMATION_TESTS
#include "Misc/AutomationTest.h"
#endif
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"
#include "UObject/UObjectHash.h"

#if WITH_EDITOR
#include "AssetImportTask.h"
#include "AssetToolsModule.h"
#include "AutomatedAssetImportData.h"
#include "Editor.h"
#include "Editor/EditorEngine.h"
#include "IAssetTools.h"
#include "UnrealEdMisc.h"
#endif

DEFINE_LOG_CATEGORY_STATIC(LogGreyboxMcpTools, Log, All);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
namespace
{
FGreyboxMcpToolResult ToolError(const FString& Message)
{
    FGreyboxMcpToolResult Result;
    Result.bSucceeded = false;
    Result.Error = Message;
    // Return a JSON object so callers never receive a bare string.
    TSharedRef<FJsonObject> Obj = MakeShared<FJsonObject>();
    Obj->SetBoolField(TEXT("ok"), false);
    Obj->SetStringField(TEXT("error"), Message);
    FString Body;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(Obj, Writer);
    Result.Content = Body;
    return Result;
}

FGreyboxMcpToolResult ToolOk(const TSharedRef<FJsonObject>& Payload)
{
    FGreyboxMcpToolResult Result;
    Result.bSucceeded = true;
    Payload->SetBoolField(TEXT("ok"), true);
    FString Body;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
    FJsonSerializer::Serialize(Payload, Writer);
    Result.Content = Body;
    return Result;
}

bool ParseParams(const FString& ParamsJson, TSharedPtr<FJsonObject>& OutParams)
{
    if (ParamsJson.IsEmpty())
    {
        OutParams = MakeShared<FJsonObject>();
        return true;
    }
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ParamsJson);
    return FJsonSerializer::Deserialize(Reader, OutParams) && OutParams.IsValid();
}

#if WITH_EDITOR
UWorld* GetEditorWorld()
{
    if (GEditor)
    {
        return GEditor->GetEditorWorldContext().World();
    }
    return nullptr;
}
#endif

FString ScalarValueString(const TSharedPtr<FJsonValue>& Val)
{
    if (!Val.IsValid()) return FString();
    switch (Val->Type)
    {
    case EJson::String: return Val->AsString();
    case EJson::Number:
    {
        double N = 0.0;
        Val->TryGetNumber(N);
        return FString::SanitizeFloat(N);
    }
    case EJson::Boolean: return Val->AsBool() ? TEXT("true") : TEXT("false");
    default: return FString();
    }
}
}

// ---------------------------------------------------------------------------
// FGreyboxMcpBridge::DispatchTool
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::DispatchTool(const FString& ToolName, const FString& ParamsJson)
{
    TSharedPtr<FJsonObject> Params;
    if (!ParseParams(ParamsJson, Params) || !Params.IsValid())
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP: could not parse params JSON for tool '%s'."), *ToolName));
    }

    if (ToolName == TEXT("unreal.getWorldActors"))   return HandleGetWorldActors(Params);
    if (ToolName == TEXT("unreal.createActor"))      return HandleCreateActor(Params);
    if (ToolName == TEXT("unreal.addComponent"))     return HandleAddComponent(Params);
    if (ToolName == TEXT("unreal.setProperty"))      return HandleSetProperty(Params);
    if (ToolName == TEXT("unreal.assignAsset"))      return HandleAssignAsset(Params);
    if (ToolName == TEXT("unreal.runAutomationTest")) return HandleRunAutomationTest(Params);
    if (ToolName == TEXT("unreal.captureViewportScreenshot")) return HandleCaptureViewportScreenshot(Params);
    if (ToolName == TEXT("unreal.buildCookedContent")) return HandleBuildCookedContent(Params);
    if (ToolName == TEXT("unreal.importGlbAsset"))    return HandleImportGlbAsset(Params);

    // Spec-required legacy aliases — each forwards to the canonical handler above.
    if (ToolName == TEXT("unreal.getSceneHierarchy"))          return HandleGetWorldActors(Params);
    if (ToolName == TEXT("unreal.createGameObject"))           return HandleCreateActor(Params);
    if (ToolName == TEXT("unreal.setField"))                   return HandleSetProperty(Params);
    if (ToolName == TEXT("unreal.runEditModeTest"))            return HandleRunAutomationTest(Params);
    if (ToolName == TEXT("unreal.captureGameViewScreenshot"))  return HandleCaptureViewportScreenshot(Params);
    if (ToolName == TEXT("unreal.buildAddressables"))          return HandleBuildCookedContent(Params);
    if (ToolName == TEXT("unreal.importAsset"))                return HandleImportGlbAsset(Params);

    return ToolError(FString::Printf(
        TEXT("Greybox MCP: unknown tool name '%s'."), *ToolName));
}

// ---------------------------------------------------------------------------
// unreal.getWorldActors
// Serialises the current editor world's actor hierarchy to JSON.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleGetWorldActors(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

#if WITH_EDITOR
    UWorld* World = GetEditorWorld();
    if (!World)
    {
        return ToolError(TEXT("Greybox MCP getWorldActors: no editor world is loaded."));
    }

    FString TypeFilter;
    if (Params.IsValid()) Params->TryGetStringField(TEXT("typeFilter"), TypeFilter);

    TArray<TSharedPtr<FJsonValue>> ActorArray;
    for (TActorIterator<AActor> It(World); It; ++It)
    {
        const AActor* Actor = *It;
        if (!IsValid(Actor)) continue;

        const FString ClassName = Actor->GetClass()->GetName();
        if (!TypeFilter.IsEmpty() && !ClassName.Contains(TypeFilter, ESearchCase::IgnoreCase))
        {
            continue;
        }

        TSharedRef<FJsonObject> ActorObj = MakeShared<FJsonObject>();
        ActorObj->SetStringField(TEXT("name"), Actor->GetActorLabel());
        ActorObj->SetStringField(TEXT("class"), ClassName);
        ActorObj->SetStringField(TEXT("path"), Actor->GetPathName());

        const FVector Loc = Actor->GetActorLocation();
        TSharedRef<FJsonObject> LocObj = MakeShared<FJsonObject>();
        LocObj->SetNumberField(TEXT("x"), Loc.X);
        LocObj->SetNumberField(TEXT("y"), Loc.Y);
        LocObj->SetNumberField(TEXT("z"), Loc.Z);
        ActorObj->SetObjectField(TEXT("locationCm"), LocObj);

        const FRotator Rot = Actor->GetActorRotation();
        TSharedRef<FJsonObject> RotObj = MakeShared<FJsonObject>();
        RotObj->SetNumberField(TEXT("pitch"), Rot.Pitch);
        RotObj->SetNumberField(TEXT("yaw"), Rot.Yaw);
        RotObj->SetNumberField(TEXT("roll"), Rot.Roll);
        ActorObj->SetObjectField(TEXT("rotation"), RotObj);

        TArray<TSharedPtr<FJsonValue>> TagArray;
        for (const FName& Tag : Actor->Tags)
        {
            TagArray.Add(MakeShared<FJsonValueString>(Tag.ToString()));
        }
        ActorObj->SetArrayField(TEXT("tags"), TagArray);

        ActorArray.Add(MakeShared<FJsonValueObject>(ActorObj));
    }

    Response->SetArrayField(TEXT("actors"), ActorArray);
    Response->SetNumberField(TEXT("actorCount"), static_cast<double>(ActorArray.Num()));
    Response->SetStringField(TEXT("worldName"), World->GetName());
    UE_LOG(LogGreyboxMcpTools, Log, TEXT("Greybox MCP getWorldActors: returned %d actors."), ActorArray.Num());
#else
    Response->SetStringField(TEXT("note"), TEXT("getWorldActors is only available in Editor builds."));
    Response->SetNumberField(TEXT("actorCount"), 0.0);
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.createActor
// Spawns an AActor in the editor world at the given transform.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleCreateActor(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

#if WITH_EDITOR
    UWorld* World = GetEditorWorld();
    if (!World)
    {
        return ToolError(TEXT("Greybox MCP createActor: no editor world is loaded."));
    }

    FString ActorName, ActorType;
    Params->TryGetStringField(TEXT("name"), ActorName);
    Params->TryGetStringField(TEXT("type"), ActorType);

    double X = 0, Y = 0, Z = 0;
    const TSharedPtr<FJsonObject>* PosObj = nullptr;
    if (Params->TryGetObjectField(TEXT("position"), PosObj) && PosObj != nullptr && PosObj->IsValid())
    {
        (*PosObj)->TryGetNumberField(TEXT("x"), X);
        (*PosObj)->TryGetNumberField(TEXT("y"), Y);
        (*PosObj)->TryGetNumberField(TEXT("z"), Z);
    }

    const FVector Location(static_cast<float>(X), static_cast<float>(Y), static_cast<float>(Z));
    FActorSpawnParameters SpawnParams;
    SpawnParams.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

    AActor* NewActor = World->SpawnActor<AActor>(AActor::StaticClass(), FTransform(Location), SpawnParams);
    if (!NewActor)
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP createActor: failed to spawn actor '%s' (check for FName collision or class restrictions)."), *ActorName));
    }

    if (!ActorName.IsEmpty())
    {
        NewActor->SetActorLabel(ActorName);
    }
    if (!ActorType.IsEmpty())
    {
        NewActor->Tags.AddUnique(*FString::Printf(TEXT("Greybox.%s"), *ActorType));
    }
    NewActor->Tags.AddUnique(TEXT("Greybox"));

    Response->SetStringField(TEXT("actorPath"), NewActor->GetPathName());
    Response->SetStringField(TEXT("actorLabel"), NewActor->GetActorLabel());
    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP createActor: spawned '%s' at (%.1f, %.1f, %.1f)."),
        *NewActor->GetActorLabel(), Location.X, Location.Y, Location.Z);
#else
    return ToolError(TEXT("Greybox MCP createActor is only available in Editor builds."));
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.addComponent
// Adds a named component class to an existing actor by actor path.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleAddComponent(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

#if WITH_EDITOR
    UWorld* World = GetEditorWorld();
    if (!World)
    {
        return ToolError(TEXT("Greybox MCP addComponent: no editor world is loaded."));
    }

    FString ActorPath, ComponentClassName;
    Params->TryGetStringField(TEXT("actorPath"), ActorPath);
    Params->TryGetStringField(TEXT("componentClass"), ComponentClassName);

    if (ActorPath.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP addComponent: 'actorPath' is required."));
    }
    if (ComponentClassName.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP addComponent: 'componentClass' is required."));
    }

    // Resolve actor
    AActor* TargetActor = nullptr;
    for (TActorIterator<AActor> It(World); It; ++It)
    {
        if (It->GetPathName() == ActorPath)
        {
            TargetActor = *It;
            break;
        }
    }
    if (!IsValid(TargetActor))
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP addComponent: actor not found at path '%s'."), *ActorPath));
    }

    // Resolve component class
    UClass* ComponentClass = FindFirstObject<UClass>(*ComponentClassName, EFindFirstObjectOptions::NativeFirst);
    if (!ComponentClass || !ComponentClass->IsChildOf(UActorComponent::StaticClass()))
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP addComponent: component class '%s' not found or not a UActorComponent."),
            *ComponentClassName));
    }

    TargetActor->Modify();
    UActorComponent* NewComponent = NewObject<UActorComponent>(TargetActor, ComponentClass, NAME_None, RF_Transactional);
    if (!NewComponent)
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP addComponent: failed to create component '%s'."), *ComponentClassName));
    }
    TargetActor->AddInstanceComponent(NewComponent);
    NewComponent->OnComponentCreated();
    NewComponent->RegisterComponent();
    TargetActor->RerunConstructionScripts();
    TargetActor->MarkPackageDirty();

    Response->SetStringField(TEXT("componentPath"), NewComponent->GetPathName());
    Response->SetStringField(TEXT("componentClass"), ComponentClassName);
    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP addComponent: added '%s' to '%s'."),
        *ComponentClassName, *TargetActor->GetActorLabel());
#else
    return ToolError(TEXT("Greybox MCP addComponent is only available in Editor builds."));
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.setProperty
// Sets location, rotation, scale or a named property on an actor.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleSetProperty(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

#if WITH_EDITOR
    UWorld* World = GetEditorWorld();
    if (!World)
    {
        return ToolError(TEXT("Greybox MCP setProperty: no editor world is loaded."));
    }

    FString ActorPath, PropertyName;
    Params->TryGetStringField(TEXT("actorPath"), ActorPath);
    Params->TryGetStringField(TEXT("property"), PropertyName);

    if (ActorPath.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP setProperty: 'actorPath' is required."));
    }
    if (PropertyName.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP setProperty: 'property' is required."));
    }

    AActor* TargetActor = nullptr;
    for (TActorIterator<AActor> It(World); It; ++It)
    {
        if (It->GetPathName() == ActorPath) { TargetActor = *It; break; }
    }
    if (!IsValid(TargetActor))
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP setProperty: actor not found at path '%s'."), *ActorPath));
    }

    // Handle built-in transform properties
    const TSharedPtr<FJsonObject>* VecObj = nullptr;
    auto ReadVec3 = [&](const TCHAR* Key, FVector& OutVec) -> bool
    {
        const TSharedPtr<FJsonObject>* ObjPtr = nullptr;
        if (!Params->TryGetObjectField(Key, ObjPtr) || ObjPtr == nullptr || !ObjPtr->IsValid())
            return false;
        double X = 0, Y = 0, Z = 0;
        (*ObjPtr)->TryGetNumberField(TEXT("x"), X);
        (*ObjPtr)->TryGetNumberField(TEXT("y"), Y);
        (*ObjPtr)->TryGetNumberField(TEXT("z"), Z);
        OutVec = FVector(static_cast<float>(X), static_cast<float>(Y), static_cast<float>(Z));
        return true;
    };

    bool bHandled = false;
    TargetActor->Modify();
    if (PropertyName == TEXT("location") || PropertyName == TEXT("position"))
    {
        FVector Vec;
        if (ReadVec3(TEXT("value"), Vec))
        {
            TargetActor->SetActorLocation(Vec, false, nullptr, ETeleportType::TeleportPhysics);
            bHandled = true;
        }
    }
    else if (PropertyName == TEXT("rotation"))
    {
        FVector Vec;
        if (ReadVec3(TEXT("value"), Vec))
        {
            TargetActor->SetActorRotation(FRotator(Vec.Z, -Vec.Y, Vec.X), ETeleportType::TeleportPhysics);
            bHandled = true;
        }
    }
    else if (PropertyName == TEXT("scale"))
    {
        FVector Vec;
        if (ReadVec3(TEXT("value"), Vec))
        {
            TargetActor->SetActorScale3D(Vec);
            bHandled = true;
        }
    }
    else
    {
        // Generic property via UE reflection — restricted to safe scalar types only.
        const TSharedPtr<FJsonValue>* ValuePtr = Params->Values.Find(TEXT("value"));
        if (ValuePtr != nullptr && ValuePtr->IsValid())
        {
            FProperty* Prop = TargetActor->GetClass()->FindPropertyByName(*PropertyName);
            if (Prop)
            {
                const bool bSafeType = Prop->IsA<FNumericProperty>()
                    || Prop->IsA<FBoolProperty>()
                    || Prop->IsA<FStrProperty>()
                    || Prop->IsA<FNameProperty>();
                if (!bSafeType)
                {
                    return ToolError(FString::Printf(
                        TEXT("Greybox MCP setProperty: property '%s' type is not settable via MCP."), *PropertyName));
                }
                TargetActor->Modify();
                void* Container = Prop->ContainerPtrToValuePtr<void>(TargetActor);
                FString ValueStr = ScalarValueString(*ValuePtr);
                Prop->ImportText_Direct(*ValueStr, Container, TargetActor, PPF_None);
                TargetActor->MarkPackageDirty();
                bHandled = true;
            }
        }
    }

    if (!bHandled)
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP setProperty: could not apply property '%s' on '%s'."),
            *PropertyName, *TargetActor->GetActorLabel()));
    }

    Response->SetStringField(TEXT("actorPath"), ActorPath);
    Response->SetStringField(TEXT("property"), PropertyName);
    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP setProperty: set '%s' on '%s'."),
        *PropertyName, *TargetActor->GetActorLabel());
#else
    return ToolError(TEXT("Greybox MCP setProperty is only available in Editor builds."));
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.assignAsset
// Loads a UObject asset by path and assigns it to a component property.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleAssignAsset(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

#if WITH_EDITOR
    UWorld* World = GetEditorWorld();
    if (!World)
    {
        return ToolError(TEXT("Greybox MCP assignAsset: no editor world is loaded."));
    }

    FString ActorPath, ComponentName, PropertyName, AssetPath;
    Params->TryGetStringField(TEXT("actorPath"), ActorPath);
    Params->TryGetStringField(TEXT("componentName"), ComponentName);
    Params->TryGetStringField(TEXT("property"), PropertyName);
    Params->TryGetStringField(TEXT("assetPath"), AssetPath);

    if (ActorPath.IsEmpty() || AssetPath.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP assignAsset: 'actorPath' and 'assetPath' are required."));
    }

    AActor* TargetActor = nullptr;
    for (TActorIterator<AActor> It(World); It; ++It)
    {
        if (It->GetPathName() == ActorPath) { TargetActor = *It; break; }
    }
    if (!IsValid(TargetActor))
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP assignAsset: actor not found at path '%s'."), *ActorPath));
    }

    UObject* Asset = StaticLoadObject(UObject::StaticClass(), nullptr, *AssetPath);
    if (!Asset)
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP assignAsset: asset not found at path '%s'."), *AssetPath));
    }

    // Find target component (or use root)
    UActorComponent* TargetComp = nullptr;
    if (!ComponentName.IsEmpty())
    {
        for (UActorComponent* Comp : TargetActor->GetComponents())
        {
            if (IsValid(Comp) && Comp->GetName() == ComponentName)
            {
                TargetComp = Comp;
                break;
            }
        }
    }

    UObject* PropertyOwner = TargetComp ? static_cast<UObject*>(TargetComp) : static_cast<UObject*>(TargetActor);
    const FString ResolvedProperty = PropertyName.IsEmpty() ? TEXT("StaticMesh") : PropertyName;

    FProperty* Prop = PropertyOwner->GetClass()->FindPropertyByName(*ResolvedProperty);
    if (Prop)
    {
        FObjectProperty* ObjProp = CastField<FObjectProperty>(Prop);
        if (ObjProp && Asset->IsA(ObjProp->PropertyClass))
        {
            void* Container = Prop->ContainerPtrToValuePtr<void>(PropertyOwner);
            PropertyOwner->Modify();
            ObjProp->SetObjectPropertyValue(Container, Asset);
            PropertyOwner->MarkPackageDirty();
            Response->SetStringField(TEXT("assignedAsset"), AssetPath);
            Response->SetStringField(TEXT("property"), ResolvedProperty);
        }
        else
        {
            return ToolError(FString::Printf(
                TEXT("Greybox MCP assignAsset: asset type mismatch for property '%s'."),
                *ResolvedProperty));
        }
    }
    else
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP assignAsset: property '%s' not found on '%s'."),
            *ResolvedProperty, *PropertyOwner->GetName()));
    }

    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP assignAsset: assigned '%s' → '%s'.%s."),
        *AssetPath, *TargetActor->GetActorLabel(), *ResolvedProperty);
#else
    return ToolError(TEXT("Greybox MCP assignAsset is only available in Editor builds."));
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.runAutomationTest
// Runs a named automation test and returns pass/fail + summary.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleRunAutomationTest(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

    FString TestName;
    if (Params.IsValid()) Params->TryGetStringField(TEXT("testName"), TestName);
    if (TestName.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP runAutomationTest: 'testName' is required."));
    }
    // NOTE (UE limitation): The UE public automation API (FAutomationTestFramework) only
    // supports running the full smoke suite synchronously. There is no public single-test-
    // by-name synchronous path at this abstraction level. testName is accepted and echoed
    // in the response for caller convenience, but it does not filter which tests execute.
    // For per-test isolation use the Session Frontend or -ExecCmds="Automation RunTests <Name>".

#if WITH_EDITOR && WITH_AUTOMATION_TESTS
    // Run all smoke tests registered in the framework. FAutomationTestFramework does not
    // expose a single-test-by-name synchronous API at this abstraction level; for
    // per-test isolation the caller should use the Session Frontend / Test Runner subsystem.
    // We record whether the smoke suite passes so CI can gate on it.
    const bool bPassed = FAutomationTestFramework::Get().RunSmokeTests();

    Response->SetStringField(TEXT("testName"), TestName);
    Response->SetBoolField(TEXT("smokeSuitePassed"), bPassed);
    Response->SetStringField(TEXT("note"),
        TEXT("Smoke-test suite ran; for per-test isolation use Session Frontend or -ExecCmds=\"Automation RunTests <Name>\"."));
    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP runAutomationTest '%s': smoke suite %s."),
        *TestName, bPassed ? TEXT("PASSED") : TEXT("FAILED"));
#else
    Response->SetStringField(TEXT("testName"), TestName);
    Response->SetBoolField(TEXT("smokeSuitePassed"), false);
    Response->SetStringField(TEXT("note"), TEXT("Automation tests require an Editor build with WITH_AUTOMATION_TESTS enabled."));
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.captureViewportScreenshot
// Requests a viewport screenshot and returns the file path.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleCaptureViewportScreenshot(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

    FString OutputPath;
    if (Params.IsValid()) Params->TryGetStringField(TEXT("outputPath"), OutputPath);
    if (OutputPath.IsEmpty())
    {
        OutputPath = FPaths::Combine(
            FPaths::ProjectSavedDir(),
            TEXT("Greybox"),
            TEXT("Screenshots"),
            FString::Printf(TEXT("greybox-mcp-%lld.png"),
                static_cast<int64>(FPlatformTime::Seconds())));
    }
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(OutputPath), true);

#if WITH_EDITOR
    // Request a screenshot via the UE console command, which works in both
    // PIE and standalone editor contexts. The file is written on the next engine tick.
    if (GEngine)
    {
        GEngine->Exec(
            GetEditorWorld(),
            *FString::Printf(TEXT("SHOT FILENAME=\"%s\""), *OutputPath));
    }
    Response->SetStringField(TEXT("outputPath"), OutputPath);
    Response->SetStringField(TEXT("note"), TEXT("Screenshot request queued via SHOT command; file is written on the next engine tick."));
    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP captureViewportScreenshot: queued screenshot to '%s'."), *OutputPath);
#else
    return ToolError(TEXT("Greybox MCP captureViewportScreenshot is only available in Editor builds."));
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.buildCookedContent
// Triggers a map-check / cook request for the current project.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleBuildCookedContent(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

#if WITH_EDITOR
    // Run map check (equivalent to GEditor->RunMapCheck).
    // A full cook requires launching a dedicated UAT process; we record the
    // command-line for the caller to execute.
    FString ProjectPath = FPaths::GetProjectFilePath();
    FString Platform = TEXT("WindowsNoEditor");
    if (Params.IsValid()) Params->TryGetStringField(TEXT("platform"), Platform);

    // Map check via editor utilities
    if (GEditor)
    {
        GEditor->Exec(GEditor->GetEditorWorldContext().World(), TEXT("MAP CHECK"), *GLog);
    }

    const FString CookCommandLine = FString::Printf(
        TEXT("RunUAT BuildCookRun -project=\"%s\" -noP4 -platform=%s -clientconfig=Development -cook -build -stage -pak -archive"),
        *ProjectPath,
        *Platform);

    Response->SetStringField(TEXT("mapCheckStatus"), TEXT("executed"));
    Response->SetStringField(TEXT("cookCommandLine"), CookCommandLine);
    Response->SetStringField(TEXT("note"), TEXT("Map check ran synchronously. Full cook: execute cookCommandLine via UAT."));
    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP buildCookedContent: map check complete. Cook command prepared for platform '%s'."), *Platform);
#else
    return ToolError(TEXT("Greybox MCP buildCookedContent is only available in Editor builds."));
#endif

    return ToolOk(Response);
}

// ---------------------------------------------------------------------------
// unreal.importGlbAsset  (alias: unreal.importAsset)
// Imports a .glb file from disk into the Unreal asset registry as a UASSET.
// ---------------------------------------------------------------------------
FGreyboxMcpToolResult FGreyboxMcpBridge::HandleImportGlbAsset(const TSharedPtr<FJsonObject>& Params)
{
    TSharedRef<FJsonObject> Response = MakeShared<FJsonObject>();

#if WITH_EDITOR
    if (!Params.IsValid())
    {
        return ToolError(TEXT("Greybox MCP importGlbAsset: params object is required."));
    }

    FString GlbPath;
    if (!Params->TryGetStringField(TEXT("glbPath"), GlbPath) || GlbPath.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP importGlbAsset: 'glbPath' param is required."));
    }

    FString DestinationPath;
    if (!Params->TryGetStringField(TEXT("destinationPath"), DestinationPath) || DestinationPath.IsEmpty())
    {
        return ToolError(TEXT("Greybox MCP importGlbAsset: 'destinationPath' param is required."));
    }

    if (!IFileManager::Get().FileExists(*GlbPath))
    {
        return ToolError(FString::Printf(
            TEXT("Greybox MCP importGlbAsset: glbPath '%s' does not exist on disk."), *GlbPath));
    }

    // Derive asset name from the filename stem if not provided
    FString AssetName;
    if (!Params->TryGetStringField(TEXT("assetName"), AssetName) || AssetName.IsEmpty())
    {
        AssetName = FPaths::GetBaseFilename(GlbPath);
    }

    bool bReplaceExisting = true;
    Params->TryGetBoolField(TEXT("bReplaceExisting"), bReplaceExisting);

    // Build and run the import task
    UAssetImportTask* ImportTask = NewObject<UAssetImportTask>();
    ImportTask->Filename = GlbPath;
    ImportTask->DestinationPath = DestinationPath;
    ImportTask->DestinationName = AssetName;
    ImportTask->bReplaceExisting = bReplaceExisting;
    ImportTask->bAutomated = true;   // headless — suppress all dialogs
    ImportTask->bSave = true;        // persist the UASSET immediately

    // Configure skeletal mesh import settings so .glb → UASSET conversion
    // produces Skeleton, SkeletalMesh, PhysicsAsset, and AnimSequences.
    // Without this, ImportAssetTasks silently skips animation/skeleton data.
    UAutomatedAssetImportData* ImportData = NewObject<UAutomatedAssetImportData>();
    if (ImportData)
    {
        ImportData->bImportMesh = true;
        ImportData->bImportSkeletalMeshes = true;
        ImportData->bImportMorphTargets = false;
        ImportData->bImportAnimations = true;
        ImportData->bCreatePhysicsAsset = true;
        ImportData->PhysicsAsset = nullptr;  // auto-generate from mesh bounds
        ImportTask->Options = ImportData;
    }

    TArray<UAssetImportTask*> Tasks;
    Tasks.Add(ImportTask);

    FAssetToolsModule& AssetToolsModule =
        FModuleManager::LoadModuleChecked<FAssetToolsModule>(TEXT("AssetTools"));
    AssetToolsModule.Get().ImportAssetTasks(Tasks);

    // Collect imported object paths
    TArray<TSharedPtr<FJsonValue>> ImportedPaths;
    for (const FString& Path : ImportTask->ImportedObjectPaths)
    {
        ImportedPaths.Add(MakeShared<FJsonValueString>(Path));
    }

    const bool bImportedAny = ImportedPaths.Num() > 0;
    const FString PrimaryPath = bImportedAny
        ? ImportTask->ImportedObjectPaths[0]
        : FString::Printf(TEXT("%s/%s"), *DestinationPath, *AssetName);

    Response->SetStringField(TEXT("glbPath"), GlbPath);
    Response->SetStringField(TEXT("destinationPath"), DestinationPath);
    Response->SetStringField(TEXT("assetName"), AssetName);
    Response->SetStringField(TEXT("importedPackagePath"), PrimaryPath);
    Response->SetArrayField(TEXT("importedObjects"), ImportedPaths);
    Response->SetBoolField(TEXT("importedAny"), bImportedAny);

    if (!bImportedAny)
    {
        Response->SetStringField(TEXT("warning"),
            TEXT("ImportAssetTasks completed but returned no imported object paths. "
                 "Check that the GLTFImporter or InterchangeFramework plugin is enabled for this UE version."));
    }

    UE_LOG(LogGreyboxMcpTools, Log,
        TEXT("Greybox MCP importGlbAsset: imported '%s' -> '%s' (%d objects)."),
        *GlbPath, *PrimaryPath, ImportedPaths.Num());
#else
    return ToolError(TEXT("Greybox MCP importGlbAsset is only available in Editor builds."));
#endif

    return ToolOk(Response);
}
