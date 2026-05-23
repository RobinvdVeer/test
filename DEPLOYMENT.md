# Deployment Guide

This guide covers deployment scenarios for the Todo App backend at various scales.

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

npm start
```

## Docker Compose (Local/Small Team)

### Prerequisites
- Docker
- Docker Compose

### Deployment
```bash
docker-compose up --build
```

This will:
1. Start PostgreSQL container with persistent volume
2. Initialize schema from `init-db.sql`
3. Start Node.js app
4. Expose app on `http://localhost:3000`

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
- Deploy Node.js app to Kubernetes or ECS
- Use managed PostgreSQL (RDS, Cloud SQL, Azure Database for PostgreSQL)
- Use container registry (ECR, Docker Hub, ACR)

Example Kubernetes deployment:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-app
spec:
  replicas: 3
  selector:
    matchLabels:
      app: todo-app
  template:
    metadata:
      labels:
        app: todo-app
    spec:
      containers:
      - name: todo-app
        image: your-registry/todo-app:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: connection-string
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: todo-app-service
spec:
  selector:
    app: todo-app
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

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
```

### Security Considerations

1. **API Security**
   - ✅ User isolation via X-User-Id (replace with JWT in production)
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

### Development
```
PORT=3000
DATABASE_URL=postgresql://todouser:todopass@localhost:5432/tododb
NODE_ENV=development
```

### Production
```
PORT=3000
DATABASE_URL=postgresql://user:password@prod-db.example.com:5432/tododb
NODE_ENV=production
LOG_LEVEL=info
```

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
