FROM node:24.7-slim AS builder
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/academic-service/package.json services/academic-service/package.json
RUN npm ci --workspace @presencia/academic-service --include-workspace-root
COPY services/academic-service services/academic-service
RUN npm run build --workspace @presencia/academic-service

FROM node:24.7-slim AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/academic-service/package.json services/academic-service/package.json
RUN npm ci --omit=dev --workspace @presencia/academic-service --include-workspace-root && npm cache clean --force
COPY --from=builder /workspace/services/academic-service/dist services/academic-service/dist
COPY --from=builder /workspace/services/academic-service/src/generated services/academic-service/dist/generated
COPY --from=builder /workspace/services/academic-service/prisma services/academic-service/prisma
USER node
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3300/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/academic-service/dist/index.js"]
