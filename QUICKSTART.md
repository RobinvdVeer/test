# Metrics Todo API - Quick Start

## 5-Minute Setup

### Prerequisites
- Docker and Docker Compose installed

### Start the Application
```bash
cp .env.example .env
# Edit .env and set the required passwords.
docker-compose up --build
```

The app will be available at `http://localhost:3000` and the login page at `http://localhost:3000/login`.

## Common Commands

### Test Health
```bash
curl http://localhost:3000/health
```

### Sign in
1. Open `http://localhost:3000/login`
2. Click **Login**
3. Complete the Keycloak sign-in flow
4. Use the returned access token in the examples below

### Create a Todo
```bash
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries",
    "category": "personal",
    "priority": "medium",
    "due_date": "2026-06-15T10:00:00Z"
  }'
```

### List Todos
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos"
```

### List Work Todos
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?category=work"
```

### List Pending Todos
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?status=pending"
```

### Find Forgotten Todos
```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?status=pending&sort_by=last_viewed_asc"
```

### Mark Todo as Complete
```bash
curl -X PUT http://localhost:3000/todos/1 \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### Delete a Todo
```bash
curl -X DELETE http://localhost:3000/todos/1 \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

### Run Example Script
```bash
chmod +x example-requests.sh
./example-requests.sh
```

## Important Notes

### Docker Compose Configuration
- `POSTGRES_USER` - PostgreSQL todo database user (default: `todouser`)
- `POSTGRES_DB` - PostgreSQL todo database name (default: `tododb`)
- `POSTGRES_PASSWORD` - PostgreSQL todo database password (required; set this in `.env`)
- `KEYCLOAK_POSTGRES_USER` - Keycloak database user (default: `keycloak`)
- `KEYCLOAK_POSTGRES_DB` - Keycloak database name (default: `keycloak`)
- `KEYCLOAK_POSTGRES_PASSWORD` - Keycloak database password (required; set this in `.env`)
- `KEYCLOAK_ADMIN` - Keycloak admin username (default: `admin`)
- `KEYCLOAK_ADMIN_PASSWORD` - Keycloak admin password (required; set this in `.env`)
- `KEYCLOAK_ISSUER_URL`, `KEYCLOAK_JWKS_URL`, `KEYCLOAK_CLIENT_ID`, `AUTH_REDIRECT_URI`, `AUTH_POST_LOGOUT_REDIRECT_URI` - Auth settings used by the browser login flow
- `DATABASE_URL` - Optional override; otherwise built from the values above

Use `.env.example` as the template for local development.


### Authentication
- Open `/login` to start the Keycloak PKCE flow
- Todo endpoints require an `Authorization: Bearer <access_token>` header
- Each user only sees their own data based on the JWT `sub` claim

### Status Values
- `pending` - Not started
- `in_progress` - Currently working on it
- `completed` - Done

Requests with other status values return `400 Bad Request`.

### Due Dates & Reminders
Todos can have a `due_date` field. When configured with an SMTP server, the app sends reminder emails to users for todos with due dates within the next 48 hours.

### Priority Values
- `low`
- `medium` (default)
- `high`

Requests with other priority values return `400 Bad Request`.

### Sorting Options
Default is `last_viewed_desc` (most recently viewed first)
- `created_asc` - Oldest first
- `created_desc` - Newest first
- `updated_asc` - Least recently updated
- `updated_desc` - Most recently updated
- `last_viewed_asc` - Least recently viewed (find forgotten items)
- `last_viewed_desc` - Most recently viewed

## Database Access

**Inside Docker:**
- Host: `postgres`
- Port: `5432`
- User: `todouser`
- Password: from `POSTGRES_PASSWORD` in `.env`
- Database: `tododb`

**From localhost:**
```bash
psql -h localhost -U ${POSTGRES_USER:-todouser} -d ${POSTGRES_DB:-tododb}
```

## Using with Kubernetes Port-Forward

If you have a staging Keycloak deployment and want to connect your local app via port-forward:

```bash
# Port-forward both services from your staging namespace
kubectl -n test-staging port-forward svc/app-staging-app 8080:80 &
kubectl -n test-staging port-forward svc/app-staging-keycloak 8081:8080
```

Then the app will be available at `http://localhost:8080` and Keycloak at `http://localhost:8081`.

## Documentation

- **Full API docs**: See [API.md](./API.md)
- **Deployment guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Implementation details**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Project overview**: See [README.md](./README.md)

## Troubleshooting

### Containers not starting
Make sure `.env` exists and contains `POSTGRES_PASSWORD` before starting Docker Compose.

```bash
# Check Docker daemon is running
docker ps

# View logs
docker-compose logs

# Rebuild from scratch
docker-compose down
docker-compose up --build
```

### Database connection error
```bash
# Wait for database to be ready
docker-compose ps
# Status should show "healthy" for postgres

# Check database logs
docker-compose logs postgres
```

### Port already in use
```bash
# If port 3000 is in use, change in docker-compose.yml:
# ports:
#   - "3001:3000"  # Use 3001 instead

# If port 5432 is in use:
# ports:
#   - "5433:5432"  # Use 5433 instead
```

## Next Steps

1. Read [API.md](./API.md) for complete API reference
2. Run `./example-requests.sh` for full workflow example
3. See [DEPLOYMENT.md](./DEPLOYMENT.md) for production setup
4. Check [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for architecture details

## Performance Metrics

Check server uptime and resource usage:
```bash
curl http://localhost:3000/metrics | jq
```

## Stop the Application

```bash
# Stop and remove containers
docker-compose down

# Stop but keep data
docker-compose stop

# Resume after stopping
docker-compose start
```
