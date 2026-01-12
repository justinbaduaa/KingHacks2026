"""AWS Bedrock utilities."""

import boto3


def get_bedrock_client():
    """Get Bedrock runtime client."""
    return boto3.client("bedrock-runtime")


def invoke_model(prompt: str, model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"):
    """Invoke a Bedrock model."""
    pass
