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
    const keycloakDeployment = docs.find((doc) => doc.kind === 'Deployment' && doc.metadata.name === 'test-keycloak');
    const keycloakSecret = docs.find((doc) => doc.kind === 'Secret' && doc.metadata.name === 'metrics-server-keycloak');
    const keycloakRealm = docs.find((doc) => doc.kind === 'ConfigMap' && doc.metadata.name === 'test-keycloak-realm');

    expect(appDeployment.spec.template.spec.containers[0].image).toBe('example.test/app:abc123');
    expect(appDeployment.spec.template.spec.containers[0].env).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'KEYCLOAK_ISSUER_URL', value: 'http://localhost:8081/realms/todos' }),
      expect.objectContaining({ name: 'KEYCLOAK_JWKS_URL' }),
      expect.objectContaining({ name: 'KEYCLOAK_CLIENT_ID', value: 'todo-app' }),
    ]));

    expect(keycloakDeployment.spec.template.spec.containers[0].image).toBe('example.test/keycloak:kc123');
    expect(keycloakSecret.stringData['postgres-password']).toBe('kc-pass');
    expect(keycloakSecret.stringData['admin-password']).toBe('kc-admin');
    expect(keycloakRealm.data['realm.json']).toContain('"clientId": "todo-app"');
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
    expect(externalSecrets.map((doc) => doc.metadata.name)).toEqual(
      expect.arrayContaining(['test-database', 'test-postgres', 'test-keycloak'])
    );
  });
});
