# Metrics & Todo API

A multi-user todo and metrics app with Keycloak auth, PostgreSQL, and a minimal browser login page.

## Features
- Keycloak login using PKCE
- JWT bearer auth on todo APIs
- Users only see their own todos
- PostgreSQL-backed persistence
- Docker Compose and Helm support
- Public health and OpenAPI routes

## Quick Start
```bash
cp .env.example .env
# Set the passwords in .env
docker compose up --build
```

Open:
- App/login: `http://localhost:3000/login`
- API docs: `http://localhost:3000/openapi.json`
- Keycloak: `http://localhost:8081`

## Auth flow
1. Open `/login`
2. Click **Login**
3. Keycloak authenticates the user
4. The callback exchanges the code for JWTs using PKCE
5. The app stores the bearer token and redirects to the todo list

## API
- `GET /health` – public health check
- `GET /openapi.json` – public OpenAPI doc
- `GET /metrics` – public metrics
- `GET /todos` – list current user todos
- `POST /todos` – create todo
- `GET /todos/:id` – get todo
- `PUT /todos/:id` – update todo
- `DELETE /todos/:id` – delete todo

## Environment
See `.env.example` for the full local Docker Compose configuration.

- `DATABASE_URL`
- `POSTGRES_USER`
- `POSTGRES_DB`
- `POSTGRES_PASSWORD`
- `KEYCLOAK_POSTGRES_USER`
- `KEYCLOAK_POSTGRES_DB`
- `KEYCLOAK_POSTGRES_PASSWORD`
- `KEYCLOAK_ADMIN`
- `KEYCLOAK_ADMIN_PASSWORD`
- `KEYCLOAK_ISSUER_URL`
- `KEYCLOAK_JWKS_URL`
- `KEYCLOAK_CLIENT_ID`
- `AUTH_REDIRECT_URI`
- `AUTH_POST_LOGOUT_REDIRECT_URI`

## Notes
- Todo ownership is derived from the JWT `sub` claim.
- Public routes stay unauthenticated.
- A dedicated Postgres instance is used for Keycloak.
