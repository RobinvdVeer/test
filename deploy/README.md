# Deployment

Build/push image target:

```sh
docker build -t ghcr.io/robinvdveer/metrics-server:<tag> .
docker push ghcr.io/robinvdveer/metrics-server:<tag>
```

Install the chart and provide secrets via Kubernetes (or External/Sealed Secrets). Do NOT pass credentials on the `helm --set` command line.

1) Create secrets (example placeholders):

```sh
kubectl create secret generic metrics-server-postgres \
  --from-literal=postgres-password='REPLACE_ME'

kubectl create secret generic metrics-server-database \
  --from-literal=database-url='postgresql://todouser:REPLACE_ME@metrics-server-postgres:5432/tododb'

kubectl create secret generic metrics-server-jwt \
  --from-literal=jwt-secret='REPLACE_ME'
```

2) Install/upgrade (credentials are referenced by name/keys in values):

```sh
helm upgrade --install metrics-server ./deploy/chart \
  -f ./deploy/values-staging.yaml \
  --set image.app.tag=<tag>
```

Alternatively, set `app.database.secretName`, `postgres.auth.passwordSecretName`, and `app.jwt.secretName` to match your pre-created secrets.
