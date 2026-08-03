FROM node:24.7-alpine AS builder
WORKDIR /workspace
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contracts-http/package.json packages/contracts-http/package.json
COPY services/api-gateway/package.json services/api-gateway/package.json
RUN npm ci --workspace @presencia/contracts-http --workspace @presencia/api-gateway --include-workspace-root
COPY packages/contracts-http packages/contracts-http
COPY services/api-gateway services/api-gateway
RUN npm run build --workspace @presencia/contracts-http \
  && npm run build --workspace @presencia/api-gateway

FROM node:24.7-alpine AS production
ENV NODE_ENV=production
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY packages/contracts-http/package.json packages/contracts-http/package.json
COPY services/api-gateway/package.json services/api-gateway/package.json
RUN npm ci --omit=dev --workspace @presencia/contracts-http --workspace @presencia/api-gateway --include-workspace-root \
  && npm cache clean --force
COPY --from=builder /workspace/packages/contracts-http/dist packages/contracts-http/dist
COPY --from=builder /workspace/services/api-gateway/dist services/api-gateway/dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/health/ready || exit 1
CMD ["node", "services/api-gateway/dist/index.js"]
