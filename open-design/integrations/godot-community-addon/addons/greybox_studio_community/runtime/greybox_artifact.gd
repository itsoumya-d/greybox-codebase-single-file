# SPDX-License-Identifier: Apache-2.0
@tool
extends Resource
class_name GreyboxCommunityArtifact

@export var source_path: String = ""
@export var source_kind: String = ""
@export var human_designer: String = ""
@export var generator: String = ""
@export_multiline var content: String = ""


static func from_text(path: String, kind: String, body: String, designer_name: String = "") -> GreyboxCommunityArtifact:
	var artifact := GreyboxCommunityArtifact.new()
	artifact.source_path = path
	artifact.source_kind = kind
	artifact.human_designer = designer_name.strip_edges()
	artifact.generator = "Greybox"
	if artifact.human_designer != "":
		artifact.generator += " + " + artifact.human_designer
	artifact.content = body
	return artifact
