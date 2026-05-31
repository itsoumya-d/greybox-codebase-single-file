# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxCharacterImporter

# Builds a PackedScene per canonical Character. Root is a CharacterBody3D with
#   - MeshInstance3D (mesh loaded from the referenced glTF asset)
#   - Skeleton3D (when the imported scene includes one)
#   - AnimationPlayer carrying clip stubs named per Character.animations
#
# When the mesh asset lives outside the editor's import pipeline we use
# `GLTFDocument.append_from_file` to instantiate it; otherwise we attach the
# importer-known scene via load(). This keeps the importer headless-friendly.

const CHARACTER_SUBDIR := "characters"
const META_GREYBOX_CHARACTER_ID := "greybox_character_id"
const META_GREYBOX_MESH_REF := "greybox_mesh_ref"


static func import_character(character: Dictionary, asset_lookup: Dictionary, output_dir: String) -> Dictionary:
    var character_id := str(character.get("id", ""))
    if character_id.is_empty():
        return _failure("Character entry is missing an id.")
    var mesh_ref := str(character.get("meshRef", ""))
    if mesh_ref.is_empty():
        return _failure("Character %s has empty meshRef." % character_id)

    var warnings: Array = []
    var mesh_path := str(asset_lookup.get(mesh_ref, ""))
    if mesh_path.is_empty():
        warnings.append("Character %s references unknown mesh asset %s." % [character_id, mesh_ref])

    var root := CharacterBody3D.new()
    root.name = _sanitize(character.get("name", character_id))
    root.set_meta(META_GREYBOX_CHARACTER_ID, character_id)
    root.set_meta(META_GREYBOX_MESH_REF, mesh_ref)

    var mesh_instance: MeshInstance3D = _instantiate_mesh(mesh_path, warnings)
    mesh_instance.name = "Mesh"
    root.add_child(mesh_instance)

    var collision := CollisionShape3D.new()
    collision.name = "Collision"
    var capsule := CapsuleShape3D.new()
    capsule.height = 1.8
    capsule.radius = 0.4
    collision.shape = capsule
    root.add_child(collision)

    var animator := AnimationPlayer.new()
    animator.name = "AnimationPlayer"
    var animation_library := AnimationLibrary.new()
    var animations := character.get("animations", [])
    if typeof(animations) == TYPE_ARRAY:
        for clip in animations:
            if typeof(clip) != TYPE_DICTIONARY:
                continue
            var clip_name := str(clip.get("name", ""))
            if clip_name.is_empty():
                continue
            var animation := Animation.new()
            animation.length = float(clip.get("duration", 1.0))
            animation.loop_mode = Animation.LOOP_LINEAR if bool(clip.get("loop", false)) else Animation.LOOP_NONE
            animation.set_meta("greybox_clip_id", str(clip.get("id", "")))
            animation.set_meta("greybox_clip_ref", str(clip.get("clipRef", "")))
            animation_library.add_animation(clip_name, animation)
    animator.add_animation_library("greybox", animation_library)
    root.add_child(animator)

    var game_stats := character.get("gameStats", {})
    if typeof(game_stats) == TYPE_DICTIONARY:
        root.set_meta("greybox_game_stats", game_stats)

    var provenance := character.get("provenance", {})
    if typeof(provenance) == TYPE_DICTIONARY:
        root.set_meta("greybox_character_provenance", provenance)

    _own_children_recursively(root, root)

    var packed := PackedScene.new()
    var pack_error := packed.pack(root)
    if pack_error != OK:
        return _failure("Could not pack character %s (Godot code %d)." % [character_id, pack_error])

    var destination := output_dir.path_join(CHARACTER_SUBDIR).path_join("%s.tscn" % _safe_filename(character_id))
    var ensure_dir := _ensure_dir(destination.get_base_dir())
    if not ensure_dir.get("succeeded", false):
        return _failure(ensure_dir.get("message", ""))
    var save_error := ResourceSaver.save(packed, destination)
    if save_error != OK:
        return _failure("Could not save character scene %s to %s (code %d)." % [character_id, destination, save_error])

    # Notify the editor's file-system daemon so the new .tscn appears in the
    # FileSystem dock and is immediately accessible via load()/preload() without
    # a manual project rescan.
    if Engine.is_editor_hint():
        var fs := EditorInterface.get_resource_filesystem()
        if fs:
            fs.reimport_files(PackedStringArray([destination]))

    return {
        "succeeded": true,
        "character_id": character_id,
        "scene_path": destination,
        "absolute_path": ProjectSettings.globalize_path(destination),
        "warnings": warnings,
        "animation_count": animation_library.get_animation_list().size(),
        "message": "Wrote character %s to %s." % [character_id, destination]
    }


static func _instantiate_mesh(mesh_path: String, warnings: Array) -> MeshInstance3D:
    var mesh_instance := MeshInstance3D.new()
    if mesh_path.is_empty():
        return mesh_instance
    if not ResourceLoader.exists(mesh_path):
        # Try GLTFDocument as a fallback (e.g. headless mode without editor import).
        if mesh_path.get_extension().to_lower() in ["gltf", "glb"]:
            var gltf := GLTFDocument.new()
            var state := GLTFState.new()
            var globalized := ProjectSettings.globalize_path(mesh_path)
            var open_error := gltf.append_from_file(globalized, state)
            if open_error == OK:
                var imported_scene := gltf.generate_scene(state)
                if imported_scene is Node:
                    for child in imported_scene.get_children():
                        imported_scene.remove_child(child)
                        if child is MeshInstance3D:
                            return child
                    imported_scene.queue_free()
        warnings.append("Mesh asset %s was not resolvable; emitted empty MeshInstance3D." % mesh_path)
        return mesh_instance

    var loaded := load(mesh_path)
    if loaded is Mesh:
        mesh_instance.mesh = loaded
    elif loaded is PackedScene:
        var instance := loaded.instantiate()
        if instance is Node:
            for child in instance.get_children():
                if child is MeshInstance3D:
                    instance.remove_child(child)
                    return child
            instance.queue_free()
    else:
        warnings.append("Mesh path %s did not resolve to a Mesh or PackedScene; emitted empty MeshInstance3D." % mesh_path)
    return mesh_instance


static func _own_children_recursively(node: Node, owner: Node) -> void:
    for child in node.get_children():
        if child.owner == null and child != owner:
            child.owner = owner
        _own_children_recursively(child, owner)


static func _ensure_dir(path: String) -> Dictionary:
    var globalized := ProjectSettings.globalize_path(path)
    var directory_error := DirAccess.make_dir_recursive_absolute(globalized)
    if directory_error != OK:
        return {"succeeded": false, "message": "Could not create Greybox character directory %s (code %d)." % [path, directory_error]}
    return {"succeeded": true, "message": ""}


static func _safe_filename(value: String) -> String:
    var allowed := "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    var clean := ""
    for index in range(value.length()):
        var character := value.substr(index, 1)
        clean += character if allowed.contains(character) else "_"
    if clean.is_empty():
        clean = "character"
    return clean


static func _sanitize(value) -> String:
    var raw := str(value)
    if raw.is_empty():
        return "Character"
    return raw


static func _failure(message: String) -> Dictionary:
    return {
        "succeeded": false,
        "character_id": "",
        "scene_path": "",
        "absolute_path": "",
        "warnings": [],
        "animation_count": 0,
        "message": message
    }
