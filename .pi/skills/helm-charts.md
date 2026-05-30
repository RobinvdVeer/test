# Helm Charts Skill

## Capability-Conditional Templates

Use Helm's `{{- if .Capabilities.APIVersions.Has ... }}` for API version compatibility:

```yaml
apiVersion: {{ if .Capabilities.APIVersions.Has "external-secrets.io/v1" }}external-secrets.io/v1{{ else }}external-secrets.io/v1beta1{{ end }}
```

Use `{{- if .Values.<feature>.enabled }}` to conditionally render optional resources (e.g., notifications, ingress, extra services).

Example:
```yaml
{{- if .Values.app.notifications.enabled }}
# ... notification-related resources or env vars
{{- end }}
```

## Secrets Handling

**Never hardcode secrets.** Use one of these patterns:

1. **Pre-created Kubernetes Secrets** — Reference via `secretKeyRef`:
   ```yaml
   env:
     - name: DATABASE_URL
       valueFrom:
         secretKeyRef:
           name: {{ .Values.app.database.secretName }}
           key: {{ .Values.app.database.secretKey }}
   ```

2. **External Secrets Operator (ESO)** — Use `ExternalSecret` resources (conditional on `.Values.externalSecrets.enabled`):
   ```yaml
   {{- if .Values.externalSecrets.enabled }}
   apiVersion: {{ if .Capabilities.APIVersions.Has "external-secrets.io/v1" }}external-secrets.io/v1{{ else }}external-secrets.io/v1beta1{{ end }}
   kind: ExternalSecret
   metadata:
     name: {{ .Release.Name }}-database
   spec:
     secretStoreRef:
       name: {{ .Values.externalSecrets.secretStoreRef.name | quote }}
       kind: {{ .Values.externalSecrets.secretStoreRef.kind | quote }}
     target:
       name: {{ .Values.app.database.secretName | quote }}
   ```

3. **Transient secrets** — Use `secrets.create: true` with inline `secrets.<name>` values for local/dev only. **Never commit real values.**

## Namespace Conventions

- Use `.Release.Name` as the release prefix for all resource names.
- All resources share the same namespace (set by Helm at install time).
- Don't hardcode namespace labels; let the Helm release manage it.

## Security Context Rules

Always set security contexts on application containers:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  runAsGroup: 1000
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]
```

## Image Tags

**Never commit hardcoded image tags in templates.** Use values-based references:

```yaml
image: "{{ .Values.image.app.repository }}:{{ .Values.image.app.tag }}"
imagePullPolicy: {{ .Values.image.app.pullPolicy }}
```

Set `image.app.tag` via `--set image.app.tag=<tag>` at deploy time. The `values.yaml` default of `latest` is for development convenience only.

## Service Labels

Backend/API services that should be registered on the Kong gateway must include:
```yaml
labels:
  x-kong: "true"
```

This applies to the `app` service in `docker-compose.yml` and any API-facing deployments.

## Environment Variables

Pass configuration to containers via:
- `value` for non-secret configuration
- `valueFrom.secretKeyRef` for secrets
- `valueFrom.configMapKeyRef` for optional non-secret overrides

## Values Structure Convention

Use a hierarchical structure in `values.yaml`:
```yaml
app:
  port: 3000
  nodeEnv: production
  database:
    secretName: metrics-server-database
    secretKey: database-url
  notifications:
    enabled: false
    lookAheadDays: 2
    email:
      secretName: metrics-server-email
      secretKeyHost: smtp-host
      secretKeyUser: smtp-user
      secretKeyPassword: smtp-password
      secretKeyFrom: smtp-from
      port: 587
```

Each optional feature gets its own sub-tree with `enabled: false` as the default.
