FROM node:24-slim AS builder
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY services/attendance-service/package.json services/attendance-service/package.json
RUN npm ci --workspace @presencia/attendance-service --include-workspace-root
COPY services/attendance-service services/attendance-service
RUN npm run build --workspace @presencia/attendance-service

FROM node:24-slim AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY services/attendance-service/package.json services/attendance-service/package.json
RUN npm ci --omit=dev --workspace @presencia/attendance-service --include-workspace-root && npm cache clean --force
COPY --from=builder /workspace/services/attendance-service/dist services/attendance-service/dist
COPY --from=builder /workspace/services/attendance-service/src/generated services/attendance-service/dist/generated
COPY --from=builder /workspace/services/attendance-service/prisma services/attendance-service/prisma
USER node
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3400/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/attendance-service/dist/index.js"]
