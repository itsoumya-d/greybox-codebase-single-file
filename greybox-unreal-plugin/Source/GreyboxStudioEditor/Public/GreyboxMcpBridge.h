// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"

struct FGreyboxMcpToolResult
{
    bool bSucceeded = false;
    FString Content;        // JSON string returned to the MCP client
    FString Error;          // Human-readable error, empty on success
};

class FGreyboxMcpBridge
{
public:
    static void Start(uint16 Port = 38468);
    static void Stop();
    static FString RotateBearerToken();
    static FString ClientConfigJson();
    static TArray<FString> ToolNames();
    static bool AuthorizationHeaderMatches(const FString& Authorization, const FString& Expected);
    static bool HeaderTokenMatches(const TMap<FString, FString>& Headers, const FString& Expected);
    static bool BearerTokenMatches(const FString& Candidate, const FString& Expected);
    static bool IsSafeBearerToken(const FString& Token);

    /**
     * Dispatch an inbound MCP tool call and return a result that can be
     * serialised directly into the MCP JSON-RPC response body.
     *
     * @param ToolName   One of the names returned by ToolNames().
     * @param ParamsJson The "params" object from the MCP request, as a JSON string.
     */
    static FGreyboxMcpToolResult DispatchTool(const FString& ToolName, const FString& ParamsJson);

private:
    static FString GetOrCreateBearerToken();
    static FString HeaderValue(const TMap<FString, FString>& Headers, const FString& Name);
    static bool IsSafeAuthHeader(const FString& Value);
    static bool FixedTimeEquals(const FString& Left, const FString& Right);

    // Individual tool handlers (all called from DispatchTool)
    static FGreyboxMcpToolResult HandleGetWorldActors(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleCreateActor(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleAddComponent(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleSetProperty(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleAssignAsset(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleRunAutomationTest(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleCaptureViewportScreenshot(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleBuildCookedContent(const TSharedPtr<FJsonObject>& Params);
    static FGreyboxMcpToolResult HandleImportGlbAsset(const TSharedPtr<FJsonObject>& Params);
};
