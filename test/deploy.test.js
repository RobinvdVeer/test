const { execFileSync } = require('child_process');
const fs = require('fs');
const yaml = require('js-yaml');

function readYaml(path) {
  return yaml.load(fs.readFileSync(path, 'utf8'));
}

function commandExists(command) {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch (_) {
    return false;
  }
}

describe('docker compose deployability conventions', () => {
  test('includes app, postgres, keycloak postgres, and keycloak services', () => {
    const compose = readYaml('docker-compose.yml');

    expect(compose.services.app.build.context).toBe('.');
    expect(compose.services.app.image).toBe('ghcr.io/robinvdveer/metrics-server:latest');
    expect(compose.services.app.labels['x-kong']).toBe('true');

    expect(compose.services.postgres.image).toBe('postgres:16-alpine');
    expect(compose.services['keycloak-postgres'].image).toBe('postgres:16-alpine');
    expect(compose.services.keycloak.image).toBe('quay.io/keycloak/keycloak:25.0.6');

    const rendered = execFileSync('env', [
      '-u', 'DATABASE_URL',
      'POSTGRES_PASSWORD=test',
      'KEYCLOAK_POSTGRES_PASSWORD=test',
      'KEYCLOAK_ADMIN_PASSWORD=test',
      'docker', 'compose', 'config'
    ], { encoding: 'utf8' });

    expect(rendered).toContain('KEYCLOAK_ISSUER_URL');
    expect(rendered).toContain('http://localhost:8081/realms/todos');
    expect(rendered).toContain('keycloak-postgres');
  });
});

describe('helm chart deployability conventions', () => {
  const helmAvailable = commandExists('helm');
  const maybeTest = helmAvailable ? test : test.skip;

  maybeTest('renders app, keycloak, postgres, secrets, and external secrets', () => {
    execFileSync('helm', ['lint', 'deploy/chart'], { stdio: 'pipe' });

    const rendered = execFileSync('helm', [
      'template', 'test', 'deploy/chart',
      '--set', 'image.app.repository=example.test/app',
      '--set', 'image.app.tag=abc123',
      '--set', 'image.postgres.repository=example.test/postgres',
      '--set', 'image.postgres.tag=pg123',
      '--set', 'image.keycloak.repository=example.test/keycloak',
      '--set', 'image.keycloak.tag=kc123',
      '--set', 'secrets.create=true',
      '--set-string', 'secrets.databaseUrl=postgresql://user:pass@test-postgres:5432/db',
      '--set-string', 'secrets.postgresPassword=pass',
      '--set-string', 'secrets.keycloakPostgresPassword=kc-pass',
      '--set-string', 'secrets.keycloakAdminPassword=kc-admin'
    ], { encoding: 'utf8' });

    const docs = yaml.loadAll(rendered).filter(Boolean);
    const appDeployment = docs.find((doc) => doc.kind === 'Deployment' && doc.metadata.name === 'test-app');
    const keycloakPostgresDeployment = docs.find((doc) => doc.kind === 'Deployment' && doc.metadata.name === 'test-keycloak-postgres');
    const keycloakDeployment = docs.find((doc) => doc.kind === 'Deployment' && doc.metadata.name === 'test-keycloak');
    const keycloakService = docs.find((doc) => doc.kind === 'Service' && doc.metadata.name === 'test-keycloak');
    const keycloakSecret = docs.find((doc) => doc.kind === 'Secret' && doc.metadata.name === 'metrics-server-keycloak');
    const keycloakRealm = docs.find((doc) => doc.kind === 'ConfigMap' && doc.metadata.name === 'test-keycloak-realm');

    expect(appDeployment.spec.template.spec.containers[0].image).toBe('example.test/app:abc123');
    expect(appDeployment.spec.template.spec.containers[0].env).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'KEYCLOAK_ISSUER_URL', value: 'http://localhost:8081/realms/todos' }),
      expect.objectContaining({ name: 'KEYCLOAK_JWKS_URL' }),
      expect.objectContaining({ name: 'KEYCLOAK_AUTHORIZE_URL', value: 'http://localhost:8081/realms/todos/protocol/openid-connect/auth' }),
      expect.objectContaining({ name: 'KEYCLOAK_TOKEN_URL', value: 'http://localhost:8081/realms/todos/protocol/openid-connect/token' }),
      expect.objectContaining({ name: 'KEYCLOAK_LOGOUT_URL', value: 'http://localhost:8081/realms/todos/protocol/openid-connect/logout' }),
      expect.objectContaining({ name: 'AUTH_REDIRECT_URI', value: 'http://localhost:3000/auth/callback' }),
      expect.objectContaining({ name: 'AUTH_POST_LOGOUT_REDIRECT_URI', value: 'http://localhost:3000/login' }),
      expect.objectContaining({ name: 'KEYCLOAK_CLIENT_ID', value: 'todo-app' }),
    ]));

    expect(keycloakPostgresDeployment.spec.template.spec.containers[0].env).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'POSTGRES_USER', value: 'keycloak' }),
      expect.objectContaining({ name: 'POSTGRES_DB', value: 'keycloak' }),
      expect.objectContaining({ name: 'POSTGRES_PASSWORD', valueFrom: { secretKeyRef: { name: 'metrics-server-keycloak', key: 'postgres-password' } } }),
    ]));

    expect(keycloakDeployment.spec.template.spec.containers[0].image).toBe('example.test/keycloak:kc123');
    expect(keycloakDeployment.spec.template.spec.containers[0].command).toEqual(['/opt/keycloak/bin/kc.sh', 'start-dev', '--import-realm']);
    expect(keycloakDeployment.spec.template.spec.containers[0].env).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'KEYCLOAK_ADMIN', value: 'admin' }),
      expect.objectContaining({ name: 'KEYCLOAK_ADMIN_PASSWORD', valueFrom: { secretKeyRef: { name: 'metrics-server-keycloak', key: 'admin-password' } } }),
      expect.objectContaining({ name: 'KC_DB_URL', value: 'jdbc:postgresql://test-keycloak-postgres:5432/keycloak' }),
      expect.objectContaining({ name: 'KC_DB_USERNAME', value: 'keycloak' }),
      expect.objectContaining({ name: 'KC_DB_PASSWORD', valueFrom: { secretKeyRef: { name: 'metrics-server-keycloak', key: 'postgres-password' } } }),
      expect.objectContaining({ name: 'KC_HOSTNAME', value: 'localhost' }),
      expect.objectContaining({ name: 'KC_HOSTNAME_PORT', value: '8080' }),
    ]));
    expect(keycloakDeployment.spec.template.spec.containers[0].volumeMounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ mountPath: '/opt/keycloak/data/import/realm.json', subPath: 'realm.json' }),
    ]));

    expect(keycloakService.spec.type).toBe('ClusterIP');
    expect(keycloakService.spec.ports[0]).toMatchObject({ port: 8080, targetPort: 'http', name: 'http' });
    expect(keycloakSecret.stringData['postgres-password']).toBe('kc-pass');
    expect(keycloakSecret.stringData['admin-password']).toBe('kc-admin');
    expect(keycloakRealm.data['realm.json']).toContain('"realm": "todos"');
    expect(keycloakRealm.data['realm.json']).toContain('"clientId": "todo-app"');
    expect(keycloakRealm.data['realm.json']).toContain('http://localhost:3000/auth/callback');
    expect(keycloakRealm.data['realm.json']).toContain('http://localhost:3000');
  });

  maybeTest('renders ExternalSecret resources when enabled (staging)', () => {
    const rendered = execFileSync(
      'helm',
      [
        'template',
        'test',
        'deploy/chart',
        '-f',
        'deploy/values-staging.yaml',
      ],
      { encoding: 'utf8' }
    );

    const docs = yaml.loadAll(rendered).filter(Boolean);
    const externalSecrets = docs.filter((doc) => doc.kind === 'ExternalSecret');

    expect(externalSecrets.length).toBeGreaterThanOrEqual(3);
  });
});
