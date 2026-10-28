# MajiSmart Zambia - Production Multi-Stage Dockerfile
FROM node:24-alpine AS builder

WORKDIR /app/web
COPY WEB/package*.json ./
RUN npm install
COPY WEB/ ./
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

# Install production dependencies
COPY BACKEND/package*.json ./BACKEND/
WORKDIR /app/BACKEND
RUN npm install --omit=dev

# Copy backend source
COPY BACKEND/src ./src
COPY BACKEND/database ./database

# Copy built frontend assets from builder
COPY --from=builder /app/web/dist /app/WEB/dist

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "src/server.js"]
