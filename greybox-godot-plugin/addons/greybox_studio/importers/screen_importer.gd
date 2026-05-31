# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxScreenImporter

# Builds a PackedScene for one canonical Screen. The root node depends on whether
# the screen is UI-driven (Control + CanvasLayer) or world-driven (Node3D with
# default DirectionalLight3D and WorldEnvironment / sky stub).
#
# Returns a Dictionary with:
#   { succeeded, scene_path, screen_id, warnings, message }

const GreyboxComponentImporter := preload("res://addons/greybox_studio/importers/component_importer.gd")
const SCREEN_SUBDIR := "screens"
const UI_SCREEN_KINDS := ["main-menu", "pause", "game-over", "loading", "settings", "inventory", "shop", "credits"]
const GAMEPLAY_SCREEN_KINDS := ["gameplay", "cutscene"]


static func import_screen(screen: Dictionary, asset_lookup: Dictionary, character_lookup: Dictionary, output_dir: String) -> Dictionary:
    var screen_id := str(screen.get("id", ""))
    if screen_id.is_empty():
        return _failure("Screen entry is missing an id.")

    var screen_kind := str(screen.get("kind", "custom"))
    var resolved_root_kind := _resolve_root_kind(screen_kind)
    var warnings: Array = []

    var root: Node = _build_root(resolved_root_kind, screen, warnings)
    root.name = _sanitize(screen.get("name", screen_id))
    root.set_meta("greybox_screen_id", screen_id)
    root.set_meta("greybox_screen_kind", screen_kind)
    root.set_meta("greybox_root_kind", resolved_root_kind)

    var components_root := _components_root_node(root, resolved_root_kind)
    var parented_components := {}
    var components := screen.get("components", [])
    if typeof(components) == TYPE_ARRAY:
        for component in components:
            if typeof(component) != TYPE_DICTIONARY:
                continue
            var build_result: Dictionary = GreyboxComponentImporter.build_node(component, resolved_root_kind, asset_lookup, character_lookup)
            warnings.append_array(build_result.get("warnings", []))
            var node: Node = build_result.get("node")
            if node == null:
                continue
            parented_components[str(component.get("id", ""))] = {
                "node": node,
                "parent": component.get("parent")
            }

    # Reparent components according to their canonical `parent` ids.
    for component_id in parented_components.keys():
        var entry: Dictionary = parented_components[component_id]
        var parent_id = entry.get("parent")
        var node: Node = entry.get("node")
        var target_parent: Node = components_root
        if parent_id != null and str(parent_id).length() > 0 and parented_components.has(str(parent_id)):
            var candidate = parented_components[str(parent_id)].get("node")
            if candidate is Node:
                target_parent = _container_inner_or_self(candidate)
        target_parent.add_child(node)
        _own_children_recursively(node, root)

    _own_children_recursively(components_root, root)

    var packed := PackedScene.new()
    var pack_error := packed.pack(root)
    if pack_error != OK:
        return _failure("Could not pack screen %s (Godot code %d)." % [screen_id, pack_error])

    var destination := output_dir.path_join(SCREEN_SUBDIR).path_join("%s.tscn" % _safe_filename(screen_id))
    var ensure_dir := _ensure_dir(destination.get_base_dir())
    if not ensure_dir.get("succeeded", false):
        return _failure(ensure_dir.get("message", ""))

    var save_error := ResourceSaver.save(packed, destination)
    if save_error != OK:
        return _failure("Could not save Greybox screen %s to %s (code %d)." % [screen_id, destination, save_error])

    return {
        "succeeded": true,
        "screen_id": screen_id,
        "scene_path": destination,
        "absolute_path": ProjectSettings.globalize_path(destination),
        "kind": screen_kind,
        "root_kind": resolved_root_kind,
        "component_count": parented_components.size(),
        "warnings": warnings,
        "message": "Wrote screen %s to %s with %d components." % [screen_id, destination, parented_components.size()]
    }


static func _resolve_root_kind(screen_kind: String) -> String:
    if screen_kind in UI_SCREEN_KINDS:
        return "ui"
    if screen_kind in GAMEPLAY_SCREEN_KINDS:
        return "3d"
    return "ui"


static func _build_root(resolved_root_kind: String, screen: Dictionary, warnings: Array) -> Node:
    if resolved_root_kind == "3d":
        var root_3d := Node3D.new()
        var environment := WorldEnvironment.new()
        environment.name = "Environment"
        var env_resource := Environment.new()
        env_resource.background_mode = Environment.BG_SKY
        env_resource.sky = Sky.new()
        environment.environment = env_resource
        root_3d.add_child(environment)

        var light := DirectionalLight3D.new()
        light.name = "DefaultDirectionalLight"
        light.rotation_degrees = Vector3(-45.0, 30.0, 0.0)
        root_3d.add_child(light)
        _apply_background(root_3d, screen, warnings)
        return root_3d

    var root_ui := Control.new()
    root_ui.anchor_right = 1.0
    root_ui.anchor_bottom = 1.0
    var canvas := CanvasLayer.new()
    canvas.name = "CanvasLayer"
    root_ui.add_child(canvas)
    _apply_background(root_ui, screen, warnings)
    return root_ui


static func _components_root_node(root: Node, root_kind: String) -> Node:
    if root_kind == "3d":
        var components_root := Node3D.new()
        components_root.name = "Components"
        root.add_child(components_root)
        return components_root
    var ui_root := Control.new()
    ui_root.name = "Components"
    var canvas := root.get_node_or_null("CanvasLayer")
    if canvas:
        canvas.add_child(ui_root)
    else:
        root.add_child(ui_root)
    return ui_root


static func _container_inner_or_self(node: Node) -> Node:
    var inner := node.get_node_or_null("Inner")
    if inner is Node:
        return inner
    return node


static func _apply_background(root: Node, screen: Dictionary, warnings: Array) -> void:
    var background := screen.get("background")
    if typeof(background) != TYPE_DICTIONARY:
        return
    var background_type := str(background.get("type", ""))
    if background_type == "color":
        var color_value := str(background.get("color", ""))
        if root is Control:
            var color_rect := ColorRect.new()
            color_rect.name = "Background"
            color_rect.color = _safe_color(color_value)
            color_rect.anchor_right = 1.0
            color_rect.anchor_bottom = 1.0
            root.add_child(color_rect)
        elif root is Node3D:
            var env_node := root.get_node_or_null("Environment") as WorldEnvironment
            if env_node and env_node.environment:
                env_node.environment.background_mode = Environment.BG_COLOR
                env_node.environment.background_color = _safe_color(color_value)
    elif background_type == "asset":
        warnings.append("Background asset %s deferred (texture import not wired yet)." % str(background.get("assetRef", "")))


static func _safe_color(hex_string: String) -> Color:
    if not Color.html_is_valid(hex_string):
        return Color.BLACK
    return Color.html(hex_string)


static func _own_children_recursively(node: Node, owner: Node) -> void:
    for child in node.get_children():
        if child.owner == null and child != owner:
            child.owner = owner
        _own_children_recursively(child, owner)


static func _safe_filename(value: String) -> String:
    var allowed := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    var clean := ""
    for index in range(value.length()):
        var character := value.substr(index, 1)
        clean += character if allowed.contains(character) else "_"
    if clean.is_empty():
        clean = "screen"
    return clean


static func _sanitize(value) -> String:
    var raw := str(value)
    if raw.is_empty():
        return "Screen"
    return raw


static func _ensure_dir(path: String) -> Dictionary:
    var globalized := ProjectSettings.globalize_path(path)
    var directory_error := DirAccess.make_dir_recursive_absolute(globalized)
    if directory_error != OK:
        return {"succeeded": false, "message": "Could not create Greybox screen directory %s (code %d)." % [path, directory_error]}
    return {"succeeded": true, "message": ""}


static func _failure(message: String) -> Dictionary:
    return {
        "succeeded": false,
        "screen_id": "",
        "scene_path": "",
        "absolute_path": "",
        "kind": "",
        "root_kind": "",
        "component_count": 0,
        "warnings": [],
        "message": message
    }
