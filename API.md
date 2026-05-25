# Metrics Todo API Documentation

## Overview
This is a multi-user todo and metrics API built with Express.js and PostgreSQL. Todo requests are authenticated with Keycloak JWT bearer tokens and user ownership is derived from the token `sub` claim.

## Getting Started

### Running with Docker Compose
```bash
cp .env.example .env
# Edit .env and set POSTGRES_PASSWORD to a local development password.
docker-compose up --build
```

This will:
1. Start a PostgreSQL database with the todo schema initialized
2. Build and run the Node.js application
3. Expose the app on `http://localhost:3000`

### Running Locally
```bash
npm install
# Make sure PostgreSQL is running and configured
npm start
```

## Authentication
Open `/login` in the browser to sign in with Keycloak using PKCE. After login, use the returned access token as a bearer token on todo requests.

Example:
```bash
Authorization: Bearer <access_token>
```

Public endpoints (`/health`, `/openapi.json`, `/api/docs/openapi.json`, and `/metrics`) do not require authentication.

## API Endpoints

### Health Check
```
GET /health
```
Response: `{ "status": "ok" }`

### OpenAPI Document
```
GET /openapi.json
GET /api/docs/openapi.json
```
Returns the OpenAPI 3 document used by Kong or other API gateways for registration.

Example:
```bash
curl http://localhost:3000/openapi.json
```

### Metrics
```
GET /metrics
```
Returns process uptime, memory usage, and CPU usage.

### List Todos
```
GET /todos
```
Query parameters:
- `category` - Filter by category
- `status` - Filter by status (pending, in_progress, completed)
- `sort_by` - Sort order: `created_asc`, `created_desc`, `updated_asc`, `updated_desc`, `last_viewed_asc`, `last_viewed_desc` (default)

Example:
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?category=work&status=pending&sort_by=last_viewed_desc"
```

Response:
```json
[
  {
    "id": 1,
    "user_id": "user123",
    "title": "Complete project",
    "description": "Finish the todo app backend",
    "category": "work",
    "status": "pending",
    "priority": "high",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z",
    "last_viewed": "2024-01-15T14:20:00Z"
  }
]
```

### Create Todo
```
POST /todos
Content-Type: application/json

{
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "category": "personal",
  "status": "pending",
  "priority": "medium"
}
```

- `title` - Required
- `description` - Optional
- `category` - Optional
- `status` - Optional; one of `pending`, `in_progress`, `completed` (default: `pending`)
- `priority` - Optional; one of `low`, `medium`, `high` (default: `medium`)

Response: `201 Created` with the created todo object.

### Get Todo
```
GET /todos/:id
```
Retrieves a specific todo and updates its `last_viewed` timestamp.

Response:
```json
{
  "id": 1,
  "user_id": "user123",
  "title": "Complete project",
  "description": "Finish the todo app backend",
  "category": "work",
  "status": "pending",
  "priority": "high",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "last_viewed": "2024-01-15T14:25:00Z"
}
```

### Update Todo
```
PUT /todos/:id
Content-Type: application/json

{
  "status": "completed",
  "priority": "low"
}
```

All fields are optional. Only provided fields are updated. If supplied, `status` must be one of `pending`, `in_progress`, `completed`, and `priority` must be one of `low`, `medium`, `high`. The `updated_at` and `last_viewed` timestamps are automatically updated.

Response: Updated todo object with status `200 OK`.

### Delete Todo
```
DELETE /todos/:id
```

Response: `200 OK` with deleted todo details.

## Data Model

### Users Table
- `id` - Auto-incremented primary key
- `user_id` - Unique user identifier derived from the JWT `sub` claim
- `created_at` - Account creation timestamp

### Todos Table
- `id` - Auto-incremented primary key
- `user_id` - Foreign key to users table
- `title` - Todo title (required)
- `description` - Todo description
- `category` - Category/tag for organizing todos
- `status` - Todo status (`pending`, `in_progress`, or `completed`)
- `priority` - Priority level (`low`, `medium`, or `high`)
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp
- `last_viewed` - Last time the todo was viewed or updated (used for "forgotten items" insights)

## Insights: Forgotten Items
The `last_viewed` field tracks the last time a user viewed or interacted with a todo. This can be used to highlight items that:
- Haven't been updated in a long time
- Are still pending but haven't been viewed recently
- Need attention

Example query to find forgotten items:
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?status=pending&sort_by=last_viewed_asc"
```

This returns pending todos sorted by least recently viewed first.

## Error Responses

### Missing Bearer Token
```json
{
  "error": "Authorization bearer token is required"
}
```
Status: `401 Unauthorized`

### Todo Not Found
```json
{
  "error": "Todo not found"
}
```
Status: `404 Not Found`

### Missing Required Fields
```json
{
  "error": "Title is required"
}
```
Status: `400 Bad Request`

### Invalid Status or Priority
```json
{
  "error": "Status must be one of: pending, in_progress, completed"
}
```
Status: `400 Bad Request`

### Server Error
```json
{
  "error": "Internal server error"
}
```
Status: `500 Internal Server Error`

## Example Usage

### Create a todo
```bash
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Design database schema",
    "description": "Create tables for todos and users",
    "category": "work",
    "priority": "high"
  }'
```

### List all pending todos in work category
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?category=work&status=pending"
```

### Mark a todo as completed
```bash
curl -X PUT http://localhost:3000/todos/1 \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### Find forgotten todos
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?status=pending&sort_by=last_viewed_asc"
```
