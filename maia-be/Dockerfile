# syntax=docker/dockerfile:1

# --- deps: install all dependencies (incl. devDependencies, needed to build) ---
FROM node:24.22.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: generate the Prisma client and compile Nest to dist/ ---
FROM node:24.22.1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The client is generated into src/generated/prisma (see schema.prisma), so
# `nest build` compiles it to dist/generated/prisma along with the app.
RUN npx prisma generate
RUN npm run build

# --- production: minimal runtime image ---
FROM node:24.22.1-alpine AS production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

ENV NODE_ENV=production
ENV PORT=3000

# prisma (CLI) and dotenv are regular dependencies, not devDependencies:
# `prisma migrate deploy` runs on every boot and loads prisma7.config.ts.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma7.config.ts ./prisma7.config.ts

USER nestjs

EXPOSE 3000

# Applies any pending migration before starting the app. Safe to run on
# every deploy/restart: a no-op when the DB is already up to date.
# `--no-install` keeps it fully offline (no npx registry fallback).
CMD ["sh", "-c", "npx --no-install prisma migrate deploy && node dist/main.js"]
