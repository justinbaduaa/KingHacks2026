#!/bin/bash

# Example curl commands for the API

BASE_URL="${API_URL:-https://x4exeundl2.execute-api.us-east-1.amazonaws.com/Prod/}"
ACCESS_TOKEN="${ACCESS_TOKEN:-}"

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "ACCESS_TOKEN is required (export ACCESS_TOKEN=...)." >&2
  exit 1
fi

AUTH_HEADER="Authorization: Bearer ${ACCESS_TOKEN}"

# WhoAmI
echo "=== WhoAmI ==="
curl -X GET "$BASE_URL/whoami" \
  -H "$AUTH_HEADER"

echo ""

# Ingest
echo "=== Ingest ==="
curl -X POST "$BASE_URL/ingest" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"content": "Example content"}'

echo ""

# Get Active Nodes (default: last 7 days)
echo "=== Get Active Nodes ==="
curl -X GET "$BASE_URL/nodes/active" \
  -H "$AUTH_HEADER"

echo ""

# Get Active Nodes with custom timeframe
echo "=== Get Active Nodes (last 14 days) ==="
curl -X GET "$BASE_URL/nodes/active?days=14" \
  -H "$AUTH_HEADER"

echo ""

# Patch Node
echo "=== Patch Node ==="
curl -X PATCH "$BASE_URL/node/123" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"content": "Updated content"}'

echo ""

# Complete Node
echo "=== Complete Node ==="
curl -X POST "$BASE_URL/node/123/complete" \
  -H "$AUTH_HEADER"

echo ""
