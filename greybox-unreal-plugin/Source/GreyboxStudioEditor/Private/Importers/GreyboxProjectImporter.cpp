// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxProjectImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "HAL/FileManager.h"
#include "Importers/GreyboxAssetImporter.h"
#include "Importers/GreyboxCharacterImporter.h"
#include "Importers/GreyboxComponentImporter.h"
#include "Importers/GreyboxFlowImporter.h"
#include "Importers/GreyboxScreenImporter.h"
#include "Math/UnrealMathUtility.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

DEFINE_LOG_CATEGORY_STATIC(LogGreyboxProjectImporter, Log, All);

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

bool TryReadNumber(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName, float& OutValue)
{
    double Temp = 0.0;
    if (Object.IsValid() && Object->TryGetNumberField(FieldName, Temp))
    {
        OutValue = static_cast<float>(Temp);
        return true;
    }
    return false;
}

bool TryReadVector(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName, FVector& OutValue)
{
    const TSharedPtr<FJsonObject>* Child = nullptr;
    if (!Object.IsValid() || !Object->TryGetObjectField(FieldName, Child) || Child == nullptr || !Child->IsValid())
    {
        return false;
    }
    float X = 0.0f;
    float Y = 0.0f;
    float Z = 0.0f;
    TryReadNumber(*Child, TEXT("x"), X);
    TryReadNumber(*Child, TEXT("y"), Y);
    TryReadNumber(*Child, TEXT("z"), Z);
    OutValue = FVector(X, Y, Z);
    return true;
}

bool TryReadRotator(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName, FRotator& OutValue)
{
    FVector AsVector;
    if (!TryReadVector(Object, FieldName, AsVector))
    {
        return false;
    }
    // Canonical: rotation expressed as Euler XYZ degrees.
    OutValue = FRotator(AsVector.Y, AsVector.Z, AsVector.X);
    return true;
}

const TArray<TSharedPtr<FJsonValue>>* TryGetArray(const TSharedPtr<FJsonObject>& Object, const TCHAR* FieldName)
{
    const TArray<TSharedPtr<FJsonValue>>* Items = nullptr;
    if (Object.IsValid() && Object->TryGetArrayField(FieldName, Items))
    {
        return Items;
    }
    return nullptr;
}

void StoreScalarsFromJson(const TSharedPtr<FJsonObject>& Object, FGreyboxComponentSpec& OutSpec)
{
    if (!Object.IsValid())
    {
        return;
    }
    for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : Object->Values)
    {
        if (!Pair.Value.IsValid())
        {
            continue;
        }
        if (Pair.Key == TEXT("id")
            || Pair.Key == TEXT("kind")
            || Pair.Key == TEXT("name")
            || Pair.Key == TEXT("transform")
            || Pair.Key == TEXT("parent")
            || Pair.Key == TEXT("visible")
            || Pair.Key == TEXT("properties"))
        {
            continue;
        }

        switch (Pair.Value->Type)
        {
        case EJson::String:
        {
            FString StringValue;
            Pair.Value->TryGetString(StringValue);
            OutSpec.StringProperties.Add(Pair.Key, StringValue);
            break;
        }
        case EJson::Number:
        {
            double NumberValue = 0.0;
            Pair.Value->TryGetNumber(NumberValue);
            OutSpec.NumberProperties.Add(Pair.Key, static_cast<float>(NumberValue));
            break;
        }
        case EJson::Boolean:
        {
            bool BoolValue = false;
            Pair.Value->TryGetBool(BoolValue);
            OutSpec.BoolProperties.Add(Pair.Key, BoolValue);
            break;
        }
        default:
            break;
        }
    }
}
}

FString FGreyboxProjectImporter::DefaultContentRoot()
{
    return TEXT("/Game/Greybox");
}

FString FGreyboxProjectImporter::DefaultImportPlanPath()
{
    return FPaths::Combine(
        FPaths::ProjectSavedDir(),
        TEXT("Greybox"),
        TEXT("ImportPlans"),
        TEXT("greybox-project.greybox-plan.json"));
}

FTransform FGreyboxProjectImporter::ConvertTransformToUnreal(const FGreyboxCanonicalTransform& In)
{
    // Canonical (web/Babylon): right-handed, Y-up, metres. Unreal: left-handed, Z-up, centimetres.
    // Mapping: (X_c, Y_c, Z_c) metres -> (X_u, Y_u, Z_u) centimetres where
    //   X_u = X_c * 100
    //   Y_u = Z_c * 100  (swap and keep, Unreal Y is canonical Z)
    //   Z_u = Y_c * 100  (canonical Y up becomes Unreal Z up)
    const FVector UnrealLocation(
        In.Position.X * 100.0f,
        In.Position.Z * 100.0f,
        In.Position.Y * 100.0f);

    // Rotation: rotate axes the same way; negate yaw to flip handedness.
    const FRotator UnrealRotation(
        In.Rotation.Pitch,
        -In.Rotation.Yaw,
        In.Rotation.Roll);

    // Scale: swap Y/Z to follow the handedness, keep magnitudes.
    const FVector UnrealScale(In.Scale.X, In.Scale.Z, In.Scale.Y);

    return FTransform(UnrealRotation, UnrealLocation, UnrealScale);
}

bool FGreyboxProjectImporter::ParseTransform(const TSharedPtr<FJsonObject>& Source, FGreyboxCanonicalTransform& OutTransform)
{
    if (!Source.IsValid())
    {
        return false;
    }
    TryReadVector(Source, TEXT("position"), OutTransform.Position);
    TryReadRotator(Source, TEXT("rotation"), OutTransform.Rotation);
    FVector ScaleVector(1.0f, 1.0f, 1.0f);
    TryReadVector(Source, TEXT("scale"), ScaleVector);
    OutTransform.Scale = ScaleVector;
    return true;
}

void FGreyboxProjectImporter::ParseComponent(const TSharedPtr<FJsonObject>& Source, FGreyboxComponentSpec& OutSpec)
{
    if (!Source.IsValid())
    {
        return;
    }
    Source->TryGetStringField(TEXT("id"), OutSpec.Id);
    Source->TryGetStringField(TEXT("kind"), OutSpec.Kind);
    Source->TryGetStringField(TEXT("name"), OutSpec.Name);
    Source->TryGetStringField(TEXT("parent"), OutSpec.Parent);
    Source->TryGetBoolField(TEXT("visible"), OutSpec.bVisible);

    const TSharedPtr<FJsonObject>* TransformObject = nullptr;
    if (Source->TryGetObjectField(TEXT("transform"), TransformObject) && TransformObject != nullptr && TransformObject->IsValid())
    {
        ParseTransform(*TransformObject, OutSpec.Transform);
    }

    StoreScalarsFromJson(Source, OutSpec);
}

void FGreyboxProjectImporter::ParseScreen(const TSharedPtr<FJsonObject>& Source, FGreyboxScreenSpec& OutSpec)
{
    if (!Source.IsValid())
    {
        return;
    }
    Source->TryGetStringField(TEXT("id"), OutSpec.Id);
    Source->TryGetStringField(TEXT("name"), OutSpec.Name);
    Source->TryGetStringField(TEXT("kind"), OutSpec.Kind);

    const TSharedPtr<FJsonObject>* BackgroundObject = nullptr;
    if (Source->TryGetObjectField(TEXT("background"), BackgroundObject) && BackgroundObject != nullptr && BackgroundObject->IsValid())
    {
        FString BackgroundType;
        (*BackgroundObject)->TryGetStringField(TEXT("type"), BackgroundType);
        if (BackgroundType == TEXT("color"))
        {
            (*BackgroundObject)->TryGetStringField(TEXT("color"), OutSpec.BackgroundColorHex);
        }
        else if (BackgroundType == TEXT("asset"))
        {
            (*BackgroundObject)->TryGetStringField(TEXT("assetRef"), OutSpec.BackgroundAssetRef);
        }
    }

    if (const TArray<TSharedPtr<FJsonValue>>* Components = TryGetArray(Source, TEXT("components")))
    {
        OutSpec.Components.Reserve(Components->Num());
        for (const TSharedPtr<FJsonValue>& Value : *Components)
        {
            const TSharedPtr<FJsonObject> ComponentObject = Value.IsValid() ? Value->AsObject() : nullptr;
            if (!ComponentObject.IsValid())
            {
                continue;
            }
            FGreyboxComponentSpec ComponentSpec;
            ParseComponent(ComponentObject, ComponentSpec);
            OutSpec.Components.Add(MoveTemp(ComponentSpec));
        }
    }
}

void FGreyboxProjectImporter::ParseCharacter(const TSharedPtr<FJsonObject>& Source, FGreyboxCharacterSpec& OutSpec)
{
    if (!Source.IsValid())
    {
        return;
    }
    Source->TryGetStringField(TEXT("id"), OutSpec.Id);
    Source->TryGetStringField(TEXT("name"), OutSpec.Name);
    Source->TryGetStringField(TEXT("meshRef"), OutSpec.MeshAssetRef);

    const TSharedPtr<FJsonObject>* RigObject = nullptr;
    if (Source->TryGetObjectField(TEXT("rig"), RigObject) && RigObject != nullptr && RigObject->IsValid())
    {
        if (const TArray<TSharedPtr<FJsonValue>>* Joints = TryGetArray(*RigObject, TEXT("joints")))
        {
            for (const TSharedPtr<FJsonValue>& Value : *Joints)
            {
                const TSharedPtr<FJsonObject> JointObject = Value.IsValid() ? Value->AsObject() : nullptr;
                if (!JointObject.IsValid())
                {
                    continue;
                }
                FGreyboxRigJointSpec Joint;
                JointObject->TryGetStringField(TEXT("name"), Joint.JointName);
                JointObject->TryGetStringField(TEXT("parent"), Joint.ParentName);
                OutSpec.Joints.Add(MoveTemp(Joint));
            }
        }
    }

    if (const TArray<TSharedPtr<FJsonValue>>* Animations = TryGetArray(Source, TEXT("animations")))
    {
        for (const TSharedPtr<FJsonValue>& Value : *Animations)
        {
            const TSharedPtr<FJsonObject> AnimationObject = Value.IsValid() ? Value->AsObject() : nullptr;
            if (!AnimationObject.IsValid())
            {
                continue;
            }
            FGreyboxAnimationClipSpec Clip;
            AnimationObject->TryGetStringField(TEXT("id"), Clip.Id);
            AnimationObject->TryGetStringField(TEXT("name"), Clip.Name);
            AnimationObject->TryGetStringField(TEXT("clipRef"), Clip.ClipAssetRef);
            TryReadNumber(AnimationObject, TEXT("duration"), Clip.Duration);
            AnimationObject->TryGetBoolField(TEXT("loop"), Clip.bLoop);
            OutSpec.Animations.Add(MoveTemp(Clip));
        }
    }

    const TSharedPtr<FJsonObject>* StatsObject = nullptr;
    if (Source->TryGetObjectField(TEXT("gameStats"), StatsObject) && StatsObject != nullptr && StatsObject->IsValid())
    {
        for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : (*StatsObject)->Values)
        {
            double Number = 0.0;
            if (Pair.Value.IsValid() && Pair.Value->TryGetNumber(Number))
            {
                OutSpec.GameStats.Add(Pair.Key, static_cast<float>(Number));
            }
        }
    }
}

void FGreyboxProjectImporter::ParseAsset(const TSharedPtr<FJsonObject>& Source, FGreyboxAssetSpec& OutSpec)
{
    if (!Source.IsValid())
    {
        return;
    }
    Source->TryGetStringField(TEXT("id"), OutSpec.Id);
    Source->TryGetStringField(TEXT("type"), OutSpec.Type);
    Source->TryGetStringField(TEXT("uri"), OutSpec.Uri);
    Source->TryGetStringField(TEXT("sha256"), OutSpec.Sha256);
    Source->TryGetStringField(TEXT("name"), OutSpec.DisplayName);
    double SizeNumber = 0.0;
    Source->TryGetNumberField(TEXT("sizeBytes"), SizeNumber);
    OutSpec.SizeBytes = static_cast<int64>(SizeNumber);
}

void FGreyboxProjectImporter::ParseFlowEdge(const TSharedPtr<FJsonObject>& Source, FGreyboxFlowEdgeSpec& OutSpec)
{
    if (!Source.IsValid())
    {
        return;
    }
    Source->TryGetStringField(TEXT("id"), OutSpec.Id);
    Source->TryGetStringField(TEXT("from"), OutSpec.FromScreenId);
    Source->TryGetStringField(TEXT("to"), OutSpec.ToScreenId);

    const TSharedPtr<FJsonObject>* TriggerObject = nullptr;
    if (Source->TryGetObjectField(TEXT("trigger"), TriggerObject) && TriggerObject != nullptr && TriggerObject->IsValid())
    {
        (*TriggerObject)->TryGetStringField(TEXT("type"), OutSpec.TriggerType);
        (*TriggerObject)->TryGetStringField(TEXT("componentRef"), OutSpec.TriggerComponentRef);
        (*TriggerObject)->TryGetStringField(TEXT("eventId"), OutSpec.TriggerEventId);
        TryReadNumber(*TriggerObject, TEXT("durationSeconds"), OutSpec.TriggerDurationSeconds);
    }
}

bool FGreyboxProjectImporter::ParseProjectSpec(
    const FString& JsonBody,
    FGreyboxGameProjectSpec& OutSpec,
    TArray<FString>& OutErrors)
{
    TSharedPtr<FJsonObject> Root;
    const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonBody);
    if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
    {
        OutErrors.Add(TEXT("Greybox project JSON could not be parsed."));
        return false;
    }

    Root->TryGetStringField(TEXT("schemaVersion"), OutSpec.SchemaVersion);

    const TSharedPtr<FJsonObject>* MetaObject = nullptr;
    if (Root->TryGetObjectField(TEXT("meta"), MetaObject) && MetaObject != nullptr && MetaObject->IsValid())
    {
        (*MetaObject)->TryGetStringField(TEXT("id"), OutSpec.Meta.Id);
        (*MetaObject)->TryGetStringField(TEXT("name"), OutSpec.Meta.Name);
        (*MetaObject)->TryGetStringField(TEXT("version"), OutSpec.Meta.Version);
        (*MetaObject)->TryGetStringField(TEXT("genre"), OutSpec.Meta.Genre);
    }
    else
    {
        OutErrors.Add(TEXT("Greybox project JSON is missing required meta block."));
    }

    if (const TArray<TSharedPtr<FJsonValue>>* Assets = TryGetArray(Root, TEXT("assets")))
    {
        OutSpec.Assets.Reserve(Assets->Num());
        for (const TSharedPtr<FJsonValue>& Value : *Assets)
        {
            const TSharedPtr<FJsonObject> Object = Value.IsValid() ? Value->AsObject() : nullptr;
            if (!Object.IsValid())
            {
                continue;
            }
            FGreyboxAssetSpec Spec;
            ParseAsset(Object, Spec);
            OutSpec.Assets.Add(MoveTemp(Spec));
        }
    }

    if (const TArray<TSharedPtr<FJsonValue>>* Characters = TryGetArray(Root, TEXT("characters")))
    {
        OutSpec.Characters.Reserve(Characters->Num());
        for (const TSharedPtr<FJsonValue>& Value : *Characters)
        {
            const TSharedPtr<FJsonObject> Object = Value.IsValid() ? Value->AsObject() : nullptr;
            if (!Object.IsValid())
            {
                continue;
            }
            FGreyboxCharacterSpec Spec;
            ParseCharacter(Object, Spec);
            OutSpec.Characters.Add(MoveTemp(Spec));
        }
    }

    if (const TArray<TSharedPtr<FJsonValue>>* Screens = TryGetArray(Root, TEXT("screens")))
    {
        OutSpec.Screens.Reserve(Screens->Num());
        for (const TSharedPtr<FJsonValue>& Value : *Screens)
        {
            const TSharedPtr<FJsonObject> Object = Value.IsValid() ? Value->AsObject() : nullptr;
            if (!Object.IsValid())
            {
                continue;
            }
            FGreyboxScreenSpec Spec;
            ParseScreen(Object, Spec);
            OutSpec.Screens.Add(MoveTemp(Spec));
        }
    }
    else
    {
        OutErrors.Add(TEXT("Greybox project JSON does not declare any screens."));
    }

    if (const TArray<TSharedPtr<FJsonValue>>* Flow = TryGetArray(Root, TEXT("flow")))
    {
        OutSpec.Flow.Reserve(Flow->Num());
        for (const TSharedPtr<FJsonValue>& Value : *Flow)
        {
            const TSharedPtr<FJsonObject> Object = Value.IsValid() ? Value->AsObject() : nullptr;
            if (!Object.IsValid())
            {
                continue;
            }
            FGreyboxFlowEdgeSpec Spec;
            ParseFlowEdge(Object, Spec);
            OutSpec.Flow.Add(MoveTemp(Spec));
        }
    }

    return OutErrors.Num() == 0;
}

FGreyboxProjectImportResult FGreyboxProjectImporter::ImportFromJson(
    const FString& JsonPath,
    const FString& AssetBaseDir,
    const FString& OutputContentDir)
{
    FGreyboxProjectImportResult Result;
    const FString ResolvedContentRoot = OutputContentDir.IsEmpty() ? DefaultContentRoot() : OutputContentDir;

    FString JsonBody;
    if (!FFileHelper::LoadFileToString(JsonBody, *JsonPath))
    {
        Result.Errors.Add(FString::Printf(TEXT("Greybox project JSON missing or unreadable: %s."), *JsonPath));
        return Result;
    }

    FGreyboxGameProjectSpec Spec;
    if (!ParseProjectSpec(JsonBody, Spec, Result.Errors))
    {
        return Result;
    }

    // Asset import descriptors (resolved first so component refs can reuse the paths later).
    for (const FGreyboxAssetSpec& Asset : Spec.Assets)
    {
        const FGreyboxImportedAsset Descriptor = FGreyboxAssetImporter::BuildAssetDescriptor(
            Asset,
            AssetBaseDir,
            ResolvedContentRoot,
            Result.Warnings);
        Result.ImportedAssets.Add(Descriptor);
    }

    // Character import descriptors (skeletal mesh + ABP).
    for (const FGreyboxCharacterSpec& Character : Spec.Characters)
    {
        TArray<FGreyboxImportedAsset> Items = FGreyboxCharacterImporter::BuildCharacterDescriptor(
            Character,
            ResolvedContentRoot,
            Result.Warnings);
        Result.ImportedAssets.Append(MoveTemp(Items));
    }

    // Screen + component descriptors.
    for (const FGreyboxScreenSpec& Screen : Spec.Screens)
    {
        TArray<FGreyboxImportedAsset> Items = FGreyboxScreenImporter::BuildScreenDescriptor(
            Screen,
            ResolvedContentRoot,
            Result.Warnings);
        Result.ImportedAssets.Append(MoveTemp(Items));
    }

    // Flow dispatcher (single actor).
    if (Spec.Flow.Num() > 0)
    {
        const FGreyboxImportedAsset Dispatcher = FGreyboxFlowImporter::BuildFlowDispatcherDescriptor(
            Spec.Flow,
            ResolvedContentRoot,
            Result.Warnings);
        Result.ImportedAssets.Add(Dispatcher);
    }

    if (Spec.Screens.Num() > 0)
    {
        Result.FirstLevelPackagePath = JoinPath(ResolvedContentRoot, TEXT("Levels/") + Spec.Screens[0].Id);
    }

    // Serialise the entire result as a deterministic JSON plan for CI introspection.
    TSharedRef<FJsonObject> Plan = MakeShared<FJsonObject>();
    Plan->SetStringField(TEXT("generator"), TEXT("Greybox"));
    Plan->SetStringField(TEXT("kind"), TEXT("game-project"));
    Plan->SetStringField(TEXT("schemaVersion"), Spec.SchemaVersion);
    Plan->SetStringField(TEXT("projectId"), Spec.Meta.Id);
    Plan->SetStringField(TEXT("projectName"), Spec.Meta.Name);
    Plan->SetStringField(TEXT("contentRoot"), ResolvedContentRoot);
    Plan->SetStringField(TEXT("unrealTarget"), TEXT("Editor import plan"));
    Plan->SetNumberField(TEXT("screenCount"), Spec.Screens.Num());
    Plan->SetNumberField(TEXT("characterCount"), Spec.Characters.Num());
    Plan->SetNumberField(TEXT("assetCount"), Spec.Assets.Num());
    Plan->SetNumberField(TEXT("flowEdgeCount"), Spec.Flow.Num());
    Plan->SetNumberField(TEXT("primaryObjectCount"), Result.ImportedAssets.Num());

    TArray<TSharedPtr<FJsonValue>> AssetEntries;
    AssetEntries.Reserve(Result.ImportedAssets.Num());
    for (const FGreyboxImportedAsset& Imported : Result.ImportedAssets)
    {
        TSharedRef<FJsonObject> Entry = MakeShared<FJsonObject>();
        Entry->SetStringField(TEXT("packagePath"), Imported.PackagePath);
        Entry->SetStringField(TEXT("assetKind"), Imported.AssetKind);
        Entry->SetStringField(TEXT("sourceId"), Imported.SourceId);
        AssetEntries.Add(MakeShared<FJsonValueObject>(Entry));
    }
    Plan->SetArrayField(TEXT("importedAssets"), AssetEntries);

    TArray<TSharedPtr<FJsonValue>> WarningEntries;
    WarningEntries.Reserve(Result.Warnings.Num());
    for (const FString& Warning : Result.Warnings)
    {
        WarningEntries.Add(MakeShared<FJsonValueString>(Warning));
    }
    Plan->SetArrayField(TEXT("warnings"), WarningEntries);

    Result.PrimaryObjectCount = Result.ImportedAssets.Num();
    Result.ImportPlanPath = DefaultImportPlanPath();

    FString PlanBody;
    const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&PlanBody);
    FJsonSerializer::Serialize(Plan, Writer);
    IFileManager::Get().MakeDirectory(*FPaths::GetPath(Result.ImportPlanPath), true);
    const bool bSavedPlan = FFileHelper::SaveStringToFile(PlanBody, *Result.ImportPlanPath);
    if (!bSavedPlan)
    {
        Result.Warnings.Add(FString::Printf(TEXT("Greybox project import plan could not be written to %s."), *Result.ImportPlanPath));
    }

    Result.bSucceeded = Result.Errors.Num() == 0 && bSavedPlan;
    UE_LOG(LogGreyboxProjectImporter, Log, TEXT("Greybox project import produced %d primary objects (%d screens, %d characters, %d assets)."),
        Result.PrimaryObjectCount,
        Spec.Screens.Num(),
        Spec.Characters.Num(),
        Spec.Assets.Num());
    return Result;
}
