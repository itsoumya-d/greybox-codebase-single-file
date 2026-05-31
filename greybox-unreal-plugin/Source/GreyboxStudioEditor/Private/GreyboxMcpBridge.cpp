// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#include "GreyboxMcpBridge.h"

#include "Misc/Guid.h"

namespace
{
FString GGreyboxMcpBearerToken;
uint16 GGreyboxMcpPort = 38468;
constexpr int32 GreyboxMcpBearerTokenChars = 64;
constexpr int32 GreyboxMcpMaxAuthorizationHeaderChars = 128;
const TCHAR* GreyboxMcpBearerPrefix = TEXT("Bearer ");

bool IsLowerHexDigit(TCHAR Character)
{
    return (Character >= TCHAR('0') && Character <= TCHAR('9'))
        || (Character >= TCHAR('a') && Character <= TCHAR('f'));
}

FString NewBearerTokenPart()
{
    return FGuid::NewGuid().ToString(EGuidFormats::Digits).ToLower();
}
}

void FGreyboxMcpBridge::Start(uint16 Port)
{
    GGreyboxMcpPort = Port;
    GetOrCreateBearerToken();
}

void FGreyboxMcpBridge::Stop()
{
}

FString FGreyboxMcpBridge::RotateBearerToken()
{
    GGreyboxMcpBearerToken = NewBearerTokenPart() + NewBearerTokenPart();
    return GGreyboxMcpBearerToken;
}

FString FGreyboxMcpBridge::ClientConfigJson()
{
    return FString::Printf(
        TEXT("{\"url\":\"http://127.0.0.1:%u/mcp\",\"headers\":{\"Authorization\":\"Bearer %s\"}}"),
        GGreyboxMcpPort,
        *GetOrCreateBearerToken());
}

TArray<FString> FGreyboxMcpBridge::ToolNames()
{
    return {
        TEXT("unreal.getWorldActors"),
        TEXT("unreal.createActor"),
        TEXT("unreal.addComponent"),
        TEXT("unreal.setProperty"),
        TEXT("unreal.assignAsset"),
        TEXT("unreal.runAutomationTest"),
        TEXT("unreal.captureViewportScreenshot"),
        TEXT("unreal.buildCookedContent")
    };
}

bool FGreyboxMcpBridge::AuthorizationHeaderMatches(const FString& Authorization, const FString& Expected)
{
    if (!IsSafeAuthHeader(Authorization) || !Authorization.StartsWith(GreyboxMcpBearerPrefix, ESearchCase::CaseSensitive))
    {
        return false;
    }
    return BearerTokenMatches(Authorization.RightChop(FCString::Strlen(GreyboxMcpBearerPrefix)), Expected);
}

bool FGreyboxMcpBridge::HeaderTokenMatches(const TMap<FString, FString>& Headers, const FString& Expected)
{
    if (AuthorizationHeaderMatches(HeaderValue(Headers, TEXT("Authorization")), Expected))
    {
        return true;
    }
    return BearerTokenMatches(HeaderValue(Headers, TEXT("X-Greybox-Mcp-Token")), Expected);
}

bool FGreyboxMcpBridge::BearerTokenMatches(const FString& Candidate, const FString& Expected)
{
    if (!IsSafeBearerToken(Candidate) || !IsSafeBearerToken(Expected))
    {
        return false;
    }
    return FixedTimeEquals(Candidate, Expected);
}

bool FGreyboxMcpBridge::IsSafeBearerToken(const FString& Token)
{
    if (Token.Len() != GreyboxMcpBearerTokenChars)
    {
        return false;
    }
    for (int32 Index = 0; Index < Token.Len(); ++Index)
    {
        if (!IsLowerHexDigit(Token[Index]))
        {
            return false;
        }
    }
    return true;
}

FString FGreyboxMcpBridge::GetOrCreateBearerToken()
{
    if (GGreyboxMcpBearerToken.IsEmpty())
    {
        RotateBearerToken();
    }
    return GGreyboxMcpBearerToken;
}

FString FGreyboxMcpBridge::HeaderValue(const TMap<FString, FString>& Headers, const FString& Name)
{
    if (const FString* Exact = Headers.Find(Name))
    {
        return *Exact;
    }
    for (const TPair<FString, FString>& Header : Headers)
    {
        if (Header.Key.Equals(Name, ESearchCase::IgnoreCase))
        {
            return Header.Value;
        }
    }
    return FString();
}

bool FGreyboxMcpBridge::IsSafeAuthHeader(const FString& Value)
{
    if (Value.IsEmpty() || Value.Len() > GreyboxMcpMaxAuthorizationHeaderChars)
    {
        return false;
    }
    for (int32 Index = 0; Index < Value.Len(); ++Index)
    {
        const TCHAR Character = Value[Index];
        if (Character < 32 || Character == 127)
        {
            return false;
        }
    }
    return true;
}

bool FGreyboxMcpBridge::FixedTimeEquals(const FString& Left, const FString& Right)
{
    uint32 Diff = Left.Len() == Right.Len() ? 0u : 1u;
    const int32 Length = FMath::Max(Left.Len(), Right.Len());
    for (int32 Index = 0; Index < Length; ++Index)
    {
        const uint32 LeftCode = Index < Left.Len() ? static_cast<uint32>(Left[Index]) : 0u;
        const uint32 RightCode = Index < Right.Len() ? static_cast<uint32>(Right[Index]) : 0u;
        Diff |= LeftCode ^ RightCode;
    }
    return Diff == 0u;
}
