# Deployment

Build/push image target:

```sh
docker build -t ghcr.io/robinvdveer/metrics-server:<tag> .
docker push ghcr.io/robinvdveer/metrics-server:<tag>
```

Install the chart with secrets supplied at deploy time (do not commit real values):

```sh
export POSTGRES_PASSWORD='replace-me'
export DATABASE_URL="postgresql://todouser:${POSTGRES_PASSWORD}@metrics-server-postgres:5432/tododb"
helm upgrade --install metrics-server ./deploy/chart \
  -f ./deploy/values-staging.yaml \
  --set image.app.tag=<tag> \
  --set secrets.create=true \
  --set-string secrets.postgresPassword="$POSTGRES_PASSWORD" \
  --set-string secrets.databaseUrl="$DATABASE_URL"
```

Alternatively set `app.database.secretName` and `postgres.auth.passwordSecretName` to pre-created Kubernetes, External, or Sealed Secrets.
