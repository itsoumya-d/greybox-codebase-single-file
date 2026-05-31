# Proprietary and confidential. Copyright (c) 2026 Greybox Studio.
@tool
extends SceneTree

# Plain-GDScript test runner. Invoke with:
#   godot --headless --script res://test/run_tests.gd
# Each test file under res://test/ exposes a static `run()` returning an Array
# of {name, passed, message} records. Failures push the SceneTree exit code to 1.

const TEST_FILES := [
    "res://test/test_diff_applier.gd",
    "res://test/test_component_importer.gd",
    "res://test/test_project_importer.gd"
]


func _initialize() -> void:
    var total := 0
    var passed := 0
    var failures: Array = []
    for path in TEST_FILES:
        var test_script: GDScript = load(path)
        if test_script == null:
            failures.append({"name": path, "message": "failed to load"})
            continue
        var test_instance = test_script.new() if test_script.can_instantiate() else null
        var results = []
        if test_instance != null and test_instance.has_method("run"):
            results = test_instance.run()
        elif test_script.has_method("run"):
            results = test_script.run()
        else:
            results = test_script.call("run")
        for record in results:
            total += 1
            var name := str(record.get("name", "unknown"))
            if bool(record.get("passed", false)):
                passed += 1
                print("PASS %s" % name)
            else:
                failures.append({"name": name, "message": record.get("message", "")})
                printerr("FAIL %s -- %s" % [name, record.get("message", "")])
    print("Greybox tests: %d passed, %d failed, %d total" % [passed, failures.size(), total])
    quit(0 if failures.is_empty() else 1)
