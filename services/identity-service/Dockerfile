FROM node:24-slim AS builder
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/identity-service/package.json services/identity-service/package.json
RUN npm ci --workspace @presencia/identity-service --include-workspace-root
COPY services/identity-service services/identity-service
RUN npm run build --workspace @presencia/identity-service

FROM node:24-slim AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/identity-service/package.json services/identity-service/package.json
RUN npm ci --omit=dev --workspace @presencia/identity-service --include-workspace-root && npm cache clean --force
COPY --from=builder /workspace/services/identity-service/dist services/identity-service/dist
COPY --from=builder /workspace/services/identity-service/src/generated services/identity-service/dist/generated
COPY --from=builder /workspace/services/identity-service/prisma services/identity-service/prisma
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3200/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/identity-service/dist/index.js"]
