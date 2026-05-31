# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends RefCounted
class_name GreyboxEnginePackagePreflightClient

var daemon_url := "http://127.0.0.1:17345"


func _init(in_daemon_url := "http://127.0.0.1:17345") -> void:
    daemon_url = in_daemon_url.rstrip("/")


func godot_engine_package_preflight_url(project_id: String) -> String:
    return "%s/api/game-deliverables/%s/engine-package/godot/preflight" % [daemon_url, project_id.uri_encode()]


func fetch_godot_preflight(project_id: String, parent: Node, completed: Callable) -> HTTPRequest:
    var request := HTTPRequest.new()
    request.name = "GreyboxGodotEnginePackagePreflight"
    parent.add_child(request)
    request.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
        var payload := GreyboxEnginePackagePreflightClient.parse_response_json(body.get_string_from_utf8())
        payload["request_result"] = result
        payload["http_code"] = response_code
        if response_code < 200 or response_code >= 300:
            payload["ready"] = false
            payload["error"] = "Godot engine-package preflight returned HTTP %d." % response_code
        completed.call(payload)
        request.queue_free()
    )
    var error := request.request(
        godot_engine_package_preflight_url(project_id),
        PackedStringArray(["Accept: application/json"]),
        HTTPClient.METHOD_GET
    )
    if error != OK:
        completed.call({
            "ready": false,
            "error": "Could not start Godot engine-package preflight request: %d." % error,
            "request_result": error,
            "http_code": 0
        })
        request.queue_free()
    return request


static func parse_response_json(body: String) -> Dictionary:
    var parsed := JSON.parse_string(body)
    if typeof(parsed) != TYPE_DICTIONARY:
        return {
            "ready": false,
            "error": "Godot engine-package preflight response was not valid JSON."
        }

    var manifest := parsed.get("manifest", {})
    var manifest_files := manifest.get("files", []) if typeof(manifest) == TYPE_DICTIONARY else []
    var ready := (
        parsed.get("engine", "") == "godot"
        and not str(parsed.get("projectId", "")).is_empty()
        and not str(parsed.get("sourceFileName", "")).is_empty()
        and not str(parsed.get("packageFileName", "")).is_empty()
        and int(parsed.get("fileCount", 0)) > 0
        and int(parsed.get("sizeBytes", 0)) > 0
        and typeof(manifest_files) == TYPE_ARRAY
        and manifest_files.size() > 0
    )

    return {
        "ready": ready,
        "error": "" if ready else "Godot engine-package preflight is missing package readiness fields.",
        "project_id": str(parsed.get("projectId", "")),
        "project_name": str(parsed.get("projectName", "")),
        "engine": str(parsed.get("engine", "")),
        "source_file_name": str(parsed.get("sourceFileName", "")),
        "package_file_name": str(parsed.get("packageFileName", "")),
        "file_count": int(parsed.get("fileCount", 0)),
        "size_bytes": int(parsed.get("sizeBytes", 0)),
        "terrain_collider_count": int(manifest.get("terrainColliderCount", 0)) if typeof(manifest) == TYPE_DICTIONARY else 0,
        "dynamic_event_count": int(manifest.get("dynamicEventCount", 0)) if typeof(manifest) == TYPE_DICTIONARY else 0,
        "faction_count": int(manifest.get("factionCount", 0)) if typeof(manifest) == TYPE_DICTIONARY else 0,
        "runtime_hooks": manifest.get("runtimeHooks", []) if typeof(manifest) == TYPE_DICTIONARY else [],
        "manifest": manifest
    }
