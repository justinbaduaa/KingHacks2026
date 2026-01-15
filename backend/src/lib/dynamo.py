"""DynamoDB utilities."""

import os
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

_table_cache = {}


def get_table(table_name: str = None):
    """Get DynamoDB table resource (cached)."""
    resolved = table_name or os.environ.get("TABLE_NAME")
    if resolved not in _table_cache:
        dynamodb = boto3.resource("dynamodb")
        _table_cache[resolved] = dynamodb.Table(resolved)
    return _table_cache[resolved]


def put_item(item: dict, table_name: str = None):
    """Put an item into the table."""
    table = get_table(table_name)
    return table.put_item(Item=item)


def get_item(pk: str, sk: str, table_name: str = None):
    """Get an item from the table."""
    table = get_table(table_name)
    response = table.get_item(Key={"pk": pk, "sk": sk})
    return response.get("Item")


def delete_item(pk: str, sk: str, table_name: str = None):
    """Delete an item from the table."""
    table = get_table(table_name)
    return table.delete_item(Key={"pk": pk, "sk": sk})


def query_items(pk: str, sk_prefix: str = None, table_name: str = None):
    """Query items by partition key and optional sort key prefix."""
    table = get_table(table_name)
    key_condition = Key("pk").eq(pk)
    if sk_prefix:
        key_condition = key_condition & Key("sk").begins_with(sk_prefix)
    response = table.query(KeyConditionExpression=key_condition)
    return response.get("Items", [])


def _convert_floats(obj):
    """Convert floats to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _convert_floats(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_floats(v) for v in obj]
    return obj


def put_node_item(
    user_id: str,
    local_day: str,
    node_id: str,
    raw_transcript: str,
    raw_payload_subset: dict,
    node_obj: dict,
    captured_at_iso: str,
    created_at_iso: str,
    table_name: str = None
) -> None:
    """
    Store a node item in DynamoDB.
    
    Uses pk/sk strategy for efficient "list today's nodes" queries:
    - pk: user#{user_id}
    - sk: day#{local_day}#node#{node_id}
    """
    table = get_table(table_name)
    
    pk = f"user#{user_id}"
    sk = f"day#{local_day}#node#{node_id}"
    
    # Convert floats to Decimal for DynamoDB
    node_obj_clean = _convert_floats(node_obj)
    raw_payload_clean = _convert_floats(raw_payload_subset)
    
    item = {
        "pk": pk,
        "sk": sk,
        "node_id": node_id,
        "created_at_iso": created_at_iso,
        "captured_at_iso": captured_at_iso,
        "local_day": local_day,
        "status": node_obj.get("status", "active"),
        "raw_transcript": raw_transcript[:10000],  # Limit size
        "raw_payload_subset": raw_payload_clean,
        "node": node_obj_clean,
        "node_type": node_obj.get("node_type", "note"),
    }
    
    try:
        table.put_item(
            Item=item,
            ConditionExpression=Attr("pk").not_exists() & Attr("sk").not_exists()
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            # Item already exists - this is fine, just update
            table.put_item(Item=item)
        else:
            raise


def query_nodes_by_day(user_id: str, local_day: str, table_name: str = None) -> list:
    """Query all nodes for a user on a specific day."""
    return query_items(
        pk=f"user#{user_id}",
        sk_prefix=f"day#{local_day}#node#",
        table_name=table_name
    )
