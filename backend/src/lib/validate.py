"""Schema validation for BrainDump nodes."""

from lib.schemas import SCHEMA_VERSION, get_node_schema

try:
    import jsonschema
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False


def create_fallback_note(title: str, body: str, warnings: list[str]) -> dict:
    """Create a minimal fallback note node."""
    return {
        "schema_version": SCHEMA_VERSION,
        "node_type": "note",
        "title": title[:120] if title else "Captured Note",
        "body": body[:4000] if body else "",
        "tags": [],
        "status": "active",
        "confidence": 0.3,
        "evidence": [{"quote": body[:200] if body else ""}],
        "location_context": {
            "location_used": False,
            "location_relevance": "Fallback node - location not processed"
        },
        "note": {
            "content": body[:4000] if body else "",
            "category_hint": "other",
            "pin": False,
            "related_entities": []
        },
        "global_warnings": warnings
    }


def validate_node_manual(node: dict) -> list[str]:
    """Manual validation of required fields. Returns list of errors."""
    errors = []
    
    required_fields = [
        "schema_version", "node_type", "title", "body", "tags",
        "status", "confidence", "evidence", "location_context"
    ]
    
    for field in required_fields:
        if field not in node:
            errors.append(f"Missing required field: {field}")
    
    if node.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"Invalid schema_version: expected {SCHEMA_VERSION}")
    
    valid_node_types = ["reminder", "todo", "note", "calendar_placeholder", "email"]
    node_type = node.get("node_type")
    if node_type not in valid_node_types:
        errors.append(f"Invalid node_type: {node_type}")
    
    # Check that the matching payload exists
    if node_type == "reminder" and "reminder" not in node:
        errors.append("reminder node missing 'reminder' payload")
    elif node_type == "todo" and "todo" not in node:
        errors.append("todo node missing 'todo' payload")
    elif node_type == "note" and "note" not in node:
        errors.append("note node missing 'note' payload")
    elif node_type == "calendar_placeholder" and "calendar_placeholder" not in node:
        errors.append("calendar_placeholder node missing 'calendar_placeholder' payload")
    elif node_type == "email" and "email" not in node:
        errors.append("email node missing 'email' payload")
    
    # Validate confidence range
    confidence = node.get("confidence")
    if confidence is not None and (not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1):
        errors.append(f"confidence must be 0-1, got: {confidence}")
    
    # Validate evidence is non-empty array
    evidence = node.get("evidence")
    if not evidence or not isinstance(evidence, list) or len(evidence) == 0:
        errors.append("evidence must be non-empty array")
    
    # Validate status
    status = node.get("status")
    if status not in ["active", "completed"]:
        errors.append(f"Invalid status: {status}")
    
    # Validate location_context
    loc = node.get("location_context")
    if loc and "location_used" not in loc:
        errors.append("location_context missing 'location_used'")
    
    return errors


def validate_node_jsonschema(node: dict) -> list[str]:
    """Validate using jsonschema library. Returns list of errors."""
    if not HAS_JSONSCHEMA:
        return []
    
    schema = get_node_schema()
    errors = []
    
    try:
        # Use Draft202012Validator for draft 2020-12 support
        validator_cls = jsonschema.Draft202012Validator
        validator = validator_cls(schema)
        
        for error in validator.iter_errors(node):
            errors.append(f"{error.json_path}: {error.message}")
    except Exception as e:
        errors.append(f"Schema validation error: {str(e)}")
    
    return errors


def validate_node(node: dict, transcript: str = "") -> tuple[dict, list[str], bool]:
    """
    Validate a node against the schema.
    
    Returns: (valid_node, warnings, fallback_used)
    - If valid: returns (node, warnings, False)
    - If invalid: returns (fallback_note, warnings, True)
    """
    if not node:
        warnings = ["No node provided by model"]
        return create_fallback_note("Captured Note", transcript, warnings), warnings, True
    
    # Run manual validation (always)
    manual_errors = validate_node_manual(node)
    
    # Run jsonschema validation if available
    schema_errors = validate_node_jsonschema(node) if HAS_JSONSCHEMA else []
    
    all_errors = manual_errors + schema_errors
    
    if manual_errors:
        # Critical errors - use fallback
        title = node.get("title", "Captured Note")
        body = node.get("body", transcript)
        warnings = [f"Validation error: {e}" for e in all_errors]
        return create_fallback_note(title, body, warnings), warnings, True
    
    # Minor schema errors - keep node but add warnings
    warnings = [f"Schema warning: {e}" for e in schema_errors] if schema_errors else []
    
    # Ensure global_warnings exists and merge
    if "global_warnings" not in node:
        node["global_warnings"] = []
    node["global_warnings"] = list(node.get("global_warnings", [])) + warnings
    
    return node, warnings, False
