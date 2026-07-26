# Mini Clash deploy images (TECH §1): one build stage, two runtime targets —
#   game: the Colyseus server as a single self-contained bundle
#   web:  Caddy serving the built client + reverse-proxying /ws to the game
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY assets ./assets
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
RUN pnpm assets:build \
  && pnpm --filter @mini-clash/client build \
  && node packages/server/build.mjs \
  && node packages/api/build.mjs

FROM node:22-alpine AS game
WORKDIR /srv
COPY --from=build /app/packages/server/dist/server.mjs ./server.mjs
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
USER node
CMD ["node", "server.mjs"]

FROM node:22-alpine AS api
WORKDIR /srv
COPY --from=build /app/packages/api/dist/api.mjs ./api.mjs
COPY --from=build /app/packages/api/dist/migrations ./migrations
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "api.mjs"]

FROM caddy:2-alpine AS web
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/packages/client/dist /srv/client
