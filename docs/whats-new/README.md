# What’s New changelog

Static release notes shipped with the app (`changelog.json`). Served by `GET /api/whats-new`.

Feature reference and end-user docs live elsewhere and should stay current even between version bumps:

| Doc | Role |
|-----|------|
| [`docs/FEATURES.md`](../FEATURES.md) | Engineer / agent feature SOT |
| [`docs/ROLE_PERMISSIONS.md`](../ROLE_PERMISSIONS.md) | Permissions |
| [`docs/mcp/`](../mcp/) | Remote MCP connect + Cursor rule |
| [`docs/synapse-myelin-manual/`](../synapse-myelin-manual/) | Synapse vault end-user manual |

When you ship behaviour that users will notice, update **FEATURES** (and the Synapse manual when it is a user-facing flow) in the same change set as the code — do not wait for the next `whats-new:generate` pass.

## Source of truth: `package.json` version (not Git tags)

Woodpecker builds Docker images from `V*` tags. Your release sequence is:

1. Bump `version` in root `package.json` to the version you are about to ship
2. Refresh this changelog (`pnpm whats-new:generate`), then curate the new bullets
3. Commit `package.json` + `docs/whats-new/changelog.json` together
4. Create the `V*` tag so Woodpecker builds

The tag is created **after** the version bump, so the changelog must never wait on tags. The running app reads `package.json` `version` and this JSON from the image tree.

## Commands

```bash
pnpm whats-new:generate
# optional: keep hand-curated bullets for older versions
pnpm whats-new:generate -- --keep-curated
```

- Does **not** overwrite the hand-authored `1.0.0` entry
- By default **rebuilds every version after 1.0.0** from git commit subjects (full messages, not truncated)
- Finds each version’s **introduction** commit (first `package.json` bump to that version)
- For the **current** `package.json` version, lists subjects from the previous introduction through `HEAD`
- Includes the **current working-tree** `package.json` version even if not committed yet
- Does **not** invent entries from `V*` tags
- After generate, curate titles/bullets in `changelog.json` as needed
