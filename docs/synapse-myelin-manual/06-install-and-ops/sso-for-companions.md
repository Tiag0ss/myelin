# SSO for companions (Synapse) — complete guide

**Audience:** Operator, Admin  
**Access:** Environment variables on Myelin; matching client config on the companion  
**Requires:** `ALLOWED_SSO_REDIRECTS` + `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` (or `SSO_CLIENTS`)  
**When disabled / missing:** Companions cannot complete browser SSO — users may still use personal `pt_` API tokens for non-SSO integrations.


Minimal OAuth-style handoff so companion apps (e.g. **Synapse**) reuse Myelin users without rebuilding planner auth UI.

```mermaid
flowchart TD
  Comp[Companion] --> Auth[/sso/authorize]
  Auth --> Login{Logged in on Myelin?}
  Login -->|No| PMLogin[/login + returnUrl]
  Login -->|Yes| Hand[POST /api/sso/handoff → one-time code]
  PMLogin --> Hand
  Hand --> Exch[Companion POST /api/sso/token]
  Exch --> Pair[Access JWT + refresh JWT]
  Pair --> API[Call Myelin APIs]
  API --> Ref[Refresh before access expiry]
```

## 1 — Configure Myelin (env)

```env
ALLOWED_SSO_REDIRECTS=https://synapse.example.com/api/auth/sso/callback
SSO_CLIENT_ID=synapse
SSO_CLIENT_SECRET=long-random-secret
```

| Variable | Purpose |
|----------|---------|
| `ALLOWED_SSO_REDIRECTS` | Comma-separated allowed callback URLs |
| `SSO_CLIENT_ID` | Client id the companion sends |
| `SSO_CLIENT_SECRET` | Shared secret |
| `SSO_CLIENTS` | Alternative list: `clientId:secret,clientId2:secret2` |
| `SSO_SHARED_SECRET` | Optional override when resolving secrets (falls back toward `JWT_SECRET` patterns per env docs) |

Local example (Synapse on 3010):

```env
ALLOWED_SSO_REDIRECTS=http://localhost:3010/api/auth/sso/callback
SSO_CLIENT_ID=synapse
SSO_CLIENT_SECRET=change-me-synapse-sso-secret
```

Full env tables: [[06-install-and-ops/environment-variables]].

## 2 — Browser flow (summary)

1. Companion redirects the browser to `/sso/authorize?redirect_uri=…&state=…&client_id=…`.
2. User logs in on Myelin if needed (`returnUrl` supported on `/login`).
3. Myelin issues a one-time code via authenticated `POST /api/sso/handoff`.
4. Companion backend exchanges the code at `POST /api/sso/token` for:
   - Short-lived **access** JWT (~8h)
   - Longer **refresh** JWT (~30 days, `typ: sso_refresh`)
5. Before access expiry (or after idle), companion refreshes with `grant_type=refresh_token` + `refresh_token` and the same client credentials.

Sliding `X-New-Token` behaviour on authenticated API calls still applies when the companion is actively calling Myelin.

## 3 — What SSO is not

| Not this | Use instead |
|----------|-------------|
| Navbar deep links into Synapse | Manual / companion UX |
| Replacement for `pt_` tokens | Profile → API Tokens for Workers / IDE |
| A Features checkbox | Env-only |
| Synapse process inside Myelin Compose | Separate process (often port `3010`) |

## 4 — Operator verification

1. Set env on Myelin; restart.
2. Mirror client id/secret on Synapse (or other companion).
3. Start SSO from the companion; complete login once.
4. Confirm API calls succeed with the access token; confirm refresh without a full browser login.
5. Revoke by rotating `SSO_CLIENT_SECRET` and companion config together.

![SSO env sample](../media/docs-ops-sso-env.png)

> **SCREENSHOT** — Capture companion SSO settings UI or a redacted env template (never real secrets).
> File to add: `media/docs-ops-sso-env.png`


## Tips and mistakes

- Callback URL must match `ALLOWED_SSO_REDIRECTS` exactly as configured.
- Do not commit SSO secrets into the Synapse vault.
- Users can still create `pt_` tokens for Cloudflare email queue and IDE extensions without SSO.

## Done when

- Companion login completes without a second password store.
- Refresh works across an 8h+ idle window as designed.
- Secrets live only in env / secret stores.

## Related

- [[07-companions/desktop-app]]
- [[03-modules/synapse-bridge]]
- [[06-install-and-ops/environment-variables]]
- [[06-install-and-ops/deploy-checklist]]
