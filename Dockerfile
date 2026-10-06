# Production Dockerfile for Myelin
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Build Linux desktop AppImage (Electron requires glibc — use Debian, not Alpine)
FROM node:20-bookworm-slim AS desktop-builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

COPY package.json pnpm-lock.yaml ./
COPY extras/desktop ./extras/desktop
COPY extras/scripts/ensure-electron.mjs ./extras/scripts/

RUN pnpm install --frozen-lockfile \
    && node extras/scripts/ensure-electron.mjs \
    && pnpm run desktop:build:linux

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

# Merge Linux AppImage from desktop-builder into extras/release (canonical downloads path).
# Host-provided Windows .exe / IDE packages already under extras/release (via COPY . .) are kept.
COPY --from=desktop-builder /app/extras/release ./extras/release-built
RUN mkdir -p extras/release \
  && cp -a extras/release-built/. extras/release/ \
  && rm -rf extras/release-built

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

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Writable dirs for runtime uploads (branding / application images) and logs.
# The app runs as `nodejs`; without this, fs.writeFile under public/uploads fails with EACCES.
RUN mkdir -p public/uploads/branding public/uploads/applications logs \
  && chown -R nodejs:nodejs public/uploads logs

USER nodejs

# Expose port
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Liveness only (127.0.0.1 avoids Alpine localhost→::1). /health still probes DB for operators.
HEALTHCHECK --interval=30s --timeout=8s --start-period=120s --retries=5 \
  CMD node -e "const r=require('http').get('http://127.0.0.1:3000/health/live',res=>process.exit(res.statusCode===200?0:1));r.on('error',()=>process.exit(1));r.setTimeout(7000,()=>{r.destroy();process.exit(1);})"

# Start the application
CMD ["node", "dist/server/index.js"]
