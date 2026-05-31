// Proprietary and confidential. Copyright (c) 2026 Greybox Studio.

#pragma once

#include "CoreMinimal.h"
#include "Importers/GreyboxGameProjectTypes.h"

/**
 * Translates FlowEdge[] into runtime-resolvable navigation.
 *
 * Implementation note: a fully synthesised K2 graph (Blueprint event
 * graph nodes) per edge is rejected here because the node-spawner API
 * is heavyweight and fragile across UE versions. Instead we emit a
 * single AGreyboxFlowDispatcher actor descriptor with a flat
 * `ComponentId -> ScreenId` table plus a separate `EventId -> ScreenId`
 * table. Generated widget blueprints reference the dispatcher by name
 * and call `RouteByComponentId` from their `OnClicked` handler.
 *
 * This delivers the same observable behaviour ("clicking Button X
 * navigates to Screen Y") with a small, testable surface.
 */
class GREYBOXSTUDIOEDITOR_API FGreyboxFlowImporter
{
public:
    static FGreyboxImportedAsset BuildFlowDispatcherDescriptor(
        const TArray<FGreyboxFlowEdgeSpec>& FlowEdges,
        const FString& ContentRoot,
        TArray<FString>& OutWarnings);

    static FString FlowDispatcherPackagePath(const FString& ContentRoot);
};
