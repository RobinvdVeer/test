#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
KEYCLOAK_URL="${KEYCLOAK_URL:-http://localhost:8080}"
REALM="${REALM:-local-dev}"
CLIENT_ID="${CLIENT_ID:-todo-app}"
ISSUER="${ISSUER:-$KEYCLOAK_URL/realms/$REALM}"

cleanup() {
  docker compose down
}
trap cleanup EXIT

docker compose up -d --build postgres keycloak-postgres keycloak app

for _ in $(seq 1 60); do
  if curl -fsS "$KEYCLOAK_URL/realms/$REALM/.well-known/openid-configuration" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

for _ in $(seq 1 60); do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

get_token() {
  local username="$1"
  local password="$2"
  curl -fsS -X POST "$KEYCLOAK_URL/realms/$REALM/protocol/openid-connect/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "client_id=$CLIENT_ID" \
    -d 'grant_type=password' \
    -d "username=$username" \
    -d "password=$password" | jq -r .access_token
}

verify_claims() {
  local token="$1"
  local username="$2"
  TOKEN="$token" ISSUER="$ISSUER" CLIENT_ID="$CLIENT_ID" USERNAME="$username" node <<'NODE'
const token = process.env.TOKEN;
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
const audience = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
const roles = [
  ...((payload.realm_access && payload.realm_access.roles) || []),
  ...Object.values(payload.resource_access || {}).flatMap((access) => access.roles || []),
];
if (payload.iss !== process.env.ISSUER) {
  throw new Error(`${process.env.USERNAME}: expected issuer ${process.env.ISSUER}, got ${payload.iss}`);
}
if (!audience.includes(process.env.CLIENT_ID)) {
  throw new Error(`${process.env.USERNAME}: expected audience ${process.env.CLIENT_ID}, got ${payload.aud}`);
}
if (!roles.includes('user')) {
  throw new Error(`${process.env.USERNAME}: expected user role, got ${roles.join(',')}`);
}
NODE
}

ALICE_TOKEN="$(get_token alice alicepass)"
BOB_TOKEN="$(get_token bob bobpass)"

verify_claims "$ALICE_TOKEN" alice
verify_claims "$BOB_TOKEN" bob

curl -fsS -H "Authorization: Bearer $ALICE_TOKEN" "$BASE_URL/todos" >/dev/null
curl -fsS -H "Authorization: Bearer $BOB_TOKEN" "$BASE_URL/todos" >/dev/null

unauth_status="$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/todos")"
if [ "$unauth_status" != "401" ]; then
  echo "Expected unauthenticated /todos to return 401, got $unauth_status" >&2
  exit 1
fi

echo "Keycloak smoke test passed"
