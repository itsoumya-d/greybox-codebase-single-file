# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxArtifactImporters

static func build_gameview_plan_json(source_json: String, source_path: String, destination_path: String) -> String:
    var document := JSON.parse_string(source_json)
    if typeof(document) != TYPE_DICTIONARY:
        return ""
    var actor_count := _array_count(document, "actors")
    var spawn_point_count := _array_count(document, "spawnPoints")
    var objective_count := _array_count(document, "objectives")
    var hazard_count := _array_count(document, "hazards")
    var plan := _base_plan("gameview", source_path, destination_path)
    plan["title"] = str(document.get("title", ""))
    plan["primary_object_count"] = actor_count + spawn_point_count + objective_count + hazard_count
    plan["actor_count"] = actor_count
    plan["spawn_point_count"] = spawn_point_count
    plan["objective_count"] = objective_count
    plan["hazard_count"] = hazard_count
    plan["output"] = "Scene tree plus PackedScene placement plan"
    return JSON.stringify(plan, "\t")


static func build_art_bible_plan_json(source_markdown: String, source_path: String, destination_path: String) -> String:
    var color_count := _regex_count(source_markdown, "#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?")
    var plan := _base_plan("art-bible", source_path, destination_path)
    plan["primary_object_count"] = color_count
    plan["color_count"] = color_count
    plan["section_count"] = _regex_count(source_markdown, "(?m)^#{1,3} ")
    plan["output"] = "Resource palette and material guidance plan"
    return JSON.stringify(plan, "\t")


static func build_hud_plan_json(source_html: String, source_path: String, destination_path: String) -> String:
    var slot_count := source_html.count("data-agds-id")
    var plan := _base_plan("hud-layout", source_path, destination_path)
    plan["primary_object_count"] = slot_count
    plan["slot_count"] = slot_count
    plan["panel_count"] = source_html.count("data-greybox-artifact")
    plan["output"] = "Control scene plan"
    return JSON.stringify(plan, "\t")


static func build_level_board_plan_json(source_json: String, source_path: String, destination_path: String) -> String:
    var document := JSON.parse_string(source_json)
    if typeof(document) != TYPE_DICTIONARY:
        return ""
    var room_count := _array_count(document, "rooms")
    var encounter_count := _array_count(document, "encounters")
    var connection_count := _array_count(document, "connections")
    var plan := _base_plan("level-board", source_path, destination_path)
    plan["title"] = str(document.get("title", ""))
    plan["primary_object_count"] = room_count + encounter_count + connection_count
    plan["room_count"] = room_count
    plan["encounter_count"] = encounter_count
    plan["connection_count"] = connection_count
    plan["output"] = "TileMap or Node2D level layout plan"
    return JSON.stringify(plan, "\t")


static func import_gameview_json(source_path: String, destination_path: String) -> Dictionary:
    # Write the import plan first (existing behaviour).
    var plan_result := _import_plan(source_path, destination_path, ".gameview.json scene tree", Callable(GreyboxArtifactImporters, "build_gameview_plan_json"))
    if not plan_result.get("succeeded", false):
        return plan_result

    # Materialize the scene on disk.
    var file := FileAccess.open(source_path, FileAccess.READ)
    if file == null:
        return _fail_with(plan_result, "Could not re-open .gameview.json source: %s." % source_path)
    var source_body := file.get_as_text()
    file.close()

    var data = JSON.parse_string(source_body)
    if typeof(data) != TYPE_DICTIONARY:
        return _fail_with(plan_result, ".gameview.json did not parse as an object.")

    var root := Node3D.new()
    root.name = str(data.get("title", "GameView")).strip_edges()
    if root.name.is_empty():
        root.name = "GameView"
    root.set_meta("greybox_game_id", str(data.get("gameId", "")))

    var viewport_data = data.get("viewport", {})
    if typeof(viewport_data) == TYPE_DICTIONARY:
        root.set_meta("greybox_viewport_width", int(viewport_data.get("width", 1920)))
        root.set_meta("greybox_viewport_height", int(viewport_data.get("height", 1080)))
        root.set_meta("greybox_viewport_camera", str(viewport_data.get("camera", "top-down")))

    # Factions metadata.
    var factions = data.get("factions", [])
    if typeof(factions) == TYPE_ARRAY and not factions.is_empty():
        root.set_meta("greybox_factions", factions)

    # Actors container.
    var actors_container := Node3D.new()
    actors_container.name = "Actors"
    root.add_child(actors_container)
    var actor_count := 0
    var actors = data.get("actors", [])
    if typeof(actors) == TYPE_ARRAY:
        for actor_data in actors:
            if typeof(actor_data) != TYPE_DICTIONARY:
                continue
            var actor_node := _build_actor_node(actor_data)
            actors_container.add_child(actor_node)
            actor_node.owner = root
            actor_count += 1

    # Spawn points.
    var spawn_points_container := Node3D.new()
    spawn_points_container.name = "SpawnPoints"
    root.add_child(spawn_points_container)
    var spawn_points = data.get("spawnPoints", [])
    if typeof(spawn_points) == TYPE_ARRAY:
        for sp_data in spawn_points:
            if typeof(sp_data) != TYPE_DICTIONARY:
                continue
            var sp_node := Marker3D.new()
            sp_node.name = str(sp_data.get("name", "SpawnPoint")).strip_edges()
            if sp_node.name.is_empty():
                sp_node.name = "SpawnPoint"
            var sp_pos = sp_data.get("position", {})
            if typeof(sp_pos) == TYPE_DICTIONARY:
                sp_node.position = Vector3(
                    float(sp_pos.get("x", 0.0)),
                    float(sp_pos.get("y", 0.0)),
                    float(sp_pos.get("z", 0.0))
                )
            sp_node.set_meta("greybox_id", str(sp_data.get("id", "")))
            sp_node.set_meta("greybox_type", "spawn")
            if sp_data.has("factionId"):
                sp_node.set_meta("greybox_faction_id", str(sp_data.get("factionId", "")))
            spawn_points_container.add_child(sp_node)
            sp_node.owner = root

    # Objectives.
    var objectives_container := Node3D.new()
    objectives_container.name = "Objectives"
    root.add_child(objectives_container)
    var objectives = data.get("objectives", [])
    if typeof(objectives) == TYPE_ARRAY:
        for obj_data in objectives:
            if typeof(obj_data) != TYPE_DICTIONARY:
                continue
            var obj_node := Marker3D.new()
            obj_node.name = str(obj_data.get("name", "Objective")).strip_edges()
            if obj_node.name.is_empty():
                obj_node.name = "Objective"
            var obj_pos = obj_data.get("position", {})
            if typeof(obj_pos) == TYPE_DICTIONARY:
                obj_node.position = Vector3(
                    float(obj_pos.get("x", 0.0)),
                    float(obj_pos.get("y", 0.0)),
                    float(obj_pos.get("z", 0.0))
                )
            obj_node.set_meta("greybox_id", str(obj_data.get("id", "")))
            obj_node.set_meta("greybox_type", "objective")
            if obj_data.has("description"):
                obj_node.set_meta("greybox_description", str(obj_data.get("description", "")))
            objectives_container.add_child(obj_node)
            obj_node.owner = root

    # Hazards.
    var hazards_container := Node3D.new()
    hazards_container.name = "Hazards"
    root.add_child(hazards_container)
    var hazards = data.get("hazards", [])
    if typeof(hazards) == TYPE_ARRAY:
        for hz_data in hazards:
            if typeof(hz_data) != TYPE_DICTIONARY:
                continue
            var hz_node := Area3D.new()
            hz_node.name = str(hz_data.get("name", "Hazard")).strip_edges()
            if hz_node.name.is_empty():
                hz_node.name = "Hazard"
            var hz_pos = hz_data.get("position", {})
            if typeof(hz_pos) == TYPE_DICTIONARY:
                hz_node.position = Vector3(
                    float(hz_pos.get("x", 0.0)),
                    float(hz_pos.get("y", 0.0)),
                    float(hz_pos.get("z", 0.0))
                )
            var collision := CollisionShape3D.new()
            collision.name = "CollisionShape"
            collision.shape = SphereShape3D.new()
            hz_node.add_child(collision)
            collision.owner = root
            hz_node.set_meta("greybox_id", str(hz_data.get("id", "")))
            hz_node.set_meta("greybox_type", "hazard")
            if hz_data.has("damage"):
                hz_node.set_meta("greybox_damage", float(hz_data.get("damage", 0.0)))
            hazards_container.add_child(hz_node)
            hz_node.owner = root

    actors_container.owner = root
    spawn_points_container.owner = root
    objectives_container.owner = root
    hazards_container.owner = root

    # Ensure all descendants are owned by root so PackedScene.pack() captures them.
    _own_children_recursively(root, root)

    var packed := PackedScene.new()
    var pack_error := packed.pack(root)
    if pack_error != OK:
        return _fail_with(plan_result, "Could not pack .gameview.json scene (code %d)." % pack_error)

    var scene_path := destination_path
    if scene_path.get_extension().is_empty() or scene_path.get_extension() != "tscn":
        scene_path = scene_path.get_basename() + ".tscn"
    var scene_dir := scene_path.get_base_dir()
    var dir_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(scene_dir))
    if dir_error != OK:
        return _fail_with(plan_result, "Could not create scene directory %s (code %d)." % [scene_dir, dir_error])

    var save_error := ResourceSaver.save(packed, scene_path)
    if save_error != OK:
        return _fail_with(plan_result, "Could not save .gameview.json scene to %s (code %d)." % [scene_path, save_error])

    plan_result["actor_count"] = actor_count
    plan_result["scene_path"] = scene_path
    plan_result["message"] = "Materialized .gameview.json with %d actors into %s." % [actor_count, scene_path]
    return plan_result


static func _build_actor_node(actor_data: Dictionary) -> Node3D:
    var actor_type := str(actor_data.get("type", "prop"))
    var node: Node3D
    match actor_type:
        "player":
            node = CharacterBody3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = CapsuleShape3D.new()
            node.add_child(collision)
        "enemy", "npc":
            node = CharacterBody3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = CapsuleShape3D.new()
            node.add_child(collision)
        "spawn":
            node = Marker3D.new()
        "trigger":
            var area := Area3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = BoxShape3D.new()
            area.add_child(collision)
            node = area
        "hazard":
            var area := Area3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = SphereShape3D.new()
            area.add_child(collision)
            node = area
        _:  # prop and everything else
            node = StaticBody3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = BoxShape3D.new()
            node.add_child(collision)

    var actor_name := str(actor_data.get("name", "Actor")).strip_edges()
    node.name = actor_name if not actor_name.is_empty() else "Actor"

    var pos = actor_data.get("position", {})
    if typeof(pos) == TYPE_DICTIONARY:
        node.position = Vector3(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)), float(pos.get("z", 0.0)))

    var rot = actor_data.get("rotation", {})
    if typeof(rot) == TYPE_DICTIONARY:
        node.rotation_degrees = Vector3(float(rot.get("x", 0.0)), float(rot.get("y", 0.0)), float(rot.get("z", 0.0)))

    var scl = actor_data.get("scale", {})
    if typeof(scl) == TYPE_DICTIONARY:
        node.scale = Vector3(float(scl.get("x", 1.0)), float(scl.get("y", 1.0)), float(scl.get("z", 1.0)))

    # Add a box mesh placeholder for visible actors (not spawn/trigger).
    if actor_type not in ["spawn", "trigger"]:
        var mesh_instance := MeshInstance3D.new()
        mesh_instance.name = "Mesh"
        mesh_instance.mesh = BoxMesh.new()
        node.add_child(mesh_instance)

    node.set_meta("greybox_id", str(actor_data.get("id", "")))
    node.set_meta("greybox_type", actor_type)
    if actor_data.has("meshAssetPath") and actor_data.get("meshAssetPath") != null:
        node.set_meta("greybox_mesh_asset_path", str(actor_data.get("meshAssetPath", "")))
    if actor_data.has("factionId"):
        node.set_meta("greybox_faction_id", str(actor_data.get("factionId", "")))
    return node


static func import_art_bible_markdown(source_path: String, destination_path: String) -> Dictionary:
    return _import_plan(source_path, destination_path, "DESIGN.md art-bible Resource", Callable(GreyboxArtifactImporters, "build_art_bible_plan_json"))


static func import_hud_html(source_path: String, destination_path: String) -> Dictionary:
    return _import_plan(source_path, destination_path, "HUD HTML Control scene", Callable(GreyboxArtifactImporters, "build_hud_plan_json"))


static func import_level_board_json(source_path: String, destination_path: String) -> Dictionary:
    # Write the import plan first (existing behaviour).
    var plan_result := _import_plan(source_path, destination_path, "level board JSON TileMap scene", Callable(GreyboxArtifactImporters, "build_level_board_plan_json"))
    if not plan_result.get("succeeded", false):
        return plan_result

    var file := FileAccess.open(source_path, FileAccess.READ)
    if file == null:
        return _fail_with(plan_result, "Could not re-open .levelboard.json source: %s." % source_path)
    var source_body := file.get_as_text()
    file.close()

    var data = JSON.parse_string(source_body)
    if typeof(data) != TYPE_DICTIONARY:
        return _fail_with(plan_result, ".levelboard.json did not parse as an object.")

    var root := Node3D.new()
    root.name = str(data.get("title", "LevelBoard")).strip_edges()
    if root.name.is_empty():
        root.name = "LevelBoard"
    root.set_meta("greybox_artifact_kind", "level-board")

    var room_count := 0
    var tile_count := 0

    var rooms = data.get("rooms", [])
    if typeof(rooms) == TYPE_ARRAY:
        for room_data in rooms:
            if typeof(room_data) != TYPE_DICTIONARY:
                continue
            var room_node := Node3D.new()
            var room_name := str(room_data.get("name", "Room")).strip_edges()
            room_node.name = room_name if not room_name.is_empty() else "Room"
            room_node.set_meta("greybox_room_id", str(room_data.get("id", "")))

            # Connections metadata.
            var connections = room_data.get("connections", [])
            if typeof(connections) == TYPE_ARRAY and not connections.is_empty():
                room_node.set_meta("greybox_connections", connections)

            # Tiles.
            var tiles_container := Node3D.new()
            tiles_container.name = "Tiles"
            room_node.add_child(tiles_container)

            var tiles = room_data.get("tiles", [])
            if typeof(tiles) == TYPE_ARRAY:
                for tile_data in tiles:
                    if typeof(tile_data) != TYPE_DICTIONARY:
                        continue
                    var tile_node := _build_tile_node(tile_data)
                    tiles_container.add_child(tile_node)
                    tile_node.owner = root
                    tile_count += 1
            tiles_container.owner = root

            # Encounters.
            var encounters = room_data.get("encounters", [])
            if typeof(encounters) == TYPE_ARRAY and not encounters.is_empty():
                var encounters_container := Node3D.new()
                encounters_container.name = "Encounters"
                room_node.add_child(encounters_container)
                for enc_data in encounters:
                    if typeof(enc_data) != TYPE_DICTIONARY:
                        continue
                    var enc_node := Marker3D.new()
                    var enc_name := str(enc_data.get("name", "Encounter")).strip_edges()
                    enc_node.name = enc_name if not enc_name.is_empty() else "Encounter"
                    enc_node.set_meta("greybox_id", str(enc_data.get("id", "")))
                    enc_node.set_meta("greybox_type", "encounter")
                    if enc_data.has("enemyType"):
                        enc_node.set_meta("greybox_enemy_type", str(enc_data.get("enemyType", "")))
                    if enc_data.has("count"):
                        enc_node.set_meta("greybox_enemy_count", int(enc_data.get("count", 1)))
                    var enc_pos = enc_data.get("position", {})
                    if typeof(enc_pos) == TYPE_DICTIONARY:
                        enc_node.position = Vector3(
                            float(enc_pos.get("x", 0.0)),
                            float(enc_pos.get("y", 0.0)),
                            float(enc_pos.get("z", 0.0))
                        )
                    encounters_container.add_child(enc_node)
                    enc_node.owner = root
                encounters_container.owner = root

            root.add_child(room_node)
            room_node.owner = root
            room_count += 1

    # Ensure all descendants are owned by root so PackedScene.pack() captures them.
    _own_children_recursively(root, root)

    var packed := PackedScene.new()
    var pack_error := packed.pack(root)
    if pack_error != OK:
        return _fail_with(plan_result, "Could not pack .levelboard.json scene (code %d)." % pack_error)

    var scene_path := destination_path
    if scene_path.get_extension().is_empty() or scene_path.get_extension() != "tscn":
        scene_path = scene_path.get_basename() + ".tscn"
    var scene_dir := scene_path.get_base_dir()
    var dir_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(scene_dir))
    if dir_error != OK:
        return _fail_with(plan_result, "Could not create scene directory %s (code %d)." % [scene_dir, dir_error])

    var save_error := ResourceSaver.save(packed, scene_path)
    if save_error != OK:
        return _fail_with(plan_result, "Could not save .levelboard.json scene to %s (code %d)." % [scene_path, save_error])

    plan_result["room_count"] = room_count
    plan_result["tile_count"] = tile_count
    plan_result["scene_path"] = scene_path
    plan_result["message"] = "Materialized .levelboard.json with %d rooms and %d tiles into %s." % [room_count, tile_count, scene_path]
    return plan_result


static func _build_tile_node(tile_data: Dictionary) -> Node3D:
    var tile_type := str(tile_data.get("type", "floor"))
    var node: Node3D

    match tile_type:
        "wall":
            var body := StaticBody3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = BoxShape3D.new()
            body.add_child(collision)
            var mesh := MeshInstance3D.new()
            mesh.name = "Mesh"
            var box := BoxMesh.new()
            mesh.mesh = box
            var material := StandardMaterial3D.new()
            material.albedo_color = Color(0.3, 0.3, 0.3)
            mesh.set_surface_override_material(0, material)
            body.add_child(mesh)
            node = body
        "door":
            var area := Area3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = BoxShape3D.new()
            area.add_child(collision)
            var mesh := MeshInstance3D.new()
            mesh.name = "Mesh"
            mesh.mesh = BoxMesh.new()
            var material := StandardMaterial3D.new()
            material.albedo_color = Color(0.9, 0.8, 0.1)
            mesh.set_surface_override_material(0, material)
            area.add_child(mesh)
            area.set_meta("greybox_tile_type", "door")
            node = area
        "hazard":
            var area := Area3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = BoxShape3D.new()
            area.add_child(collision)
            var mesh := MeshInstance3D.new()
            mesh.name = "Mesh"
            mesh.mesh = BoxMesh.new()
            var material := StandardMaterial3D.new()
            material.albedo_color = Color(0.8, 0.1, 0.1)
            mesh.set_surface_override_material(0, material)
            area.add_child(mesh)
            area.set_meta("greybox_tile_type", "hazard")
            node = area
        _:  # floor and anything else
            var body := StaticBody3D.new()
            var collision := CollisionShape3D.new()
            collision.name = "Collision"
            collision.shape = BoxShape3D.new()
            body.add_child(collision)
            var mesh := MeshInstance3D.new()
            mesh.name = "Mesh"
            mesh.mesh = BoxMesh.new()
            var material := StandardMaterial3D.new()
            material.albedo_color = Color(0.6, 0.6, 0.6)
            mesh.set_surface_override_material(0, material)
            body.add_child(mesh)
            node = body

    node.name = "Tile_%s" % tile_type
    node.set_meta("greybox_tile_type", tile_type)

    var walkable = tile_data.get("walkable")
    if walkable != null:
        node.set_meta("greybox_walkable", bool(walkable))

    var pos = tile_data.get("position", {})
    if typeof(pos) == TYPE_DICTIONARY:
        node.position = Vector3(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)), float(pos.get("z", 0.0)))

    return node


static func _import_plan(source_path: String, destination_path: String, kind: String, builder: Callable) -> Dictionary:
    if not FileAccess.file_exists(source_path):
        return {
            "succeeded": false,
            "asset_path": destination_path,
            "plan_path": _destination_plan_path(destination_path),
            "primary_object_count": 0,
            "message": "Greybox %s source file is missing: %s." % [kind, source_path]
        }

    var file := FileAccess.open(source_path, FileAccess.READ)
    if file == null:
        return {
            "succeeded": false,
            "asset_path": destination_path,
            "plan_path": _destination_plan_path(destination_path),
            "primary_object_count": 0,
            "message": "Greybox %s source file is unreadable: %s." % [kind, source_path]
        }

    var source_body := file.get_as_text()
    file.close()
    var plan_json := str(builder.call(source_body, source_path, destination_path))
    if plan_json.is_empty():
        return {
            "succeeded": false,
            "asset_path": destination_path,
            "plan_path": _destination_plan_path(destination_path),
            "primary_object_count": 0,
            "message": "Greybox %s source could not be parsed into a Godot import plan: %s." % [kind, source_path]
        }

    var plan_path := _destination_plan_path(destination_path)
    var plan_dir := plan_path.get_base_dir()
    var directory_error := DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(plan_dir))
    if directory_error != OK:
        return {
            "succeeded": false,
            "asset_path": destination_path,
            "plan_path": plan_path,
            "primary_object_count": 0,
            "message": "Could not create Greybox Godot import-plan directory: %d." % directory_error
        }

    var output := FileAccess.open(plan_path, FileAccess.WRITE)
    if output == null:
        return {
            "succeeded": false,
            "asset_path": destination_path,
            "plan_path": plan_path,
            "primary_object_count": 0,
            "message": "Could not write Greybox Godot import plan to %s." % plan_path
        }
    output.store_string(plan_json)
    output.close()

    var parsed_plan := JSON.parse_string(plan_json)
    return {
        "succeeded": true,
        "asset_path": destination_path,
        "plan_path": plan_path,
        "primary_object_count": int(parsed_plan.get("primary_object_count", 0)) if typeof(parsed_plan) == TYPE_DICTIONARY else 0,
        "message": "Wrote Greybox %s Godot import plan to %s." % [kind, plan_path]
    }


static func _base_plan(kind: String, source_path: String, destination_path: String) -> Dictionary:
    return {
        "generator": "Greybox",
        "kind": kind,
        "source_path": source_path,
        "destination_path": destination_path,
        "godot_target": "Editor import plan"
    }


static func _destination_plan_path(destination_path: String) -> String:
    var clean := destination_path.strip_edges()
    if clean.is_empty():
        return "user://greybox/import-plans/greybox-import.greybox-plan.json"
    return clean.get_basename() + ".greybox-plan.json"


static func _array_count(document: Dictionary, key: String) -> int:
    var value = document.get(key, [])
    return value.size() if typeof(value) == TYPE_ARRAY else 0


static func _regex_count(text: String, pattern_text: String) -> int:
    var pattern := RegEx.new()
    if pattern.compile(pattern_text) != OK:
        return 0
    return pattern.search_all(text).size()


static func _fail_with(base_result: Dictionary, message: String) -> Dictionary:
    var result := base_result.duplicate()
    result["succeeded"] = false
    result["message"] = message
    return result


static func _own_children_recursively(node: Node, owner: Node) -> void:
    for child in node.get_children():
        if child.owner == null and child != owner:
            child.owner = owner
        _own_children_recursively(child, owner)
