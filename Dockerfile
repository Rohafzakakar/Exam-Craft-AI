# syntax=docker/dockerfile:1

# --- Stage 1: Build Vite Frontend ---
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY index.html tsconfig.json vite.config.ts server.ts ./
COPY src ./src

RUN npm run build

# --- Stage 2: Production Runtime ---
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV EXAMCRAFT_DATA_DIR=/app/data

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY src/server ./src/server
COPY fonts ./fonts

# Prepare writable persistent data directory before declaring volume
RUN mkdir -p /app/data/backups && chown -R node:node /app

USER node

VOLUME ["/app/data"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "start"]
