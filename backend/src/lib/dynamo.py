"""DynamoDB utilities."""

import os
import boto3


def get_table(table_name: str = None):
    """Get DynamoDB table resource."""
    dynamodb = boto3.resource("dynamodb")
    resolved = table_name or os.environ.get("TABLE_NAME")
    return dynamodb.Table(resolved)


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
    key_condition = boto3.dynamodb.conditions.Key("pk").eq(pk)
    if sk_prefix:
        key_condition = key_condition & boto3.dynamodb.conditions.Key("sk").begins_with(sk_prefix)
    response = table.query(KeyConditionExpression=key_condition)
    return response.get("Items", [])
