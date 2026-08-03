FROM node:24-alpine AS builder
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/observability packages/observability
COPY services/demo-portal-service/package.json services/demo-portal-service/package.json
RUN npm ci --workspace @presencia/observability --workspace @presencia/demo-portal-service --include-workspace-root
COPY services/demo-portal-service services/demo-portal-service
RUN npm run build --workspace @presencia/demo-portal-service

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/observability packages/observability
COPY services/demo-portal-service/package.json services/demo-portal-service/package.json
RUN npm ci --omit=dev --workspace @presencia/observability --workspace @presencia/demo-portal-service --include-workspace-root \
  && npm cache clean --force
COPY --from=builder /workspace/services/demo-portal-service/dist services/demo-portal-service/dist
USER node
EXPOSE 3900
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3900/health/ready || exit 1
CMD ["node", "--import", "@presencia/observability/register", "services/demo-portal-service/dist/index.js"]
