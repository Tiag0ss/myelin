# Cursor — connect to Myelin MCP (self-hosted)

Myelin is **self-hosted**: the MCP URL is **your** instance (`https://your-host/api/mcp`), not a fixed SaaS endpoint. Two different files matter:

| File | Purpose | Commit to git? |
|---|---|---|
| `.cursor/mcp.json` or `~/.cursor/mcp.json` | **How Cursor talks to Myelin** (URL + Bearer token) | Project file: yes **without** secrets; prefer `${env:…}` for the token. Global file: personal only |
| `myelin.mcp.json` (repo root) | **Scope for tools** (`projectIds`, `strict`, `allowWrite`) — not the server URL | Yes (no secrets) |

---

## 1. MCP server connection (Cursor)

Create or edit **Cursor MCP config**:

- **Per project:** `.cursor/mcp.json`
- **All projects (personal):** `~/.cursor/mcp.json`

Both are merged; project wins on name clash.

```json
{
  "mcpServers": {
    "myelin": {
      "url": "https://YOUR-MYELIN-HOST/api/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MYELIN_API_TOKEN}"
      }
    },
    "myelin-local": {
      "url": "http://localhost:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer ${env:MYELIN_API_TOKEN_DEV}"
      }
    }
  }
}
```

You can run **both** entries at once (prod + local). Use separate `pt_…` tokens and env vars per host. Local needs `pnpm dev` (or your API) listening on that port.

Copy-paste template: [cursor.mcp.json.example](cursor.mcp.json.example).

### Fill in

1. **`url`** — same origin as the Myelin web/API you already use, plus `/api/mcp`.
   - Examples: `https://pm.company.internal/api/mcp`, `http://localhost:4000/api/mcp`
   - Do **not** invent a public Myelin cloud URL; use your deployment.
2. **`Authorization`** — personal API token from **My Profile → API Tokens** (`pt_…`).
   - Prefer `Bearer ${env:MYELIN_API_TOKEN}` and export the env var in your shell / OS — **never commit `pt_` secrets**.
   - Cursor resolves `${env:NAME}` in `url` and `headers`.

Then restart Cursor (or reload MCP servers) so the `myelin` server appears.

### Notes

- Transport: **Streamable HTTP** (`url` entry). If a Cursor build cannot use Bearer headers with this transport, check Cursor MCP docs for that version; SSE-only setups are not the v1 Myelin path.
- Customer-portal users cannot use MCP (403).
- Task **writes** also need Profile → **Allow MCP task writes** plus `allowWrite: true` in `myelin.mcp.json` / tool args.

---

## 2. Repo scope file (`myelin.mcp.json`)

Optional at the **repo root**. The Myelin server never reads your disk — the agent must pass these fields on tool calls.

```json
{
  "projectIds": [12, 34],
  "strict": false,
  "allowWrite": false
}
```

Example: [myelin.mcp.json.example](myelin.mcp.json.example).

---

## 3. Agent rule (copy-paste)

Paste into a project Cursor rule (or skill):

```markdown
## Myelin MCP

Before calling any Myelin MCP tool:

1. Confirm Cursor is connected to this deployment via `.cursor/mcp.json` / `~/.cursor/mcp.json` (`url` = `{your-myelin-origin}/api/mcp`, Bearer `pt_…`). Do not assume a fixed cloud host.
2. Read repo-root `myelin.mcp.json` if present (`projectIds`, `strict`, `allowWrite`). Defaults: `strict=false`, `allowWrite=false`, `projectIds=[]`.
3. Resolve `repositoryUrl` with `git remote get-url origin` (prefer the primary origin remote).
4. Pass on **every** tool call: `projectIds`, `strict`, `allowWrite`, and `repositoryUrl`.
5. If `resolve_context` reports multiple Applications for the remote, pass `applicationId` from the candidate list — do not guess.
6. Do not invent status/priority/taskType ids; call `list_project_meta` (or use catalogs from context) first.
7. For sprint assignment, call `list_sprints` / `get_sprint` first; only use sprint ids from effective projects. `create_task` / `update_task` accept `sprintId` (`null` clears). Use `sprint_update` to change sprint status/fields.
8. Task/sprint writes require **both** Profile “Allow MCP task writes” and `allowWrite: true` in config. Prefer reads unless the user asked to create/update.
9. Never put API tokens in `myelin.mcp.json` or commit them to git.
10. If a newly added MCP tool does not appear in Cursor after reload, rename the server key in `.cursor/mcp.json` (e.g. `myelin-dev` → `myelin-local`) to force a fresh tools/list cache.
```

See [FEATURES.md §21c](../FEATURES.md#21c-remote-mcp-cursor--agents).
