# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends Node
class_name GreyboxSyncClient

# Emitted when the daemon pushes an artifact update.
signal artifact_updated(artifact: Dictionary)
# Emitted when the daemon pushes a full project state snapshot.
signal project_state_changed(state: Dictionary)
# Emitted when the WebSocket connection is established.
signal connected()
# Emitted when the WebSocket connection closes.
signal disconnected(code: int, reason: String)

var daemon_url := "http://127.0.0.1:17345"

# Internal WebSocket peer. Null when disconnected.
var _ws: WebSocketPeer = null
var _project_id := ""
var _reconnect_on_close := false
# Tracks whether the WebSocket was open on the last _process tick.
var _was_open := false


func _init(in_daemon_url := "http://127.0.0.1:17345") -> void:
    daemon_url = in_daemon_url.rstrip("/")


# -- URL helpers -------------------------------------------------------------------------------

func godot_sync_websocket_url(project_id: String) -> String:
    # Convert http(s):// base URL to ws(s):// for WebSocket connection.
    var ws_base := daemon_url.replace("https://", "wss://").replace("http://", "ws://")
    return "%s/api/sync/godot?projectId=%s" % [ws_base, project_id.uri_encode()]


func round_trip_merge_url(project_id: String) -> String:
    return "%s/api/projects/%s/round-trip-merge" % [daemon_url, project_id.uri_encode()]


func godot_engine_package_preflight_url(project_id: String) -> String:
    return "%s/api/game-deliverables/%s/engine-package/godot/preflight" % [daemon_url, project_id.uri_encode()]


func godot_engine_package_url(project_id: String, file_name := "") -> String:
    var query := "" if file_name.is_empty() else "?fileName=%s" % file_name.uri_encode()
    return "%s/api/projects/%s/engine-package/godot%s" % [daemon_url, project_id.uri_encode(), query]


func unity_compatibility_package_url(project_id: String) -> String:
    return "%s/api/projects/%s/unity-package" % [daemon_url, project_id.uri_encode()]


# -- WebSocket connection ----------------------------------------------------------------------

# Connect to the daemon sync endpoint for `project_id`. Safe to call multiple times;
# closes any existing connection first. Set `reconnect` to true to auto-reconnect on
# unexpected close.
func connect_to_daemon(project_id: String, reconnect := false) -> void:
    _project_id = project_id
    _reconnect_on_close = reconnect
    _open_websocket()


func disconnect_from_daemon() -> void:
    _reconnect_on_close = false
    if _ws != null:
        _ws.close()
    # Don't null _ws here — let _process handle STATE_CLOSED cleanup
    # so the TCP close handshake completes before we drop the peer.
    _was_open = false


func is_connected_to_daemon() -> bool:
    if _ws == null:
        return false
    return _ws.get_ready_state() == WebSocketPeer.STATE_OPEN


# Send an arbitrary JSON message to the daemon over the open WebSocket.
# Returns false when the connection is not open.
func send_message(payload: Dictionary) -> bool:
    if not is_connected_to_daemon():
        return false
    var json_text := JSON.stringify(payload)
    var err := _ws.send_text(json_text)
    return err == OK


# -- Node lifecycle (poll loop) ----------------------------------------------------------------

func _process(_delta: float) -> void:
    if _ws == null:
        return
    _ws.poll()
    var state := _ws.get_ready_state()

    if state == WebSocketPeer.STATE_OPEN:
        if not _was_open:
            _was_open = true
            connected.emit()
        # Drain all available incoming packets.
        while _ws.get_available_packet_count() > 0:
            var packet := _ws.get_packet()
            var text := packet.get_string_from_utf8()
            if text.is_empty():
                continue
            var message = JSON.parse_string(text)
            if typeof(message) == TYPE_DICTIONARY:
                _handle_sync_message(message)
            else:
                push_warning("GreyboxSyncClient: received non-JSON packet: %s" % text.left(120))

    elif state == WebSocketPeer.STATE_CLOSED:
        var close_code := _ws.get_close_code()
        var close_reason := _ws.get_close_reason()
        if _was_open:
            _was_open = false
            disconnected.emit(close_code, close_reason)
        _ws = null  # Safe to null after close handshake completes
        if _reconnect_on_close and not _project_id.is_empty():
            # Reconnect on next process tick.
            call_deferred("_open_websocket")


# -- Internal ----------------------------------------------------------------------------------

func _open_websocket() -> void:
    if _ws != null:
        _ws.close()
        _ws = null
    _was_open = false
    _ws = WebSocketPeer.new()
    var url := godot_sync_websocket_url(_project_id)
    var err := _ws.connect_to_url(url)
    if err != OK:
        push_warning("GreyboxSyncClient: could not initiate WebSocket connection to %s (error %d)." % [url, err])
        _ws = null


func _handle_sync_message(message: Dictionary) -> void:
    match message.get("type", ""):
        "artifact_updated":
            var artifact = message.get("artifact", {})
            if typeof(artifact) == TYPE_DICTIONARY:
                artifact_updated.emit(artifact)
        "project_state":
            var state = message.get("state", {})
            if typeof(state) == TYPE_DICTIONARY:
                project_state_changed.emit(state)
        "ping":
            # Respond with pong to keep the connection alive.
            send_message({"type": "pong"})
        "error":
            push_warning("GreyboxSyncClient: daemon error — %s" % str(message.get("message", "unknown error")))
        _:
            # Unknown message type — log and ignore.
            push_warning("GreyboxSyncClient: unrecognised message type '%s'." % str(message.get("type", "")))
