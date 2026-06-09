# Keycloak (IIP development)

## What it does

- **Login / unlock**: `iam-svc` validates username and password against Keycloak (Resource Owner Password grant). The portal login UI is unchanged (including captcha).
- **API access**: Services validate the Keycloak **access token** (RS256) via JWKS.
- **Authorization**: Offices, roles, menus, and privileges remain in PostgreSQL (custom IAM).

## Defaults (local)

| Setting | Value |
|--------|--------|
| URL | `http://localhost:8081` (host port; container listens on 8080) |
| Realm | `iip` |
| Web client ID | `iip-backend` |
| Web client secret | `iip-backend-secret-dev-only` |
| Mobile client ID | `iip-mobile` |
| Mobile client secret | `iip-mobile-secret-dev-only` |

Web and mobile use **separate Keycloak clients** so portal activity (idle lock, refresh, sign-out) does not invalidate the mobile app session. Mobile requests `client_type: mobile` on login/refresh; the portal defaults to `web`.

Mobile client refresh tokens last up to **30 days** (`client.session.idle.timeout` and `client.session.max.lifespan` = 2592000s). Web portal sessions stay shorter so idle lock / sign-out there does not affect the phone.
| Bootstrap user | `admin` / `ChangeMe@IIP2026!` (matches `init.sql`) |

## Start

```bash
docker compose up -d keycloak
```

Wait until Keycloak is healthy, then start `iam-svc` with the env vars below (or use defaults).

### Flutter / mobile client (`iip-mobile`)

Realm import runs only on a **fresh** Keycloak data volume. If the portal works but the Flutter app cannot sign in (same username/password), the mobile client is usually missing.

```bash
chmod +x infra/keycloak/ensure-mobile-client.sh
./infra/keycloak/ensure-mobile-client.sh
```

Restart `iam-svc` after changing Keycloak env vars. Sign in again on the phone.

## Sync existing DB users to Keycloak

After importing users only in Postgres:

```bash
cd backend/services/iam-svc
uv run python -m iam_svc.scripts.sync_users_to_keycloak
```

Requires admin credentials (`KEYCLOAK_ADMIN_USERNAME` / `KEYCLOAK_ADMIN_PASSWORD`) and users must reset passwords in Keycloak if they were never synced (script uses a one-time sync password from env).

## Two-factor authentication (TOTP)

IIP uses **Google Authenticator–compatible TOTP** in `iam-svc` (not Keycloak OTP). Password checks remain in Keycloak; the 6-digit code is validated after captcha + password.

- **My Profile** → Two-factor authentication (per user)
- **System admin** → `/system/security` (force 2FA for all users)
- Run migration `infra/postgres/migrations/011_mfa_totp.sql` before use

## Environment (iam-svc and other services)

```env
KEYCLOAK_ENABLED=true
KEYCLOAK_SERVER_URL=http://localhost:8081
KEYCLOAK_REALM=iip
KEYCLOAK_CLIENT_ID=iip-backend
KEYCLOAK_CLIENT_SECRET=iip-backend-secret-dev-only
KEYCLOAK_MOBILE_CLIENT_ID=iip-mobile
KEYCLOAK_MOBILE_CLIENT_SECRET=iip-mobile-secret-dev-only
KEYCLOAK_ADMIN_USERNAME=admin
KEYCLOAK_ADMIN_PASSWORD=admin
```

When `iam-svc` runs inside Docker network, set `KEYCLOAK_SERVER_URL=http://keycloak:8080` (internal container port).

If port **8081** is also taken on your machine, change the compose mapping (e.g. `"8082:8080"`) and set `KEYCLOAK_SERVER_URL` to match.
