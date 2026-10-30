# MajiSmart Zambia — shared API image (API only, for Fly.io / any container host)
# The web dashboard is deployed separately to Cloudflare Pages.
# syntax=docker/dockerfile:1

FROM node:24-alpine AS deps
WORKDIR /app
COPY BACKEND/package.json BACKEND/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as a non-root user
RUN addgroup -S maji && adduser -S maji -G maji

COPY --from=deps /app/node_modules ./node_modules
COPY BACKEND/package.json ./
COPY BACKEND/src ./src
COPY BACKEND/database ./database

# Only used when AUTO_MIGRATE=true. Production should migrate from CI instead
# (`supabase db push`), so the runtime role never needs DDL privileges.
COPY supabase/migrations ./supabase/migrations

# db.js creates a local SQLite file at boot even when DB_MODE=supabase,
# so the directory must exist and be writable by the runtime user.
RUN mkdir -p /app/data && chown -R maji:maji /app

USER maji
EXPOSE 8080

CMD ["node", "src/server.js"]
