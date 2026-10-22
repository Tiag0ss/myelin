# Production Dockerfile for Myelin
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Desktop: Linux AppImage + Windows NSIS (Wine). Image includes Node + Wine/Mono.
FROM electronuserland/builder:22-wine-mono AS desktop-builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
COPY extras/desktop ./extras/desktop
COPY extras/scripts/ensure-electron.mjs ./extras/scripts/

RUN pnpm install --frozen-lockfile \
    && node extras/scripts/ensure-electron.mjs \
    && pnpm run desktop:build:linux \
    && pnpm run desktop:build:win \
    && mkdir -p extras/release \
    && rm -rf extras/release/linux-unpacked extras/release/win-unpacked \
       extras/release/*.blockmap extras/release/builder-debug.yml \
       extras/release/builder-effective-config.yaml

# IDE: VS Code/Cursor VSIX + Rider ZIP (Linux CI). Visual Studio VSIX needs Windows MSBuild.
FROM node:20-bookworm-slim AS ide-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    openjdk-17-jdk-headless \
    unzip \
    && corepack enable && corepack prepare pnpm@9.15.9 --activate \
    && rm -rf /var/lib/apt/lists/*

COPY extras/ide-extensions ./extras/ide-extensions

ENV GRADLE_OPTS="-Dorg.gradle.daemon=false -Dorg.gradle.jvmargs=-Xmx2g"

RUN mkdir -p extras/release \
    && cd extras/ide-extensions/vscode \
    && pnpm install --ignore-workspace --frozen-lockfile \
    && pnpm run package \
    && cp -f ./*.vsix /app/extras/release/ \
    && cd /app/extras/ide-extensions/rider \
    && chmod +x ./gradlew \
    && ./gradlew buildPlugin --no-daemon \
    && cp -f ./build/distributions/*.zip /app/extras/release/

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build Next.js and TypeScript server separately to ensure both succeed
RUN npx next build && npx tsc --project server/tsconfig.json

# Merge desktop + IDE companions into extras/release. Host-provided files from
# COPY . . (if present in the build context) are kept and overlaid by CI builds.
COPY --from=desktop-builder /app/extras/release ./extras/release-desktop
COPY --from=ide-builder /app/extras/release ./extras/release-ide
RUN mkdir -p extras/release \
  && cp -a extras/release-desktop/. extras/release/ \
  && cp -a extras/release-ide/. extras/release/ \
  && rm -rf extras/release-desktop extras/release-ide

# Production image, copy all the files and run
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Copy necessary files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/extras/release ./extras/release
COPY --from=builder /app/extras/scripts/tampermonkey ./extras/scripts/tampermonkey
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server/database ./dist/server/database
# UI lit catalogs are read at runtime via fs (not bundled into the client graph).
COPY --from=builder /app/lib/i18n/locales ./lib/i18n/locales
# What’s New changelog (static JSON; read at runtime by /api/whats-new).
COPY --from=builder /app/docs/whats-new ./docs/whats-new

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Writable dirs for runtime uploads (branding / application images) and logs.
# The app runs as `nodejs`; without this, fs.writeFile under public/uploads fails with EACCES.
RUN mkdir -p public/uploads/branding public/uploads/applications logs \
  && chown -R nodejs:nodejs public/uploads logs

USER nodejs

# Default listen port (override with PORT at runtime). Host publish can be any host:container mapping.
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Liveness inside the container only — uses PORT (not the host-mapped port).
# 127.0.0.1 avoids Alpine localhost→::1. /health still probes DB for operators.
HEALTHCHECK --interval=30s --timeout=8s --start-period=120s --retries=5 \
  CMD node -e "const p=process.env.PORT||'3000';const r=require('http').get('http://127.0.0.1:'+p+'/health/live',res=>process.exit(res.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(7000,()=>{r.destroy();process.exit(1);})"

# Start the application
CMD ["node", "dist/server/index.js"]
