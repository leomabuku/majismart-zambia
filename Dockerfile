# MajiSmart Zambia - single-service image (API + prebuilt dashboard)
# Use this when you want one container to serve both /api and the SPA.
# For the recommended split deployment (Cloudflare Pages + Fly.io API) use BACKEND/Dockerfile.
# syntax=docker/dockerfile:1

FROM node:24-alpine AS builder
WORKDIR /app/web
COPY WEB/package.json WEB/package-lock.json ./
RUN npm ci
COPY WEB/ ./
RUN npm run build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S maji && adduser -S maji -G maji

COPY BACKEND/package.json BACKEND/package-lock.json ./BACKEND/
WORKDIR /app/BACKEND
RUN npm ci --omit=dev

# Copy backend source and migrations
COPY BACKEND/src ./src
COPY BACKEND/database ./database
COPY supabase/migrations /app/supabase/migrations

# Copy built frontend assets from builder (server.js serves ../../WEB/dist)
COPY --from=builder /app/web/dist /app/WEB/dist

# db.js touches a local SQLite file at import time even in Supabase mode
RUN mkdir -p /app/data && chown -R maji:maji /app
USER maji

ENV PORT=5000
EXPOSE 5000
CMD ["node", "src/server.js"]
