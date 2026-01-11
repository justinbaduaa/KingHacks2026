"""DynamoDB utilities."""

import os
import boto3


def get_table():
    """Get DynamoDB table resource."""
    dynamodb = boto3.resource("dynamodb")
    table_name = os.environ.get("TABLE_NAME")
    return dynamodb.Table(table_name)


def put_item(item: dict):
    """Put an item into the table."""
    table = get_table()
    return table.put_item(Item=item)


def get_item(pk: str, sk: str):
    """Get an item from the table."""
    table = get_table()
    response = table.get_item(Key={"pk": pk, "sk": sk})
    return response.get("Item")


def query_items(pk: str, sk_prefix: str = None):
    """Query items by partition key and optional sort key prefix."""
    table = get_table()
    key_condition = boto3.dynamodb.conditions.Key("pk").eq(pk)
    if sk_prefix:
        key_condition = key_condition & boto3.dynamodb.conditions.Key("sk").begins_with(sk_prefix)
    response = table.query(KeyConditionExpression=key_condition)
    return response.get("Items", [])
