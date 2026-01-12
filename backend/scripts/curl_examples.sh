#!/bin/bash

# Example curl commands for the API

BASE_URL="${API_URL:-https://x4exeundl2.execute-api.us-east-1.amazonaws.com/Prod/}"

# Ingest
echo "=== Ingest ==="
curl -X POST "$BASE_URL/ingest" \
  -H "Content-Type: application/json" \
  -d '{"content": "Example content"}'

echo ""

# Get Active Nodes (default: last 7 days)
echo "=== Get Active Nodes ==="
curl -X GET "$BASE_URL/nodes/active"

echo ""

# Get Active Nodes with custom timeframe
echo "=== Get Active Nodes (last 14 days) ==="
curl -X GET "$BASE_URL/nodes/active?days=14"

echo ""

# Patch Node
echo "=== Patch Node ==="
curl -X PATCH "$BASE_URL/node/123" \
  -H "Content-Type: application/json" \
  -d '{"content": "Updated content"}'

echo ""

# Complete Node
echo "=== Complete Node ==="
curl -X POST "$BASE_URL/node/123/complete"

echo ""
