#!/usr/bin/env bash
# Create or update the iip-mobile Keycloak client (required for Flutter sign-in).
# Safe to run repeatedly. Does not delete existing realms or users.
set -euo pipefail

KC="${KEYCLOAK_SERVER_URL:-http://localhost:8081}"
ADMIN_USER="${KEYCLOAK_ADMIN_USERNAME:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="${KEYCLOAK_REALM:-iip}"
CLIENT_ID="${KEYCLOAK_MOBILE_CLIENT_ID:-iip-mobile}"
CLIENT_SECRET="${KEYCLOAK_MOBILE_CLIENT_SECRET:-iip-mobile-secret-dev-only}"

echo "Keycloak: $KC  realm: $REALM  client: $CLIENT_ID"

TOKEN="$(
  curl -sf -X POST "$KC/realms/master/protocol/openid-connect/token" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "client_id=admin-cli" \
    -d "username=$ADMIN_USER" \
    -d "password=$ADMIN_PASS" \
    -d 'grant_type=password' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])'
)"

AUTH="Authorization: Bearer $TOKEN"
API="$KC/admin/realms/$REALM/clients"

EXISTING_ID="$(
  curl -sf -H "$AUTH" "$API?clientId=$CLIENT_ID" \
    | python3 -c 'import json,sys; xs=json.load(sys.stdin); print(xs[0]["id"] if xs else "")'
)"

CLIENT_JSON="$(python3 - <<PY
import json
print(json.dumps({
  "clientId": "$CLIENT_ID",
  "name": "IIP Mobile App",
  "enabled": True,
  "protocol": "openid-connect",
  "publicClient": False,
  "directAccessGrantsEnabled": True,
  "serviceAccountsEnabled": False,
  "standardFlowEnabled": False,
  "implicitFlowEnabled": False,
  "fullScopeAllowed": True,
  "secret": "$CLIENT_SECRET",
  "attributes": {
    "client.session.idle.timeout": "86400",
    "client.session.max.lifespan": "2592000",
  },
}))
PY
)"

if [[ -z "$EXISTING_ID" ]]; then
  echo "Creating client $CLIENT_ID …"
  curl -sf -X POST -H "$AUTH" -H 'Content-Type: application/json' -d "$CLIENT_JSON" "$API" >/dev/null
else
  echo "Updating client $CLIENT_ID (id=$EXISTING_ID) …"
  curl -sf -X PUT -H "$AUTH" -H 'Content-Type: application/json' -d "$CLIENT_JSON" "$API/$EXISTING_ID" >/dev/null
fi

# Verify password grant
curl -sf -X POST "$KC/realms/$REALM/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=password" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET" \
  -d 'username=admin' \
  -d 'password=ChangeMe@IIP2026!' \
  -d 'scope=openid profile email' \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("access_token"), d; print("OK: mobile client token grant works.")'

echo "Done."
