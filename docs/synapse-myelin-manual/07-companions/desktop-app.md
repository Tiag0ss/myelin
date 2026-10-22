# Desktop app — complete guide

**Audience:** End user, Operator  
**Access:** In-app Downloads catalog; packages under `extras/release`  
**Requires:** Reachable Myelin base URL; installer for your OS (Windows / Linux AppImage from release builds)  
**When disabled / missing:** Downloads empty if operators did not publish packages into the image/`extras/release` path — the web app still works in the browser.


Optional Electron shell around Myelin for a desktop window experience (timers and day-to-day work without a browser tab). Built in Docker/desktop stages and served via `/api/downloads/...`.

```mermaid
flowchart TD
  Build[desktop-builder / CI] --> Rel[extras/release packages]
  Rel --> API[/api/downloads catalog]
  API --> User[Install on OS]
  User --> URL[Point at Myelin base URL]
  URL --> Login[Sign in as usual]
```

## 1 — Install (end user)

1. Sign in to the web app.
2. Open **Downloads** (or ask your operator for the installer).
3. Download the **Windows** or **Linux** package for your platform.
4. Install / make executable per OS norms (AppImage on Linux).
5. Launch and set the **Myelin base URL** (same origin you use in the browser).
6. Sign in with your normal credentials (JWT cookie session flow inside the shell).

![Downloads catalog](../media/docs-companion-downloads.png)

> **SCREENSHOT** — Capture downloads UI listing desktop packages.
> File to add: `media/docs-companion-downloads.png`


## 2 — Operator notes

| Topic | Detail |
|-------|--------|
| Build | Dockerfile `companions-builder` stage (`electronuserland/builder` + Wine) produces Linux AppImage **and** Windows NSIS; Woodpecker tag builds bake both into the image |
| Runtime image | Copies `extras/release` into the production image |
| Local / CI script | `pnpm run companions:build` (or `bash extras/scripts/build-companions.sh`) also builds VS Code VSIX + Rider ZIP into `extras/release` |
| Local dev | `pnpm run desktop:dev` from the repo |
| Auth | Same users as web — no separate desktop account store |
| SSO | Synapse SSO is separate — [[06-install-and-ops/sso-for-companions]] |

## 3 — Day-to-day use

1. Use Dashboard, tasks, and timers as in the browser.
2. Navbar timer still shows HH:MM:SS; Switch & Save rules unchanged — [[04-workflows/timer-context-switch]].
3. Keep the base URL updated if your deployment hostname changes.

## Tips and mistakes

- Self-hosted HTTPS must be a certificate the desktop stack trusts (same class of issues as IDE clients).
- Desktop is not a Features flag — absence means packages were not published.
- Do not paste `pt_` tokens into the desktop URL field — use normal login unless a build documents otherwise.

## Done when

- App launches, reaches your Myelin URL, and you can open a task + timer.

## Related

- [[07-companions/ide-extensions]]
- [[07-companions/tampermonkey]]
- [[06-install-and-ops/docker-and-health]]
- [[06-install-and-ops/local-development]]
