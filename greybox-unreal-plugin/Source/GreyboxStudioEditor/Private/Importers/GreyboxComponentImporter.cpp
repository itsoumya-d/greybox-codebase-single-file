// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "Importers/GreyboxComponentImporter.h"

#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Importers/GreyboxProjectImporter.h"

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

uint8 HexDigit(TCHAR Character)
{
    if (Character >= TCHAR('0') && Character <= TCHAR('9'))
    {
        return static_cast<uint8>(Character - TCHAR('0'));
    }
    if (Character >= TCHAR('a') && Character <= TCHAR('f'))
    {
        return static_cast<uint8>(10 + (Character - TCHAR('a')));
    }
    if (Character >= TCHAR('A') && Character <= TCHAR('F'))
    {
        return static_cast<uint8>(10 + (Character - TCHAR('A')));
    }
    return 0;
}

TSharedRef<FJsonObject> BuildBaseDescriptor(const FGreyboxComponentSpec& Component, const FTransform& Transform)
{
    TSharedRef<FJsonObject> Object = MakeShared<FJsonObject>();
    Object->SetStringField(TEXT("componentId"), Component.Id);
    Object->SetStringField(TEXT("kind"), Component.Kind);
    Object->SetStringField(TEXT("name"), Component.Name);
    Object->SetBoolField(TEXT("visible"), Component.bVisible);

    const FVector Location = Transform.GetLocation();
    const FRotator Rotation = Transform.GetRotation().Rotator();
    const FVector Scale = Transform.GetScale3D();

    TSharedRef<FJsonObject> PositionObject = MakeShared<FJsonObject>();
    PositionObject->SetNumberField(TEXT("x"), Location.X);
    PositionObject->SetNumberField(TEXT("y"), Location.Y);
    PositionObject->SetNumberField(TEXT("z"), Location.Z);
    Object->SetObjectField(TEXT("unrealLocationCm"), PositionObject);

    TSharedRef<FJsonObject> RotationObject = MakeShared<FJsonObject>();
    RotationObject->SetNumberField(TEXT("pitch"), Rotation.Pitch);
    RotationObject->SetNumberField(TEXT("yaw"), Rotation.Yaw);
    RotationObject->SetNumberField(TEXT("roll"), Rotation.Roll);
    Object->SetObjectField(TEXT("unrealRotation"), RotationObject);

    TSharedRef<FJsonObject> ScaleObject = MakeShared<FJsonObject>();
    ScaleObject->SetNumberField(TEXT("x"), Scale.X);
    ScaleObject->SetNumberField(TEXT("y"), Scale.Y);
    ScaleObject->SetNumberField(TEXT("z"), Scale.Z);
    Object->SetObjectField(TEXT("unrealScale3D"), ScaleObject);

    return Object;
}

FString StringPropertyOrDefault(const FGreyboxComponentSpec& Component, const FString& Key, const FString& Default)
{
    const FString* Value = Component.StringProperties.Find(Key);
    return Value != nullptr ? *Value : Default;
}

float NumberPropertyOrDefault(const FGreyboxComponentSpec& Component, const FString& Key, float Default)
{
    const float* Value = Component.NumberProperties.Find(Key);
    return Value != nullptr ? *Value : Default;
}

bool BoolPropertyOrDefault(const FGreyboxComponentSpec& Component, const FString& Key, bool Default)
{
    const bool* Value = Component.BoolProperties.Find(Key);
    return Value != nullptr ? *Value : Default;
}

void AddImportedAsset(TArray<FGreyboxImportedAsset>& Out, const FString& PackagePath, const FString& Kind, const FString& SourceId)
{
    FGreyboxImportedAsset Entry;
    Entry.PackagePath = PackagePath;
    Entry.AssetKind = Kind;
    Entry.SourceId = SourceId;
    Out.Add(MoveTemp(Entry));
}
}

FTransform FGreyboxComponentImporter::ConvertTransform(const FGreyboxCanonicalTransform& In)
{
    return FGreyboxProjectImporter::ConvertTransformToUnreal(In);
}

FLinearColor FGreyboxComponentImporter::ParseHexColor(const FString& Hex)
{
    FString Trimmed = Hex;
    Trimmed.TrimStartAndEndInline();
    if (Trimmed.StartsWith(TEXT("#")))
    {
        Trimmed.RightChopInline(1);
    }
    if (Trimmed.Len() != 6 && Trimmed.Len() != 8)
    {
        return FLinearColor::Black;
    }

    const float R = (HexDigit(Trimmed[0]) * 16 + HexDigit(Trimmed[1])) / 255.0f;
    const float G = (HexDigit(Trimmed[2]) * 16 + HexDigit(Trimmed[3])) / 255.0f;
    const float B = (HexDigit(Trimmed[4]) * 16 + HexDigit(Trimmed[5])) / 255.0f;
    const float A = Trimmed.Len() == 8
        ? (HexDigit(Trimmed[6]) * 16 + HexDigit(Trimmed[7])) / 255.0f
        : 1.0f;

    return FLinearColor(R, G, B, A);
}

bool FGreyboxComponentImporter::IsUmgComponentKind(const FString& Kind)
{
    return Kind == TEXT("Button")
        || Kind == TEXT("Image")
        || Kind == TEXT("Text")
        || Kind == TEXT("TextInput")
        || Kind == TEXT("ProgressBar")
        || Kind == TEXT("HUDBar")
        || Kind == TEXT("MenuList")
        || Kind == TEXT("Container");
}

bool FGreyboxComponentImporter::IsLevelComponentKind(const FString& Kind)
{
    return Kind == TEXT("Character3DRef")
        || Kind == TEXT("GameObject")
        || Kind == TEXT("Spawner")
        || Kind == TEXT("Trigger")
        || Kind == TEXT("Pickup")
        || Kind == TEXT("Hazard")
        || Kind == TEXT("Checkpoint")
        || Kind == TEXT("Camera")
        || Kind == TEXT("Light")
        || Kind == TEXT("Particle")
        || Kind == TEXT("AudioSource");
}

TArray<FGreyboxImportedAsset> FGreyboxComponentImporter::BuildComponentDescriptor(
    const FGreyboxComponentSpec& Component,
    const FString& ContentRoot,
    const FString& ScreenId,
    TSharedPtr<FJsonObject>& InOutScreenDescriptor,
    TArray<FString>& OutWarnings)
{
    TArray<FGreyboxImportedAsset> Items;
    if (Component.Kind.IsEmpty())
    {
        OutWarnings.Add(FString::Printf(TEXT("Component '%s' is missing a kind discriminator."), *Component.Id));
        return Items;
    }
    if (!InOutScreenDescriptor.IsValid())
    {
        InOutScreenDescriptor = MakeShared<FJsonObject>();
    }

    const FTransform Unreal = ConvertTransform(Component.Transform);
    TSharedRef<FJsonObject> Descriptor = BuildBaseDescriptor(Component, Unreal);
    const FString WidgetRoot = JoinPath(ContentRoot, TEXT("Widgets/") + ScreenId);
    const FString LevelRoot = JoinPath(ContentRoot, TEXT("Levels/") + ScreenId);
    const FString CharactersRoot = JoinPath(ContentRoot, TEXT("Characters"));
    const FString AssetsRoot = JoinPath(ContentRoot, TEXT("Assets"));

    if (Component.Kind == TEXT("Button"))
    {
        const FString Label = StringPropertyOrDefault(Component, TEXT("label"), Component.Name);
        const FString OnClickEvent = StringPropertyOrDefault(Component, TEXT("onClickEvent"), FString());
        const FString IconAssetRef = StringPropertyOrDefault(Component, TEXT("iconAssetRef"), FString());
        Descriptor->SetStringField(TEXT("umgClass"), TEXT("UButton"));
        Descriptor->SetStringField(TEXT("label"), Label);
        Descriptor->SetStringField(TEXT("onClickEvent"), OnClickEvent);
        Descriptor->SetStringField(TEXT("iconAssetRef"), IconAssetRef);
        Descriptor->SetStringField(TEXT("widgetSlot"), JoinPath(WidgetRoot, Component.Id));
        AddImportedAsset(Items, JoinPath(WidgetRoot, Component.Id), TEXT("UMG.Button"), Component.Id);
    }
    else if (Component.Kind == TEXT("Image"))
    {
        const FString AssetRef = StringPropertyOrDefault(Component, TEXT("assetRef"), FString());
        const FString AltText = StringPropertyOrDefault(Component, TEXT("altText"), FString());
        Descriptor->SetStringField(TEXT("umgClass"), TEXT("UImage"));
        Descriptor->SetStringField(TEXT("assetRef"), AssetRef);
        Descriptor->SetStringField(TEXT("textureSource"), AssetRef.IsEmpty() ? FString() : JoinPath(AssetsRoot, AssetRef));
        Descriptor->SetStringField(TEXT("altText"), AltText);
        AddImportedAsset(Items, JoinPath(WidgetRoot, Component.Id), TEXT("UMG.Image"), Component.Id);
    }
    else if (Component.Kind == TEXT("Text"))
    {
        const FString Content = StringPropertyOrDefault(Component, TEXT("content"), Component.Name);
        const FString FontFamily = StringPropertyOrDefault(Component, TEXT("font"), TEXT("Roboto"));
        const float FontSize = NumberPropertyOrDefault(Component, TEXT("fontSize"), 16.0f);
        const FString ColorHex = StringPropertyOrDefault(Component, TEXT("color"), TEXT("#FFFFFF"));
        const FLinearColor Color = ParseHexColor(ColorHex);
        Descriptor->SetStringField(TEXT("umgClass"), TEXT("UTextBlock"));
        Descriptor->SetStringField(TEXT("content"), Content);
        Descriptor->SetStringField(TEXT("font"), FontFamily);
        Descriptor->SetNumberField(TEXT("fontSize"), FontSize);
        Descriptor->SetStringField(TEXT("colorHex"), ColorHex);
        Descriptor->SetNumberField(TEXT("colorLinearR"), Color.R);
        Descriptor->SetNumberField(TEXT("colorLinearG"), Color.G);
        Descriptor->SetNumberField(TEXT("colorLinearB"), Color.B);
        Descriptor->SetNumberField(TEXT("colorLinearA"), Color.A);
        AddImportedAsset(Items, JoinPath(WidgetRoot, Component.Id), TEXT("UMG.TextBlock"), Component.Id);
    }
    else if (Component.Kind == TEXT("TextInput"))
    {
        Descriptor->SetStringField(TEXT("umgClass"), TEXT("UEditableTextBox"));
        Descriptor->SetStringField(TEXT("placeholder"), StringPropertyOrDefault(Component, TEXT("placeholder"), FString()));
        Descriptor->SetStringField(TEXT("inputType"), StringPropertyOrDefault(Component, TEXT("inputType"), TEXT("text")));
        Descriptor->SetNumberField(TEXT("maxLength"), NumberPropertyOrDefault(Component, TEXT("maxLength"), 0.0f));
        AddImportedAsset(Items, JoinPath(WidgetRoot, Component.Id), TEXT("UMG.EditableTextBox"), Component.Id);
    }
    else if (Component.Kind == TEXT("ProgressBar") || Component.Kind == TEXT("HUDBar"))
    {
        Descriptor->SetStringField(TEXT("umgClass"), TEXT("UProgressBar"));
        if (Component.Kind == TEXT("HUDBar"))
        {
            Descriptor->SetStringField(TEXT("statKey"), StringPropertyOrDefault(Component, TEXT("statKey"), TEXT("hp")));
            Descriptor->SetStringField(TEXT("barStyle"), StringPropertyOrDefault(Component, TEXT("style"), TEXT("bar")));
        }
        else
        {
            Descriptor->SetNumberField(TEXT("min"), NumberPropertyOrDefault(Component, TEXT("min"), 0.0f));
            Descriptor->SetNumberField(TEXT("max"), NumberPropertyOrDefault(Component, TEXT("max"), 1.0f));
            Descriptor->SetNumberField(TEXT("value"), NumberPropertyOrDefault(Component, TEXT("value"), 0.0f));
        }
        AddImportedAsset(Items, JoinPath(WidgetRoot, Component.Id), TEXT("UMG.ProgressBar"), Component.Id);
    }
    else if (Component.Kind == TEXT("MenuList"))
    {
        Descriptor->SetStringField(TEXT("umgClass"), TEXT("UListView"));
        AddImportedAsset(Items, JoinPath(WidgetRoot, Component.Id), TEXT("UMG.ListView"), Component.Id);
    }
    else if (Component.Kind == TEXT("Container"))
    {
        Descriptor->SetStringField(TEXT("umgClass"), TEXT("USizeBox"));
        Descriptor->SetStringField(TEXT("layout"), StringPropertyOrDefault(Component, TEXT("layout"), TEXT("absolute")));
        Descriptor->SetNumberField(TEXT("gap"), NumberPropertyOrDefault(Component, TEXT("gap"), 0.0f));
        AddImportedAsset(Items, JoinPath(WidgetRoot, Component.Id), TEXT("UMG.SizeBox"), Component.Id);
    }
    else if (Component.Kind == TEXT("Character3DRef"))
    {
        const FString CharacterRef = StringPropertyOrDefault(Component, TEXT("characterRef"), FString());
        const FString InitialAnimation = StringPropertyOrDefault(Component, TEXT("initialAnimation"), FString());
        Descriptor->SetStringField(TEXT("actorClass"), TEXT("ASkeletalMeshActor"));
        Descriptor->SetStringField(TEXT("characterRef"), CharacterRef);
        Descriptor->SetStringField(TEXT("initialAnimation"), InitialAnimation);
        Descriptor->SetStringField(TEXT("skeletalMeshPath"),
            CharacterRef.IsEmpty() ? FString() : JoinPath(CharactersRoot, CharacterRef + TEXT("_SK")));
        Descriptor->SetStringField(TEXT("animBlueprintPath"),
            CharacterRef.IsEmpty() ? FString() : JoinPath(CharactersRoot, CharacterRef + TEXT("_ABP")));
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), TEXT("Level.SkeletalMeshActor"), Component.Id);
    }
    else if (Component.Kind == TEXT("GameObject"))
    {
        const FString PrefabRef = StringPropertyOrDefault(Component, TEXT("prefabRef"), FString());
        Descriptor->SetStringField(TEXT("actorClass"), TEXT("AStaticMeshActor"));
        Descriptor->SetStringField(TEXT("prefabRef"), PrefabRef);
        Descriptor->SetStringField(TEXT("staticMeshPath"),
            PrefabRef.IsEmpty() ? FString() : JoinPath(AssetsRoot, PrefabRef));
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), TEXT("Level.StaticMeshActor"), Component.Id);
    }
    else if (Component.Kind == TEXT("Camera"))
    {
        Descriptor->SetStringField(TEXT("actorClass"), TEXT("ACameraActor"));
        Descriptor->SetStringField(TEXT("projection"), StringPropertyOrDefault(Component, TEXT("projection"), TEXT("perspective")));
        Descriptor->SetNumberField(TEXT("fieldOfView"), NumberPropertyOrDefault(Component, TEXT("fov"), 60.0f));
        Descriptor->SetBoolField(TEXT("isMain"), BoolPropertyOrDefault(Component, TEXT("isMain"), false));
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), TEXT("Level.CameraActor"), Component.Id);
    }
    else if (Component.Kind == TEXT("Light"))
    {
        const FString LightType = StringPropertyOrDefault(Component, TEXT("lightType"), TEXT("point"));
        FString ActorClass = TEXT("APointLight");
        if (LightType == TEXT("directional"))
        {
            ActorClass = TEXT("ADirectionalLight");
        }
        else if (LightType == TEXT("spot"))
        {
            ActorClass = TEXT("ASpotLight");
        }
        else if (LightType == TEXT("area"))
        {
            ActorClass = TEXT("ARectLight");
        }
        Descriptor->SetStringField(TEXT("actorClass"), ActorClass);
        const FString ColorHex = StringPropertyOrDefault(Component, TEXT("color"), TEXT("#FFFFFF"));
        const FLinearColor Color = ParseHexColor(ColorHex);
        Descriptor->SetStringField(TEXT("colorHex"), ColorHex);
        Descriptor->SetNumberField(TEXT("colorLinearR"), Color.R);
        Descriptor->SetNumberField(TEXT("colorLinearG"), Color.G);
        Descriptor->SetNumberField(TEXT("colorLinearB"), Color.B);
        Descriptor->SetNumberField(TEXT("intensity"), NumberPropertyOrDefault(Component, TEXT("intensity"), 1.0f));
        Descriptor->SetBoolField(TEXT("castsShadows"), BoolPropertyOrDefault(Component, TEXT("castsShadows"), true));
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), TEXT("Level.Light"), Component.Id);
    }
    else if (Component.Kind == TEXT("Spawner")
        || Component.Kind == TEXT("Trigger")
        || Component.Kind == TEXT("Pickup")
        || Component.Kind == TEXT("Hazard")
        || Component.Kind == TEXT("Checkpoint"))
    {
        Descriptor->SetStringField(TEXT("actorClass"), TEXT("AStaticMeshActor"));
        Descriptor->SetStringField(TEXT("placeholderMesh"), TEXT("/Engine/BasicShapes/Cube.Cube"));
        Descriptor->SetStringField(TEXT("greyboxComponentTag"), Component.Kind);
        for (const TPair<FString, FString>& Pair : Component.StringProperties)
        {
            Descriptor->SetStringField(Pair.Key, Pair.Value);
        }
        for (const TPair<FString, float>& Pair : Component.NumberProperties)
        {
            Descriptor->SetNumberField(Pair.Key, Pair.Value);
        }
        for (const TPair<FString, bool>& Pair : Component.BoolProperties)
        {
            Descriptor->SetBoolField(Pair.Key, Pair.Value);
        }
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), FString::Printf(TEXT("Level.%s"), *Component.Kind), Component.Id);
    }
    else if (Component.Kind == TEXT("Particle"))
    {
        Descriptor->SetStringField(TEXT("actorClass"), TEXT("AEmitter"));
        Descriptor->SetStringField(TEXT("effectRef"), StringPropertyOrDefault(Component, TEXT("effectRef"), FString()));
        Descriptor->SetBoolField(TEXT("autoPlay"), BoolPropertyOrDefault(Component, TEXT("autoPlay"), true));
        Descriptor->SetBoolField(TEXT("loop"), BoolPropertyOrDefault(Component, TEXT("loop"), true));
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), TEXT("Level.Particle"), Component.Id);
    }
    else if (Component.Kind == TEXT("AudioSource"))
    {
        Descriptor->SetStringField(TEXT("actorClass"), TEXT("AAmbientSound"));
        Descriptor->SetStringField(TEXT("clipRef"), StringPropertyOrDefault(Component, TEXT("clipRef"), FString()));
        Descriptor->SetNumberField(TEXT("volume"), NumberPropertyOrDefault(Component, TEXT("volume"), 1.0f));
        Descriptor->SetBoolField(TEXT("spatial"), BoolPropertyOrDefault(Component, TEXT("spatial"), true));
        Descriptor->SetBoolField(TEXT("loop"), BoolPropertyOrDefault(Component, TEXT("loop"), false));
        Descriptor->SetBoolField(TEXT("autoPlay"), BoolPropertyOrDefault(Component, TEXT("autoPlay"), false));
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), TEXT("Level.AudioSource"), Component.Id);
    }
    else
    {
        OutWarnings.Add(FString::Printf(
            TEXT("Component '%s' has unknown kind '%s' and was emitted as a placeholder static mesh actor."),
            *Component.Id,
            *Component.Kind));
        Descriptor->SetStringField(TEXT("actorClass"), TEXT("AStaticMeshActor"));
        Descriptor->SetStringField(TEXT("placeholderMesh"), TEXT("/Engine/BasicShapes/Cube.Cube"));
        Descriptor->SetStringField(TEXT("greyboxComponentTag"), Component.Kind);
        AddImportedAsset(Items, JoinPath(LevelRoot, Component.Id), TEXT("Level.UnknownComponent"), Component.Id);
    }

    // Attach the descriptor to the screen descriptor under either widgets[] or actors[].
    const FString Bucket = IsUmgComponentKind(Component.Kind) ? TEXT("widgets") : TEXT("actors");
    TArray<TSharedPtr<FJsonValue>> Existing;
    const TArray<TSharedPtr<FJsonValue>>* ExistingPtr = nullptr;
    if (InOutScreenDescriptor->TryGetArrayField(Bucket, ExistingPtr) && ExistingPtr != nullptr)
    {
        Existing = *ExistingPtr;
    }
    Existing.Add(MakeShared<FJsonValueObject>(Descriptor));
    InOutScreenDescriptor->SetArrayField(Bucket, Existing);
    return Items;
}
