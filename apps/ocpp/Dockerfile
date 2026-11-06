# AChargeX OCPP service. Build from the REPO ROOT:
#   docker build -f apps/ocpp/Dockerfile -t achargex-ocpp .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/ocpp/package.json apps/ocpp/
COPY apps/web/package.json apps/web/
RUN npm ci -w @achargex/ocpp -w @achargex/shared --include-workspace-root --no-audit --no-fund
COPY packages/shared packages/shared
COPY apps/ocpp apps/ocpp
RUN npm run build -w @achargex/ocpp

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/ocpp/package.json apps/ocpp/
COPY apps/web/package.json apps/web/
RUN npm ci -w @achargex/ocpp --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/apps/ocpp/dist apps/ocpp/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "apps/ocpp/dist/main.js"]
