# Deployment

Build/push image target:

```sh
docker build -t ghcr.io/robinvdveer/metrics-server:<tag> .
docker push ghcr.io/robinvdveer/metrics-server:<tag>
```

Install the chart and provide secrets via Kubernetes (or External/Sealed Secrets). Do NOT pass credentials on the `helm --set` command line.

## Staging with External Secrets Operator (ESO)

The staging values can use External Secrets Operator when the cluster exposes the `external-secrets.io/v1beta1` API. Before deploying, make sure the referenced `ClusterSecretStore` and remote keys are configured:

- `metrics-server/staging/database` property `database-url`
- `metrics-server/staging/postgres` property `postgres-password`
- `metrics-server/staging/keycloak-postgres` property `postgres-password`
- `metrics-server/staging/keycloak` property `admin-password`

```sh
helm upgrade --install metrics-server ./deploy/chart \
  -f ./deploy/values-staging.yaml \
  --set image.app.tag=<tag>
```

If ESO is not installed, the chart will skip `ExternalSecret` resources; in that case, provide the required Kubernetes Secrets yourself.

## Non-ESO environments

For local/non-ESO environments, disable `externalSecrets.enabled` and either:

- use pre-created Kubernetes/Sealed Secrets named by `app.database.secretName` and `postgres.auth.passwordSecretName`, or
- inject temporary chart-created secrets at deploy time with `secrets.create=true` and `--set-string` values.

Do not commit real secret values.

## Kubernetes/Helm secrets (example placeholders)

If you’re creating your own secrets (for example in environments without ESO), you can create them like:

```sh
kubectl create secret generic metrics-server-postgres \
  --from-literal=postgres-password='REPLACE_ME'

kubectl create secret generic metrics-server-database \
  --from-literal=database-url='postgresql://todouser:REPLACE_ME@metrics-server-postgres:5432/tododb'


```

Then install/upgrade (credentials are referenced by name/keys in values):

```sh
helm upgrade --install metrics-server ./deploy/chart \
  -f ./deploy/values-staging.yaml \
  --set image.app.tag=<tag>
```

Alternatively, set `app.database.secretName` and `postgres.auth.passwordSecretName` to match your pre-created secrets.
