# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxComponentImporter

# Per-component-kind instantiator. Each `build_*` method receives the component
# dictionary (canonical schema shape) plus the resolved asset/character lookup
# dictionaries and returns a Node subtree.
#
# 19 supported kinds (matches @greybox/schema COMPONENT_KINDS):
#   UI    : Button, Image, Text, TextInput, ProgressBar, HUDBar, MenuList, Container
#   Game  : Character3DRef, GameObject, Spawner, Trigger, Pickup, Hazard, Checkpoint, Camera
#   3D    : Light, Particle, AudioSource
#
# Every emitted node is stamped via `set_meta("greybox_id", ...)` and
# `set_meta("greybox_kind", ...)` so the round-trip serializer can map nodes back
# to their canonical components.

const UI_KINDS := ["Button", "Image", "Text", "TextInput", "ProgressBar", "HUDBar", "MenuList", "Container"]
const META_GREYBOX_ID := "greybox_id"
const META_GREYBOX_KIND := "greybox_kind"
const META_GREYBOX_PROPERTIES := "greybox_properties"


static func build_node(component: Dictionary, screen_kind: String, asset_lookup: Dictionary, character_lookup: Dictionary) -> Dictionary:
    var kind := str(component.get("kind", ""))
    var component_id := str(component.get("id", ""))
    var node: Node = null
    var warnings: Array = []

    match kind:
        "Button":
            node = _build_button(component)
        "Image":
            node = _build_image(component, asset_lookup, warnings)
        "Text":
            node = _build_text(component)
        "TextInput":
            node = _build_text_input(component)
        "ProgressBar":
            node = _build_progress_bar(component)
        "HUDBar":
            node = _build_hud_bar(component)
        "MenuList":
            node = _build_menu_list(component)
        "Container":
            node = _build_container(component)
        "Character3DRef":
            node = _build_character_3d_ref(component, character_lookup, warnings)
        "GameObject":
            node = _build_game_object(component, asset_lookup, warnings)
        "Spawner":
            node = _build_marker_area(component, "Spawner")
        "Trigger":
            node = _build_marker_area(component, "Trigger")
        "Pickup":
            node = _build_marker_area(component, "Pickup")
        "Hazard":
            node = _build_marker_area(component, "Hazard")
        "Checkpoint":
            node = _build_marker_area(component, "Checkpoint")
        "Camera":
            node = _build_camera(component, screen_kind)
        "Light":
            node = _build_light(component)
        "Particle":
            node = _build_particle(component)
        "AudioSource":
            node = _build_audio_source(component, asset_lookup, warnings)
        _:
            warnings.append("Unknown component kind: %s" % kind)
            node = _placeholder_node(component, kind)

    if node == null:
        node = _placeholder_node(component, kind)
        warnings.append("Builder returned null for component %s; using placeholder." % component_id)

    _apply_common(node, component)
    return {
        "succeeded": true,
        "node": node,
        "kind": kind,
        "component_id": component_id,
        "warnings": warnings
    }


static func is_ui_kind(kind: String) -> bool:
    return kind in UI_KINDS


# -- UI builders --------------------------------------------------------------------------------

static func _build_button(component: Dictionary) -> Button:
    var node := Button.new()
    node.text = str(component.get("label", component.get("name", "Button")))
    return node


static func _build_image(component: Dictionary, asset_lookup: Dictionary, warnings: Array) -> TextureRect:
    var node := TextureRect.new()
    var asset_id := str(component.get("assetRef", ""))
    if not asset_id.is_empty():
        var path := str(asset_lookup.get(asset_id, ""))
        if not path.is_empty():
            node.set_meta("greybox_texture_path", path)
        else:
            warnings.append("Image component %s references missing asset %s." % [component.get("id", ""), asset_id])
    node.expand_mode = TextureRect.EXPAND_FIT_WIDTH_PROPORTIONAL
    return node


static func _build_text(component: Dictionary) -> Label:
    var node := Label.new()
    node.text = str(component.get("content", component.get("name", "Text")))
    var font_size = component.get("fontSize")
    if font_size != null:
        node.add_theme_font_size_override("font_size", int(font_size))
    var color_value := str(component.get("color", ""))
    if color_value.begins_with("#"):
        node.add_theme_color_override("font_color", _parse_hex_color(color_value))
    return node


static func _build_text_input(component: Dictionary) -> LineEdit:
    var node := LineEdit.new()
    var placeholder := str(component.get("placeholder", ""))
    if not placeholder.is_empty():
        node.placeholder_text = placeholder
    var max_length = component.get("maxLength")
    if max_length != null:
        node.max_length = int(max_length)
    var input_type := str(component.get("inputType", "text"))
    if input_type == "password":
        node.secret = true
    return node


static func _build_progress_bar(component: Dictionary) -> ProgressBar:
    var node := ProgressBar.new()
    node.min_value = float(component.get("min", 0.0))
    node.max_value = float(component.get("max", 1.0))
    node.value = float(component.get("value", 0.0))
    return node


static func _build_hud_bar(component: Dictionary) -> ProgressBar:
    var node := ProgressBar.new()
    node.min_value = 0.0
    node.max_value = 1.0
    node.value = 1.0
    node.set_meta("greybox_stat_key", str(component.get("statKey", "")))
    node.set_meta("greybox_hud_style", str(component.get("style", "bar")))
    return node


static func _build_menu_list(component: Dictionary) -> VBoxContainer:
    var node := VBoxContainer.new()
    var items := component.get("items", [])
    if typeof(items) == TYPE_ARRAY:
        for item in items:
            if typeof(item) != TYPE_DICTIONARY:
                continue
            var entry := Button.new()
            entry.text = str(item.get("label", ""))
            entry.name = "Item_%s" % str(item.get("id", "x"))
            var event := str(item.get("event", ""))
            if not event.is_empty():
                entry.set_meta("greybox_event_id", event)
            node.add_child(entry)
    return node


static func _build_container(component: Dictionary) -> PanelContainer:
    var node := PanelContainer.new()
    var layout := str(component.get("layout", "absolute"))
    var inner: Node = null
    match layout:
        "stack-vertical":
            inner = VBoxContainer.new()
        "stack-horizontal":
            inner = HBoxContainer.new()
        "grid":
            inner = GridContainer.new()
        _:
            inner = Control.new()
    inner.name = "Inner"
    var gap = component.get("gap")
    if gap != null and inner.has_method("add_theme_constant_override"):
        inner.add_theme_constant_override("separation", int(gap))
    node.add_child(inner)
    return node


# -- Game / 3D builders -------------------------------------------------------------------------

static func _build_character_3d_ref(component: Dictionary, character_lookup: Dictionary, warnings: Array) -> CharacterBody3D:
    var node := CharacterBody3D.new()
    var mesh := MeshInstance3D.new()
    mesh.name = "Mesh"
    node.add_child(mesh)

    var animator := AnimationPlayer.new()
    animator.name = "Animator"
    node.add_child(animator)

    var character_id := str(component.get("characterRef", ""))
    if not character_id.is_empty():
        var scene_path := str(character_lookup.get(character_id, ""))
        if not scene_path.is_empty():
            node.set_meta("greybox_character_scene", scene_path)
        else:
            warnings.append("Character3DRef component %s references missing character %s." % [component.get("id", ""), character_id])
    var initial_anim := str(component.get("initialAnimation", ""))
    if not initial_anim.is_empty():
        node.set_meta("greybox_initial_animation", initial_anim)
    return node


static func _build_game_object(component: Dictionary, asset_lookup: Dictionary, warnings: Array) -> StaticBody3D:
    var node := StaticBody3D.new()
    var mesh := MeshInstance3D.new()
    mesh.name = "Mesh"
    node.add_child(mesh)
    var prefab_id := str(component.get("prefabRef", ""))
    if not prefab_id.is_empty():
        var prefab_path := str(asset_lookup.get(prefab_id, ""))
        if not prefab_path.is_empty():
            node.set_meta("greybox_prefab_path", prefab_path)
        else:
            warnings.append("GameObject %s references missing prefab asset %s." % [component.get("id", ""), prefab_id])
    return node


static func _build_marker_area(component: Dictionary, kind_label: String) -> Marker3D:
    var marker := Marker3D.new()
    var area := Area3D.new()
    area.name = "Area"
    var collision := CollisionShape3D.new()
    collision.name = "CollisionShape"
    collision.shape = BoxShape3D.new()
    area.add_child(collision)
    marker.add_child(area)
    marker.set_meta(META_GREYBOX_KIND, kind_label)
    var event_id := str(component.get("eventId", ""))
    if not event_id.is_empty():
        marker.set_meta("greybox_event_id", event_id)
    var shape := str(component.get("shape", ""))
    if not shape.is_empty():
        marker.set_meta("greybox_volume_shape", shape)
    var grant_stat := str(component.get("grantStat", ""))
    if not grant_stat.is_empty():
        marker.set_meta("greybox_grant_stat", grant_stat)
    var checkpoint_id := str(component.get("checkpointId", ""))
    if not checkpoint_id.is_empty():
        marker.set_meta("greybox_checkpoint_id", checkpoint_id)
    return marker


static func _build_camera(component: Dictionary, screen_kind: String) -> Node:
    if screen_kind == "ui" or screen_kind == "main-menu" or screen_kind == "pause" or screen_kind == "loading":
        var cam2d := Camera2D.new()
        cam2d.enabled = bool(component.get("isMain", false))
        return cam2d
    var cam3d := Camera3D.new()
    var fov = component.get("fov")
    if fov != null:
        cam3d.fov = float(fov)
    if str(component.get("projection", "perspective")) == "orthographic":
        cam3d.projection = Camera3D.PROJECTION_ORTHOGONAL
    cam3d.current = bool(component.get("isMain", false))
    return cam3d


static func _build_light(component: Dictionary) -> Light3D:
    var light_type := str(component.get("lightType", "point"))
    var node: Light3D
    match light_type:
        "directional":
            node = DirectionalLight3D.new()
        "spot":
            node = SpotLight3D.new()
        _:
            node = OmniLight3D.new()
    var color_value := str(component.get("color", "#ffffff"))
    node.light_color = _parse_hex_color(color_value)
    node.light_energy = float(component.get("intensity", 1.0))
    node.shadow_enabled = bool(component.get("castsShadows", true))
    return node


static func _build_particle(component: Dictionary) -> GPUParticles3D:
    var node := GPUParticles3D.new()
    node.emitting = bool(component.get("autoPlay", true))
    if bool(component.get("loop", true)):
        node.one_shot = false
    else:
        node.one_shot = true
    return node


static func _build_audio_source(component: Dictionary, asset_lookup: Dictionary, warnings: Array) -> Node:
    var spatial := bool(component.get("spatial", true))
    var node: Node
    if spatial:
        node = AudioStreamPlayer3D.new()
    else:
        node = AudioStreamPlayer.new()
    var volume := float(component.get("volume", 1.0))
    if spatial:
        node.volume_db = linear_to_db(max(volume, 0.0001))
    else:
        node.volume_db = linear_to_db(max(volume, 0.0001))
    node.set_meta("greybox_volume_linear", volume)
    node.set_meta("greybox_loop", bool(component.get("loop", false)))
    node.set_meta("greybox_autoplay", bool(component.get("autoPlay", false)))
    var clip_id := str(component.get("clipRef", ""))
    if not clip_id.is_empty():
        var clip_path := str(asset_lookup.get(clip_id, ""))
        if not clip_path.is_empty():
            node.set_meta("greybox_clip_path", clip_path)
        else:
            warnings.append("AudioSource component %s references missing clip asset %s." % [component.get("id", ""), clip_id])
    return node


# -- Helpers ------------------------------------------------------------------------------------

static func _apply_common(node: Node, component: Dictionary) -> void:
    var component_id := str(component.get("id", ""))
    var component_name := str(component.get("name", component_id))
    if not component_name.is_empty():
        node.name = _sanitize_node_name(component_name)
    node.set_meta(META_GREYBOX_ID, component_id)
    node.set_meta(META_GREYBOX_KIND, str(component.get("kind", "")))

    var properties = component.get("properties")
    if typeof(properties) == TYPE_DICTIONARY and not properties.is_empty():
        node.set_meta(META_GREYBOX_PROPERTIES, properties)

    var transform := component.get("transform", {})
    if typeof(transform) == TYPE_DICTIONARY:
        _apply_transform(node, transform)

    var visible = component.get("visible")
    if visible != null and node is CanvasItem:
        node.visible = bool(visible)
    elif visible != null and node is Node3D:
        node.visible = bool(visible)


static func _apply_transform(node: Node, transform: Dictionary) -> void:
    var position := transform.get("position", {})
    var rotation := transform.get("rotation", {})
    var scale := transform.get("scale", {})
    if node is Node3D:
        var node_3d := node as Node3D
        node_3d.position = Vector3(
            float(position.get("x", 0.0)),
            float(position.get("y", 0.0)),
            float(position.get("z", 0.0))
        )
        node_3d.rotation_degrees = Vector3(
            float(rotation.get("x", 0.0)),
            float(rotation.get("y", 0.0)),
            float(rotation.get("z", 0.0))
        )
        node_3d.scale = Vector3(
            float(scale.get("x", 1.0)),
            float(scale.get("y", 1.0)),
            float(scale.get("z", 1.0))
        )
    elif node is Control:
        var control := node as Control
        control.position = Vector2(float(position.get("x", 0.0)), float(position.get("y", 0.0)))
        var sx := float(scale.get("x", 1.0))
        var sy := float(scale.get("y", 1.0))
        control.scale = Vector2(sx, sy)
        control.rotation_degrees = float(rotation.get("z", 0.0))
    elif node is Node2D:
        var node_2d := node as Node2D
        node_2d.position = Vector2(float(position.get("x", 0.0)), float(position.get("y", 0.0)))
        node_2d.rotation_degrees = float(rotation.get("z", 0.0))
        node_2d.scale = Vector2(float(scale.get("x", 1.0)), float(scale.get("y", 1.0)))


static func _parse_hex_color(value: String) -> Color:
    var clean := value
    if clean.begins_with("#"):
        clean = clean.substr(1)
    return Color.html("#" + clean) if Color.html_is_valid("#" + clean) else Color.WHITE


static func _placeholder_node(component: Dictionary, kind: String) -> Node:
    var node := Node.new()
    node.set_meta("greybox_placeholder", true)
    node.set_meta(META_GREYBOX_KIND, kind)
    var component_id := str(component.get("id", ""))
    node.name = "Unsupported_%s" % _sanitize_node_name(component_id)
    return node


static func _sanitize_node_name(value: String) -> String:
    var clean := ""
    for index in range(value.length()):
        var character := value.substr(index, 1)
        if character == "/" or character == ":" or character == "@" or character == "$" or character == "%":
            clean += "_"
        else:
            clean += character
    if clean.is_empty():
        clean = "Component"
    return clean
