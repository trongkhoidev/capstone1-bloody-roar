# Bloody-Roar web (Next.js + GraphQL + Socket.IO custom server) for Railway.
FROM oven/bun:1

# Prisma query engine needs OpenSSL
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies in their own layer so code-only changes reuse the cache.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/
COPY apps/contracts/package.json apps/contracts/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
# Retry once: the npm registry sometimes answers 429 during large installs.
RUN bun install --frozen-lockfile || (sleep 30 && bun install --frozen-lockfile)

COPY . .

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time,
# so Railway must pass them as build args (it does for declared ARGs).
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Cap build parallelism/heap so the build fits in a ~8 GB builder.
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_BUILD_CPUS=2 SKIP_BUILD_LINT=1 NODE_OPTIONS=--max-old-space-size=3072
RUN bun run db:generate && bun run build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["bun", "run", "--cwd", "apps/web", "start"]
