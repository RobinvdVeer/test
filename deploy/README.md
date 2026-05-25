# Deployment

Build/push image target:

```sh
docker build -t ghcr.io/robinvdveer/metrics-server:<tag> .
docker push ghcr.io/robinvdveer/metrics-server:<tag>
```

The staging values use External Secrets Operator. Before deploying, make sure the cluster has the referenced `ClusterSecretStore` and remote keys configured:

- `metrics-server/staging/database` property `database-url`
- `metrics-server/staging/postgres` property `postgres-password`

```sh
helm upgrade --install metrics-server ./deploy/chart \
  -f ./deploy/values-staging.yaml \
  --set image.app.tag=<tag>
```

For local/non-ESO environments, disable `externalSecrets.enabled` and either provide pre-created Kubernetes/Sealed Secrets named by `app.database.secretName` and `postgres.auth.passwordSecretName`, or inject temporary chart-created secrets at deploy time with `secrets.create=true` and `--set-string` values. Do not commit real secret values.
