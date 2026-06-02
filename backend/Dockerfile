# Build from repo root: docker compose build (context: .)
# Serves SDK at /sdk — paths in index.ts resolve ../../sdk from dist/ → /usr/src/sdk
# SDK build stage
FROM node:20-alpine AS sdk-builder

WORKDIR /build/sdk

COPY sdk/package*.json ./
RUN npm ci

COPY sdk/ ./
RUN npm run build

# Backend build stage
FROM node:20-alpine AS backend-builder

WORKDIR /build/backend

COPY backend/package*.json backend/tsconfig.json ./
RUN npm ci

COPY backend/src ./src
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --only=production

COPY --from=backend-builder /build/backend/dist ./dist

# Backend static routes expect repo layout: ../../sdk from /usr/src/app/dist → /usr/src/sdk
COPY --from=sdk-builder /build/sdk/dist /usr/src/sdk/dist
COPY --from=sdk-builder /build/sdk/assets /usr/src/sdk/assets
COPY sdk/src/components /usr/src/sdk/src/components

EXPOSE 5000

CMD ["node", "dist/index.js"]
