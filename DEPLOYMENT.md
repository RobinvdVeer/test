# Deployment Guide

This guide covers deployment scenarios for the Metrics Todo API at various scales.

## Local Development

### Prerequisites
- Node.js 18+
- PostgreSQL 12+

### Setup
```bash
npm install

# Create database
createdb tododb
psql -U postgres tododb < init-db.sql

export DATABASE_URL=postgresql://todouser:<password>@localhost:5432/tododb
npm start
```

## Docker Compose (Local/Small Team)

### Prerequisites
- Docker
- Docker Compose

### Deployment
```bash
cp .env.example .env
# Edit .env and set the required passwords.
docker-compose up --build
```

This will:
1. Start the todo PostgreSQL container with persistent volume
2. Start a dedicated Keycloak PostgreSQL container
3. Start Keycloak and import the demo realm
4. Start Node.js app
5. Expose app on `http://localhost:3000`

The browser login flow uses `http://localhost:3000/login` and Keycloak is exposed on `http://localhost:8081`.

### Teardown
```bash
docker-compose down
# Keep data: docker-compose down -v (removes volumes)
```

## Production Deployment (Thousands of Users)

### Architecture Recommendations

#### 1. Containerized Deployment (Kubernetes/ECS)

**Benefits:**
- Auto-scaling
- Load balancing
- Health checks and automatic recovery
- Rolling updates

**Setup:**
- Build and push the app image as `ghcr.io/robinvdveer/metrics-server:<tag>`
- Deploy with the Helm chart in `deploy/chart`
- Supply todo database, Keycloak database, and Keycloak admin credentials as Kubernetes, External, or Sealed Secrets; do not commit real secret values
- Use managed PostgreSQL for production, or the chart's PostgreSQL services for simple environments

Primary Kubernetes deployment path:
```bash
docker build -t ghcr.io/robinvdveer/metrics-server:<tag> .
docker push ghcr.io/robinvdveer/metrics-server:<tag>

export POSTGRES_PASSWORD='replace-me'
export KEYCLOAK_POSTGRES_PASSWORD='replace-me'
export KEYCLOAK_ADMIN_PASSWORD='replace-me'
export DATABASE_URL="postgresql://todouser:${POSTGRES_PASSWORD}@metrics-server-postgres:5432/tododb"
helm upgrade --install metrics-server ./deploy/chart \
  -f ./deploy/values-staging.yaml \
  --set image.app.tag=<tag> \
  --set secrets.create=true \
  --set-string secrets.postgresPassword="$POSTGRES_PASSWORD" \
  --set-string secrets.databaseUrl="$DATABASE_URL" \
  --set-string secrets.keycloakPostgresPassword="$KEYCLOAK_POSTGRES_PASSWORD" \
  --set-string secrets.keycloakAdminPassword="$KEYCLOAK_ADMIN_PASSWORD"
```

### Local Development via Kubernetes Port-Forward

If you want to connect the app (running locally) to a staging Keycloak instance:

```bash
# Port-forward both services from your staging namespace
kubectl -n test-staging port-forward svc/app-staging-app 8080:80 &
kubectl -n test-staging port-forward svc/app-staging-keycloak 8081:8080
```

Then deploy the chart with the local port-forward values:
```bash
helm upgrade --install metrics-server-local ./deploy/chart \
  -f ./deploy/values-local.yaml \
  --set image.app.tag=<tag>
```

See [deploy/README.md](./deploy/README.md) and [deploy/chart](./deploy/chart) for the chart values and secret options.

#### 2. Database Scaling

**For thousands of users:**

1. **Connection Pooling**
   - Use PgBouncer or similar proxy
   - Already using pg Pool with appropriate pool size

2. **Read Replicas**
   - Create read-only replicas for GET requests
   - Primary for write operations (POST/PUT/DELETE)

3. **Partitioning**
   ```sql
   -- Partition todos table by user_id for large datasets
   CREATE TABLE todos_partitioned (
     id SERIAL,
     user_id VARCHAR(255),
     -- ... other fields
   ) PARTITION BY HASH (user_id);
   ```

4. **Indexing Strategy**
   ```sql
   -- Already implemented in init-db.sql
   - Index on (user_id, status) for filtering
   - Index on (user_id, category) for categorization
   - Index on (user_id, last_viewed) for forgotten items
   ```

5. **Caching Layer**
   - Add Redis for frequently accessed data
   - Cache user's todo list (invalidate on updates)
   - Cache category/status aggregations

#### 3. Application Optimization

**Current Implementation Ready For:**
- ✅ Connection pooling (pg Pool)
- ✅ Parameterized queries (SQL injection prevention)
- ✅ Proper indexing
- ✅ User isolation (multi-tenant data model)

**Recommended Additions:**

1. **Error Handling & Logging**
   ```bash
   npm install winston   # For structured logging
   npm install newrelic  # For APM monitoring
   ```

2. **Rate Limiting**
   ```bash
   npm install express-rate-limit
   ```

3. **Compression**
   ```bash
   npm install compression
   ```

4. **Request Validation**
   ```bash
   npm install joi  # For schema validation
   ```

### Monitoring and Observability

#### Metrics to Track
- Request latency (p50, p95, p99)
- Database query performance
- Error rates by endpoint
- Active connections
- CPU and memory usage

#### Tools
- **Prometheus** - Metrics collection
- **Grafana** - Visualization
- **ELK Stack** - Logging and analysis
- **Datadog/New Relic** - Full APM

#### Health Check
```bash
curl http://your-app/health
# Response: { "status": "ok" }
```

#### Metrics Endpoint
```bash
curl http://your-app/metrics
# Returns: uptime, memory, CPU, process info

curl http://your-app/openapi.json
# Returns: OpenAPI 3 document for Kong/gateway registration
```

### Security Considerations

1. **API Security**
   - ✅ User isolation via JWT bearer tokens (Keycloak)
   - ✅ Parameterized queries (prevents SQL injection)
   - [ ] Add rate limiting
   - [ ] Add HTTPS/TLS
   - [ ] Add request body size limits
   - [ ] Add CORS configuration

2. **Database Security**
   - Use strong passwords for DB credentials
   - Store credentials in environment variables or secrets manager
   - Use VPC/private networks for DB access
   - Enable SSL for DB connections
   - Regular backups

3. **Infrastructure Security**
   - Use secrets management (AWS Secrets Manager, Azure Key Vault, etc.)
   - Implement network policies/security groups
   - Enable audit logging
   - Regular security scanning of dependencies

### Example: AWS ECS Deployment

```bash
# Build and push image
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker build -t todo-app .
docker tag todo-app:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/todo-app:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/todo-app:latest

# Create RDS PostgreSQL instance
aws rds create-db-instance \
  --db-instance-identifier todo-db \
  --engine postgres \
  --db-instance-class db.t3.micro \
  --allocated-storage 20

# Create ECS cluster and service
aws ecs create-cluster --cluster-name todo-cluster
aws ecs register-task-definition --cli-input-json file://task-definition.json
aws ecs create-service --cluster todo-cluster --service-name todo-app --task-definition todo-app:1 --desired-count 3
```

### Example: Azure Container Instances & Database

```bash
# Create resource group
az group create --name todo-rg --location eastus

# Create PostgreSQL server
az postgres server create \
  --resource-group todo-rg \
  --name todo-db \
  --admin-user todouser \
  --admin-password 'StrongPassword123!' \
  --sku-name B_Gen5_1

# Build and push to ACR
az acr build --registry todoregistry --image todo-app:latest .

# Deploy to Container Instances
az container create \
  --resource-group todo-rg \
  --name todo-app \
  --image todoregistry.azurecr.io/todo-app:latest \
  --ports 3000 \
  --environment-variables DATABASE_URL="postgresql://..." \
  --dns-name-label todo-app
```

### Performance Targets

For thousands of concurrent users:

| Metric | Target | Method |
|--------|--------|--------|
| p50 latency | < 100ms | Load balancing, caching |
| p99 latency | < 500ms | Query optimization, indexing |
| Error rate | < 0.1% | Monitoring, alerting |
| Availability | 99.9% | Multi-region, failover |
| DB connections | < 20/pod | Connection pooling |

### Scaling Strategy

1. **Vertical Scaling** (current scale)
   - Increase container resources
   - Upgrade database instance

2. **Horizontal Scaling** (as needed)
   - Run multiple app instances behind load balancer
   - Implement read replicas for database
   - Add caching layer (Redis)

3. **Geographic Scaling** (future)
   - Deploy to multiple regions
   - Use CDN for static assets
   - Cross-region database replication

## Environment Variables

### Docker Compose
```
PORT=3000
POSTGRES_USER=todouser
POSTGRES_DB=tododb
POSTGRES_PASSWORD=change-me
KEYCLOAK_POSTGRES_USER=keycloak
KEYCLOAK_POSTGRES_DB=keycloak
KEYCLOAK_POSTGRES_PASSWORD=change-me
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=change-me
KEYCLOAK_ISSUER_URL=http://localhost:8081/realms/todos
KEYCLOAK_JWKS_URL=http://keycloak:8080/realms/todos/protocol/openid-connect/certs
KEYCLOAK_CLIENT_ID=todo-app
AUTH_REDIRECT_URI=http://localhost:3000/auth/callback
AUTH_POST_LOGOUT_REDIRECT_URI=http://localhost:3000/login
DATABASE_URL=postgresql://todouser:change-me@localhost:5432/tododb
NODE_ENV=development
```

### Helm chart (via `values-staging.yaml`)
The Helm chart derives these values from `values.yaml` and environment-overrides:
- `KEYCLOAK_ISSUER_URL` / `AUTHORIZE_URL` / `TOKEN_URL` / `LOGOUT_URL` come from `app.auth.*`
- `KEYCLOAK_JWKS_URL` is derived from `keycloak.publicUrl` in the chart template
- `redirectUri` / `postLogoutRedirectUri` come from `app.auth.*`

### Production
```
PORT=3000
DATABASE_URL=postgresql://user:password@prod-db.example.com:5432/tododb
KEYCLOAK_ISSUER_URL=https://keycloak.example.com/realms/todos
KEYCLOAK_JWKS_URL=https://keycloak.example.com/realms/todos/protocol/openid-connect/certs
KEYCLOAK_CLIENT_ID=todo-app
AUTH_REDIRECT_URI=https://app.example.com/auth/callback
AUTH_POST_LOGOUT_REDIRECT_URI=https://app.example.com/login
NODE_ENV=production
LOG_LEVEL=info
```

For Docker Compose, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD`, `KEYCLOAK_POSTGRES_PASSWORD`, and `KEYCLOAK_ADMIN_PASSWORD`; `DATABASE_URL` is optional and defaults from the PostgreSQL variables.

## Backup and Recovery

### Database Backups
```bash
# Manual backup
pg_dump -U todouser -h localhost tododb > backup.sql

# Restore
psql -U todouser -h localhost tododb < backup.sql

# Automated backups (AWS RDS example)
aws rds create-db-snapshot \
  --db-instance-identifier todo-db \
  --db-snapshot-identifier todo-db-$(date +%Y%m%d)
```

## Rollback Procedure

1. Keep previous version image in registry
2. Update deployment to previous image
3. Verify health checks pass
4. Run smoke tests

```bash
# Kubernetes rollback
kubectl rollout undo deployment/todo-app

# Docker Compose rollback
git revert <commit>
docker-compose up --build
```

## Cost Optimization

- Use container auto-scaling to match demand
- Use spot instances for non-critical workloads
- Set appropriate database storage limits
- Monitor and clean up unused resources
- Use multi-region only if necessary

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check DATABASE_URL format
   - Verify network connectivity
   - Check database credentials
   - Review security group/firewall rules

2. **High Latency**
   - Check database query performance
   - Review indexes
   - Check connection pool saturation
   - Monitor CPU/memory usage

3. **Out of Memory**
   - Review application heap usage
   - Check for memory leaks
   - Increase container memory limits
   - Optimize query results size

4. **Database Connection Pool Exhaustion**
   - Increase pool size
   - Implement connection pooling proxy
   - Review long-running queries
   - Add query timeouts
