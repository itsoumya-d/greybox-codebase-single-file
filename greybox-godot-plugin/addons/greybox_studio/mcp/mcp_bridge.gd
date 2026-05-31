# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxMcpBridge

static var _bearer_token := ""
static var _port := 38469
const BEARER_PREFIX := "Bearer "
const BEARER_TOKEN_BYTES := 32
const BEARER_TOKEN_HEX_CHARS := BEARER_TOKEN_BYTES * 2
const MAX_AUTH_HEADER_CHARS := 128

static func start(port := 38469) -> void:
    _port = port
    _get_or_create_bearer_token()


static func stop() -> void:
    pass


static func rotate_bearer_token() -> String:
    var crypto := Crypto.new()
    _bearer_token = crypto.generate_random_bytes(BEARER_TOKEN_BYTES).hex_encode()
    return _bearer_token


static func client_config_json() -> String:
    return JSON.stringify({
        "url": "http://127.0.0.1:%d/mcp" % _port,
        "headers": {
            "Authorization": "Bearer %s" % _get_or_create_bearer_token()
        }
    })


static func tool_names() -> Array[String]:
    return [
        "godot.getSceneTree",
        "godot.createNode",
        "godot.addScript",
        "godot.setProperty",
        "godot.assignResource",
        "godot.runEditorTest",
        "godot.captureViewportScreenshot",
        "godot.exportProject"
    ]


# Dispatch an incoming MCP tool call by name. Returns the tool result Dictionary.
# `arguments` is the parsed JSON arguments object from the client.
static func handle_tool_call(tool_name: String, arguments: Dictionary) -> Dictionary:
    match tool_name:
        "godot.getSceneTree", "getSceneHierarchy":
            return _get_scene_tree()
        "godot.createNode", "createGameObject":
            return _create_node(arguments)
        "godot.addScript", "addComponent":
            return _add_script(arguments)
        "godot.setProperty", "setField":
            return _set_property(arguments)
        "godot.assignResource", "assignAsset":
            return _assign_resource(arguments)
        "godot.runEditorTest", "runEditModeTest":
            return _run_editor_test(arguments)
        "godot.captureViewportScreenshot", "captureGameViewScreenshot":
            return _capture_viewport_screenshot(arguments)
        "godot.exportProject", "buildAddressables":
            return {
                "status": "not_supported",
                "message": "Godot uses export presets via the Export dialog or --export-release CLI, not addressable bundles. Use godot --export-release <preset> <output_path> from headless mode."
            }
        _:
            return {"error": "unknown_tool", "tool": tool_name}


static func _get_scene_tree() -> Dictionary:
    if not Engine.is_editor_hint():
        return {"error": "not_in_editor", "message": "getSceneTree is only available while the Godot editor is running."}
    if not Engine.has_singleton("EditorInterface"):
        return {"error": "no_editor_interface", "message": "EditorInterface singleton is not available."}
    var editor_interface = Engine.get_singleton("EditorInterface")
    if editor_interface == null:
        return {"error": "no_editor_interface", "message": "EditorInterface returned null."}
    var root = editor_interface.call("get_edited_scene_root")
    if root == null:
        return {"hierarchy": null, "message": "No scene is currently open in the editor."}
    return {"hierarchy": _node_to_dict(root)}


static func _node_to_dict(node: Node) -> Dictionary:
    var result := {
        "name": node.name,
        "type": node.get_class(),
        "path": str(node.get_path()),
        "children": []
    }
    # Include greybox metadata when present.
    if node.has_meta("greybox_id"):
        result["greybox_id"] = node.get_meta("greybox_id")
    if node.has_meta("greybox_type"):
        result["greybox_type"] = node.get_meta("greybox_type")
    if node.has_meta("greybox_kind"):
        result["greybox_kind"] = node.get_meta("greybox_kind")
    for child in node.get_children():
        result["children"].append(_node_to_dict(child))
    return result


static func _create_node(args: Dictionary) -> Dictionary:
    if not Engine.is_editor_hint():
        return {"error": "not_in_editor", "message": "createNode requires the Godot editor."}
    if not Engine.has_singleton("EditorInterface"):
        return {"error": "no_editor_interface"}
    var editor_interface = Engine.get_singleton("EditorInterface")
    var scene_root = editor_interface.call("get_edited_scene_root")
    if scene_root == null:
        return {"error": "no_open_scene", "message": "Open a scene before creating nodes."}

    var node_class := str(args.get("type", args.get("class", "Node3D")))
    var node: Node
    match node_class:
        "Node3D":
            node = Node3D.new()
        "Node2D":
            node = Node2D.new()
        "CharacterBody3D":
            node = CharacterBody3D.new()
        "StaticBody3D":
            node = StaticBody3D.new()
        "RigidBody3D":
            node = RigidBody3D.new()
        "Area3D":
            node = Area3D.new()
        "MeshInstance3D":
            node = MeshInstance3D.new()
        "Marker3D":
            node = Marker3D.new()
        "Camera3D":
            node = Camera3D.new()
        "DirectionalLight3D":
            node = DirectionalLight3D.new()
        "OmniLight3D":
            node = OmniLight3D.new()
        "SpotLight3D":
            node = SpotLight3D.new()
        "Control":
            node = Control.new()
        "Label":
            node = Label.new()
        "Button":
            node = Button.new()
        "Node":
            node = Node.new()
        _:
            node = Node3D.new()
            node.set_meta("greybox_requested_class", node_class)

    node.name = str(args.get("name", "NewObject"))

    # Position (for 3D nodes).
    var pos = args.get("position", {})
    if typeof(pos) == TYPE_DICTIONARY and node is Node3D:
        node.position = Vector3(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)), float(pos.get("z", 0.0)))
    elif typeof(pos) == TYPE_DICTIONARY and node is Node2D:
        node.position = Vector2(float(pos.get("x", 0.0)), float(pos.get("y", 0.0)))

    # Attach to a specific parent if provided, otherwise to scene root.
    var parent_path := str(args.get("parentPath", args.get("parent", "")))
    var parent: Node = scene_root
    if not parent_path.is_empty():
        var candidate = scene_root.get_node_or_null(parent_path)
        if candidate is Node:
            parent = candidate

    parent.add_child(node)
    node.owner = scene_root
    return {"success": true, "node_name": node.name, "node_path": str(node.get_path()), "type": node.get_class()}


static func _add_script(args: Dictionary) -> Dictionary:
    if not Engine.is_editor_hint():
        return {"error": "not_in_editor", "message": "addScript requires the Godot editor."}
    if not Engine.has_singleton("EditorInterface"):
        return {"error": "no_editor_interface"}
    var editor_interface = Engine.get_singleton("EditorInterface")
    var scene_root = editor_interface.call("get_edited_scene_root")
    if scene_root == null:
        return {"error": "no_open_scene"}

    var node_path := str(args.get("nodePath", args.get("gameObjectPath", "")))
    if node_path.is_empty():
        return {"error": "missing_argument", "message": "nodePath is required."}
    var node = scene_root.get_node_or_null(node_path)
    if node == null:
        return {"error": "node_not_found", "node_path": node_path}

    var script_path := str(args.get("scriptPath", args.get("scriptType", "")))
    if script_path.is_empty():
        return {"error": "missing_argument", "message": "scriptPath is required."}
    if not ResourceLoader.exists(script_path):
        return {"error": "script_not_found", "script_path": script_path}
    var script := load(script_path)
    if script == null:
        return {"error": "script_load_failed", "script_path": script_path}
    node.set_script(script)
    return {"success": true, "node_path": node_path, "script_path": script_path}


static func _set_property(args: Dictionary) -> Dictionary:
    if not Engine.is_editor_hint():
        return {"error": "not_in_editor", "message": "setProperty requires the Godot editor."}
    if not Engine.has_singleton("EditorInterface"):
        return {"error": "no_editor_interface"}
    var editor_interface = Engine.get_singleton("EditorInterface")
    var scene_root = editor_interface.call("get_edited_scene_root")
    if scene_root == null:
        return {"error": "no_open_scene"}

    var node_path := str(args.get("nodePath", args.get("gameObjectPath", "")))
    if node_path.is_empty():
        return {"error": "missing_argument", "message": "nodePath is required."}
    var node = scene_root.get_node_or_null(node_path)
    if node == null:
        return {"error": "node_not_found", "node_path": node_path}

    var property_name := str(args.get("property", args.get("field", args.get("fieldName", ""))))
    if property_name.is_empty():
        return {"error": "missing_argument", "message": "property is required."}
    var value = args.get("value")
    if value == null:
        return {"error": "missing_argument", "message": "value is required."}

    # Blocklist: prevent setting dangerous properties via MCP
    const BLOCKED_PROPERTIES: Array[String] = [
        "script", "owner", "unique_name_in_owner",
        "process_mode", "process_thread_group"
    ]
    if property_name in BLOCKED_PROPERTIES:
        return {
            "error": "blocked_property",
            "property": property_name,
            "message": "Property '%s' cannot be set via MCP tool call." % property_name
        }

    node.set(property_name, value)
    return {"success": true, "node_path": node_path, "property": property_name, "value": value}


static func _assign_resource(args: Dictionary) -> Dictionary:
    if not Engine.is_editor_hint():
        return {"error": "not_in_editor", "message": "assignResource requires the Godot editor."}
    if not Engine.has_singleton("EditorInterface"):
        return {"error": "no_editor_interface"}
    var editor_interface = Engine.get_singleton("EditorInterface")
    var scene_root = editor_interface.call("get_edited_scene_root")
    if scene_root == null:
        return {"error": "no_open_scene"}

    var node_path := str(args.get("nodePath", args.get("gameObjectPath", "")))
    if node_path.is_empty():
        return {"error": "missing_argument", "message": "nodePath is required."}
    var node = scene_root.get_node_or_null(node_path)
    if node == null:
        return {"error": "node_not_found", "node_path": node_path}

    var property_name := str(args.get("property", args.get("field", "")))
    var resource_path := str(args.get("resourcePath", args.get("assetPath", "")))
    if resource_path.is_empty():
        return {"error": "missing_argument", "message": "resourcePath is required."}
    if not ResourceLoader.exists(resource_path):
        return {"error": "resource_not_found", "resource_path": resource_path}
    var resource := load(resource_path)
    if resource == null:
        return {"error": "resource_load_failed", "resource_path": resource_path}

    if not property_name.is_empty():
        node.set(property_name, resource)
    else:
        # Heuristic: apply resource based on node type.
        if node is MeshInstance3D and resource is Mesh:
            node.mesh = resource
        elif node is AudioStreamPlayer3D and resource is AudioStream:
            node.stream = resource
        elif node is AudioStreamPlayer and resource is AudioStream:
            node.stream = resource
        else:
            return {"error": "ambiguous_assignment", "message": "Provide 'property' to specify which slot to assign the resource to."}

    return {"success": true, "node_path": node_path, "resource_path": resource_path, "property": property_name}


static func _run_editor_test(args: Dictionary) -> Dictionary:
    # Editor-mode (non-play) tests in Godot are run via GUT or similar tooling.
    # We expose a lightweight stub that records the test request and returns the
    # expectation. A full integration would forward to a running test runner.
    var test_name := str(args.get("testName", args.get("name", "")))
    if test_name.is_empty():
        return {"error": "missing_argument", "message": "testName is required."}
    return {
        "status": "requested",
        "test_name": test_name,
        "message": "Editor test '%s' queued. Run GUT (Godot Unit Testing) from the editor dock or via 'godot --headless --script addons/gut/gut_cmdln.gd' to execute." % test_name
    }


static func _capture_viewport_screenshot(args: Dictionary) -> Dictionary:
    if not Engine.is_editor_hint():
        return {"error": "not_in_editor", "message": "captureViewportScreenshot requires the Godot editor."}
    # Viewport screenshot requires the rendering thread to be active. We can only
    # initiate the capture here; the actual bytes are returned asynchronously.
    var output_path := str(args.get("outputPath", "user://greybox/screenshots/viewport.png"))
    return {
        "status": "deferred",
        "output_path": output_path,
        "message": "Viewport screenshot capture must be triggered from a running scene via Viewport.get_texture().get_image().save_png(). In the editor, use the built-in screenshot button or connect to the RenderingServer.frame_post_draw signal."
    }


static func authorization_header_matches(authorization: String, expected: String) -> bool:
    if not _is_safe_auth_header(authorization):
        return false
    if not authorization.begins_with(BEARER_PREFIX):
        return false
    return bearer_token_matches(authorization.substr(BEARER_PREFIX.length()), expected)


static func header_token_matches(headers: Dictionary, expected: String) -> bool:
    if authorization_header_matches(str(headers.get("Authorization", "")), expected):
        return true
    return bearer_token_matches(str(headers.get("X-Greybox-Mcp-Token", "")), expected)


static func bearer_token_matches(candidate: String, expected: String) -> bool:
    if not is_safe_bearer_token(candidate) or not is_safe_bearer_token(expected):
        return false
    return _fixed_time_equals(candidate, expected)


static func is_safe_bearer_token(token: String) -> bool:
    if token.length() != BEARER_TOKEN_HEX_CHARS:
        return false
    for index in range(token.length()):
        var code := token.unicode_at(index)
        var is_digit := code >= 48 and code <= 57
        var is_lower_hex := code >= 97 and code <= 102
        if not (is_digit or is_lower_hex):
            return false
    return true


static func _get_or_create_bearer_token() -> String:
    if _bearer_token.is_empty():
        rotate_bearer_token()
    return _bearer_token


static func _is_safe_auth_header(value: String) -> bool:
    if value.is_empty() or value.length() > MAX_AUTH_HEADER_CHARS:
        return false
    for index in range(value.length()):
        var code := value.unicode_at(index)
        if code < 32 or code == 127:
            return false
    return true


static func _fixed_time_equals(left: String, right: String) -> bool:
    var diff := 0 if left.length() == right.length() else 1
    var length := max(left.length(), right.length())
    for index in range(length):
        var left_code := left.unicode_at(index) if index < left.length() else 0
        var right_code := right.unicode_at(index) if index < right.length() else 0
        diff = diff | (left_code ^ right_code)
    return diff == 0
