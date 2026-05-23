# Todo App Backend - Quick Start

## 5-Minute Setup

### Prerequisites
- Docker and Docker Compose installed

### Start the Application
```bash
docker-compose up --build
```

The app will be available at `http://localhost:3000`

## Common Commands

### Test Health
```bash
curl http://localhost:3000/health
```

### Create a Todo
```bash
curl -X POST http://localhost:3000/todos \
  -H "X-User-Id: user123" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Buy groceries",
    "category": "personal",
    "priority": "medium"
  }'
```

### List Todos
```bash
curl -H "X-User-Id: user123" "http://localhost:3000/todos"
```

### List Work Todos
```bash
curl -H "X-User-Id: user123" "http://localhost:3000/todos?category=work"
```

### List Pending Todos
```bash
curl -H "X-User-Id: user123" "http://localhost:3000/todos?status=pending"
```

### Find Forgotten Todos
```bash
curl -H "X-User-Id: user123" "http://localhost:3000/todos?status=pending&sort_by=last_viewed_asc"
```

### Mark Todo as Complete
```bash
curl -X PUT http://localhost:3000/todos/1 \
  -H "X-User-Id: user123" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'
```

### Delete a Todo
```bash
curl -X DELETE http://localhost:3000/todos/1 \
  -H "X-User-Id: user123"
```

### Run Example Script
```bash
chmod +x example-requests.sh
./example-requests.sh
```

## Important Notes

### User Identification
- All todo endpoints require the `X-User-Id` header
- Each user gets isolated data
- Example: `X-User-Id: user123`

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

**Inside Docker:**
- Host: `postgres`
- Port: `5432`
- User: `todouser`
- Password: `todopass`
- Database: `tododb`

**From localhost:**
```bash
psql -h localhost -U todouser -d tododb
```

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
