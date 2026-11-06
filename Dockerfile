# AChargeX — ALL-IN-ONE image: web app + API + OCPP WebSocket server in one service.
# Used by render.yaml (free quick start) and works on any Docker host (Oracle VM, Koyeb, etc.).
#   docker build -t achargex .   &&   docker run -p 8080:8080 achargex
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/ocpp/package.json apps/ocpp/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/ocpp apps/ocpp
COPY apps/web apps/web
# Optional build-time public config (empty = same-origin API + demo auth)
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ARG VITE_GOOGLE_OAUTH=false
ENV VITE_API_URL= VITE_SUPABASE_URL=$VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY VITE_GOOGLE_OAUTH=$VITE_GOOGLE_OAUTH
RUN npm run build -w @achargex/ocpp && npm run build -w @achargex/web

FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 STATIC_DIR=/app/web
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/ocpp/package.json apps/ocpp/
COPY apps/web/package.json apps/web/
RUN npm ci -w @achargex/ocpp --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/ocpp/dist apps/ocpp/dist
COPY --from=build /app/apps/web/dist web
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:${PORT}/healthz >/dev/null || exit 1
CMD ["node", "apps/ocpp/dist/main.js"]
