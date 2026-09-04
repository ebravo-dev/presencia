FROM node:24-slim AS builder
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/observability packages/observability
COPY services/app-log-service/package.json services/app-log-service/package.json
RUN npm ci --workspace @presencia/observability --workspace @presencia/app-log-service --include-workspace-root
COPY services/app-log-service services/app-log-service
RUN npm run build --workspace @presencia/app-log-service

FROM node:24-slim AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/observability packages/observability
COPY services/app-log-service/package.json services/app-log-service/package.json
RUN npm ci --omit=dev --workspace @presencia/observability --workspace @presencia/app-log-service --include-workspace-root && npm cache clean --force
COPY --from=builder /workspace/services/app-log-service/dist services/app-log-service/dist
COPY --from=builder /workspace/services/app-log-service/src/generated services/app-log-service/dist/generated
COPY --from=builder /workspace/services/app-log-service/prisma services/app-log-service/prisma
USER node
EXPOSE 3600
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3600/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "@presencia/observability/register", "services/app-log-service/dist/index.js"]
