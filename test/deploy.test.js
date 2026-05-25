const fs = require('fs');
const { execFileSync, execSync } = require('child_process');
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
  test('app is buildable and pushable while postgres remains external image-only', () => {
    const compose = readYaml('docker-compose.yml');

    expect(compose.services.app.build.context).toBe('.');
    expect(compose.services.app.image).toBe('ghcr.io/robinvdveer/metrics-server:latest');
    expect(compose.services.app.labels['x-kong']).toBe('true');
    expect(compose.services.postgres.image).toBe('postgres:16-alpine');
    expect(compose.services.postgres.build).toBeUndefined();
    expect(compose.services.postgres.labels).toBeUndefined();

    const rendered = execFileSync('env', [
      '-u', 'DATABASE_URL',
      'POSTGRES_PASSWORD=test',
      'KEYCLOAK_POSTGRES_PASSWORD=test',
      'KEYCLOAK_ADMIN_PASSWORD=test',
      'JWT_SECRET=test',
      'docker', 'compose', 'config'
    ], { encoding: 'utf8' });

    expect(rendered).toContain('ghcr.io/robinvdveer/metrics-server:latest');
    expect(rendered).toContain('postgres:16-alpine');
    expect(rendered).not.toContain('todopass');
  });
});

describe('helm chart deployability conventions', () => {
  const helmAvailable = commandExists('helm');
  const maybeTest = helmAvailable ? test : test.skip;

  maybeTest('renders images, probes, env secrets, and optional secrets from values', () => {
    execFileSync('helm', ['lint', 'deploy/chart'], { stdio: 'pipe' });

    const rendered = execFileSync('helm', [
      'template', 'test', 'deploy/chart',
      '--set', 'image.app.repository=example.test/app',
      '--set', 'image.app.tag=abc123',
      '--set', 'image.postgres.repository=example.test/postgres',
      '--set', 'image.postgres.tag=pg123',
      '--set', 'secrets.create=true',
      '--set-string', 'secrets.databaseUrl=postgresql://user:pass@test-postgres:5432/db',
      '--set-string', 'secrets.postgresPassword=pass'
    ], { encoding: 'utf8' });

    const docs = yaml.loadAll(rendered).filter(Boolean);
    const appDeployment = docs.find((doc) => doc.kind === 'Deployment' && doc.metadata.name === 'test-app');
    const postgresDeployment = docs.find((doc) => doc.kind === 'Deployment' && doc.metadata.name === 'test-postgres');
    const databaseSecret = docs.find((doc) => doc.kind === 'Secret' && doc.metadata.name === 'metrics-server-database');
    const postgresSecret = docs.find((doc) => doc.kind === 'Secret' && doc.metadata.name === 'metrics-server-postgres');

    expect(appDeployment.spec.template.spec.containers[0].image).toBe('example.test/app:abc123');
    expect(appDeployment.spec.template.spec.containers[0].readinessProbe.httpGet.path).toBe('/health');
    expect(appDeployment.spec.template.spec.containers[0].livenessProbe.httpGet.path).toBe('/health');
    expect(appDeployment.spec.template.spec.containers[0].env).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'DATABASE_URL',
        valueFrom: { secretKeyRef: { name: 'metrics-server-database', key: 'database-url' } }
      })
    ]));

    expect(postgresDeployment.spec.template.spec.containers[0].image).toBe('example.test/postgres:pg123');
    expect(databaseSecret.stringData['database-url']).toBe('postgresql://user:pass@test-postgres:5432/db');
    expect(postgresSecret.stringData['postgres-password']).toBe('pass');
  });

  maybeTest('does not render secrets by default', () => {
    const rendered = execFileSync('helm', ['template', 'test', 'deploy/chart'], { encoding: 'utf8' });
    const docs = yaml.loadAll(rendered).filter(Boolean);

    expect(docs.some((doc) => doc.kind === 'Secret')).toBe(false);
    expect(docs.some((doc) => doc.kind === 'ExternalSecret')).toBe(false);
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

    expect(externalSecrets.length).toBeGreaterThanOrEqual(2);

    for (const es of externalSecrets) {
      expect(es.apiVersion).toBe('external-secrets.io/v1alpha1');
    }

    const database = externalSecrets.find((es) => es.metadata.name === 'test-database');
    const postgres = externalSecrets.find((es) => es.metadata.name === 'test-postgres');

    expect(database).toBeDefined();
    expect(postgres).toBeDefined();

    expect(database.spec.target.name).toBe('metrics-server-database');
    expect(database.spec.data[0].secretKey).toBe('database-url');
    expect(database.spec.data[0].remoteRef.key).toBe('metrics-server/staging/database');
    expect(database.spec.data[0].remoteRef.property).toBe('database-url');

    expect(postgres.spec.target.name).toBe('metrics-server-postgres');
    expect(postgres.spec.data[0].secretKey).toBe('postgres-password');
    expect(postgres.spec.data[0].remoteRef.key).toBe('metrics-server/staging/postgres');
    expect(postgres.spec.data[0].remoteRef.property).toBe('postgres-password');
  });
});
