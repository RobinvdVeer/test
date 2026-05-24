# Todo App Backend - Quick Start

## 5-Minute Setup

### Prerequisites
- Docker and Docker Compose installed
- `jq` installed for the token examples

### Start the Application
```bash
docker-compose up --build
```

This starts the app, the todo PostgreSQL database, Keycloak, and Keycloak's dedicated PostgreSQL database.

The app will be available at `http://localhost:3000`; Keycloak will be available at `http://localhost:8080`.

## Get a Local Dev Token

Todo endpoints require a JWT bearer token. The local Keycloak realm includes a public `todo-app` client and two sample users: `alice` / `alicepass` and `bob` / `bobpass`.

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/realms/local-dev/protocol/openid-connect/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=todo-app' \
  -d 'grant_type=password' \
  -d 'username=alice' \
  -d 'password=alicepass' | jq -r .access_token)
```

## Common Commands

### Test Health
```bash
curl http://localhost:3000/health
```

### Check Frontend Auth Config
```bash
curl http://localhost:3000/auth/config | jq
```

### Create a Todo
```bash
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries",
    "category": "personal",
    "priority": "medium"
  }'
```

### List Todos
```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/todos"
```

### List Work Todos
```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/todos?category=work"
```

### List Pending Todos
```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/todos?status=pending"
```

### Find Forgotten Todos
```bash
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/todos?status=pending&sort_by=last_viewed_asc"
```

### Mark Todo as Complete
```bash
curl -X PUT http://localhost:3000/todos/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### Delete a Todo
```bash
curl -X DELETE http://localhost:3000/todos/1 \
  -H "Authorization: Bearer $TOKEN"
```

### Run Example Script
```bash
chmod +x example-requests.sh
./example-requests.sh
```

## Important Notes

### Authentication and User Isolation
- All todo endpoints require `Authorization: Bearer <access-token>`.
- Tokens are issued by the configured OIDC identity provider. Local Docker Compose uses Keycloak realm `local-dev`.
- The API validates JWTs with the provider's JWKS/public key endpoint and requires the `user` role by default.
- Each user's todos are isolated by the token `sub` claim.
- `/health`, `/metrics`, and `/auth/config` are public endpoints.

### Status Values
- `pending` - Not started
- `in_progress` - Currently working on it
- `completed` - Done

### Priority Values
- `low`
- `medium` (default)
- `high`

### Sorting Options
Default is `last_viewed_desc` (most recently viewed first)
- `created_asc` - Oldest first
- `created_desc` - Newest first
- `updated_asc` - Least recently updated
- `updated_desc` - Most recently updated
- `last_viewed_asc` - Least recently viewed (find forgotten items)
- `last_viewed_desc` - Most recently viewed

## Database Access

**Todo PostgreSQL inside Docker:**
- Host: `postgres`
- Port: `5432`
- User: `todouser`
- Password: `todopass`
- Database: `tododb`

**Todo PostgreSQL from localhost:**
```bash
psql -h localhost -U todouser -d tododb
```

**Keycloak PostgreSQL from localhost:**
- Host: `localhost`
- Port: `5433`
- User: `keycloak`
- Password: `keycloakpass`
- Database: `keycloak`

## Documentation

- **Full API docs**: See [API.md](./API.md)
- **Deployment guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Implementation details**: See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **Project overview**: See [README.md](./README.md)

## Troubleshooting

### Containers not starting
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
# Wait for databases to be ready
docker-compose ps
# Status should show "healthy" for postgres and keycloak-postgres

# Check database logs
docker-compose logs postgres
docker-compose logs keycloak-postgres
```

### Token request fails
```bash
# Check Keycloak logs and wait for realm import to finish
docker-compose logs keycloak

# Verify the realm is reachable
curl http://localhost:8080/realms/local-dev/.well-known/openid-configuration | jq
```

### Port already in use
```bash
# If port 3000 is in use, change in docker-compose.yml:
# ports:
#   - "3001:3000"  # Use 3001 instead

# If port 5432 is in use:
# ports:
#   - "5434:5432"  # Use another host port for todo Postgres

# If port 8080 is in use, change the Keycloak host port and update PUBLIC_AUTH_ISSUER accordingly.
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
