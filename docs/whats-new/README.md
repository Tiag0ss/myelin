# What’s New changelog

Static release notes shipped with the app (`changelog.json`). Served by `GET /api/whats-new`.

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
```

- Does **not** overwrite the hand-authored `1.0.0` entry
- Uses commits that changed `package.json` version history
- Includes the **current working-tree** `package.json` version even if not committed yet
- Does **not** invent entries from `V*` tags
