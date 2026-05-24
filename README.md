# Todo App Backend

A multi-user todo application backend built with Express.js and PostgreSQL. Includes metrics endpoint for monitoring.

## Features

✅ **OIDC/JWT authorization** - Todo endpoints require bearer tokens and isolate data by token subject  
✅ **Full CRUD operations** - Create, read, update, delete todos  
✅ **Categories and priorities** - Organize todos by category and priority level  
✅ **Status tracking** - Track todo completion status  
✅ **Last viewed tracking** - Find forgotten items that haven't been viewed recently  
✅ **Advanced filtering** - Filter by category, status, and multiple sort options  
✅ **PostgreSQL database** - Production-ready relational database  
✅ **Docker support** - Docker Compose for easy deployment  
✅ **Metrics endpoint** - Monitor process uptime and resource usage  

## Quick Start

### With Docker Compose
```bash
cp .env.example .env # optional: customize local dev defaults
docker-compose up --build
```

The app will be available at `http://localhost:3000`; Keycloak will be available at `http://localhost:8080`.

Local Keycloak defaults: realm `local-dev`, public client `todo-app`, users `alice` / `alicepass` and `bob` / `bobpass`. Keep `.env` auth values aligned with `keycloak/realm-export.json` if you change the local realm, client, role, or port.

### Local Development
```bash
npm install
npm start
```

Requires PostgreSQL running on `localhost:5432` with credentials:
- User: `todouser`
- Password: `todopass`
- Database: `tododb`

## API Documentation

See [API.md](./API.md) for detailed API documentation.

### Quick Example
```bash
# Get a local dev token
TOKEN=$(curl -s -X POST http://localhost:8080/realms/local-dev/protocol/openid-connect/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=todo-app' \
  -d 'grant_type=password' \
  -d 'username=alice' \
  -d 'password=alicepass' | jq -r .access_token)

# Create a todo
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete project",
    "category": "work",
    "priority": "high"
  }'

# List todos
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/todos?category=work"

# Check metrics
curl http://localhost:3000/metrics
```

## Architecture

### Multi-user Design
- Todo endpoints require OIDC JWT bearer tokens
- Users are identified by the token `sub` claim
- Each user has isolated todo data

### Database Schema
- **users** table - Stores user information
- **todos** table - Stores todos with user isolation
- Indexed for performance on user_id, status, category, and last_viewed

### Key Fields
- `title` - Todo title (required)
- `description` - Todo details (optional)
- `category` - Categorize/tag todos (optional)
- `status` - Track completion: pending, in_progress, completed
- `priority` - Priority level: low, medium, high
- `created_at` - Creation timestamp
- `updated_at` - Last modified timestamp
- `last_viewed` - Last interaction time (for forgotten item insights)

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Process metrics |
| GET | `/todos` | List todos (with filtering) |
| POST | `/todos` | Create todo |
| GET | `/todos/:id` | Get todo (updates last_viewed) |
| PUT | `/todos/:id` | Update todo |
| DELETE | `/todos/:id` | Delete todo |

## Development

### Database Initialization
The `init-db.sql` script automatically runs when starting Docker Compose, creating all necessary tables and indexes.

### Environment Variables
- `PORT` - Server port (default: 3000)
- `AUTH_ISSUER` - Expected JWT issuer
- `AUTH_JWKS_URI` - JWKS/public key endpoint used to validate tokens
- `AUTH_CLIENT_ID` / `AUTH_AUDIENCE` - OIDC client and expected access-token audience
- `AUTH_REQUIRED_ROLE` - Required role for todo endpoints (default: `user`)
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - Environment (development/production)

### File Structure
```
.
├── server.js              # Main server and API endpoints
├── package.json           # Dependencies
├── docker-compose.yml     # Docker setup
├── init-db.sql            # Database schema
├── Dockerfile             # App container
├── API.md                 # API documentation
└── README.md              # This file
```

## Technology Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Containerization**: Docker & Docker Compose
- **Database Driver**: pg (node-postgres)

## Performance Considerations

- Database indexes on user_id, status, category, and last_viewed for fast filtering
- Connection pooling via pg Pool for efficient database connections
- Ready to scale to thousands of users with proper database optimization
- Last viewed tracking enables efficient discovery of forgotten tasks

## Future Enhancements
- JWT-based authentication
- Due dates and reminders
- Sharing and collaboration features
- Recurring tasks
- Subtasks/nested todos
- Full-text search
- API rate limiting
- Caching layer (Redis)

