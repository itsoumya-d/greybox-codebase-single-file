# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends Resource
class_name GreyboxArtifact

enum ArtifactKind {
    GAME_VIEW,
    ART_BIBLE,
    HUD_LAYOUT,
    LEVEL_BOARD
}

@export var artifact_id := ""
@export var kind := ArtifactKind.GAME_VIEW
@export var source_path := ""
@export var designer_name := ""
@export var generator := "Greybox + human designer"
@export var source_sha256 := ""
@export var synced_at_iso8601 := ""
