#!/bin/bash

# Example Metrics Todo API Requests
# This script demonstrates how to use the Metrics Todo API

BASE_URL="http://localhost:3000"
USER_ID="demo-user-$(date +%s)"

echo "=== Metrics Todo API Examples ==="
echo "Using User ID: $USER_ID"
echo ""

# Health check
echo "1. Health check:"
curl -s "$BASE_URL/health" | jq .
echo ""

# Get metrics
echo "2. Get metrics:"
curl -s "$BASE_URL/metrics" | jq .
echo ""

# Create first todo
echo "3. Create a todo (work - high priority):"
RESPONSE=$(curl -s -X POST "$BASE_URL/todos" \
  -H "X-User-Id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete backend implementation",
    "description": "Finish the todo app with PostgreSQL",
    "category": "work",
    "status": "in_progress",
    "priority": "high"
  }')
echo "$RESPONSE" | jq .
TODO_ID_1=$(echo "$RESPONSE" | jq -r '.id')
echo ""

# Create second todo
echo "4. Create another todo (personal - medium priority):"
RESPONSE=$(curl -s -X POST "$BASE_URL/todos" \
  -H "X-User-Id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Grocery shopping",
    "description": "Buy milk, eggs, and bread",
    "category": "personal",
    "priority": "medium"
  }')
echo "$RESPONSE" | jq .
TODO_ID_2=$(echo "$RESPONSE" | jq -r '.id')
echo ""

# Create third todo
echo "5. Create a completed todo:"
curl -s -X POST "$BASE_URL/todos" \
  -H "X-User-Id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Team meeting",
    "category": "work",
    "status": "completed",
    "priority": "low"
  }' | jq .
echo ""

# List all todos
echo "6. List all todos for the user:"
curl -s -H "X-User-Id: $USER_ID" "$BASE_URL/todos" | jq .
echo ""

# List todos with filtering
echo "7. List pending work todos:"
curl -s -H "X-User-Id: $USER_ID" "$BASE_URL/todos?category=work&status=pending" | jq .
echo ""

# Get specific todo (updates last_viewed)
echo "8. Get a specific todo (ID: $TODO_ID_1):"
curl -s -H "X-User-Id: $USER_ID" "$BASE_URL/todos/$TODO_ID_1" | jq .
echo ""

# Update todo
echo "9. Update todo status to completed (ID: $TODO_ID_1):"
curl -s -X PUT "$BASE_URL/todos/$TODO_ID_1" \
  -H "X-User-Id: $USER_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}' | jq .
echo ""

# Find forgotten todos (pending, sorted by least recently viewed)
echo "10. Find forgotten todos (pending todos, least recently viewed first):"
curl -s -H "X-User-Id: $USER_ID" "$BASE_URL/todos?status=pending&sort_by=last_viewed_asc" | jq .
echo ""

# Delete a todo
echo "11. Delete a todo (ID: $TODO_ID_2):"
curl -s -X DELETE "$BASE_URL/todos/$TODO_ID_2" \
  -H "X-User-Id: $USER_ID" | jq .
echo ""

# List todos after deletion
echo "12. List all todos after deletion:"
curl -s -H "X-User-Id: $USER_ID" "$BASE_URL/todos" | jq .
echo ""

echo "=== Example complete ==="
