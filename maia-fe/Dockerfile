# syntax=docker/dockerfile:1

# --- deps: install all dependencies (incl. devDependencies, needed to build) ---
FROM node:24.22.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: compile the Next.js standalone bundle ---
FROM node:24.22.1-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No NEXT_PUBLIC_* variables: the browser talks only to maia-fe, which proxies
# /api/* to maia-be using API_URL read at runtime (app/api/[...path]/route.ts).
# If a NEXT_PUBLIC_* var is ever needed, it must be an ARG + ENV pair here and a
# *build* variable on Coolify, because Next inlines it at build time.

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- production: minimal runtime image (next.config.ts: output: "standalone") ---
FROM node:24.22.1-alpine AS production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
# Where maia-be answers, from inside the container network (override on Coolify).
ENV API_URL=http://maia-be:3000

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3001

CMD ["node", "server.js"]
