# Metrics & Todo API

A multi-user todo and metrics API built with Express.js and PostgreSQL. Includes a metrics endpoint for monitoring.

## Features

✅ **Multi-user support** - Users identified via Keycloak JWT bearer tokens  
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
cp .env.example .env
# Edit .env and set the database and Keycloak passwords.
docker-compose up --build
```

The app will be available at `http://localhost:3000` and the login page at `http://localhost:3000/login`. Keycloak runs on `http://localhost:8081`.

### Local Development
```bash
npm install
npm start
```

Requires PostgreSQL running on `localhost:5432`. Configure it with the environment variables below or a `DATABASE_URL` connection string.

## API Documentation

See [API.md](./API.md) for detailed API documentation.

### Quick Example
```bash
# Create a todo
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Complete project",
    "category": "work",
    "priority": "high"
  }'

# List todos
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3000/todos?category=work"

# Check metrics
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:3000/metrics

# Fetch OpenAPI document for Kong/gateway registration
curl http://localhost:3000/openapi.json
```

## Architecture

### Multi-user Design
- Users are identified via Keycloak access tokens
- Each user has isolated todo data
- JWT bearer authentication with PKCE login flow

### Database Schema
- **users** table - Stores user information
- **todos** table - Stores todos with user isolation
- Indexed for performance on user_id, status, category, and last_viewed

### Key Fields
- `title` - Todo title (required)
- `description` - Todo details (optional)
- `category` - Categorize/tag todos (optional)
- `status` - Track completion: one of `pending`, `in_progress`, `completed`
- `priority` - Priority level: one of `low`, `medium`, `high`
- `created_at` - Creation timestamp
- `updated_at` - Last modified timestamp
- `last_viewed` - Last interaction time (for forgotten item insights)

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/openapi.json` | OpenAPI 3 document for gateway registration |
| GET | `/api/docs/openapi.json` | OpenAPI 3 document alias |
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
- `POSTGRES_USER` - PostgreSQL user for Docker Compose (default: `todouser`)
- `POSTGRES_DB` - PostgreSQL database for Docker Compose (default: `tododb`)
- `POSTGRES_PASSWORD` - PostgreSQL password for Docker Compose (required; set in `.env`)
- `DATABASE_URL` - PostgreSQL connection string (optional in Docker Compose; defaults from the PostgreSQL variables)
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
├── openapi.json           # OpenAPI 3 document
├── .env.example           # Local Docker Compose environment template
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

## Authentication
- Open `http://localhost:3000/login` to sign in or self-register with Keycloak.
- The app uses PKCE to obtain an access token and stores it in the browser for API calls.
- Relevant config: `APP_BASE_URL`, `KEYCLOAK_ISSUER`, `KEYCLOAK_JWKS_URL`, and `KEYCLOAK_CLIENT_ID`.

## Future Enhancements
- Due dates and reminders
- Sharing and collaboration features
- Recurring tasks
- Subtasks/nested todos
- Full-text search
- API rate limiting
- Caching layer (Redis)

