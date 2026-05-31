// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxDiffApplier.h"

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
FGreyboxRoundTripMergeRequest MakeRequest(const FString& Base, const FString& Web, const FString& UnrealEdit)
{
    FGreyboxRoundTripMergeRequest Request;
    Request.BaseArtifactJson = Base;
    Request.WebArtifactJson = Web;
    Request.UnrealEditJson = UnrealEdit;
    return Request;
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierNoChangeTest,
    "Greybox.DiffApplier.NoChange",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierNoChangeTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"a\":1,\"b\":\"hello\"}"),
        TEXT("{\"a\":1,\"b\":\"hello\"}"),
        TEXT("{\"a\":1,\"b\":\"hello\"}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    TestTrue(TEXT("succeeded"), Result.bSucceeded);
    TestFalse(TEXT("no conflicts"), Result.bHasConflicts);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierLocalScalarTest,
    "Greybox.DiffApplier.LocalScalar",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierLocalScalarTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"hp\":100}"),
        TEXT("{\"hp\":100}"),
        TEXT("{\"hp\":250}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    TestTrue(TEXT("succeeded"), Result.bSucceeded);
    TestFalse(TEXT("no conflicts"), Result.bHasConflicts);
    TestTrue(TEXT("local hp wins"), Result.MergedArtifactJson.Contains(TEXT("250")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierRemoteScalarTest,
    "Greybox.DiffApplier.RemoteScalar",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierRemoteScalarTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"hp\":100}"),
        TEXT("{\"hp\":75}"),
        TEXT("{\"hp\":100}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    TestTrue(TEXT("succeeded"), Result.bSucceeded);
    TestFalse(TEXT("no conflicts"), Result.bHasConflicts);
    TestTrue(TEXT("remote hp wins"), Result.MergedArtifactJson.Contains(TEXT("75")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierBothChangedConflictTest,
    "Greybox.DiffApplier.BothChangedConflict",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierBothChangedConflictTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"hp\":100}"),
        TEXT("{\"hp\":75}"),
        TEXT("{\"hp\":250}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    TestTrue(TEXT("succeeded"), Result.bSucceeded);
    TestTrue(TEXT("conflicts"), Result.bHasConflicts);
    TestEqual(TEXT("one conflict"), Result.ConflictPaths.Num(), 1);
    TestEqual(TEXT("conflict path"), Result.ConflictPaths[0], FString(TEXT("/hp")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierResolveRemoteTest,
    "Greybox.DiffApplier.ResolveRemote",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierResolveRemoteTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"hp\":100}"),
        TEXT("{\"hp\":75}"),
        TEXT("{\"hp\":250}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    const FGreyboxRoundTripMergeResult Resolved = FGreyboxDiffApplier::Resolve(
        Result,
        TEXT("/hp"),
        EGreyboxConflictResolution::KeepRemote);
    TestFalse(TEXT("conflicts gone"), Resolved.bHasConflicts);
    TestTrue(TEXT("remote value applied"), Resolved.MergedArtifactJson.Contains(TEXT("75")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierNestedObjectTest,
    "Greybox.DiffApplier.NestedObject",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierNestedObjectTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"transform\":{\"position\":{\"x\":0,\"y\":0,\"z\":0}}}"),
        TEXT("{\"transform\":{\"position\":{\"x\":0,\"y\":5,\"z\":0}}}"),
        TEXT("{\"transform\":{\"position\":{\"x\":2,\"y\":0,\"z\":0}}}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    TestTrue(TEXT("nested merges without conflict"), !Result.bHasConflicts);
    TestTrue(TEXT("local x wins"), Result.MergedArtifactJson.Contains(TEXT("\"x\":2")));
    TestTrue(TEXT("remote y wins"), Result.MergedArtifactJson.Contains(TEXT("\"y\":5")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierArrayInsertTest,
    "Greybox.DiffApplier.ArrayInsert",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierArrayInsertTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"components\":[{\"id\":\"a\",\"name\":\"A\"}]}"),
        TEXT("{\"components\":[{\"id\":\"a\",\"name\":\"A\"},{\"id\":\"b\",\"name\":\"B\"}]}"),
        TEXT("{\"components\":[{\"id\":\"a\",\"name\":\"A\"},{\"id\":\"c\",\"name\":\"C\"}]}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    TestTrue(TEXT("succeeded"), Result.bSucceeded);
    TestTrue(TEXT("contains a"), Result.MergedArtifactJson.Contains(TEXT("\"id\":\"a\"")));
    TestTrue(TEXT("contains b"), Result.MergedArtifactJson.Contains(TEXT("\"id\":\"b\"")));
    TestTrue(TEXT("contains c"), Result.MergedArtifactJson.Contains(TEXT("\"id\":\"c\"")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierArrayDeletionTest,
    "Greybox.DiffApplier.ArrayDeletion",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierArrayDeletionTest::RunTest(const FString& Parameters)
{
    const FGreyboxRoundTripMergeRequest Request = MakeRequest(
        TEXT("{\"components\":[{\"id\":\"a\",\"name\":\"A\"},{\"id\":\"b\",\"name\":\"B\"}]}"),
        TEXT("{\"components\":[{\"id\":\"a\",\"name\":\"A\"},{\"id\":\"b\",\"name\":\"B\"}]}"),
        TEXT("{\"components\":[{\"id\":\"a\",\"name\":\"A\"}]}"));
    const FGreyboxRoundTripMergeResult Result = FGreyboxDiffApplier::Merge(Request);
    TestTrue(TEXT("succeeded"), Result.bSucceeded);
    TestFalse(TEXT("local deletion wins without conflict"), Result.bHasConflicts);
    TestFalse(TEXT("b removed"), Result.MergedArtifactJson.Contains(TEXT("\"id\":\"b\"")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FGreyboxDiffApplierSupportsAllFieldsTest,
    "Greybox.DiffApplier.SupportsAllFields",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FGreyboxDiffApplierSupportsAllFieldsTest::RunTest(const FString& Parameters)
{
    TestTrue(TEXT("Int"), FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType::Int));
    TestTrue(TEXT("Float"), FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType::Float));
    TestTrue(TEXT("String"), FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType::String));
    TestTrue(TEXT("Color"), FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType::Color));
    TestTrue(TEXT("Vector"), FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType::Vector));
    TestTrue(TEXT("Rotator"), FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType::Rotator));
    TestTrue(TEXT("Transform"), FGreyboxDiffApplier::SupportsFieldType(EGreyboxMergeFieldType::Transform));
    return true;
}

#endif
