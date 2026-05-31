# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted

const GreyboxComponentImporter := preload("res://addons/greybox_studio/importers/component_importer.gd")


static func run() -> Array:
    var results: Array = []
    var asset_lookup := {"asset-icon": "res://Greybox/assets/asset-icon.png", "asset-clip": "res://Greybox/assets/asset-clip.wav"}
    var character_lookup := {"char-hero": "res://Greybox/characters/char-hero.tscn"}

    var cases := [
        {"kind": "Button", "screen": "ui", "expects": "Button"},
        {"kind": "Image", "screen": "ui", "expects": "TextureRect", "extra": {"assetRef": "asset-icon"}},
        {"kind": "Text", "screen": "ui", "expects": "Label", "extra": {"content": "Hi"}},
        {"kind": "TextInput", "screen": "ui", "expects": "LineEdit", "extra": {"placeholder": "p"}},
        {"kind": "ProgressBar", "screen": "ui", "expects": "ProgressBar", "extra": {"min": 0, "max": 1, "value": 0.5}},
        {"kind": "HUDBar", "screen": "ui", "expects": "ProgressBar", "extra": {"statKey": "hp"}},
        {"kind": "MenuList", "screen": "ui", "expects": "VBoxContainer", "extra": {"items": [{"id": "a", "label": "A"}]}},
        {"kind": "Container", "screen": "ui", "expects": "PanelContainer", "extra": {"layout": "stack-vertical"}},
        {"kind": "Character3DRef", "screen": "3d", "expects": "CharacterBody3D", "extra": {"characterRef": "char-hero"}},
        {"kind": "GameObject", "screen": "3d", "expects": "StaticBody3D", "extra": {"prefabRef": "asset-icon"}},
        {"kind": "Spawner", "screen": "3d", "expects": "Marker3D", "extra": {"prefabRef": "asset-icon"}},
        {"kind": "Trigger", "screen": "3d", "expects": "Marker3D", "extra": {"eventId": "door"}},
        {"kind": "Pickup", "screen": "3d", "expects": "Marker3D", "extra": {"grantStat": "hp", "amount": 1}},
        {"kind": "Hazard", "screen": "3d", "expects": "Marker3D", "extra": {"damagePerSecond": 1}},
        {"kind": "Checkpoint", "screen": "3d", "expects": "Marker3D", "extra": {"checkpointId": "cp-1"}},
        {"kind": "Camera", "screen": "3d", "expects": "Camera3D"},
        {"kind": "Camera", "screen": "ui", "expects": "Camera2D"},
        {"kind": "Light", "screen": "3d", "expects": "DirectionalLight3D", "extra": {"lightType": "directional", "color": "#ffffff", "intensity": 1}},
        {"kind": "Light", "screen": "3d", "expects": "OmniLight3D", "extra": {"lightType": "point", "color": "#ffffff", "intensity": 1}},
        {"kind": "Light", "screen": "3d", "expects": "SpotLight3D", "extra": {"lightType": "spot", "color": "#ffffff", "intensity": 1}},
        {"kind": "Particle", "screen": "3d", "expects": "GPUParticles3D"},
        {"kind": "AudioSource", "screen": "3d", "expects": "AudioStreamPlayer3D", "extra": {"clipRef": "asset-clip"}},
        {"kind": "AudioSource", "screen": "ui", "expects": "AudioStreamPlayer", "extra": {"clipRef": "asset-clip", "spatial": false}}
    ]

    var counter := 0
    for case in cases:
        counter += 1
        var component := _component(str(case.get("kind")), counter, case.get("extra", {}))
        var build = GreyboxComponentImporter.build_node(component, str(case.get("screen")), asset_lookup, character_lookup)
        var node = build.get("node")
        var class_name_value := node.get_class() if node != null else "<null>"
        var case_label := "component/%s -> %s" % [str(case.get("kind")), str(case.get("expects"))]
        var passed := class_name_value == str(case.get("expects"))
        results.append({"name": case_label, "passed": passed, "message": "got %s" % class_name_value})

    results.append_array(_test_metadata_stamped())
    results.append_array(_test_transform_applied())
    return results


static func _component(kind: String, index: int, extra: Dictionary) -> Dictionary:
    var component := {
        "id": "cmp-%s-%d" % [kind.to_lower(), index],
        "name": "%s_%d" % [kind, index],
        "kind": kind,
        "visible": true,
        "transform": {
            "position": {"x": float(index), "y": 0.0, "z": 0.0},
            "rotation": {"x": 0.0, "y": 0.0, "z": 0.0},
            "scale": {"x": 1.0, "y": 1.0, "z": 1.0}
        }
    }
    for key in extra.keys():
        component[key] = extra[key]
    return component


static func _test_metadata_stamped() -> Array:
    var component := _component("Button", 99, {"label": "Play"})
    var result = GreyboxComponentImporter.build_node(component, "ui", {}, {})
    var node = result.get("node")
    var greybox_id := str(node.get_meta(GreyboxComponentImporter.META_GREYBOX_ID, ""))
    var greybox_kind := str(node.get_meta(GreyboxComponentImporter.META_GREYBOX_KIND, ""))
    return [
        {"name": "component/metadata stamped id", "passed": greybox_id == component.id, "message": "got %s" % greybox_id},
        {"name": "component/metadata stamped kind", "passed": greybox_kind == "Button", "message": "got %s" % greybox_kind}
    ]


static func _test_transform_applied() -> Array:
    var component := _component("Light", 0, {"lightType": "directional", "color": "#ffffff", "intensity": 1.0})
    component["transform"]["position"] = {"x": 1.0, "y": 2.0, "z": 3.0}
    var result = GreyboxComponentImporter.build_node(component, "3d", {}, {})
    var node = result.get("node") as Node3D
    var ok := node != null and node.position.is_equal_approx(Vector3(1, 2, 3))
    return [
        {"name": "component/transform applied to Node3D", "passed": ok, "message": "got position %s" % (str(node.position) if node != null else "<null>")}
    ]
