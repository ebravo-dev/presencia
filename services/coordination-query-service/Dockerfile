FROM node:24.7-slim AS builder
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts-events/package.json packages/contracts-events/package.json
COPY services/coordination-query-service/package.json services/coordination-query-service/package.json
RUN npm ci --workspace @presencia/coordination-query-service --include-workspace-root
COPY packages/contracts-events packages/contracts-events
COPY services/coordination-query-service services/coordination-query-service
RUN npm run build --workspace @presencia/contracts-events && npm run build --workspace @presencia/coordination-query-service

FROM node:24.7-slim AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/contracts-events/package.json packages/contracts-events/package.json
COPY services/coordination-query-service/package.json services/coordination-query-service/package.json
RUN npm ci --omit=dev --workspace @presencia/coordination-query-service --include-workspace-root && npm cache clean --force
COPY --from=builder /workspace/packages/contracts-events/dist packages/contracts-events/dist
COPY --from=builder /workspace/services/coordination-query-service/dist services/coordination-query-service/dist
COPY --from=builder /workspace/services/coordination-query-service/src/generated services/coordination-query-service/dist/generated
COPY --from=builder /workspace/services/coordination-query-service/prisma services/coordination-query-service/prisma
USER node
EXPOSE 3500
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3500/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/coordination-query-service/dist/index.js"]
