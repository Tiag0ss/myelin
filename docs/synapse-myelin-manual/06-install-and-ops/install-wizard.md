# Install wizard — complete guide

**Audience:** Operator, Admin  
**Access:** Automatic redirect to `/install` when the database has no admin user  
**Requires:** Working `DB_*` + `JWT_SECRET` before the wizard can finish  
**When disabled / missing:** After the first successful run the wizard is permanently locked; later visits go to `/login`.


First-boot path for a new Myelin instance. Completing it creates the first administrator, the first organization, and optionally SMTP — then the route is sealed forever.

```mermaid
flowchart TD
  A[Open Myelin URL] --> B{Admin user exists?}
  B -->|No| C[/install wizard]
  B -->|Yes| L[/login]
  C --> D[Admin account]
  D --> E[Initial organization]
  E --> F[Optional SMTP]
  F --> G[Wizard locks permanently]
  G --> L
  L --> H[Admin configures Features / AI / integrations]
```

## 1 — When it appears

| Condition | Result |
|-----------|--------|
| Fresh database, no admin | Any navigation redirects to `/install` |
| Admin already created | `/install` unavailable; use `/login` |
| Partial failure mid-wizard | Fix DB/env, restart, retry before another admin exists |

If the process cannot talk to MySQL or MSSQL, fix [[06-install-and-ops/environment-variables]] and restart first.

## 2 — Admin account

Create the first **administrator**:

- Username, email, password
- First name / last name

This account is a global admin (`isAdmin`). Keep the password in your secret store — do not paste it into Synapse notes.

## 3 — Initial organization

Enter the first **organization** name. Users, projects, statuses, and most delivery data hang off organizations later. Add more orgs after login under Administration / org management.

## 4 — Optional SMTP

Configure mail now or skip and finish later under **Administration → System Settings → Email / SMTP**. Without SMTP:

- Password recovery emails will not send
- Assignment / mention / work-summary mail will not send
- In-app notifications still work

## 5 — Finish

1. Submit the wizard.
2. The wizard is **permanently disabled**.
3. Redirect to `/login`.
4. Sign in with the admin you just created.

![Install wizard](../media/docs-ops-install-wizard.png)

> **SCREENSHOT** — Capture install steps (no real passwords). Prefer admin or organization step with placeholder text.
> File to add: `media/docs-ops-install-wizard.png`


## 6 — After install (recommended order)

1. Sign in as admin.
2. **Branding** — name, logo, favicon (System Settings → Branding / General).
3. **Real feature flags only** — Front page, internal tickets, memos, expenses (+ auto-approve expenses), auto-approve time/vacation/OOO, AI assistant, Outlook calendar enable. Planning / Timesheet / Call Records / Work Summary are **not** feature flags — [[02-settings/feature-toggles-overview]].
4. **AI** (optional) — [[08-ai-assistant/admin-configuration]].
5. **Integrations** — SMTP (if skipped), Jira / GitHub / Gitea, Outlook Graph credentials.
6. Create users; assign organizations and permission groups — [[05-reference/permissions-matrix]].
7. Operators: verify env, Docker health, backups — [[06-install-and-ops/environment-variables]], [[06-install-and-ops/docker-and-health]], [[06-install-and-ops/deploy-checklist]].

## Tips and mistakes

- There is no supported “re-open install wizard” switch — protect the first admin account.
- Schema JSON still bootstraps on every start — wizard only gates first admin creation.
- Demo credentials in README (if present) are for demo images, not a reason to keep weak production passwords.

## Related

| Topic | Note |
|-------|------|
| Local first run | [[06-install-and-ops/local-development]] |
| Docker first run | [[06-install-and-ops/docker-and-health]] |
| Schema bootstrap | [[06-install-and-ops/schema]] |
| Deploy checklist | [[06-install-and-ops/deploy-checklist]] |
