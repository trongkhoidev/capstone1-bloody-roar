# Bloody-Roar web (Next.js + GraphQL + Socket.IO custom server) for Railway.
FROM oven/bun:1

# Prisma query engine needs OpenSSL
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
# Retry once: the npm registry sometimes answers 429 during large installs.
RUN bun install --frozen-lockfile || (sleep 30 && bun install --frozen-lockfile)

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time,
# so Railway must pass them as build args (it does for declared ARGs).
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_THIRDWEB_CLIENT_ID
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_THIRDWEB_CLIENT_ID=$NEXT_PUBLIC_THIRDWEB_CLIENT_ID

RUN bun run db:generate && bun run build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["bun", "run", "--cwd", "apps/web", "start"]
