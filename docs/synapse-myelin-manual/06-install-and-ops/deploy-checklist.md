# Deploy checklist — complete guide

**Audience:** Operator  
**Access:** Host / Compose / panel where Myelin runs  
**Requires:** Production DB credentials, secrets, HTTPS endpoints  
**When skipped:** Password recovery, CORS, healthchecks, and integrations fail in predictable ways — use this list every release.


Go-live and upgrade checklist grounded in `README.md`, `Dockerfile`, and `docker-compose.yml`. Never paste production `.env` contents into Synapse notes.

```mermaid
flowchart TD
  Secrets[Secrets + DB] --> URLs[HTTPS URLs + CORS]
  URLs --> Boot[Compose / image up]
  Boot --> Live[/health/live]
  Live --> Ready[/health]
  Ready --> Wizard{First boot?}
  Wizard -->|Yes| Install[Install wizard]
  Wizard -->|No| Login[Login]
  Install --> Admin[SMTP · Features · AI · integrations]
  Login --> Admin
  Admin --> Backup[Backup DB + uploads]
```

## 1 — Before first production start

| # | Action | Notes |
|---|--------|-------|
| 1 | Generate strong `JWT_SECRET` | `openssl rand -hex 64` or Node crypto |
| 2 | Optional `ENCRYPTION_KEY` (64-char hex) | Used for Jira/Outlook/etc.; falls back to `JWT_SECRET` |
| 3 | Point `DB_*` at a backed-up production DB | `mysql` or `mssql` via `DB_PROVIDER` |
| 4 | Set `NODE_ENV=production` | Compose sets this on `app` |
| 5 | Set `ALLOWED_ORIGINS`, `API_URL`, `NEXT_PUBLIC_API_URL` | Real **HTTPS** public URLs |
| 6 | Prepare `.env.docker` from `.env.docker.example` | Do not commit secrets |
| 7 | Plan volumes | Logs (`app-logs`); persist uploads if you rely on attachments |
| 8 | Decide Redis | Optional — [[06-install-and-ops/redis]] |
| 9 | Decide Synapse SSO | Optional — [[06-install-and-ops/sso-for-companions]] |

## 2 — Bring the stack up

```bash
docker compose up -d
# or with Redis:
docker compose --profile redis up -d
```

Standalone external DB:

```bash
docker run -d --name myelin -p 3000:3000 --env-file .env.docker tiag0ss/myelin:latest
```

Confirm:

1. `GET /health/live` → 200 (liveness; used by image HEALTHCHECK).
2. `GET /health` → database `connected`; redis `disabled` / `connected` / `error` as expected.
3. Image runs as non-root `nodejs` (UID 1001); default listen `PORT=3000`.

Details: [[06-install-and-ops/docker-and-health]].

## 3 — First-boot application setup

1. Open the public URL → [[06-install-and-ops/install-wizard]] if no admin exists.
2. Sign in as admin.
3. **Branding** — name, logo, favicon.
4. **SMTP** — before expecting password-reset or notification mail.
5. **Real feature flags only** — frontpage, internal tickets, memos, expenses (+ auto-approves), AI, Outlook calendar — [[02-settings/feature-toggles-overview]].
6. Integrations — Jira / GitHub / Gitea / Graph as needed.
7. Create users; assign orgs and permission groups — [[05-reference/permissions-matrix]].

## 4 — Upgrade checklist

| # | Action |
|---|--------|
| 1 | Backup DB (and uploads) |
| 2 | `docker compose pull` (or rebuild) |
| 3 | `docker compose up -d` |
| 4 | Wait `start_period` (120s) before panicking on health |
| 5 | Verify `/health/live` and `/health` |
| 6 | Spot-check login, one project Kanban, one timer |
| 7 | If Redis: confirm no systemic stale lists |

MySQL dump example:

```bash
docker exec myelin-mysql \
  mysqldump -u root -p"$DB_PASSWORD" projectmanagement > backup.sql
```

## 5 — Reverse proxy reminders

- Terminate TLS at Nginx / panel; proxy to the published app port.
- Enable WebSocket upgrade headers for Socket.io.
- Raise `client_max_body_size` for uploads (e.g. `50M`).
- Put HTTPS origins in `ALLOWED_ORIGINS`.
- Panel healthchecks should prefer `/health/live` so brief DB blips do not flap the container.

![Deploy health OK](../media/docs-ops-deploy-checklist.png)

> **SCREENSHOT** — Capture healthy stack overview in your panel (redact secrets).
> File to add: `media/docs-ops-deploy-checklist.png`


## Tips and mistakes

- Host port mapping (`8080:3000`) does **not** change container `PORT` or the in-container HEALTHCHECK.
- Planning/Timesheet are not “enabled” in Features — only real flags listed above.
- Keep `DEPLOYMENT.md` in the repo as the long-form companion to this vault note.

## Done when

- Liveness + readiness endpoints match intent.
- Admin can log in; SMTP test mail works if you need mail.
- Backup restore path is documented for your DB engine.

## Related

- [[06-install-and-ops/environment-variables]]
- [[06-install-and-ops/docker-and-health]]
- [[06-install-and-ops/schema]]
- [[06-install-and-ops/redis]]
- [[02-settings/feature-toggles-overview]]
